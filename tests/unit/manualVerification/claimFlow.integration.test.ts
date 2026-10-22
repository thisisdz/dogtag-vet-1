import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from "vitest";
import {randomUUID} from "node:crypto";
import mongoose from "mongoose";
import {startEphemeralMongod, stopEphemeralMongod, type EphemeralMongod} from "../helpers/ephemeralMongod";

/**
 * Manual verification claims: when a vaccination request becomes `issued`, the owner is emailed a
 * claim link (console fallback here - no SMTP), which the app redeems by POST for a fresh `/e`
 * record export. Covers: single email under concurrent syncs, the email contents, redeem
 * semantics (POST only, repeatable, first redeem -> claimed), expiry, rotation on re-send, and
 * that the stored hash never reveals the link.
 */
vi.mock("@/auth", () => ({auth: vi.fn()}));
vi.mock("@/lib/mailer", () => ({sendMail: vi.fn(async () => "logged")}));

import {auth} from "@/auth";
import {sendMail} from "@/lib/mailer";
import {connectToDatabase} from "@/lib/db";
import {Staff} from "@/lib/models/Staff";
import {ClinicSettings} from "@/lib/models/ClinicSettings";
import {Pet} from "@/lib/models/Pet";
import {RecordArtifact} from "@/lib/models/RecordArtifact";
import {ArtifactExportSession} from "@/lib/models/ArtifactExportSession";
import {ManualVerificationRequest, type ManualVerificationRequestDoc} from "@/lib/models/ManualVerificationRequest";
import {syncRequest} from "@/lib/manualVerification/sync";
import {hashClaimToken} from "@/lib/manualVerification/claimToken";
import {POST as redeemPOST} from "@/app/v1/manual-verification/claims/[token]/redeem/route";
import {POST as resendPOST} from "@/app/api/manual-verification/[id]/resend-claim/route";

let ephemeral: EphemeralMongod;

beforeAll(async () => {
  ephemeral = await startEphemeralMongod("dogtag-vet-manual-claims");
  process.env.MONGODB_URI = ephemeral.uri;
  process.env.PUBLIC_BASE_URL = "https://vet.example.com";
  await connectToDatabase();
  await Promise.all([ManualVerificationRequest.init(), RecordArtifact.init()]);
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
    ArtifactExportSession.deleteMany({}),
    ManualVerificationRequest.deleteMany({}),
  ]);
  vi.mocked(sendMail).mockClear();
  vi.mocked(auth).mockReset();
});

/** An approved vaccination request whose record has just gone active on chain. */
async function approvedWithActiveRecord(): Promise<ManualVerificationRequestDoc> {
  await ClinicSettings.create({_id: "singleton", businessProfile: {name: "DogTag Manual Verification", domain: "dogtagapp.com"}});
  const petId = randomUUID();
  await Pet.create({petId, name: "Biscuit", ownerClientIds: [], dogTag: {dogTagIdDec: "7", dogTagIdField: "7"}, searchKey: "biscuit"});
  const recordId = randomUUID();
  await RecordArtifact.collection.insertOne({
    recordId,
    petId,
    dogTagIdField: "7",
    recordType: "VACCINATION",
    root: `0x${"b".repeat(64)}`,
    leaves: [],
    status: "active",
    chain: {chainId: 135, contract: "0x86d9ac6c094783e6a27d3bdbb6ef868060256c75", operator: "0x1500000000000000000000000000000000005cda"},
  });
  const created = await ManualVerificationRequest.create({
    kind: "vaccination",
    status: "approved",
    source: "app",
    requester: {email: "sam@example.com", name: "Sam"},
    petId,
    vaccination: {documentId: "d", documentSha256: "00", recordId},
  });
  return created.toObject();
}

function tokenFromEmail(): string {
  const params = vi.mocked(sendMail).mock.calls.at(-1)![0];
  const match = /\/claim\/([0-9a-f]{32})/.exec(params.text);
  if (!match) throw new Error("no claim link in email");
  return match[1]!;
}

const redeem = (token: string) =>
  redeemPOST(new Request(`https://vet.example.com/v1/manual-verification/claims/${token}/redeem`, {method: "POST"}), {
    params: Promise.resolve({token}),
  });

describe("manual verification claims", () => {
  it("emails one claim link when the record confirms, even if two syncs race", async () => {
    const request = await approvedWithActiveRecord();
    await Promise.all([syncRequest(request), syncRequest(request)]);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendMail).mock.calls[0]![0];
    expect(mail.to).toBe("sam@example.com");
    expect(mail.subject).toBe("Biscuit's vaccination record is verified");
    expect(mail.text).toContain("DogTag Manual Verification verified it");
    expect(mail.html).toContain('src="cid:dogtag-claim-qr"');
    expect(mail.attachments?.[0]).toMatchObject({contentType: "image/png", cid: "dogtag-claim-qr"});

    const token = tokenFromEmail();
    const stored = await ManualVerificationRequest.findOne({requestId: request.requestId}).lean<ManualVerificationRequestDoc>();
    expect(stored?.status).toBe("issued");
    expect(stored?.claim?.tokenHash).toBe(hashClaimToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored?.claim?.sentAt).toBeInstanceOf(Date);
  });

  it("redeems for a fresh /e export, repeatably, and marks the request claimed on first use", async () => {
    const request = await approvedWithActiveRecord();
    await syncRequest(request);
    const token = tokenFromEmail();

    const first = await redeem(token);
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body).toMatchObject({kind: "vaccination", petName: "Biscuit", ttlSecs: 600});
    expect(body.exportUrl).toMatch(/^https:\/\/vet\.example\.com\/e\/[0-9a-f]{32}$/);
    const exportToken = body.exportUrl.split("/e/")[1];
    expect(await ArtifactExportSession.findOne({token: exportToken}).lean()).toMatchObject({artifactType: "record"});

    const second = await (await redeem(token)).json();
    expect(second.exportUrl).not.toBe(body.exportUrl);

    const stored = await ManualVerificationRequest.findOne({requestId: request.requestId}).lean<ManualVerificationRequestDoc>();
    expect(stored?.status).toBe("claimed");
    expect(stored?.claim?.redeemCount).toBe(2);
  });

  it("refuses unknown, malformed and expired links", async () => {
    const request = await approvedWithActiveRecord();
    await syncRequest(request);
    const token = tokenFromEmail();

    expect((await redeem("0".repeat(32))).status).toBe(404);
    expect((await redeem("not-a-token")).status).toBe(404);

    await ManualVerificationRequest.updateOne({requestId: request.requestId}, {$set: {"claim.exp": 1}});
    const expired = await redeem(token);
    expect(expired.status).toBe(410);
    expect((await expired.json()).error.code).toBe("claim_expired");
  });

  it("re-send rotates the link: the old one stops working, the new one is returned once", async () => {
    const request = await approvedWithActiveRecord();
    await syncRequest(request);
    const oldToken = tokenFromEmail();

    const staff = await Staff.create({email: "dom@example.com", role: "owner"});
    vi.mocked(auth).mockResolvedValue({user: {staffId: staff.staffId, email: staff.email}} as never);
    const res = await resendPOST(new Request(`https://vet.example.com/api/manual-verification/${request.requestId}/resend-claim`, {method: "POST"}), {
      params: Promise.resolve({id: request.requestId}),
    });
    expect(res.status).toBe(200);
    const {url, email} = await res.json();
    expect(email).toBe("logged");
    const newToken = url.split("/claim/")[1];
    expect(newToken).not.toBe(oldToken);

    expect((await redeem(oldToken)).status).toBe(404);
    expect((await redeem(newToken)).status).toBe(200);
  });

  it("will not redeem a vaccination claim whose record was revoked", async () => {
    const request = await approvedWithActiveRecord();
    await syncRequest(request);
    const token = tokenFromEmail();
    await RecordArtifact.updateOne({recordId: request.vaccination!.recordId}, {$set: {status: "revoked"}});
    const res = await redeem(token);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("not_ready");
  });
});
