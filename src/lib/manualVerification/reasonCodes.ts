/**
 * Why a manual-verification request was rejected - shown to the owner in the app and in email.
 * Deliberately separate from `lib/reasonCodes.ts`, which is the on-chain bytes32 revocation
 * vocabulary; these never go on chain.
 */
export const MANUAL_VERIFICATION_REJECT_REASONS = {
  document_illegible: "The document is too blurry or cropped to read.",
  document_incomplete: "Required details (vaccine, dates, or vet) are missing from the document.",
  not_a_vaccination_record: "The upload is not a vaccination record.",
  pet_mismatch: "The pet's name or microchip on the document does not match this DogTag.",
  vaccine_expired: "The vaccination on the document has already expired.",
  suspected_tampering: "The document appears to have been altered.",
  duplicate: "This request duplicates one already submitted.",
  tag_required: "This pet needs a DogTag before its vaccinations can be verified.",
  identity_unverifiable: "The owner details could not be verified.",
  other: "See the reviewer's note.",
} as const;

export type ManualVerificationRejectReason = keyof typeof MANUAL_VERIFICATION_REJECT_REASONS;

export const MANUAL_VERIFICATION_REJECT_REASON_CODES = Object.keys(
  MANUAL_VERIFICATION_REJECT_REASONS,
) as ManualVerificationRejectReason[];

/** `other` must carry a note so the owner always learns why. */
export function rejectReasonNeedsNote(reason: ManualVerificationRejectReason): boolean {
  return reason === "other";
}
