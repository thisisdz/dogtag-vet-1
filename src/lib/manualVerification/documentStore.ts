import {createHash} from "node:crypto";
import {getServerEnv} from "@/lib/env";
import {ManualVerificationDocument, type ManualVerificationDocumentDoc} from "@/lib/models/ManualVerificationDocument";
import type {AcceptedDocumentType} from "@/lib/manualVerification/sniff";

/**
 * Where owner evidence documents are kept. Today: inline in MongoDB, behind a total-size quota
 * (Atlas M0 is 512 MB for everything). The planned move to encrypted Cloudflare R2 storage only
 * changes this module - callers just save, read and purge by id.
 */
export async function storedDocumentBytes(): Promise<number> {
  const [row] = await ManualVerificationDocument.aggregate<{total: number}>([
    {$match: {deletedAt: {$exists: false}}},
    {$group: {_id: null, total: {$sum: "$byteLength"}}},
  ]);
  return row?.total ?? 0;
}

export type SaveDocumentResult =
  | {ok: true; document: Pick<ManualVerificationDocumentDoc, "documentId" | "sha256" | "byteLength" | "contentType">}
  | {ok: false; reason: "storage_full"};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Saves validated document bytes (run `checkDocument` first). Refuses once the quota is reached.
 * `quotaBytes` defaults to MANUAL_VERIFICATION_STORAGE_QUOTA_MB. */
export async function saveDocument(input: {
  requestId: string;
  bytes: Uint8Array;
  contentType: AcceptedDocumentType;
  quotaBytes?: number;
}): Promise<SaveDocumentResult> {
  const quotaBytes = input.quotaBytes ?? getServerEnv().MANUAL_VERIFICATION_STORAGE_QUOTA_MB * 1024 * 1024;
  if ((await storedDocumentBytes()) + input.bytes.length > quotaBytes) return {ok: false, reason: "storage_full"};

  const created = await ManualVerificationDocument.create({
    requestId: input.requestId,
    contentType: input.contentType,
    byteLength: input.bytes.length,
    sha256: sha256Hex(input.bytes),
    storage: "mongo",
    data: Buffer.from(input.bytes),
  });
  return {
    ok: true,
    document: {
      documentId: created.documentId,
      sha256: created.sha256,
      byteLength: created.byteLength,
      contentType: created.contentType,
    },
  };
}

/** The document's bytes for the reviewer viewer, or null if missing or purged. */
export async function readDocument(
  documentId: string,
): Promise<{bytes: Buffer; contentType: AcceptedDocumentType; sha256: string} | null> {
  // Not lean(): a hydrated document gives `data` as a real Node Buffer (lean() can hand back a BSON
  // Binary, whose backing buffer must not be read without its offset/length).
  const doc = await ManualVerificationDocument.findOne({documentId, deletedAt: {$exists: false}});
  if (!doc?.data) return null;
  return {bytes: Buffer.from(doc.data), contentType: doc.contentType, sha256: doc.sha256};
}

/** Retention: drops the bytes but keeps the hash and metadata as evidence of what was reviewed. */
export async function purgeDocument(documentId: string): Promise<void> {
  await ManualVerificationDocument.updateOne(
    {documentId, deletedAt: {$exists: false}},
    {$unset: {data: 1}, $set: {deletedAt: new Date()}},
  );
}
