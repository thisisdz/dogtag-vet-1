import {connectToDatabase} from "@/lib/db";
import {Pet, type PetDoc} from "@/lib/models/Pet";
import {getClinicSettings} from "@/lib/models/ClinicSettings";
import type {RecordArtifactDoc} from "@/lib/models/RecordArtifact";
import {roax} from "@/lib/chains";
import {preflightIssuance} from "@/lib/mint/preflight";
import {buildVaccinationRecord, VACCINATION_SCHEMA_ID, VACCINATION_SCHEMA_VERSION} from "@/lib/records/build";
import {createRecordArtifact} from "@/lib/records/artifact";
import type {VaccinationRecordFormInput} from "@/lib/schemas/recordIssuance";

export interface CreateVaccinationDraftInput {
  petId: string;
  form: VaccinationRecordFormInput;
  conformsTo?: {standard: string; version: string}[];
  operatorAddress: `0x${string}`;
  /**
   * The certifying practitioner leaf. The vet track passes the signed-in vet; the manual
   * verification track passes nothing, so a record built from an owner-supplied document never
   * claims the reviewer administered the vaccine (docs/MANUAL-VERIFICATION-PLAN.md).
   */
  authorizedVet?: string;
}

export type CreateVaccinationDraftResult =
  | {ok: true; record: RecordArtifactDoc}
  | {ok: false; status: 400 | 404; message: string};

/**
 * Builds a vaccination record's leaves + root server-side and stores it as a `draft` RecordArtifact
 * (plan section 11.2 V3, step 1). Shared by `POST /api/pets/:id/records` (vet track) and the manual
 * verification approve route.
 *
 * `preflightIssuance` runs BEFORE anything is built or stored - a misconfigured clinic, an inactive
 * entity, or a non-whitelisted operator wallet never gets even a draft row, mirroring
 * `api/tags/issue/start/route.ts`'s "preflight before allocating anything".
 */
export async function createVaccinationDraft(input: CreateVaccinationDraftInput): Promise<CreateVaccinationDraftResult> {
  const preflight = await preflightIssuance(input.operatorAddress);
  if (!preflight.ok) return {ok: false, status: 400, message: preflight.message};

  await connectToDatabase();
  const pet = await Pet.findOne({petId: input.petId}).lean<PetDoc>();
  if (!pet) return {ok: false, status: 404, message: "Pet not found."};
  if (!pet.dogTag.dogTagIdField) {
    return {ok: false, status: 400, message: "This pet has no issued DogTag yet - issue a tag before issuing records."};
  }

  const settings = await getClinicSettings();
  const {leaves, root} = buildVaccinationRecord(input.form, {
    dogTagIdField: pet.dogTag.dogTagIdField,
    issuer: {
      chainId: roax.id,
      contract: preflight.cloneAddress,
      operator: input.operatorAddress,
      name: settings.businessProfile?.name,
      domain: settings.businessProfile?.domain,
    },
    authorizedVet: input.authorizedVet,
  });

  const created = await createRecordArtifact({
    petId: input.petId,
    dogTagIdField: pet.dogTag.dogTagIdField,
    recordType: "VACCINATION",
    schemaId: VACCINATION_SCHEMA_ID,
    schemaVersion: VACCINATION_SCHEMA_VERSION,
    protocolVersion: "dogtag-v2/1",
    root,
    leaves,
    chain: {chainId: roax.id, contract: preflight.cloneAddress, operator: input.operatorAddress},
    conformsTo: input.conformsTo,
  });
  if (!created.ok) {
    // Server bug, not a caller input problem - buildVaccinationRecord's own output should always
    // verify (tests/unit/records/build.test.ts proves this end to end); refuse rather than store an
    // artifact this deployment's own verifier does not accept.
    console.error(`record leaf-commitment self-check failed for pet ${input.petId}: ${created.reason}`);
    return {ok: false, status: 400, message: "Could not build a valid record artifact. Try again."};
  }
  return {ok: true, record: created.record};
}
