import {Schema} from "mongoose";
import {randomUUID} from "node:crypto";
import {getOrCreateModel} from "@/lib/models/registerModel";
import {ACCEPTED_DOCUMENT_TYPES, type AcceptedDocumentType} from "@/lib/manualVerification/sniff";

/**
 * An owner-supplied evidence document (vaccination certificate) for a manual-verification request.
 * Kept apart from `StoredFile` (pet photos, clinic assets) so storage quotas and the future
 * retention/deletion policy apply only to owner evidence. `storage: "r2"` is reserved for the
 * planned encrypted object-storage move; today bytes live inline (`data`).
 */
export interface ManualVerificationDocumentDoc {
  documentId: string;
  requestId: string;
  contentType: AcceptedDocumentType;
  byteLength: number;
  sha256: string;
  storage: "mongo" | "r2";
  data?: Buffer;
  r2Key?: string;
  /** Set when the bytes are purged under the retention policy; the hash is kept as evidence. */
  deletedAt?: Date;
  createdAt: Date;
}

const manualVerificationDocumentSchema = new Schema<ManualVerificationDocumentDoc>(
  {
    documentId: {type: String, required: true, unique: true, default: () => randomUUID()},
    requestId: {type: String, required: true, index: true},
    contentType: {type: String, enum: ACCEPTED_DOCUMENT_TYPES, required: true},
    byteLength: {type: Number, required: true},
    sha256: {type: String, required: true},
    storage: {type: String, enum: ["mongo", "r2"], required: true, default: "mongo"},
    data: Buffer,
    r2Key: String,
    deletedAt: Date,
  },
  {timestamps: {createdAt: true, updatedAt: false}},
);

export const ManualVerificationDocument = getOrCreateModel<ManualVerificationDocumentDoc>(
  "ManualVerificationDocument",
  manualVerificationDocumentSchema,
);
