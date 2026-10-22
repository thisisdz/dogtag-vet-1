import {NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/db";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {startReview} from "@/lib/manualVerification/service";
import {notFound, requireVetSession} from "@/lib/staffApi";

/** `POST /api/manual-verification/:id/review` - the reviewer opens a submitted request. */
export async function POST(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const {staff, response} = await requireVetSession();
  if (response) return response;

  const {id} = await params;
  await connectToDatabase();
  const request = await ManualVerificationRequest.findOne({requestId: id}).lean<ManualVerificationRequestDoc>();
  if (!request) return notFound("Request not found.");

  const result = await startReview(request, staff.staffId);
  if (!result.ok) return NextResponse.json({error: {code: result.code, message: result.message}}, {status: result.status});
  return NextResponse.json({request: result.value});
}
