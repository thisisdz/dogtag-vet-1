import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from "vitest";
import {randomUUID} from "node:crypto";
import mongoose from "mongoose";
import {startEphemeralMongod, stopEphemeralMongod, type EphemeralMongod} from "../helpers/ephemeralMongod";

/**
 * The manual verification VACCINATION flow through the real staff route handlers: file on an
 * owner's behalf -> review -> approve (record draft built WITHOUT authorizedVet) -> the record
 * confirms on chain (simulated by flipping the artifact to active, exactly what the existing record
 * confirm route does) -> sync moves the request to `issued`. Plus rejection, the tag requirement,
 * document checks and role gating. Chain reads are mocked like recordIssuance.integration.test.ts.
 */
vi.mock("@/auth", () => ({auth: vi.fn()}));
vi.mock("@/lib/chainRead", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chainRead")>();
  return {...actual, readEntityActive: vi.fn(), readOperatorWhitelisted: vi.fn()};
});

import {auth} from "@/auth";
import * as chainRead from "@/lib/chainRead";
import {connectToDatabase} from "@/lib/db";
import {Staff} from "@/lib/models/Staff";
import {ClinicSettings} from "@/lib/models/ClinicSettings";
import {Pet} from "@/lib/models/Pet";
import {RecordArtifact, type RecordArtifactDoc} from "@/lib/models/RecordArtifact";
import {ManualVerificationRequest} from "@/lib/models/ManualVerificationRequest";
import {ManualVerificationDocument} from "@/lib/models/ManualVerificationDocument";
import {GET as listGET, POST as createPOST} from "@/app/api/manual-verification/route";
import {GET as detailGET} from "@/app/api/manual-verification/[id]/route";
import {POST as reviewPOST} from "@/app/api/manual-verification/[id]/review/route";
import {POST as rejectPOST} from "@/app/api/manual-verification/[id]/reject/route";
import {POST as approvePOST} from "@/app/api/manual-verification/[id]/approve/route";
import {GET as documentGET} from "@/app/api/manual-verification/[id]/document/route";

const OUR_CLONE = "0x86d9ac6c094783e6a27d3bdbb6ef868060256c75";
const OPERATOR = "0x1500000000000000000000000000000000005cda";
const PDF = Buffer.from("%PDF-1.7\nRabies certificate - Biscuit - Rabvac 3 - LOT-998");
const FORM = {
  targetDisease: "rabies",
  vaccineProductName: "Rabvac 3",
  vaccineManufacturer: "Boehringer Ingelheim",
  batchLotNumber: "LOT-998",
  vaccinationDate: "2026-09-01",
  validFrom: "2026-09-01",
  validUntil: "2027-09-01",
};

let ephemeral: EphemeralMongod;

beforeAll(async () => {
  ephemeral = await startEphemeralMongod("dogtag-vet-manual-vaccination");
  process.env.MONGODB_URI = ephemeral.uri;
  process.env.ENTITY_REGISTRY_ADDRESS = "0x000000000000000000000000000000000000ee00";
  process.env.DOGTAG_SBT_ADDRESS = "0x000000000000000000000000000000000000cbcd";
  process.env.VET_ISSUER_FACTORY_ADDRESS = "0x0000000000000000000000000000000000faceac";
  await connectToDatabase();
  await Promise.all([RecordArtifact.init(), ManualVerificationRequest.init()]);
}, 90_000);

afterAll(async () => {
  await mongoose.connection.close();
  await stopEphemeralMongod(ephemeral);
});

afterEach(async () => {
  await Promise.all([
    Staff.deleteMany({}),
    ClinicSettings.deleteMany({}),
    Pet.deleteMany({}),
    RecordArtifact.deleteMany({}),
    ManualVerificationRequest.deleteMany({}),
    ManualVerificationDocument.deleteMany({}),
  ]);
  vi.mocked(auth).mockReset();
});

async function signIn(role: "owner" | "vet" | "staff"): Promise<string> {
  const staff = await Staff.create({email: `${role}-${randomUUID()}@example.com`, role, firstName: "Dom", lastName: "Reviewer"});
  vi.mocked(auth).mockResolvedValue({user: {staffId: staff.staffId, email: staff.email}} as never);
  return staff.staffId;
}

async function seed(opts: {tagged?: boolean} = {}): Promise<string> {
  await ClinicSettings.create({
    _id: "singleton",
    cloneAddress: OUR_CLONE,
    entityAccount: "0x0000000000000000000000000000000000ea7171",
    businessProfile: {name: "DogTag Manual Verification", domain: "dogtagapp.com"},
  });
  const petId = randomUUID();
  await Pet.create({
    petId,
    name: "Biscuit",
    ownerClientIds: ["client-1"],
    dogTag: opts.tagged === false ? {} : {dogTagIdDec: "777", dogTagIdField: "777", root: `0x${"a".repeat(64)}`, status: "active", cloneAddress: OUR_CLONE},
    searchKey: "biscuit",
  });
  vi.mocked(chainRead.readEntityActive).mockResolvedValue(true);
  vi.mocked(chainRead.readOperatorWhitelisted).mockResolvedValue(true);
  return petId;
}

const post = (url: string, body: unknown) =>
  new Request(url, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
const params = (id: string) => ({params: Promise.resolve({id})});
const base = "https://vet.example.com/api/manual-verification";

function createBody(petId: string, document = {contentType: "application/pdf", base64: PDF.toString("base64")}) {
  return {kind: "vaccination", petId, email: "Sam@Example.com", name: "Sam Owner", ownerNotes: "Rabies shot", document};
}

async function fileRequest(petId: string): Promise<string> {
  const res = await createPOST(post(base, createBody(petId)));
  expect(res.status).toBe(201);
  return (await res.json()).request.requestId;
}

describe("manual verification - vaccination flow", () => {
  it("files, reviews, approves without authorizedVet, and syncs to issued once the record confirms", async () => {
    await signIn("owner");
    const petId = await seed();
    const requestId = await fileRequest(petId);

    const filed = await ManualVerificationRequest.findOne({requestId}).lean();
    expect(filed).toMatchObject({kind: "vaccination", status: "submitted", source: "staff_on_behalf", petId, clientId: "client-1"});
    expect(filed?.requester.email).toBe("sam@example.com");
    expect(filed?.vaccination?.dogTagIdDec).toBe("777");

    // The reviewer sees it in the default "needs me" queue and can open the document.
    const queue = await (await listGET(new Request(base))).json();
    expect(queue.requests.map((r: {requestId: string}) => r.requestId)).toEqual([requestId]);
    const docRes = await documentGET(new Request(`${base}/${requestId}/document`), params(requestId));
    expect(docRes.status).toBe(200);
    expect(docRes.headers.get("content-type")).toBe("application/pdf");
    expect(docRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(docRes.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await docRes.arrayBuffer()).equals(PDF)).toBe(true);

    expect((await reviewPOST(new Request(`${base}/${requestId}/review`, {method: "POST"}), params(requestId))).status).toBe(200);

    const approveRes = await approvePOST(
      post(`${base}/${requestId}/approve`, {operatorAddress: OPERATOR, form: FORM, certificate: {vetClinicName: "Riverside Vet", vetName: "Dr. Tan"}}),
      params(requestId),
    );
    expect(approveRes.status).toBe(200);
    const approved = (await approveRes.json()).request;
    expect(approved.status).toBe("approved");
    expect(approved.vaccination.certificate).toEqual({vetClinicName: "Riverside Vet", vetName: "Dr. Tan"});

    // The record draft carries DogTag's manual-verification issuer identity and NO authorizedVet leaf.
    const record = await RecordArtifact.findOne({recordId: approved.vaccination.recordId}).lean<RecordArtifactDoc>();
    expect(record?.status).toBe("draft");
    const keyPaths = record!.leaves.map((l) => l.keyPath);
    expect(keyPaths).not.toContain("authorizedVet");
    expect(record!.leaves.find((l) => l.keyPath === "issuer.name")?.value).toContain("DogTag Manual Verification");

    // Still waiting on the reviewer (to sign) - it stays in "needs me".
    const stillQueued = await (await listGET(new Request(base))).json();
    expect(stillQueued.requests).toHaveLength(1);

    // Before the chain confirms, sync changes nothing.
    expect((await (await detailGET(new Request(`${base}/${requestId}`), params(requestId))).json()).request.status).toBe("approved");

    // The existing record confirm route flips the artifact to active once the chain agrees.
    await RecordArtifact.updateOne({recordId: approved.vaccination.recordId}, {$set: {status: "active"}});
    const synced = (await (await detailGET(new Request(`${base}/${requestId}`), params(requestId))).json()).request;
    expect(synced.status).toBe("issued");
    expect(synced.events.map((e: {action: string}) => e.action)).toEqual(["submitted", "review_started", "approved", "record_confirmed_on_chain"]);

    // Issued is waiting on the owner to claim, not on the reviewer.
    expect((await (await listGET(new Request(base))).json()).requests).toHaveLength(0);
  });

  it("refuses approval before review and approval of an unlinked request", async () => {
    await signIn("owner");
    const petId = await seed();
    const requestId = await fileRequest(petId);
    const res = await approvePOST(post(`${base}/${requestId}/approve`, {operatorAddress: OPERATOR, form: FORM}), params(requestId));
    expect(res.status).toBe(409);
    expect(await RecordArtifact.countDocuments()).toBe(0);
  });

  it("rejects with a reason, requires a note for 'other', and refuses to reject once on chain", async () => {
    await signIn("owner");
    const petId = await seed();
    const requestId = await fileRequest(petId);

    expect((await rejectPOST(post(`${base}/${requestId}/reject`, {reasonCode: "other"}), params(requestId))).status).toBe(400);
    const res = await rejectPOST(post(`${base}/${requestId}/reject`, {reasonCode: "document_illegible"}), params(requestId));
    expect(res.status).toBe(200);
    const rejected = (await res.json()).request;
    expect(rejected.status).toBe("rejected");
    expect(rejected.decision.reasonCode).toBe("document_illegible");

    // A second request that reaches the chain can no longer be rejected.
    const second = await fileRequest(petId);
    await reviewPOST(new Request(`${base}/${second}/review`, {method: "POST"}), params(second));
    const approved = (await (await approvePOST(post(`${base}/${second}/approve`, {operatorAddress: OPERATOR, form: FORM}), params(second))).json()).request;
    await RecordArtifact.updateOne({recordId: approved.vaccination.recordId}, {$set: {status: "issuing"}});
    const refused = await rejectPOST(post(`${base}/${second}/reject`, {reasonCode: "duplicate"}), params(second));
    expect(refused.status).toBe(409);
    expect((await refused.json()).error.code).toBe("already_on_chain");
  });

  it("requires the pet to already have a DogTag", async () => {
    await signIn("owner");
    const petId = await seed({tagged: false});
    const res = await createPOST(post(base, createBody(petId)));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("tag_required");
    expect(await ManualVerificationDocument.countDocuments()).toBe(0);
  });

  it("refuses a file whose contents are not the declared type", async () => {
    await signIn("owner");
    const petId = await seed();
    const html = Buffer.from("<html><script>alert(1)</script>").toString("base64");
    const res = await createPOST(post(base, createBody(petId, {contentType: "application/pdf", base64: html})));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("document_unsupported_type");
  });

  it("is closed to plain staff accounts", async () => {
    await signIn("staff");
    const petId = await seed();
    expect((await createPOST(post(base, createBody(petId)))).status).toBe(403);
    expect((await listGET(new Request(base))).status).toBe(403);
  });
});
