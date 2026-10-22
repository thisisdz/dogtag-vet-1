import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import mongoose from "mongoose";
import {startEphemeralMongod, stopEphemeralMongod, type EphemeralMongod} from "../helpers/ephemeralMongod";
import {connectToDatabase} from "@/lib/db";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {ManualVerificationDocument} from "@/lib/models/ManualVerificationDocument";
import {UsedManualVerificationSignature, consumeSignature} from "@/lib/models/UsedManualVerificationSignature";
import {appendRequestEvent, transitionRequest} from "@/lib/manualVerification/transition";
import {purgeDocument, readDocument, saveDocument, sha256Hex} from "@/lib/manualVerification/documentStore";

/** Manual-verification persistence: race-safe transitions with an audit trail, replay protection,
 * and the document store's round trip, quota and retention purge. Real mongod (ephemeral). */
let ephemeral: EphemeralMongod;

beforeAll(async () => {
  ephemeral = await startEphemeralMongod("dogtag-vet-manual-verification");
  process.env.MONGODB_URI = ephemeral.uri;
  await connectToDatabase();
  await Promise.all([ManualVerificationRequest.init(), UsedManualVerificationSignature.init()]);
}, 90_000);

afterAll(async () => {
  await mongoose.connection.close();
  await stopEphemeralMongod(ephemeral);
});

afterEach(async () => {
  await Promise.all([ManualVerificationRequest.deleteMany({}), ManualVerificationDocument.deleteMany({}), UsedManualVerificationSignature.deleteMany({})]);
});

async function newRequest(): Promise<ManualVerificationRequestDoc> {
  const created = await ManualVerificationRequest.create({
    kind: "vaccination",
    source: "app",
    requester: {wallet: "0xABC0000000000000000000000000000000000001", email: "Owner@Example.com", name: "Sam Owner"},
    vaccination: {documentId: "doc-1", documentSha256: "00".repeat(32)},
  });
  return created.toObject();
}

describe("transitionRequest", () => {
  it("applies a legal transition, sets extra fields and records the audit event", async () => {
    const req = await newRequest();
    expect(req.requester.email).toBe("owner@example.com");
    expect(req.requester.wallet).toBe("0xabc0000000000000000000000000000000000001");

    const result = await transitionRequest({
      request: req,
      to: "in_review",
      actor: {type: "staff", id: "staff-1"},
      action: "review_started",
      set: {firstReviewedAt: new Date()},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.status).toBe("in_review");
    expect(result.request.firstReviewedAt).toBeInstanceOf(Date);
    expect(result.request.events).toHaveLength(1);
    expect(result.request.events[0]).toMatchObject({action: "review_started", from: "submitted", to: "in_review", actor: {type: "staff", id: "staff-1"}});
  });

  it("refuses an illegal transition without touching the document", async () => {
    const req = await newRequest();
    const result = await transitionRequest({request: req, to: "issued", actor: {type: "staff"}, action: "x"});
    expect(result).toEqual({ok: false, reason: "illegal_transition"});
    expect((await ManualVerificationRequest.findOne({requestId: req.requestId}).lean())?.status).toBe("submitted");
  });

  it("lets only one of two racing transitions win", async () => {
    const req = await newRequest();
    const [a, b] = await Promise.all([
      transitionRequest({request: req, to: "in_review", actor: {type: "staff"}, action: "review_started"}),
      transitionRequest({request: req, to: "cancelled", actor: {type: "owner"}, action: "cancelled"}),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser).toEqual({ok: false, reason: "conflict"});
  });

  it("appends events without changing status", async () => {
    const req = await newRequest();
    const updated = await appendRequestEvent(req.requestId, {actor: {type: "staff"}, action: "claim_resent"});
    expect(updated?.status).toBe("submitted");
    expect(updated?.events.map((e) => e.action)).toEqual(["claim_resent"]);
  });
});

describe("consumeSignature", () => {
  it("accepts a signature once and refuses the replay", async () => {
    const deadline = Math.floor(Date.now() / 1000) + 300;
    expect(await consumeSignature("0xabc:list:0x01", deadline)).toBe(true);
    expect(await consumeSignature("0xabc:list:0x01", deadline)).toBe(false);
    expect(await consumeSignature("0xabc:list:0x02", deadline)).toBe(true);
  });
});

describe("document store", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\nhello vaccination record");

  it("round-trips the exact bytes and records the hash", async () => {
    const saved = await saveDocument({requestId: "req-1", bytes: pdf, contentType: "application/pdf"});
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.document.sha256).toBe(sha256Hex(pdf));
    const read = await readDocument(saved.document.documentId);
    expect(read?.contentType).toBe("application/pdf");
    expect(Buffer.compare(read!.bytes, Buffer.from(pdf))).toBe(0);
  });

  it("refuses a document that would exceed the storage quota", async () => {
    const quotaBytes = pdf.length + 10; // room for exactly one
    expect((await saveDocument({requestId: "req-1", bytes: pdf, contentType: "application/pdf", quotaBytes})).ok).toBe(true);
    expect(await saveDocument({requestId: "req-2", bytes: pdf, contentType: "application/pdf", quotaBytes})).toEqual({
      ok: false,
      reason: "storage_full",
    });
  });

  it("does not count purged documents against the quota", async () => {
    const quotaBytes = pdf.length + 10;
    const first = await saveDocument({requestId: "req-1", bytes: pdf, contentType: "application/pdf", quotaBytes});
    if (!first.ok) throw new Error("save failed");
    await purgeDocument(first.document.documentId);
    expect((await saveDocument({requestId: "req-2", bytes: pdf, contentType: "application/pdf", quotaBytes})).ok).toBe(true);
  });

  it("purges bytes but keeps the hash", async () => {
    const saved = await saveDocument({requestId: "req-1", bytes: pdf, contentType: "application/pdf"});
    if (!saved.ok) throw new Error("save failed");
    await purgeDocument(saved.document.documentId);
    expect(await readDocument(saved.document.documentId)).toBeNull();
    const meta = await ManualVerificationDocument.findOne({documentId: saved.document.documentId}).lean();
    expect(meta?.sha256).toBe(sha256Hex(pdf));
    expect(meta?.deletedAt).toBeInstanceOf(Date);
    expect(meta?.data).toBeUndefined();
  });
});
