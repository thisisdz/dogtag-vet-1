import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from "vitest";
import {randomUUID} from "node:crypto";
import mongoose from "mongoose";
import {startEphemeralMongod, stopEphemeralMongod, type EphemeralMongod} from "../helpers/ephemeralMongod";

/**
 * `/api/settings` - clinic-wide settings, including where crypto invoice payments are sent
 * (`receivingAddresses`). PATCH used to accept any signed-in session, so a plain `staff` account
 * could redirect payments; it is now owner-only via `requireOwnerSession`, which re-reads the role
 * from Mongo rather than trusting the token. GET stays open to every staff member (TagIssueWizard
 * and the secondary-owner actions read the clone address from it). Same conventions as
 * `selfProfileRoute.integration.test.ts`.
 */
vi.mock("@/auth", () => ({auth: vi.fn()}));

import {auth} from "@/auth";
import {connectToDatabase} from "@/lib/db";
import {ClinicSettings, getClinicSettings} from "@/lib/models/ClinicSettings";
import {Staff, type StaffDoc, type StaffRole} from "@/lib/models/Staff";
import {GET, PATCH} from "@/app/api/settings/route";

const ATTACKER_ADDRESS = "0x1111111111111111111111111111111111111111";
const OWNER_ADDRESS = "0x2222222222222222222222222222222222222222";

let ephemeral: EphemeralMongod;

beforeAll(async () => {
  ephemeral = await startEphemeralMongod("dogtag-vet-clinic-settings-route");
  process.env.MONGODB_URI = ephemeral.uri;
  await connectToDatabase();
  expect(mongoose.connection.port).toBe(ephemeral.port);
}, 90_000);

afterAll(async () => {
  await mongoose.connection.close();
  await stopEphemeralMongod(ephemeral);
});

afterEach(async () => {
  await Staff.deleteMany({});
  await ClinicSettings.deleteMany({});
  vi.mocked(auth).mockReset();
});

function patchReceiving(address: string): Request {
  return new Request("https://vet.example.com/api/settings", {
    method: "PATCH",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({receivingAddresses: [{chainKey: "roax", address}]}),
  });
}

async function createStaff(role: StaffRole, disabled = false): Promise<StaffDoc> {
  const created = await Staff.create({email: `${role}-${randomUUID()}@example.com`, role, disabled});
  return created.toObject();
}

/** `role` on the token is deliberately overridable: requireOwnerSession must ignore it. */
function signInAs(staff: StaffDoc, tokenRole: StaffRole = staff.role): void {
  vi.mocked(auth).mockResolvedValue({user: {staffId: staff.staffId, email: staff.email, role: tokenRole}} as never);
}

async function savedReceiving(): Promise<string[]> {
  return (await getClinicSettings()).receivingAddresses.map((r) => r.address);
}

describe("PATCH /api/settings - owner only", () => {
  it("401s with no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await PATCH(patchReceiving(ATTACKER_ADDRESS))).status).toBe(401);
  });

  it.each(["staff", "vet"] as const)("403s a %s account and leaves the receiving address unchanged", async (role) => {
    signInAs(await createStaff(role));
    const res = await PATCH(patchReceiving(ATTACKER_ADDRESS));
    expect(res.status).toBe(403);
    expect(await savedReceiving()).toEqual([]);
  });

  it("403s a disabled owner", async () => {
    signInAs(await createStaff("owner", true));
    expect((await PATCH(patchReceiving(ATTACKER_ADDRESS))).status).toBe(403);
  });

  it("403s a stale token that still claims owner after a demotion (role is re-read from Mongo)", async () => {
    signInAs(await createStaff("staff"), "owner");
    expect((await PATCH(patchReceiving(ATTACKER_ADDRESS))).status).toBe(403);
    expect(await savedReceiving()).toEqual([]);
  });

  it("lets an owner save", async () => {
    signInAs(await createStaff("owner"));
    const res = await PATCH(patchReceiving(OWNER_ADDRESS));
    expect(res.status).toBe(200);
    expect(await savedReceiving()).toEqual([OWNER_ADDRESS]);
  });
});

describe("GET /api/settings - any staff", () => {
  it("401s with no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
  });

  it("returns settings to a plain staff account", async () => {
    signInAs(await createStaff("staff"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("receivingAddresses");
  });
});
