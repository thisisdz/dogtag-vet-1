import {NextResponse} from "next/server";
import {connectToDatabase} from "@/lib/db";
import {Pet, type PetDoc} from "@/lib/models/Pet";
import {listRecordArtifactsForPet} from "@/lib/records/artifact";
import {createVaccinationDraft} from "@/lib/records/createVaccinationDraft";
import {createRecordArtifactSchema} from "@/lib/schemas/recordIssuance";
import {practitionerDisplayName} from "@/lib/staffRoleTone";
import type {StaffDoc} from "@/lib/models/Staff";
import {badRequest, notFound, requireStaffSession, requireVetSession} from "@/lib/staffApi";

/** Plan section 11.2 V2's context field: the certifying practitioner's composed name + government
 * accreditation number - `practitionerDisplayName` already composes name/title (WP4.13); this adds
 * the accreditation number, distinct from both `issuer.operator` (the wallet) and `issuer.contract`
 * (the clinic's on-chain contract). Derived from the SIGNED-IN vet's OWN staff record only - never
 * client-supplied - so one vet can never attest to being another. */
function composeAuthorizedVet(staff: Pick<StaffDoc, "firstName" | "lastName" | "title" | "displayName" | "email" | "accreditationNumber">): string {
  const name = practitionerDisplayName(staff);
  const accreditation = staff.accreditationNumber?.trim();
  return accreditation ? `${name} (${accreditation})` : name;
}

/** `GET /api/pets/:id/records` - the Records tab's list source (plan section 11.2 V4), newest
 * first. Staff-gated (not vet-gated) like every other read/list route in this app - `POST` below,
 * the actual issuance start, is where the vet-role gate applies. */
export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const {response} = await requireStaffSession();
  if (response) return response;

  const {id: petId} = await params;
  await connectToDatabase();
  const pet = await Pet.findOne({petId}).lean<PetDoc>();
  if (!pet) return notFound("Pet not found.");

  const records = await listRecordArtifactsForPet(petId);
  return NextResponse.json({records});
}

/**
 * `POST /api/pets/:id/records` - plan section 11.2 V3, step 1: build the leaves + root SERVER-SIDE
 * (no owner-device round trip - a record carries no owner-control leaves to bind) and store a
 * `draft` `RecordArtifact` row. Vet-gated, mirroring `api/tags/issue/start/route.ts`'s own WP4.7A
 * ruling R1 exactly - this is the first step of the SAME issuance flow `tx`/`confirm`/`attestation`
 * already gate.
 *
 * The build/store itself lives in `createVaccinationDraft` (shared with the manual verification
 * track), which runs `preflightIssuance` before anything is built or stored.
 */
export async function POST(request: Request, {params}: {params: Promise<{id: string}>}) {
  const {staff, response} = await requireVetSession();
  if (response) return response;

  const {id: petId} = await params;
  const body = await request.json().catch(() => null);
  const parsed = createRecordArtifactSchema.safeParse(body);
  if (!parsed.success) return badRequest("Malformed record-issuance request.", parsed.error.flatten());
  const input = parsed.data;

  const created = await createVaccinationDraft({
    petId,
    form: input.form,
    conformsTo: input.conformsTo,
    operatorAddress: input.operatorAddress as `0x${string}`,
    authorizedVet: staff ? composeAuthorizedVet(staff) : undefined,
  });
  if (!created.ok) return created.status === 404 ? notFound(created.message) : badRequest(created.message);

  return NextResponse.json({record: created.record}, {status: 201});
}
