import {createHash, randomBytes, timingSafeEqual} from "node:crypto";

/**
 * Claim links emailed to the owner (`/claim/<token>`): a 32-hex bearer token, same grammar as the
 * mobile app's other QR tokens (`hexToken32`), but long-lived (days) and stored ONLY as a SHA-256
 * hash - a database read never reveals a usable link. A claim never grants anything on GET; the
 * app must POST to redeem it, so email link scanners cannot use it up.
 */
export const DEFAULT_CLAIM_TTL_DAYS = 7;

export function generateClaimToken(): string {
  return randomBytes(16).toString("hex");
}

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time check of a presented token against a stored hash. */
export function claimTokenMatches(token: string, storedHash: string): boolean {
  const presented = Buffer.from(hashClaimToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

export interface ClaimState {
  tokenHash: string;
  exp: number; // unix seconds
  revokedAt?: Date;
}

export type ClaimUsability = "usable" | "expired" | "revoked";

export function claimUsability(claim: ClaimState, now: number): ClaimUsability {
  if (claim.revokedAt) return "revoked";
  if (now >= claim.exp) return "expired";
  return "usable";
}

/** A fresh claim: the plaintext token goes into the email only; persist `state`. */
export function issueClaim(now: number, ttlDays = DEFAULT_CLAIM_TTL_DAYS): {token: string; state: ClaimState} {
  const token = generateClaimToken();
  return {token, state: {tokenHash: hashClaimToken(token), exp: now + ttlDays * 24 * 60 * 60}};
}
