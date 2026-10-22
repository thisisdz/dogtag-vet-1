import {RecordArtifact, type RecordArtifactDoc} from "@/lib/models/RecordArtifact";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {transitionRequest} from "@/lib/manualVerification/transition";
import {issueAndSendClaim} from "@/lib/manualVerification/claims";

/**
 * Brings a request's status in line with the on-chain artifact it is waiting on. The existing
 * issuance routes (record tx/confirm, tag issue tx/confirm) stay untouched and never know about
 * manual verification; this reads their result instead. Called on every staff detail view and app
 * status poll, so it must be cheap and idempotent.
 *
 * Vaccination: the linked RecordArtifact going `active` means Dom's `issueRecord` confirmed ->
 * request `issued`, and the owner is emailed a claim link; `error` -> `needs_attention`.
 * (DogTag syncing is added with the DogTag flow.)
 */
export async function syncRequest(request: ManualVerificationRequestDoc): Promise<ManualVerificationRequestDoc> {
  if (request.kind === "vaccination") return syncVaccination(request);
  return request;
}

async function syncVaccination(request: ManualVerificationRequestDoc): Promise<ManualVerificationRequestDoc> {
  const recordId = request.vaccination?.recordId;
  if (!recordId || !["approved", "needs_attention"].includes(request.status)) return request;

  const record = await RecordArtifact.findOne({recordId}, {status: 1}).lean<Pick<RecordArtifactDoc, "status">>();
  if (!record) return request;

  if (record.status === "active") {
    const result = await transitionRequest({
      request,
      to: "issued",
      actor: {type: "system"},
      action: "record_confirmed_on_chain",
      set: {issuedAt: new Date()},
    });
    if (!result.ok) return request;
    // Only the call that won the transition sends the owner their claim link, so concurrent syncs
    // never email twice.
    if (!result.request.claim) await issueAndSendClaim(result.request, {type: "system"});
    return (await ManualVerificationRequest.findOne({requestId: request.requestId}).lean<ManualVerificationRequestDoc>()) ?? result.request;
  }
  if (record.status === "error" && request.status === "approved") {
    const result = await transitionRequest({
      request,
      to: "needs_attention",
      actor: {type: "system"},
      action: "record_issuance_error",
      note: "The record's on-chain issuance failed verification. Retry it from the record panel.",
    });
    return result.ok ? result.request : request;
  }
  return request;
}
