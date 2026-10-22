/**
 * Upload type check by content, not by the declared type: a vaccination document must really be a
 * JPEG, PNG or PDF. Anything else (HEIC, executables, HTML renamed to .pdf) is refused - the app
 * converts HEIC to JPEG on the device.
 */
export const ACCEPTED_DOCUMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export type AcceptedDocumentType = (typeof ACCEPTED_DOCUMENT_TYPES)[number];

/** Max decoded document size. Atlas M0 stores everything in 512 MB, so keep these small. */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function sniffDocumentType(bytes: Uint8Array): AcceptedDocumentType | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // "%PDF-"
  return null;
}

export type DocumentCheck =
  | {ok: true; contentType: AcceptedDocumentType}
  | {ok: false; reason: "empty" | "too_large" | "unsupported_type" | "type_mismatch"};

/** Validates decoded bytes against the declared content type. */
export function checkDocument(bytes: Uint8Array, declaredType: string): DocumentCheck {
  if (bytes.length === 0) return {ok: false, reason: "empty"};
  if (bytes.length > MAX_DOCUMENT_BYTES) return {ok: false, reason: "too_large"};
  const sniffed = sniffDocumentType(bytes);
  if (!sniffed) return {ok: false, reason: "unsupported_type"};
  if (sniffed !== declaredType.toLowerCase()) return {ok: false, reason: "type_mismatch"};
  return {ok: true, contentType: sniffed};
}
