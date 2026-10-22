import {generateHexToken} from "@/lib/models/BindToken";
import {ArtifactExportSession} from "@/lib/models/ArtifactExportSession";
import {Pet, type PetDoc} from "@/lib/models/Pet";
import {RecordArtifact, type RecordArtifactDoc} from "@/lib/models/RecordArtifact";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {claimUsability} from "@/lib/manualVerification/claimToken";
import {transitionRequest} from "@/lib/manualVerification/transition";

/** Same lifetime as the in-clinic "Export to phone" QR: the app redeems and imports immediately. */
export const REDEEM_EXPORT_TTL_SECS = 600;

export type RedeemResult =
  | {ok: true; kind: "vaccination"; petName: string; exportUrl: string; ttlSecs: number}
  | {ok: false; status: 404 | 409 | 410; code: string; message: string};

/**
 * Turns a long-lived emailed claim into a fresh, short-lived delivery session the DogTag app
 * already knows how to consume - for a vaccination record, an `/e/<token>` record export, exactly
 * like the in-clinic "Export to phone" QR. Repeatable until the claim expires (a failed import can
 * be retried); only POST reaches this, so link scanners and previews (GET) never trigger it. The
 * first redeem moves the request to `claimed`.
 */
export async function redeemClaim(request: ManualVerificationRequestDoc, baseUrl: string, now: number): Promise<RedeemResult> {
  if (!request.claim) return {ok: false, status: 404, code: "not_found", message: "This link isn't valid."};
  const usability = claimUsability(request.claim, now);
  if (usability !== "usable") {
    return {
      ok: false,
      status: 410,
      code: usability === "expired" ? "claim_expired" : "claim_revoked",
      message: usability === "expired" ? "This link has expired. Ask DogTag to send a new one." : "This link was replaced by a newer one.",
    };
  }
  if (request.kind !== "vaccination") {
    return {ok: false, status: 409, code: "not_supported", message: "This link must be opened in the DogTag app."};
  }
  if (request.status !== "issued" && request.status !== "claimed") {
    return {ok: false, status: 409, code: "not_ready", message: "This record isn't ready yet."};
  }

  const recordId = request.vaccination?.recordId;
  const record = recordId ? await RecordArtifact.findOne({recordId}).lean<RecordArtifactDoc>() : null;
  if (!record || record.status !== "active") {
    return {ok: false, status: 409, code: "not_ready", message: "This record is no longer available."};
  }

  const token = generateHexToken();
  await ArtifactExportSession.create({
    token,
    petId: record.petId,
    artifactType: "record",
    recordId: record.recordId,
    root: record.root,
    exp: now + REDEEM_EXPORT_TTL_SECS,
  });

  const first = request.claim.redeemCount === 0;
  await ManualVerificationRequest.updateOne(
    {requestId: request.requestId},
    {$inc: {"claim.redeemCount": 1}, ...(first ? {$set: {"claim.firstRedeemedAt": new Date(now * 1000)}} : {})},
  );
  if (request.status === "issued") {
    await transitionRequest({request, to: "claimed", actor: {type: "owner"}, action: "claimed", set: {claimedAt: new Date(now * 1000)}});
  }

  const pet = await Pet.findOne({petId: record.petId}, {name: 1}).lean<Pick<PetDoc, "name">>();
  return {
    ok: true,
    kind: "vaccination",
    petName: pet?.name ?? "",
    exportUrl: `${baseUrl.replace(/\/$/, "")}/e/${token}`,
    ttlSecs: REDEEM_EXPORT_TTL_SECS,
  };
}
