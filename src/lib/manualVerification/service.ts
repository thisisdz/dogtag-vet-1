import {randomUUID} from "node:crypto";
import {Pet, type PetDoc} from "@/lib/models/Pet";
import {RecordArtifact, type RecordArtifactDoc} from "@/lib/models/RecordArtifact";
import {ManualVerificationRequest, type ManualVerificationRequestDoc, type ManualVerificationSource} from "@/lib/models/ManualVerificationRequest";
import {checkDocument} from "@/lib/manualVerification/sniff";
import {purgeDocument, saveDocument} from "@/lib/manualVerification/documentStore";
import {transitionRequest} from "@/lib/manualVerification/transition";
import type {ManualVerificationRejectReason} from "@/lib/manualVerification/reasonCodes";
import {createVaccinationDraft} from "@/lib/records/createVaccinationDraft";
import type {VaccinationRecordFormInput} from "@/lib/schemas/recordIssuance";

/**
 * The manual verification track's actions, shared by the staff console routes and the mobile app
 * routes so both follow exactly the same rules. Every status change goes through
 * `transitionRequest` (table-checked, race-safe, audited).
 */
export type ServiceResult<T> = {ok: true; value: T} | {ok: false; status: number; code: string; message: string};

const fail = (status: number, code: string, message: string) => ({ok: false, status, code, message}) as const;

export interface CreateVaccinationRequestInput {
  source: ManualVerificationSource;
  requester: {wallet?: string; email: string; name: string; phone?: string};
  petId: string;
  ownerNotes?: string;
  document: {bytes: Uint8Array; declaredType: string};
  actor: {type: "owner" | "staff"; id?: string};
}

/** A vaccination request for a pet that already has a DogTag (the track requires one). */
export async function createVaccinationRequest(input: CreateVaccinationRequestInput): Promise<ServiceResult<ManualVerificationRequestDoc>> {
  const pet = await Pet.findOne({petId: input.petId}).lean<PetDoc>();
  if (!pet) return fail(404, "pet_not_found", "Pet not found.");
  if (!pet.dogTag?.dogTagIdField) {
    return fail(422, "tag_required", "This pet needs a DogTag before its vaccinations can be verified.");
  }

  const check = checkDocument(input.document.bytes, input.document.declaredType);
  if (!check.ok) return fail(422, `document_${check.reason}`, documentProblemMessage(check.reason));

  const requestId = randomUUID();
  const saved = await saveDocument({requestId, bytes: input.document.bytes, contentType: check.contentType});
  if (!saved.ok) return fail(503, "storage_full", "Document storage is full. Please try again later.");

  try {
    const created = await ManualVerificationRequest.create({
      requestId,
      kind: "vaccination",
      source: input.source,
      requester: input.requester,
      clientId: pet.primaryOwnerClientId ?? pet.ownerClientIds[0],
      petId: pet.petId,
      vaccination: {
        dogTagIdDec: pet.dogTag.dogTagIdDec,
        documentId: saved.document.documentId,
        documentSha256: saved.document.sha256,
        ownerNotes: input.ownerNotes,
      },
      events: [{at: new Date(), actor: input.actor, action: "submitted", to: "submitted"}],
    });
    return {ok: true, value: created.toObject()};
  } catch (err) {
    await purgeDocument(saved.document.documentId);
    throw err;
  }
}

function documentProblemMessage(reason: "empty" | "too_large" | "unsupported_type" | "type_mismatch"): string {
  switch (reason) {
    case "empty":
      return "The document is empty.";
    case "too_large":
      return "The document is larger than 5 MB.";
    case "unsupported_type":
      return "Upload a JPEG, PNG or PDF.";
    case "type_mismatch":
      return "The file's contents do not match its type.";
  }
}

/** Reviewer opens a submitted request. Idempotent: an already-in-review request is returned as is. */
export async function startReview(request: ManualVerificationRequestDoc, staffId: string): Promise<ServiceResult<ManualVerificationRequestDoc>> {
  if (request.status === "in_review") return {ok: true, value: request};
  const result = await transitionRequest({
    request,
    to: "in_review",
    actor: {type: "staff", id: staffId},
    action: "review_started",
    set: {firstReviewedAt: request.firstReviewedAt ?? new Date()},
  });
  return result.ok ? {ok: true, value: result.request} : fail(409, result.reason, "This request can't be reviewed in its current state.");
}

/** Rejects with a reason the owner will see. Refused once anything is on chain. */
export async function rejectRequest(
  request: ManualVerificationRequestDoc,
  input: {staffId: string; reasonCode: ManualVerificationRejectReason; note?: string},
): Promise<ServiceResult<ManualVerificationRequestDoc>> {
  if (request.vaccination?.recordId) {
    const record = await RecordArtifact.findOne({recordId: request.vaccination.recordId}, {status: 1}).lean<Pick<RecordArtifactDoc, "status">>();
    if (record && (record.status === "issuing" || record.status === "active")) {
      return fail(409, "already_on_chain", "The record is already on chain - revoke it from the pet's Records tab instead.");
    }
  }
  const now = new Date();
  const result = await transitionRequest({
    request,
    to: "rejected",
    actor: {type: "staff", id: input.staffId},
    action: "rejected",
    note: input.note,
    set: {decision: {reasonCode: input.reasonCode, note: input.note, decidedBy: input.staffId, decidedAt: now}, closedAt: now},
  });
  return result.ok ? {ok: true, value: result.request} : fail(409, result.reason, "This request can't be rejected in its current state.");
}

export interface ApproveVaccinationInput {
  staffId: string;
  operatorAddress: `0x${string}`;
  form: VaccinationRecordFormInput;
  conformsTo?: {standard: string; version: string}[];
  certificate?: {vetClinicName?: string; vetName?: string; microchipOnCert?: string};
}

/**
 * Approves a vaccination request: builds the record draft WITHOUT an `authorizedVet` leaf (the
 * reviewer transcribed an owner-supplied document; they did not administer the vaccine) and links
 * it. Dom then signs `issueRecord` in MetaMask through the existing record flow; `syncRequest` moves
 * the request to `issued` once the record confirms on chain.
 */
export async function approveVaccination(
  request: ManualVerificationRequestDoc,
  input: ApproveVaccinationInput,
): Promise<ServiceResult<{request: ManualVerificationRequestDoc; record: RecordArtifactDoc}>> {
  if (request.kind !== "vaccination") return fail(400, "wrong_kind", "Not a vaccination request.");
  if (request.status !== "in_review") return fail(409, "illegal_transition", "Open the request for review before approving it.");
  if (!request.petId) return fail(409, "pet_not_linked", "Link this request to a pet before approving it.");

  const draft = await createVaccinationDraft({
    petId: request.petId,
    form: input.form,
    conformsTo: input.conformsTo,
    operatorAddress: input.operatorAddress,
    authorizedVet: undefined,
  });
  if (!draft.ok) return fail(draft.status, "draft_failed", draft.message);

  const now = new Date();
  const result = await transitionRequest({
    request,
    to: "approved",
    actor: {type: "staff", id: input.staffId},
    action: "approved",
    set: {
      "vaccination.confirmedFields": input.form,
      "vaccination.recordId": draft.record.recordId,
      ...(input.certificate ? {"vaccination.certificate": input.certificate} : {}),
      approvedAt: now,
      decision: {decidedBy: input.staffId, decidedAt: now},
    },
  });
  if (!result.ok) {
    // The draft is harmless (never signed); it simply stays a draft on the pet's Records tab.
    console.error(`manual verification ${request.requestId}: approve lost a race after creating draft ${draft.record.recordId}`);
    return fail(409, result.reason, "This request changed while you were approving it. Reload and try again.");
  }
  return {ok: true, value: {request: result.request, record: draft.record}};
}
