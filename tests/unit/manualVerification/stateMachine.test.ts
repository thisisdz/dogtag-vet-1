import {describe, expect, it} from "vitest";
import {
  MANUAL_VERIFICATION_STATUSES,
  canTransition,
  isCancellableByOwner,
  isTerminal,
  waitingOn,
  type ManualVerificationKind,
  type ManualVerificationStatus,
} from "@/lib/manualVerification/stateMachine";

const legal: Record<ManualVerificationKind, Array<[ManualVerificationStatus, ManualVerificationStatus]>> = {
  dogtag: [
    ["submitted", "in_review"],
    ["in_review", "approved"],
    ["approved", "bound"],
    ["bound", "issued"],
  ],
  vaccination: [
    ["submitted", "in_review"],
    ["in_review", "approved"],
    ["approved", "issued"],
    ["issued", "claimed"],
  ],
};

describe("manual verification state machine", () => {
  it.each(["dogtag", "vaccination"] as const)("allows the %s happy path", (kind) => {
    for (const [from, to] of legal[kind]) expect(canTransition(kind, from, to)).toBe(true);
  });

  it("keeps kind-specific steps to their kind", () => {
    expect(canTransition("vaccination", "approved", "bound")).toBe(false);
    expect(canTransition("dogtag", "approved", "issued")).toBe(false); // must bind first
    expect(canTransition("dogtag", "issued", "claimed")).toBe(false);
  });

  it("never skips review or goes backwards", () => {
    expect(canTransition("vaccination", "submitted", "approved")).toBe(false);
    expect(canTransition("vaccination", "issued", "approved")).toBe(false);
    expect(canTransition("dogtag", "bound", "approved")).toBe(false);
  });

  it("lets the reviewer reject before anything is signed, but not after issuance", () => {
    for (const from of ["submitted", "in_review", "approved", "needs_attention"] as const) {
      expect(canTransition("vaccination", from, "rejected")).toBe(true);
    }
    expect(canTransition("vaccination", "issued", "rejected")).toBe(false);
    expect(canTransition("dogtag", "bound", "rejected")).toBe(false);
  });

  it("lets the owner cancel only before a decision", () => {
    expect(isCancellableByOwner("submitted")).toBe(true);
    expect(isCancellableByOwner("in_review")).toBe(true);
    expect(isCancellableByOwner("approved")).toBe(false);
    expect(canTransition("dogtag", "approved", "cancelled")).toBe(false);
  });

  it("recovers from needs_attention", () => {
    expect(canTransition("dogtag", "bound", "needs_attention")).toBe(true);
    expect(canTransition("dogtag", "needs_attention", "bound")).toBe(true);
    expect(canTransition("vaccination", "needs_attention", "issued")).toBe(true);
  });

  it("treats rejected, cancelled, claimed and a dogtag's issued as terminal", () => {
    expect(isTerminal("vaccination", "rejected")).toBe(true);
    expect(isTerminal("vaccination", "cancelled")).toBe(true);
    expect(isTerminal("vaccination", "claimed")).toBe(true);
    expect(isTerminal("dogtag", "issued")).toBe(true);
    expect(isTerminal("vaccination", "issued")).toBe(false); // owner still has to claim
  });

  it("names who each status is waiting on", () => {
    expect(waitingOn("vaccination", "submitted")).toBe("reviewer");
    expect(waitingOn("dogtag", "approved")).toBe("owner");
    expect(waitingOn("vaccination", "approved")).toBe("reviewer");
    expect(waitingOn("dogtag", "bound")).toBe("reviewer");
    expect(waitingOn("vaccination", "issued")).toBe("owner");
    expect(waitingOn("dogtag", "issued")).toBe("none");
  });

  it("has a transition entry for every status", () => {
    for (const status of MANUAL_VERIFICATION_STATUSES) expect(() => isTerminal("dogtag", status)).not.toThrow();
  });
});
