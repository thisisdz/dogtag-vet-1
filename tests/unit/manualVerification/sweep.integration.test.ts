import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from "vitest";
import {randomUUID} from "node:crypto";
import mongoose from "mongoose";
import {startEphemeralMongod, stopEphemeralMongod, type EphemeralMongod} from "../helpers/ephemeralMongod";

/**
 * Test report finding 3: a request used to move to `issued` (and email the owner) only when someone
 * opened its page. Now three paths advance it with nobody looking:
 *   - the record confirm route syncs the linked request right after confirming,
 *   - the worker's sweep syncs every request waiting on the chain,
 *   - the sweep reconciles a linked record left `issuing` (reviewer signed, then closed the tab).
 * The chain check itself (`reconcileAnchoredRecord`) is stubbed to "anchored", applying what the real
 * one writes; everything else is real.
 */
vi.mock("@/auth", () => ({auth: vi.fn()}));
vi.mock("@/lib/mailer", () => ({sendMail: vi.fn(async () => "logged")}));
vi.mock("@/lib/records/reconcile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/records/reconcile")>();
  return {
    ...actual,
    reconcileAnchoredRecord: vi.fn(async (input: {recordId: string}) => {
      const {RecordArtifact} = await import("@/lib/models/RecordArtifact");
      await RecordArtifact.updateOne({recordId: input.recordId}, {$set: {status: "active"}});
      return {reconciled: true, contract: "0x86d9ac6c094783e6a27d3bdbb6ef868060256c75"};
    }),
  };
});

import {auth} from "@/auth";
import {sendMail} from "@/lib/mailer";
import {reconcileAnchoredRecord} from "@/lib/records/reconcile";
import {connectToDatabase} from "@/lib/db";
import {Staff} from "@/lib/models/Staff";
import {ClinicSettings} from "@/lib/models/ClinicSettings";
import {RecordArtifact} from "@/lib/models/RecordArtifact";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {sweepManualVerification} from "@/lib/manualVerification/sweep";
import {POST as confirmPOST} from "@/app/api/records/[id]/confirm/route";

const CLONE = "0x86d9ac6c094783e6a27d3bdbb6ef868060256c75";
const OPERATOR = "0x1500000000000000000000000000000000005cda";
let ephemeral: EphemeralMongod;

beforeAll(async () => {
  ephemeral = await startEphemeralMongod("dogtag-vet-manual-sweep");
  process.env.MONGODB_URI = ephemeral.uri;
  process.env.PUBLIC_BASE_URL = "https://verify.example.com";
  process.env.VET_ISSUER_FACTORY_ADDRESS = "0x0000000000000000000000000000000000faceac";
  await connectToDatabase();
  await Promise.all([ManualVerificationRequest.init(), RecordArtifact.init()]);
}, 90_000);

afterAll(async () => {
  await mongoose.connection.close();
  await stopEphemeralMongod(ephemeral);
});

afterEach(async () => {
  await Promise.all([Staff.deleteMany({}), ClinicSettings.deleteMany({}), RecordArtifact.deleteMany({}), ManualVerificationRequest.deleteMany({})]);
  vi.mocked(sendMail).mockClear();
  vi.mocked(reconcileAnchoredRecord).mockClear();
  vi.mocked(auth).mockReset();
});

/** An approved request whose record is in `recordStatus`; `issuingAt` defaults to just now. */
async function approved(recordStatus: string, extra: Record<string, unknown> = {}): Promise<{requestId: string; recordId: string}> {
  await ClinicSettings.updateOne(
    {_id: "singleton"},
    {$set: {cloneAddress: CLONE, businessProfile: {name: "DogTag Manual Verification", domain: "dogtagapp.com"}}},
    {upsert: true},
  );
  const recordId = randomUUID();
  await RecordArtifact.collection.insertOne({
    recordId,
    petId: randomUUID(),
    dogTagIdField: "7",
    recordType: "VACCINATION",
    root: `0x${"b".repeat(64)}`,
    leaves: [],
    status: recordStatus,
    chain: {chainId: 135, contract: CLONE, operator: OPERATOR, txHash: `0x${"c".repeat(64)}`},
    issuingAt: new Date(),
    ...extra,
  });
  const request = await ManualVerificationRequest.create({
    kind: "vaccination",
    status: "approved",
    source: "app",
    requester: {email: "sam@example.com", name: "Sam"},
    vaccination: {documentId: "d", documentSha256: "00", recordId},
  });
  return {requestId: request.requestId, recordId};
}

const statusOf = async (requestId: string) =>
  (await ManualVerificationRequest.findOne({requestId}).lean<ManualVerificationRequestDoc>())?.status;

describe("manual verification advances without anyone reopening the request", () => {
  it("the worker sweep issues a confirmed request and emails the owner once", async () => {
    const {requestId} = await approved("active");
    const first = await sweepManualVerification();
    expect(first).toMatchObject({checked: 1, issued: 1, failed: 0});
    expect(await statusOf(requestId)).toBe("issued");
    expect(sendMail).toHaveBeenCalledTimes(1);

    // The next sweep finds nothing waiting and sends nothing more.
    expect(await sweepManualVerification()).toMatchObject({checked: 0, issued: 0});
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("the sweep moves a failed issuance to needs attention", async () => {
    const {requestId} = await approved("error");
    expect(await sweepManualVerification()).toMatchObject({needsAttention: 1});
    expect(await statusOf(requestId)).toBe("needs_attention");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("the sweep leaves a request alone while its signature is still in flight", async () => {
    const {requestId} = await approved("issuing");
    expect(await sweepManualVerification()).toMatchObject({checked: 1, issued: 0});
    expect(reconcileAnchoredRecord).not.toHaveBeenCalled();
    expect(await statusOf(requestId)).toBe("approved");
  });

  it("the sweep reconciles a record left issuing after the reviewer closed the tab", async () => {
    const {requestId} = await approved("issuing", {issuingAt: new Date(Date.now() - 10 * 60_000)});
    expect(await sweepManualVerification()).toMatchObject({issued: 1});
    expect(reconcileAnchoredRecord).toHaveBeenCalledTimes(1);
    expect(await statusOf(requestId)).toBe("issued");
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("the sweep never touches a stale vet-issued record (no request behind it)", async () => {
    await RecordArtifact.collection.insertOne({
      recordId: randomUUID(),
      petId: randomUUID(),
      dogTagIdField: "8",
      recordType: "VACCINATION",
      root: `0x${"d".repeat(64)}`,
      leaves: [],
      status: "issuing",
      chain: {chainId: 135, contract: CLONE, operator: OPERATOR},
      issuingAt: new Date(Date.now() - 60 * 60_000),
    });
    await sweepManualVerification();
    expect(reconcileAnchoredRecord).not.toHaveBeenCalled();
  });

  it("the record confirm route issues the linked request immediately", async () => {
    const staff = await Staff.create({email: "dom@example.com", role: "owner"});
    vi.mocked(auth).mockResolvedValue({user: {staffId: staff.staffId, email: staff.email}} as never);
    const {requestId, recordId} = await approved("issuing");

    const res = await confirmPOST(new Request(`https://verify.example.com/api/records/${recordId}/confirm`, {method: "POST"}), {
      params: Promise.resolve({id: recordId}),
    });
    expect(res.status).toBe(200);
    expect(await statusOf(requestId)).toBe("issued");
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
