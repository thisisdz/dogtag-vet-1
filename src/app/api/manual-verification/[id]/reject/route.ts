import {NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/db";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {rejectRequest} from "@/lib/manualVerification/service";
import type {ManualVerificationRejectReason} from "@/lib/manualVerification/reasonCodes";
import {rejectRequestSchema} from "@/lib/schemas/manualVerification";
import {badRequest, notFound, requireVetSession} from "@/lib/staffApi";

/** `POST /api/manual-verification/:id/reject` - `{reasonCode, note?}`; the owner sees the reason. */
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const {staff, response} = await requireVetSession();
  if (response) return response;

  const parsed = rejectRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Malformed request.", parsed.error.flatten());

  const {id} = await params;
  await connectToDatabase();
  const existing = await ManualVerificationRequest.findOne({requestId: id}).lean<ManualVerificationRequestDoc>();
  if (!existing) return notFound("Request not found.");

  const result = await rejectRequest(existing, {
    staffId: staff.staffId,
    reasonCode: parsed.data.reasonCode as ManualVerificationRejectReason,
    note: parsed.data.note,
  });
  if (!result.ok) return NextResponse.json({error: {code: result.code, message: result.message}}, {status: result.status});
  return NextResponse.json({request: result.value});
}
