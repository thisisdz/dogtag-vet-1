import {NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/db";
import {readJsonBody} from "@/lib/bodyLimit";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {MANUAL_VERIFICATION_STATUSES, NEEDS_REVIEWER_FILTER, type ManualVerificationStatus} from "@/lib/manualVerification/stateMachine";
import {createVaccinationRequest} from "@/lib/manualVerification/service";
import {
  DOCUMENT_REQUEST_MAX_BODY_BYTES,
  decodeBase64Document,
  staffCreateVaccinationRequestSchema,
} from "@/lib/schemas/manualVerification";
import {badRequest, requireVetSession} from "@/lib/staffApi";

/** `GET /api/manual-verification?status=&kind=` - the manual verification queue (vet/owner only). */
export async function GET(request: Request) {
  const {response} = await requireVetSession();
  if (response) return response;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "needs_me";
  const kind = url.searchParams.get("kind");
  const filter: Record<string, unknown> = {};
  if (statusParam === "needs_me") Object.assign(filter, NEEDS_REVIEWER_FILTER);
  else if (statusParam !== "all") {
    const statuses = statusParam.split(",").filter((s): s is ManualVerificationStatus =>
      (MANUAL_VERIFICATION_STATUSES as readonly string[]).includes(s),
    );
    filter.status = {$in: statuses};
  }
  if (kind === "dogtag" || kind === "vaccination") filter.kind = kind;

  await connectToDatabase();
  const requests = await ManualVerificationRequest.find(filter, {events: 0})
    .sort({submittedAt: 1})
    .limit(500)
    .lean<ManualVerificationRequestDoc[]>();
  return NextResponse.json({requests});
}

/** `POST /api/manual-verification` - the reviewer files a vaccination request on an owner's behalf
 * (e.g. a certificate the owner emailed to DogTag). Same rules as an app submission. */
export async function POST(request: Request) {
  const {staff, response} = await requireVetSession();
  if (response) return response;

  const body = await readJsonBody(request, DOCUMENT_REQUEST_MAX_BODY_BYTES);
  if (!body.ok) return badRequest(body.tooLarge ? "The upload is larger than 5 MB." : "Malformed request.");
  const parsed = staffCreateVaccinationRequestSchema.safeParse(body.body);
  if (!parsed.success) return badRequest("Malformed request.", parsed.error.flatten());
  const input = parsed.data;

  const bytes = decodeBase64Document(input.document.base64);
  if (!bytes) return badRequest("The document is not valid base64.");

  await connectToDatabase();
  const result = await createVaccinationRequest({
    source: "staff_on_behalf",
    requester: {email: input.email, name: input.name, phone: input.phone},
    petId: input.petId,
    ownerNotes: input.ownerNotes,
    document: {bytes, declaredType: input.document.contentType},
    actor: {type: "staff", id: staff.staffId},
  });
  if (!result.ok) {
    return NextResponse.json({error: {code: result.code, message: result.message}}, {status: result.status});
  }
  return NextResponse.json({request: result.value}, {status: 201});
}
