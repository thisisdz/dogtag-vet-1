import {NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/db";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {syncRequest} from "@/lib/manualVerification/sync";
import {notFound, requireVetSession} from "@/lib/staffApi";

/** `GET /api/manual-verification/:id` - one request with its audit trail, synced with the chain
 * first so the reviewer always sees the current state. */
export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const {response} = await requireVetSession();
  if (response) return response;

  const {id} = await params;
  await connectToDatabase();
  const request = await ManualVerificationRequest.findOne({requestId: id}).lean<ManualVerificationRequestDoc>();
  if (!request) return notFound("Request not found.");
  return NextResponse.json({request: await syncRequest(request)});
}
