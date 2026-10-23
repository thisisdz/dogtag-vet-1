import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from "vitest";
import {randomUUID} from "node:crypto";
import {writeFileSync} from "node:fs";
import mongoose from "mongoose";
import {startEphemeralMongod, stopEphemeralMongod, type EphemeralMongod} from "../helpers/ephemeralMongod";

/**
 * Ten end-to-end test runs of DogTag manual verification, through the real staff route handlers,
 * services, models and a real (ephemeral) MongoDB. Only three things are stood in for:
 *   - sign-in (`@/auth` mocked to a staff session),
 *   - the mailer (captured instead of sent - no SMTP in tests),
 *   - the chain: issuance is confirmed by flipping the record artifact to `active`, exactly what the
 *     existing record confirm route does once the chain agrees (no MetaMask, nothing on chain).
 *
 * Every step is logged (action, expected, actual, duration, pass/fail). With MV_RUN_REPORT=<path>
 * the log is written there as JSON for docs/MANUAL-VERIFICATION-TEST-REPORT.md; without it this is
 * an ordinary regression test.
 */
vi.hoisted(() => {
  // A 1 MB document quota so run 6 can prove the storage guard without writing 250 MB.
  process.env.MANUAL_VERIFICATION_STORAGE_QUOTA_MB = "1";
});
vi.mock("@/auth", () => ({auth: vi.fn()}));
vi.mock("@/lib/mailer", () => ({sendMail: vi.fn(async () => "logged")}));
vi.mock("@/lib/chainRead", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chainRead")>();
  return {...actual, readEntityActive: vi.fn(), readOperatorWhitelisted: vi.fn()};
});

import {auth} from "@/auth";
import {sendMail} from "@/lib/mailer";
import * as chainRead from "@/lib/chainRead";
import {connectToDatabase} from "@/lib/db";
import {Staff} from "@/lib/models/Staff";
import {ClinicSettings} from "@/lib/models/ClinicSettings";
import {Pet} from "@/lib/models/Pet";
import {RecordArtifact, type RecordArtifactDoc} from "@/lib/models/RecordArtifact";
import {ArtifactExportSession} from "@/lib/models/ArtifactExportSession";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {ManualVerificationDocument} from "@/lib/models/ManualVerificationDocument";
import {syncRequest} from "@/lib/manualVerification/sync";
import {findRequestByClaimToken} from "@/lib/manualVerification/claims";
import {computeRecordRoot} from "@/lib/records/build";
import {GET as listGET, POST as createPOST} from "@/app/api/manual-verification/route";
import {GET as detailGET} from "@/app/api/manual-verification/[id]/route";
import {POST as reviewPOST} from "@/app/api/manual-verification/[id]/review/route";
import {POST as rejectPOST} from "@/app/api/manual-verification/[id]/reject/route";
import {POST as approvePOST} from "@/app/api/manual-verification/[id]/approve/route";
import {GET as documentGET} from "@/app/api/manual-verification/[id]/document/route";
import {POST as resendPOST} from "@/app/api/manual-verification/[id]/resend-claim/route";
import * as redeemRoute from "@/app/v1/manual-verification/claims/[token]/redeem/route";

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const CLONE = "0x86d9ac6c094783e6a27d3bdbb6ef868060256c75";
const OPERATOR = "0x1500000000000000000000000000000000005cda";
const BASE = "https://verify.example.com/api/manual-verification";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (size = 2048) => Buffer.concat([PNG_SIGNATURE, Buffer.alloc(size - PNG_SIGNATURE.length, 7)]);
const PDF = Buffer.from("%PDF-1.7\nRabies certificate - Biscuit - Rabvac 3 - LOT-998\n%%EOF");
const FORM = {
  targetDisease: "rabies",
  vaccineProductName: "Rabvac 3",
  vaccineManufacturer: "Boehringer Ingelheim",
  batchLotNumber: "LOT-998",
  vaccinationDate: "2026-09-01",
  validFrom: "2026-09-01",
  validUntil: "2027-09-01",
};

// ---------------------------------------------------------------------------------------------
// The step log
// ---------------------------------------------------------------------------------------------

interface StepLog {
  action: string;
  expected: string;
  actual: string;
  ms: number;
  pass: boolean;
}
interface RunLog {
  run: number;
  title: string;
  steps: StepLog[];
  ms: number;
  pass: boolean;
  email?: {to: string; subject: string; hasButtonLink: boolean; hasInlineQr: boolean; linkPattern: string};
}
const runs: RunLog[] = [];

/** Runs one logged step: `fn` asserts with expect() and returns the observed outcome as text. */
async function step(run: RunLog, action: string, expected: string, fn: () => Promise<string>): Promise<void> {
  const started = performance.now();
  try {
    const actual = await fn();
    run.steps.push({action, expected, actual, ms: Math.round(performance.now() - started), pass: true});
  } catch (err) {
    run.steps.push({action, expected, actual: `FAILED: ${(err as Error).message.split("\n")[0]}`, ms: Math.round(performance.now() - started), pass: false});
    throw err;
  }
}

/** Declares one of the ten runs; its log is kept even when a step fails. */
function testRun(n: number, title: string, body: (run: RunLog) => Promise<void>) {
  it(`run ${n}: ${title}`, async () => {
    const run: RunLog = {run: n, title, steps: [], ms: 0, pass: false};
    runs.push(run);
    const started = performance.now();
    try {
      await body(run);
      run.pass = run.steps.every((s) => s.pass);
    } finally {
      run.ms = Math.round(performance.now() - started);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Helpers over the real routes
// ---------------------------------------------------------------------------------------------

const post = (url: string, body?: unknown) =>
  new Request(url, {method: "POST", headers: {"content-type": "application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
const params = (id: string) => ({params: Promise.resolve({id})});
const redeem = (token: string, method = "POST") =>
  redeemRoute.POST(new Request(`https://verify.example.com/v1/manual-verification/claims/${token}/redeem`, {method}), {params: Promise.resolve({token})});

async function signIn(role: "owner" | "vet" | "staff"): Promise<void> {
  const staff = await Staff.create({email: `${role}-${randomUUID()}@example.com`, role, firstName: "Dom", lastName: "Reviewer"});
  vi.mocked(auth).mockResolvedValue({user: {staffId: staff.staffId, email: staff.email}} as never);
}

async function seed(opts: {tagged?: boolean} = {}): Promise<string> {
  await ClinicSettings.updateOne(
    {_id: "singleton"},
    {$set: {cloneAddress: CLONE, entityAccount: "0x0000000000000000000000000000000000ea7171", businessProfile: {name: "DogTag Manual Verification", domain: "dogtagapp.com"}}},
    {upsert: true},
  );
  const petId = randomUUID();
  await Pet.create({
    petId,
    name: "Biscuit",
    ownerClientIds: ["client-1"],
    dogTag: opts.tagged === false ? {} : {dogTagIdDec: "777", dogTagIdField: "777", root: `0x${"a".repeat(64)}`, status: "active", cloneAddress: CLONE},
    searchKey: "biscuit",
  });
  vi.mocked(chainRead.readEntityActive).mockResolvedValue(true);
  vi.mocked(chainRead.readOperatorWhitelisted).mockResolvedValue(true);
  return petId;
}

function fileBody(petId: string, doc: {contentType: string; bytes: Buffer}) {
  return {kind: "vaccination", petId, email: "Sam@Example.com", name: "Sam Owner", ownerNotes: "Rabies shot", document: {contentType: doc.contentType, base64: doc.bytes.toString("base64")}};
}

async function file(petId: string, doc = {contentType: "image/png", bytes: png()}): Promise<Response> {
  return createPOST(post(BASE, fileBody(petId, doc)));
}

async function detail(requestId: string): Promise<ManualVerificationRequestDoc> {
  return (await (await detailGET(new Request(`${BASE}/${requestId}`), params(requestId))).json()).request;
}

/** File -> review -> approve. Returns the request id and the record draft's id. */
async function fileReviewApprove(petId: string, doc?: {contentType: string; bytes: Buffer}) {
  const filed = await file(petId, doc);
  const requestId = (await filed.json()).request.requestId as string;
  await reviewPOST(post(`${BASE}/${requestId}/review`), params(requestId));
  const approved = (await (await approvePOST(post(`${BASE}/${requestId}/approve`, {operatorAddress: OPERATOR, form: FORM}), params(requestId))).json()).request;
  return {requestId, recordId: approved.vaccination.recordId as string};
}

/** Stand-in for the chain: what the record confirm route does once issueRecord is verified. */
const confirmOnChain = (recordId: string) => RecordArtifact.updateOne({recordId}, {$set: {status: "active"}});

function lastEmailToken(): string {
  const mail = vi.mocked(sendMail).mock.calls.at(-1)![0];
  const match = /\/claim\/([0-9a-f]{32})/.exec(mail.text);
  if (!match) throw new Error("no claim link in the email");
  return match[1]!;
}

function captureEmail(run: RunLog) {
  const mail = vi.mocked(sendMail).mock.calls.at(-1)![0];
  run.email = {
    to: mail.to,
    subject: mail.subject,
    hasButtonLink: /href="[^"]*\/claim\/[0-9a-f]{32}"/.test(mail.html ?? ""),
    hasInlineQr: (mail.html ?? "").includes("cid:dogtag-claim-qr") && mail.attachments?.[0]?.cid === "dogtag-claim-qr",
    linkPattern: "/claim/<32 hex>",
  };
}

// ---------------------------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------------------------

let ephemeral: EphemeralMongod;

beforeAll(async () => {
  ephemeral = await startEphemeralMongod("dogtag-vet-manual-test-runs");
  process.env.MONGODB_URI = ephemeral.uri;
  process.env.PUBLIC_BASE_URL = "https://verify.example.com";
  process.env.ENTITY_REGISTRY_ADDRESS = "0x000000000000000000000000000000000000ee00";
  process.env.DOGTAG_SBT_ADDRESS = "0x000000000000000000000000000000000000cbcd";
  process.env.VET_ISSUER_FACTORY_ADDRESS = "0x0000000000000000000000000000000000faceac";
  await connectToDatabase();
  await Promise.all([RecordArtifact.init(), ManualVerificationRequest.init()]);
}, 90_000);

afterAll(async () => {
  if (process.env.MV_RUN_REPORT) {
    writeFileSync(
      process.env.MV_RUN_REPORT,
      JSON.stringify({generatedAt: new Date().toISOString(), node: process.version, runs: [...runs].sort((a, b) => a.run - b.run)}, null, 2),
    );
  }
  await mongoose.connection.close();
  await stopEphemeralMongod(ephemeral);
});

afterEach(async () => {
  await Promise.all([
    Staff.deleteMany({}),
    ClinicSettings.deleteMany({}),
    Pet.deleteMany({}),
    RecordArtifact.deleteMany({}),
    ArtifactExportSession.deleteMany({}),
    ManualVerificationRequest.deleteMany({}),
    ManualVerificationDocument.deleteMany({}),
  ]);
  vi.mocked(sendMail).mockClear();
  vi.mocked(auth).mockReset();
});

// ---------------------------------------------------------------------------------------------
// The ten runs
// ---------------------------------------------------------------------------------------------

describe("manual verification - 10 test runs", () => {
  /** Runs 1 and 2 share the whole happy path; only the certificate's file type differs. */
  async function happyPath(run: RunLog, doc: {contentType: string; bytes: Buffer}) {
    await signIn("owner");
    const petId = await seed();
    let requestId = "";
    let recordId = "";

    await step(run, "Reviewer files the owner's certificate", "201, status submitted, requester email normalised", async () => {
      const res = await file(petId, doc);
      expect(res.status).toBe(201);
      const request = (await res.json()).request;
      requestId = request.requestId;
      expect(request.status).toBe("submitted");
      expect(request.requester.email).toBe("sam@example.com");
      return `${res.status}, ${request.status}, ${request.requester.email}`;
    });
    await step(run, "Request appears in the 'Needs me' queue", "exactly this request", async () => {
      const queue = (await (await listGET(new Request(BASE))).json()).requests as {requestId: string}[];
      expect(queue.map((r) => r.requestId)).toEqual([requestId]);
      return `${queue.length} request in queue`;
    });
    await step(run, "Reviewer opens the document", `200, ${doc.contentType}, nosniff, no-store, identical bytes`, async () => {
      const res = await documentGET(new Request(`${BASE}/${requestId}/document`), params(requestId));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(doc.contentType);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("cache-control")).toBe("no-store");
      const served = Buffer.from(await res.arrayBuffer());
      expect(served.equals(doc.bytes)).toBe(true);
      return `${res.status}, ${res.headers.get("content-type")}, ${served.length} bytes identical`;
    });
    await step(run, "Start review", "200, status in_review", async () => {
      const res = await reviewPOST(post(`${BASE}/${requestId}/review`), params(requestId));
      expect(res.status).toBe(200);
      expect((await res.json()).request.status).toBe("in_review");
      return `${res.status}, in_review`;
    });
    await step(run, "Approve with the transcribed record", "200, status approved, record draft created", async () => {
      const res = await approvePOST(
        post(`${BASE}/${requestId}/approve`, {operatorAddress: OPERATOR, form: FORM, certificate: {vetClinicName: "Riverside Vet", vetName: "Dr. Tan"}}),
        params(requestId),
      );
      expect(res.status).toBe(200);
      const request = (await res.json()).request;
      expect(request.status).toBe("approved");
      recordId = request.vaccination.recordId;
      return `${res.status}, approved, record ${recordId.slice(0, 8)}…`;
    });
    await step(run, "Inspect the record draft", "issuer = DogTag Manual Verification, no authorizedVet leaf, root recomputes", async () => {
      const record = await RecordArtifact.findOne({recordId}).lean<RecordArtifactDoc>();
      expect(record?.status).toBe("draft");
      const keyPaths = record!.leaves.map((l) => l.keyPath);
      expect(keyPaths).not.toContain("authorizedVet");
      expect(record!.leaves.find((l) => l.keyPath === "issuer.name")?.value).toContain("DogTag Manual Verification");
      expect(computeRecordRoot(record!.leaves)).toBe(record!.root);
      return `${record!.leaves.length} leaves, no authorizedVet, root matches`;
    });
    await step(run, "Before the chain confirms, sync changes nothing", "still approved, no email", async () => {
      expect((await detail(requestId)).status).toBe("approved");
      expect(sendMail).not.toHaveBeenCalled();
      return "approved, 0 emails";
    });
    await step(run, "Chain confirms (simulated) and the request syncs", "status issued, one claim email to the owner", async () => {
      await confirmOnChain(recordId);
      const synced = await detail(requestId);
      expect(synced.status).toBe("issued");
      expect(sendMail).toHaveBeenCalledTimes(1);
      captureEmail(run);
      expect(run.email).toMatchObject({to: "sam@example.com", hasButtonLink: true, hasInlineQr: true});
      return `issued, 1 email "${run.email!.subject}" with button link and inline QR`;
    });
    await step(run, "Claim link stored only as a hash", "sha256 stored, token never in the database", async () => {
      const token = lastEmailToken();
      const stored = await ManualVerificationRequest.findOne({requestId}).lean<ManualVerificationRequestDoc>();
      expect(stored?.claim?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored)).not.toContain(token);
      return "hash only";
    });
    await step(run, "Owner's app redeems the claim link", "200, fresh 10-minute /e/ export, status claimed", async () => {
      const res = await redeem(lastEmailToken());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({kind: "vaccination", petName: "Biscuit", ttlSecs: 600});
      expect(body.exportUrl).toMatch(/^https:\/\/verify\.example\.com\/e\/[0-9a-f]{32}$/);
      expect((await detail(requestId)).status).toBe("claimed");
      return `${res.status}, export ttl ${body.ttlSecs}s, claimed`;
    });
    await step(run, "Audit trail", "submitted → review → approved → on chain → claim issued → claimed", async () => {
      const actions = (await detail(requestId)).events.map((e) => e.action);
      expect(actions).toEqual(["submitted", "review_started", "approved", "record_confirmed_on_chain", "claim_issued", "claim_email_not_sent", "claimed"]);
      return actions.join(" → ");
    });
    await step(run, "Queue after the owner claimed", "nothing left waiting on the reviewer", async () => {
      const queue = (await (await listGET(new Request(BASE))).json()).requests;
      expect(queue).toHaveLength(0);
      return "0 requests";
    });
  }

  testRun(1, "Happy path - photo (PNG) certificate", (run) => happyPath(run, {contentType: "image/png", bytes: png()}));

  testRun(2, "Happy path - PDF certificate", (run) => happyPath(run, {contentType: "application/pdf", bytes: PDF}));

  testRun(3, "Reject with a reason", async (run) => {
    await signIn("owner");
    const petId = await seed();
    const requestId = (await (await file(petId)).json()).request.requestId as string;
    await step(run, "Start review", "200, in_review", async () => {
      const res = await reviewPOST(post(`${BASE}/${requestId}/review`), params(requestId));
      expect(res.status).toBe(200);
      return "200, in_review";
    });
    await step(run, "Reject: document illegible", "200, rejected, reason saved", async () => {
      const res = await rejectPOST(post(`${BASE}/${requestId}/reject`, {reasonCode: "document_illegible"}), params(requestId));
      expect(res.status).toBe(200);
      const request = (await res.json()).request;
      expect(request.status).toBe("rejected");
      expect(request.decision.reasonCode).toBe("document_illegible");
      return `${res.status}, rejected, ${request.decision.reasonCode}`;
    });
    await step(run, "Try to approve the rejected request", "409, no record created", async () => {
      const res = await approvePOST(post(`${BASE}/${requestId}/approve`, {operatorAddress: OPERATOR, form: FORM}), params(requestId));
      expect(res.status).toBe(409);
      expect(await RecordArtifact.countDocuments()).toBe(0);
      return `${res.status}, 0 records`;
    });
    await step(run, "Queue", "rejected request no longer waiting", async () => {
      expect((await (await listGET(new Request(BASE))).json()).requests).toHaveLength(0);
      return "0 requests";
    });
  });

  testRun(4, "Reject with 'other' needs a note", async (run) => {
    await signIn("owner");
    const petId = await seed();
    const requestId = (await (await file(petId)).json()).request.requestId as string;
    await step(run, "Reject 'other' without a note", "400, still submitted", async () => {
      const res = await rejectPOST(post(`${BASE}/${requestId}/reject`, {reasonCode: "other"}), params(requestId));
      expect(res.status).toBe(400);
      expect((await detail(requestId)).status).toBe("submitted");
      return `${res.status}, submitted`;
    });
    await step(run, "Reject 'other' with a note", "200, rejected, note saved for the owner", async () => {
      const res = await rejectPOST(post(`${BASE}/${requestId}/reject`, {reasonCode: "other", note: "Certificate is for a different dog"}), params(requestId));
      expect(res.status).toBe(200);
      const request = (await res.json()).request;
      expect(request.decision).toMatchObject({reasonCode: "other", note: "Certificate is for a different dog"});
      return `${res.status}, rejected with note`;
    });
  });

  testRun(5, "Pet without a DogTag", async (run) => {
    await signIn("owner");
    const petId = await seed({tagged: false});
    await step(run, "File a certificate for an untagged pet", "422 tag_required, nothing stored", async () => {
      const res = await file(petId);
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("tag_required");
      expect(await ManualVerificationDocument.countDocuments()).toBe(0);
      expect(await ManualVerificationRequest.countDocuments()).toBe(0);
      return `${res.status} tag_required, 0 documents, 0 requests`;
    });
  });

  testRun(6, "Bad documents and the storage quota", async (run) => {
    await signIn("owner");
    const petId = await seed();
    await step(run, "HTML disguised as a PDF", "422 document_unsupported_type, nothing stored", async () => {
      const res = await file(petId, {contentType: "application/pdf", bytes: Buffer.from("<html><script>alert(1)</script>")});
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("document_unsupported_type");
      return `${res.status} document_unsupported_type`;
    });
    await step(run, "PNG bytes declared as a PDF", "422 type mismatch", async () => {
      const res = await file(petId, {contentType: "application/pdf", bytes: png()});
      expect(res.status).toBe(422);
      return `${res.status} ${(await res.json()).error.code}`;
    });
    await step(run, "A 5.5 MB upload", "refused (over 5 MB), nothing stored", async () => {
      const res = await file(petId, {contentType: "image/png", bytes: png(5.5 * 1024 * 1024)});
      expect([400, 413, 422]).toContain(res.status);
      expect(await ManualVerificationDocument.countDocuments()).toBe(0);
      return `${res.status}, 0 documents`;
    });
    await step(run, "Fill the (test) 1 MB quota", "first 600 KB file accepted, second refused 503 storage_full", async () => {
      expect((await file(petId, {contentType: "image/png", bytes: png(600 * 1024)})).status).toBe(201);
      const res = await file(petId, {contentType: "image/png", bytes: png(600 * 1024)});
      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("storage_full");
      expect(await ManualVerificationDocument.countDocuments()).toBe(1);
      return `201 then ${res.status} storage_full, 1 document kept`;
    });
    await step(run, "Nothing left half-saved", "requests and documents line up 1:1", async () => {
      const [requests, documents] = await Promise.all([ManualVerificationRequest.countDocuments(), ManualVerificationDocument.countDocuments()]);
      expect(requests).toBe(documents);
      return `${requests} request, ${documents} document`;
    });
  });

  testRun(7, "Expired claim link, then re-send", async (run) => {
    await signIn("owner");
    const petId = await seed();
    const {requestId, recordId} = await fileReviewApprove(petId);
    await confirmOnChain(recordId);
    await detail(requestId);
    const oldToken = lastEmailToken();
    await step(run, "Link passes its expiry date", "redeem 410 claim_expired; claim page sees the expiry", async () => {
      await ManualVerificationRequest.updateOne({requestId}, {$set: {"claim.exp": 1}});
      const res = await redeem(oldToken);
      expect(res.status).toBe(410);
      expect((await res.json()).error.code).toBe("claim_expired");
      const found = await findRequestByClaimToken(oldToken);
      expect(found?.claim?.exp).toBe(1);
      return `${res.status} claim_expired`;
    });
    await step(run, "Reviewer sends a new link", "200, new link differs from the old one", async () => {
      const res = await resendPOST(post(`${BASE}/${requestId}/resend-claim`), params(requestId));
      expect(res.status).toBe(200);
      const {url} = await res.json();
      expect(url.split("/claim/")[1]).not.toBe(oldToken);
      return `${res.status}, new link issued`;
    });
    await step(run, "Old link vs new link", "old 404, new 200 and claimed", async () => {
      const newToken = lastEmailToken();
      expect(newToken).not.toBe(oldToken);
      expect((await redeem(oldToken)).status).toBe(404);
      expect((await redeem(newToken)).status).toBe(200);
      expect((await detail(requestId)).status).toBe("claimed");
      return "old 404, new 200, claimed";
    });
  });

  testRun(8, "Record revoked after issue", async (run) => {
    await signIn("owner");
    const petId = await seed();
    const {requestId, recordId} = await fileReviewApprove(petId);
    await confirmOnChain(recordId);
    await detail(requestId);
    const token = lastEmailToken();
    await step(run, "Record is revoked before the owner claims", "redeem 409 not_ready, request stays issued", async () => {
      await RecordArtifact.updateOne({recordId}, {$set: {status: "revoked"}});
      const res = await redeem(token);
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("not_ready");
      expect((await detail(requestId)).status).toBe("issued");
      expect(await ArtifactExportSession.countDocuments()).toBe(0);
      return `${res.status} not_ready, issued, 0 export sessions`;
    });
  });

  testRun(9, "Racing syncs and a failed issuance", async (run) => {
    await signIn("owner");
    const petId = await seed();
    await step(run, "Two syncs race after the chain confirms", "exactly one claim email", async () => {
      const {requestId, recordId} = await fileReviewApprove(petId);
      await confirmOnChain(recordId);
      const request = await ManualVerificationRequest.findOne({requestId}).lean<ManualVerificationRequestDoc>();
      await Promise.all([syncRequest(request!), syncRequest(request!), syncRequest(request!)]);
      expect(sendMail).toHaveBeenCalledTimes(1);
      return `3 concurrent syncs → ${vi.mocked(sendMail).mock.calls.length} email`;
    });
    await step(run, "Issuance fails verification on chain", "status needs_attention with an explanation", async () => {
      vi.mocked(sendMail).mockClear();
      const {requestId, recordId} = await fileReviewApprove(petId);
      await RecordArtifact.updateOne({recordId}, {$set: {status: "error"}});
      const request = await detail(requestId);
      expect(request.status).toBe("needs_attention");
      expect(request.events.at(-1)?.action).toBe("record_issuance_error");
      // Back in the reviewer's queue.
      const queue = (await (await listGET(new Request(BASE))).json()).requests as {requestId: string}[];
      expect(queue.map((r) => r.requestId)).toContain(requestId);
      // The retry succeeds.
      await confirmOnChain(recordId);
      const recovered = await detail(requestId);
      expect(recovered.status).toBe("issued");
      expect(sendMail).toHaveBeenCalledTimes(1);
      return "needs_attention (back in queue) → retry → issued, 1 email";
    });
  });

  testRun(10, "Access control and safe links", async (run) => {
    const petId = await seed();
    await step(run, "Plain staff account", "403 on queue, filing, review and approve", async () => {
      await signIn("owner");
      const requestId = (await (await file(petId)).json()).request.requestId as string;
      await signIn("staff");
      const statuses = [
        (await listGET(new Request(BASE))).status,
        (await file(petId)).status,
        (await reviewPOST(post(`${BASE}/${requestId}/review`), params(requestId))).status,
        (await approvePOST(post(`${BASE}/${requestId}/approve`, {operatorAddress: OPERATOR, form: FORM}), params(requestId))).status,
        (await documentGET(new Request(`${BASE}/${requestId}/document`), params(requestId))).status,
      ];
      expect(statuses).toEqual([403, 403, 403, 403, 403]);
      return `statuses ${statuses.join(", ")}`;
    });
    await step(run, "Signed-out visitor", "401 on the queue", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);
      const res = await listGET(new Request(BASE));
      expect(res.status).toBe(401);
      return `${res.status}`;
    });
    await step(run, "Redeem only answers POST", "no GET handler (an email scanner opening the link changes nothing)", async () => {
      expect("GET" in redeemRoute).toBe(false);
      return "POST only";
    });
    await step(run, "Opening the claim page reads without redeeming", "lookup leaves redeemCount at 0 and status issued", async () => {
      await signIn("owner");
      const {requestId, recordId} = await fileReviewApprove(petId);
      await confirmOnChain(recordId);
      await detail(requestId);
      const token = lastEmailToken();
      await findRequestByClaimToken(token);
      await findRequestByClaimToken(token);
      const stored = await ManualVerificationRequest.findOne({requestId}).lean<ManualVerificationRequestDoc>();
      expect(stored?.claim?.redeemCount).toBe(0);
      expect(stored?.status).toBe("issued");
      return "redeemCount 0, issued";
    });
    await step(run, "Unknown and malformed tokens", "404 for both", async () => {
      const statuses = [(await redeem("0".repeat(32))).status, (await redeem("not-a-token")).status];
      expect(statuses).toEqual([404, 404]);
      return `statuses ${statuses.join(", ")}`;
    });
  });
});
