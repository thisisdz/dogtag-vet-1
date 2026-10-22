import {NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/db";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {issueAndSendClaim} from "@/lib/manualVerification/claims";
import {badRequest, notFound, requireVetSession} from "@/lib/staffApi";

/**
 * `POST /api/manual-verification/:id/resend-claim` - issues a NEW claim link (the old one stops
 * working), emails it, and returns it once so the reviewer can also copy it into a message of
 * their own. Response: `{url, expiresAt, email: "sent" | "logged" | "failed"}`.
 */
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const {staff, response} = await requireVetSession();
  if (response) return response;

  const {id} = await params;
  await connectToDatabase();
  const existing = await ManualVerificationRequest.findOne({requestId: id}).lean<ManualVerificationRequestDoc>();
  if (!existing) return notFound("Request not found.");
  const claimable = existing.kind === "vaccination" ? ["issued", "claimed"] : ["approved", "bound", "issued"];
  if (!claimable.includes(existing.status)) return badRequest("There's nothing for the owner to claim yet.");

  const claim = await issueAndSendClaim(existing, {type: "staff", id: staff.staffId}, new URL(request.url).origin);
  if (!claim) return badRequest("Could not issue a new link. Try again.");
  return NextResponse.json({url: claim.url, expiresAt: claim.expiresAt, email: claim.email});
}
