import {describe, expect, it} from "vitest";
import {hashTypedData, keccak256, stringToBytes, type Address, type Hex} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {
  MANUAL_VERIFICATION_PRIMARY_TYPE,
  MANUAL_VERIFICATION_TYPES,
  actionHash,
  buildManualVerificationDomain,
  computePayloadHash,
  type ManualVerificationAction,
} from "@/lib/manualVerification/eip712";
import {MANUAL_VERIFICATION_MAX_TTL_SECS, verifyManualVerificationSignature} from "@/lib/manualVerification/verifySignature";

const CHAIN_ID = 135;
const CLONE: Address = "0x1111111111111111111111111111111111111111";
const NOW = 1_800_000_000;
const NONCE: Hex = `0x${"ab".repeat(32)}`;

/** Independent hardcoded copy of the struct - if the production module drifts, the digest check fails. */
const INDEPENDENT_TYPES = {
  ManualVerificationRequest: [
    {name: "clinic", type: "address"},
    {name: "action", type: "bytes32"},
    {name: "payloadHash", type: "bytes32"},
    {name: "wallet", type: "address"},
    {name: "nonce", type: "bytes32"},
    {name: "issuedAt", type: "uint64"},
    {name: "deadline", type: "uint64"},
  ],
} as const;

async function signed(opts: {
  action?: ManualVerificationAction;
  payloadJson?: string;
  issuedAt?: number;
  deadline?: number;
  signer?: ReturnType<typeof privateKeyToAccount>;
  domainChainId?: number;
}) {
  const signer = opts.signer ?? privateKeyToAccount(generatePrivateKey());
  const action = opts.action ?? "submit_vaccination";
  const payloadJson = opts.payloadJson ?? JSON.stringify({pet: "Biscuit"});
  const issuedAt = opts.issuedAt ?? NOW - 10;
  const deadline = opts.deadline ?? NOW + 300;
  const signature = await signer.signTypedData({
    domain: buildManualVerificationDomain(opts.domainChainId ?? CHAIN_ID, CLONE),
    types: MANUAL_VERIFICATION_TYPES,
    primaryType: MANUAL_VERIFICATION_PRIMARY_TYPE,
    message: {
      clinic: CLONE,
      action: actionHash(action),
      payloadHash: computePayloadHash(payloadJson),
      wallet: signer.address,
      nonce: NONCE,
      issuedAt: BigInt(issuedAt),
      deadline: BigInt(deadline),
    },
  });
  return {signer, action, payloadJson, issuedAt, deadline, signature};
}

function verify(s: Awaited<ReturnType<typeof signed>>, overrides: Partial<Parameters<typeof verifyManualVerificationSignature>[0]> = {}) {
  return verifyManualVerificationSignature({
    chainId: CHAIN_ID,
    clinicCloneAddress: CLONE,
    action: s.action,
    payloadJson: s.payloadJson,
    claimedWallet: s.signer.address,
    nonce: NONCE,
    signature: s.signature,
    issuedAt: s.issuedAt,
    deadline: s.deadline,
    now: NOW,
    ...overrides,
  });
}

describe("ManualVerificationRequest EIP-712 struct", () => {
  it("matches an independent copy of the struct layout", () => {
    const message = {
      clinic: CLONE,
      action: actionHash("list"),
      payloadHash: computePayloadHash("{}"),
      wallet: "0x2222222222222222222222222222222222222222" as Address,
      nonce: NONCE,
      issuedAt: 1n,
      deadline: 2n,
    };
    const domain = {name: "DogTagManualVerification", version: "1", chainId: CHAIN_ID, verifyingContract: CLONE} as const;
    expect(
      hashTypedData({domain: buildManualVerificationDomain(CHAIN_ID, CLONE), types: MANUAL_VERIFICATION_TYPES, primaryType: MANUAL_VERIFICATION_PRIMARY_TYPE, message}),
    ).toBe(hashTypedData({domain, types: INDEPENDENT_TYPES, primaryType: "ManualVerificationRequest", message}));
  });

  it("hashes the payload string's exact UTF-8 bytes and actions by name", () => {
    expect(computePayloadHash('{"a":1}')).toBe(keccak256(stringToBytes('{"a":1}')));
    expect(computePayloadHash('{"a":1}')).not.toBe(computePayloadHash('{"a": 1}'));
    expect(actionHash("redeem")).toBe(keccak256(stringToBytes("redeem")));
  });
});

describe("verifyManualVerificationSignature", () => {
  it("accepts a valid signature and returns the lowercase wallet, payload hash and replay key", async () => {
    const s = await signed({});
    const result = await verify(s);
    expect(result).toEqual({
      ok: true,
      wallet: s.signer.address.toLowerCase(),
      payloadHash: computePayloadHash(s.payloadJson),
      digestKey: `${s.signer.address.toLowerCase()}:submit_vaccination:${NONCE}`,
    });
  });

  it("rejects a tampered payload (signature covers the exact payload bytes)", async () => {
    const s = await signed({});
    expect(await verify(s, {payloadJson: JSON.stringify({pet: "Rex"})})).toEqual({ok: false, reason: "signature_invalid"});
  });

  it("rejects a signature replayed against a different endpoint", async () => {
    const s = await signed({action: "list"});
    expect(await verify(s, {action: "submit_dogtag"})).toEqual({ok: false, reason: "signature_invalid"});
  });

  it("rejects a claimed wallet that did not sign", async () => {
    const s = await signed({});
    const other = privateKeyToAccount(generatePrivateKey());
    expect(await verify(s, {claimedWallet: other.address})).toEqual({ok: false, reason: "signature_invalid"});
  });

  it("rejects a signature for another chain or another clinic", async () => {
    const s = await signed({domainChainId: 1});
    expect(await verify(s)).toEqual({ok: false, reason: "signature_invalid"});
    const s2 = await signed({});
    expect(await verify(s2, {clinicCloneAddress: "0x3333333333333333333333333333333333333333"})).toEqual({
      ok: false,
      reason: "signature_invalid",
    });
  });

  it("enforces the time window before recovering the signature", async () => {
    expect(await verify(await signed({issuedAt: NOW, deadline: NOW}))).toEqual({ok: false, reason: "deadline_before_issued_at"});
    expect(await verify(await signed({issuedAt: NOW, deadline: NOW + MANUAL_VERIFICATION_MAX_TTL_SECS + 1}))).toEqual({
      ok: false,
      reason: "window_too_long",
    });
    expect(await verify(await signed({issuedAt: NOW + 121, deadline: NOW + 300}))).toEqual({ok: false, reason: "issued_in_future"});
    expect(await verify(await signed({issuedAt: NOW - 400, deadline: NOW - 1}))).toEqual({ok: false, reason: "expired"});
  });

  it("tolerates small device clock skew", async () => {
    const result = await verify(await signed({issuedAt: NOW + 60, deadline: NOW + 300}));
    expect(result.ok).toBe(true);
  });
});
