import {recoverTypedDataAddress, type Address, type Hex} from "viem";
import {
  MANUAL_VERIFICATION_PRIMARY_TYPE,
  MANUAL_VERIFICATION_TYPES,
  actionHash,
  buildManualVerificationDomain,
  computePayloadHash,
  type ManualVerificationAction,
  type ManualVerificationMessage,
} from "@/lib/manualVerification/eip712";

/** Max signed-window length, enforced server-side - same 10-minute bound as mobile booking
 * (`lib/booking/walletClaim.ts`), for the same reason: an app cannot mint a long-lived signature. */
export const MANUAL_VERIFICATION_MAX_TTL_SECS = 600;

/** Tolerated device clock drift for `issuedAt` (mirrors walletClaim.ts). */
const CLOCK_SKEW_ALLOWANCE_SECS = 120;

export interface VerifyManualVerificationSignatureInput {
  chainId: number;
  /** This deployment's own VetIssuer clone (`ClinicSettings.cloneAddress`) - never from the wire. */
  clinicCloneAddress: Address;
  /** Which endpoint is verifying - never from the wire. */
  action: ManualVerificationAction;
  /** The exact payload string from the request; hashed here, before any parsing. */
  payloadJson: string;
  claimedWallet: Address;
  nonce: Hex;
  signature: Hex;
  issuedAt: number;
  deadline: number;
  /** Server "now", unix seconds (injected for testability). */
  now: number;
}

export type ManualVerificationSignatureInvalidReason =
  | "deadline_before_issued_at"
  | "window_too_long"
  | "issued_in_future"
  | "expired"
  | "signature_invalid";

export type VerifyManualVerificationSignatureResult =
  | {ok: true; wallet: string; payloadHash: Hex; digestKey: string}
  | {ok: false; reason: ManualVerificationSignatureInvalidReason};

/**
 * Verifies a signed manual-verification call. Pure and I/O-free: callers own replay protection by
 * recording `digestKey` (unique per wallet + nonce + action) and refusing a repeat - see
 * `UsedManualVerificationSignature`. Timestamp checks run before the comparatively expensive
 * signature recovery, mirroring `verifyMobileBookingWalletClaim`.
 */
export async function verifyManualVerificationSignature(
  input: VerifyManualVerificationSignatureInput,
): Promise<VerifyManualVerificationSignatureResult> {
  if (input.deadline <= input.issuedAt) return {ok: false, reason: "deadline_before_issued_at"};
  if (input.deadline - input.issuedAt > MANUAL_VERIFICATION_MAX_TTL_SECS) return {ok: false, reason: "window_too_long"};
  if (input.issuedAt > input.now + CLOCK_SKEW_ALLOWANCE_SECS) return {ok: false, reason: "issued_in_future"};
  if (input.now > input.deadline) return {ok: false, reason: "expired"};

  const payloadHash = computePayloadHash(input.payloadJson);
  const message: ManualVerificationMessage = {
    clinic: input.clinicCloneAddress,
    action: actionHash(input.action),
    payloadHash,
    wallet: input.claimedWallet,
    nonce: input.nonce,
    issuedAt: BigInt(input.issuedAt),
    deadline: BigInt(input.deadline),
  };

  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      domain: buildManualVerificationDomain(input.chainId, input.clinicCloneAddress),
      types: MANUAL_VERIFICATION_TYPES,
      primaryType: MANUAL_VERIFICATION_PRIMARY_TYPE,
      message,
      signature: input.signature,
    });
  } catch {
    return {ok: false, reason: "signature_invalid"};
  }
  if (recovered.toLowerCase() !== input.claimedWallet.toLowerCase()) return {ok: false, reason: "signature_invalid"};

  const wallet = recovered.toLowerCase();
  return {ok: true, wallet, payloadHash, digestKey: `${wallet}:${input.action}:${input.nonce.toLowerCase()}`};
}
