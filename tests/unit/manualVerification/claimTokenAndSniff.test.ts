import {describe, expect, it} from "vitest";
import {claimTokenMatches, claimUsability, hashClaimToken, issueClaim} from "@/lib/manualVerification/claimToken";
import {MAX_DOCUMENT_BYTES, checkDocument, sniffDocumentType} from "@/lib/manualVerification/sniff";

const NOW = 1_800_000_000;

describe("claim tokens", () => {
  it("issues a 32-hex token and stores only its hash", () => {
    const {token, state} = issueClaim(NOW, 7);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(state.tokenHash).toBe(hashClaimToken(token));
    expect(state.tokenHash).not.toContain(token);
    expect(state.exp).toBe(NOW + 7 * 86_400);
  });

  it("matches the right token only", () => {
    const {token, state} = issueClaim(NOW);
    expect(claimTokenMatches(token, state.tokenHash)).toBe(true);
    expect(claimTokenMatches(issueClaim(NOW).token, state.tokenHash)).toBe(false);
    expect(claimTokenMatches(token, "not-a-hash")).toBe(false);
  });

  it("reports usable, expired and revoked", () => {
    const {state} = issueClaim(NOW, 1);
    expect(claimUsability(state, NOW)).toBe("usable");
    expect(claimUsability(state, state.exp)).toBe("expired");
    expect(claimUsability({...state, revokedAt: new Date()}, NOW)).toBe("revoked");
  });
});

describe("document sniffing", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const pdf = new TextEncoder().encode("%PDF-1.7\n...");
  const html = new TextEncoder().encode("<html><script>alert(1)</script>");

  it("identifies JPEG, PNG and PDF by content", () => {
    expect(sniffDocumentType(jpeg)).toBe("image/jpeg");
    expect(sniffDocumentType(png)).toBe("image/png");
    expect(sniffDocumentType(pdf)).toBe("application/pdf");
    expect(sniffDocumentType(html)).toBeNull();
  });

  it("accepts a document whose bytes match its declared type", () => {
    expect(checkDocument(pdf, "application/pdf")).toEqual({ok: true, contentType: "application/pdf"});
    expect(checkDocument(jpeg, "IMAGE/JPEG")).toEqual({ok: true, contentType: "image/jpeg"});
  });

  it("refuses mismatched, unknown, empty and oversized files", () => {
    expect(checkDocument(html, "application/pdf")).toEqual({ok: false, reason: "unsupported_type"});
    expect(checkDocument(png, "application/pdf")).toEqual({ok: false, reason: "type_mismatch"});
    expect(checkDocument(new Uint8Array(), "image/png")).toEqual({ok: false, reason: "empty"});
    const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    big.set(jpeg);
    expect(checkDocument(big, "image/jpeg")).toEqual({ok: false, reason: "too_large"});
  });
});
