import {describe, expect, it} from "vitest";
import {brandFor} from "@/lib/brand";
import {ISSUER_READY_MESSAGE, isValidIssuerDomain, issuerReadiness} from "@/lib/issuerReadiness";

const verify = brandFor("manual_verification");
const complete = {name: "DogTag Manual Verification", domain: "dogtagapp.com", cloneAddress: "0x" + "1".repeat(40), operatorStatus: "whitelisted" as const};
const missing = (input: Parameters<typeof issuerReadiness>[0]) =>
  issuerReadiness(input, verify).items.filter((i) => !i.done).map((i) => i.key);

describe("issuerReadiness", () => {
  it("is ready only when name, domain, clone and a whitelisted wallet are all present", () => {
    expect(issuerReadiness(complete, verify).ready).toBe(true);
    expect(missing(complete)).toEqual([]);
  });

  it("names each missing piece", () => {
    expect(missing({...complete, name: "  "})).toEqual(["name"]);
    expect(missing({...complete, domain: ""})).toEqual(["domain"]);
    expect(missing({...complete, domain: "dogtagapp.com/verify"})).toEqual(["domain"]);
    expect(missing({...complete, cloneAddress: undefined})).toEqual(["clone"]);
    expect(missing({})).toEqual(["name", "domain", "clone", "wallet"]);
  });

  it.each(["not-whitelisted", "no-address", "not-configured", "unreadable"] as const)("wallet status %s is not ready, with a hint", (status) => {
    const wallet = issuerReadiness({...complete, operatorStatus: status}, verify).items.find((i) => i.key === "wallet")!;
    expect(wallet.done).toBe(false);
    expect(wallet.hint).not.toBe("");
  });

  it("treats an unknown wallet status (reception account) as not ready", () => {
    expect(missing({...complete, operatorStatus: undefined})).toEqual(["wallet"]);
  });

  it("uses the deployment's wording", () => {
    expect(issuerReadiness({}, verify).items[0]!.label).toBe("Issuer name");
    expect(issuerReadiness({}, brandFor("clinic")).items[0]!.label).toBe("Clinic name");
  });

  it("has the exact ready sentence", () => {
    expect(ISSUER_READY_MESSAGE).toBe("You are now ready to perform issuer attestations on your credentials.");
  });
});

describe("isValidIssuerDomain", () => {
  it("accepts what the settings API would save", () => {
    expect(isValidIssuerDomain("dogtagapp.com")).toBe(true);
    expect(isValidIssuerDomain("https://DogTagApp.com/")).toBe(true);
  });
  it("rejects paths, ports, bare words and empty", () => {
    for (const bad of ["dogtagapp.com/x", "dogtagapp.com:443", "dogtagapp", "", undefined]) expect(isValidIssuerDomain(bad)).toBe(false);
  });
});
