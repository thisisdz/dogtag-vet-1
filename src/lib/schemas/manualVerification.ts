import {z} from "zod";
import {hexAddress} from "@/lib/schemas/common";
import {vaccinationRecordFormSchema} from "@/lib/schemas/recordIssuance";
import {MANUAL_VERIFICATION_REJECT_REASON_CODES, rejectReasonNeedsNote} from "@/lib/manualVerification/reasonCodes";
import {ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES} from "@/lib/manualVerification/sniff";

/** A document sent as base64 inside JSON (no multipart parsing needed on either side). */
export const documentUploadSchema = z.object({
  contentType: z.string().trim().toLowerCase().pipe(z.enum(ACCEPTED_DOCUMENT_TYPES)),
  base64: z.string().min(1),
});

/** Body cap for an upload request: the 5 MB file as base64 (4/3) plus room for the JSON around it. */
export const DOCUMENT_REQUEST_MAX_BODY_BYTES = Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 64 * 1024;

export function decodeBase64Document(base64: string): Uint8Array | null {
  const cleaned = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) return null;
  return new Uint8Array(Buffer.from(cleaned, "base64"));
}

const requesterFields = {
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).optional(),
};

/** Staff creating a vaccination request on an owner's behalf (e.g. a certificate Dom received by email). */
export const staffCreateVaccinationRequestSchema = z.object({
  kind: z.literal("vaccination"),
  petId: z.string().min(1),
  ...requesterFields,
  ownerNotes: z.string().trim().max(2000).optional(),
  document: documentUploadSchema,
});

export const rejectRequestSchema = z
  .object({
    reasonCode: z.enum(MANUAL_VERIFICATION_REJECT_REASON_CODES as [string, ...string[]]),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => !rejectReasonNeedsNote(v.reasonCode as never) || Boolean(v.note), {
    message: "A note is required when the reason is 'other'.",
    path: ["note"],
  });

const certificateSchema = z
  .object({
    vetClinicName: z.string().trim().max(200).optional(),
    vetName: z.string().trim().max(200).optional(),
    microchipOnCert: z.string().trim().max(64).optional(),
  })
  .optional();

/** Approving a vaccination request: the reviewer-confirmed record fields, signed by Dom's wallet next. */
export const approveVaccinationRequestSchema = z.object({
  operatorAddress: hexAddress,
  form: vaccinationRecordFormSchema,
  conformsTo: z.array(z.object({standard: z.string().trim().min(1), version: z.string().trim().min(1)})).max(10).optional(),
  certificate: certificateSchema,
});
