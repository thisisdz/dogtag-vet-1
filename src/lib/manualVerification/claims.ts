import {getServerEnv} from "@/lib/env";
import {sendMail, type SendMailOutcome} from "@/lib/mailer";
import {Pet, type PetDoc} from "@/lib/models/Pet";
import {getClinicSettings} from "@/lib/models/ClinicSettings";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {hashClaimToken, issueClaim} from "@/lib/manualVerification/claimToken";
import {buildClaimEmail} from "@/lib/manualVerification/email";
import {appendRequestEvent} from "@/lib/manualVerification/transition";
import type {ManualVerificationEvent} from "@/lib/models/ManualVerificationRequest";

const CLAIM_TOKEN = /^[0-9a-f]{32}$/;

export function claimUrl(token: string, requestOrigin?: string): string {
  const base = (getServerEnv().PUBLIC_BASE_URL ?? requestOrigin ?? "").replace(/\/$/, "");
  return `${base}/claim/${token}`;
}

/** The request a claim token belongs to (by hash), or null for a malformed or unknown token. */
export async function findRequestByClaimToken(token: string): Promise<ManualVerificationRequestDoc | null> {
  if (!CLAIM_TOKEN.test(token)) return null;
  return ManualVerificationRequest.findOne({"claim.tokenHash": hashClaimToken(token)}).lean<ManualVerificationRequestDoc>();
}

export interface IssuedClaim {
  token: string;
  url: string;
  expiresAt: Date;
  email: SendMailOutcome;
}

/**
 * Issues a fresh claim link for a request (replacing any previous one, which stops working) and
 * emails it to the owner. Returns the plaintext link once, so the reviewer can also copy it - it is
 * never stored and cannot be shown again; "re-send" simply issues a new one.
 */
export async function issueAndSendClaim(
  request: ManualVerificationRequestDoc,
  actor: ManualVerificationEvent["actor"],
  requestOrigin?: string,
): Promise<IssuedClaim | null> {
  const now = Math.floor(Date.now() / 1000);
  const {token, state} = issueClaim(now, getServerEnv().MANUAL_VERIFICATION_CLAIM_TTL_DAYS);
  const url = claimUrl(token, requestOrigin);
  const expiresAt = new Date(state.exp * 1000);
  const replacing = Boolean(request.claim);

  const stored = await appendRequestEvent(
    request.requestId,
    {actor, action: replacing ? "claim_resent" : "claim_issued", note: `Valid until ${expiresAt.toISOString().slice(0, 10)}`},
    {claim: {tokenHash: state.tokenHash, exp: state.exp, issuedAt: new Date(), redeemCount: 0}},
  );
  if (!stored) return null;

  const [pet, settings] = await Promise.all([
    request.petId ? Pet.findOne({petId: request.petId}, {name: 1}).lean<Pick<PetDoc, "name">>() : null,
    getClinicSettings(),
  ]);
  const email = await sendMail(
    await buildClaimEmail({
      to: request.requester.email,
      ownerName: request.requester.name,
      petName: pet?.name ?? request.dogtag?.petName ?? "Your pet",
      kind: request.kind,
      claimUrl: url,
      expiresAt,
      issuerName: settings.businessProfile?.name ?? "DogTag",
    }),
  );
  if (email !== "failed") {
    await ManualVerificationRequest.updateOne({requestId: request.requestId, "claim.tokenHash": state.tokenHash}, {$set: {"claim.sentAt": new Date()}});
  }
  if (email !== "sent") {
    await appendRequestEvent(request.requestId, {
      actor: {type: "system"},
      action: "claim_email_not_sent",
      note: email === "logged" ? "Email isn't configured yet - copy the link from this page instead." : "The email failed to send - copy the link or re-send.",
    });
  }
  return {token, url, expiresAt, email};
}
