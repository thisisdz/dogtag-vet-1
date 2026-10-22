import {NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/db";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {approveVaccination} from "@/lib/manualVerification/service";
import {approveVaccinationRequestSchema} from "@/lib/schemas/manualVerification";
import {badRequest, notFound, requireVetSession} from "@/lib/staffApi";

/**
 * `POST /api/manual-verification/:id/approve` - vaccination: `{operatorAddress, form, conformsTo?,
 * certificate?}` with the reviewer-confirmed fields. Creates the record draft (no `authorizedVet`)
 * that the reviewer then signs on chain in MetaMask. Nothing is signed here.
 */
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const {staff, response} = await requireVetSession();
  if (response) return response;

  const {id} = await params;
  await connectToDatabase();
  const existing = await ManualVerificationRequest.findOne({requestId: id}).lean<ManualVerificationRequestDoc>();
  if (!existing) return notFound("Request not found.");
  if (existing.kind !== "vaccination") return badRequest("DogTag requests are approved from the DogTag review panel.");

  const parsed = approveVaccinationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Check the record fields.", parsed.error.flatten());

  const result = await approveVaccination(existing, {
    staffId: staff.staffId,
    operatorAddress: parsed.data.operatorAddress as `0x${string}`,
    form: parsed.data.form,
    conformsTo: parsed.data.conformsTo,
    certificate: parsed.data.certificate,
  });
  if (!result.ok) return NextResponse.json({error: {code: result.code, message: result.message}}, {status: result.status});
  return NextResponse.json(result.value);
}
