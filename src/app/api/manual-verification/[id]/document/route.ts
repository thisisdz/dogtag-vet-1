import {connectToDatabase} from "@/lib/db";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {readDocument} from "@/lib/manualVerification/documentStore";
import {requireVetSession} from "@/lib/staffApi";

/**
 * `GET /api/manual-verification/:id/document` - the owner's evidence document for the reviewer's
 * viewer. Vet/owner only. Owner uploads are untrusted content (already content-sniffed to JPEG/PNG/
 * PDF on upload), so: never cached, never re-sniffed by the browser, same-origin only. Images also
 * get a `sandbox` CSP; PDFs cannot (Chrome's built-in viewer refuses to render a sandboxed PDF), and
 * rely on the browser's isolated PDF viewer instead.
 */
export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const {response} = await requireVetSession();
  if (response) return response;

  const {id} = await params;
  await connectToDatabase();
  const request = await ManualVerificationRequest.findOne({requestId: id}, {vaccination: 1}).lean<
    Pick<ManualVerificationRequestDoc, "vaccination">
  >();
  const documentId = request?.vaccination?.documentId;
  const doc = documentId ? await readDocument(documentId) : null;
  if (!doc) return new Response("Not found", {status: 404});

  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Length": String(doc.bytes.length),
      "Content-Disposition": `inline; filename="vaccination-document-${id}.${extension(doc.contentType)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      ...(doc.contentType === "application/pdf" ? {} : {"Content-Security-Policy": "sandbox"}),
      "Cache-Control": "no-store",
    },
  });
}

function extension(contentType: string): string {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "png";
  return "jpg";
}
