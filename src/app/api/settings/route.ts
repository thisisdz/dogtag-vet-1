import {NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/db";
import {getClinicSettings, updateClinicSettings} from "@/lib/models/ClinicSettings";
import {clinicSettingsInputSchema} from "@/lib/schemas/settings";
import {requireOwnerSession, requireStaffSession} from "@/lib/staffApi";

/** Readable by every staff member - TagIssueWizard and the secondary-owner actions read the clone
 * address from here. */
export async function GET() {
  const {response} = await requireStaffSession();
  if (response) return response;
  await connectToDatabase();
  const settings = await getClinicSettings();
  return NextResponse.json(settings);
}

/** Owner-only: these settings include where crypto payments are sent (`receivingAddresses`), the
 * clinic's chain identity, RPC overrides, and the issuer name/domain signed into every tag
 * attestation - none of which a `staff` or `vet` account may change. */
export async function PATCH(request: Request) {
  const {response} = await requireOwnerSession();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const parsed = clinicSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    // Keyed by the full dotted path (e.g. "businessProfile.domain") rather than zod's flatten(),
    // which only keeps top-level keys and would report every profile error under "businessProfile".
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path) (fieldErrors[path] ??= []).push(issue.message);
    }
    return NextResponse.json(
      {
        error: {
          code: "invalid_input",
          message: parsed.error.issues[0]?.message ?? "Malformed settings payload.",
          details: {formErrors: parsed.error.flatten().formErrors, fieldErrors},
        },
      },
      {status: 400},
    );
  }

  await connectToDatabase();
  const updated = await updateClinicSettings(parsed.data);
  return NextResponse.json(updated);
}
