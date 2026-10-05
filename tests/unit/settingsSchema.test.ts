import {describe, expect, it} from "vitest";
import {clinicSettingsInputSchema, normalizeIssuerDomain} from "@/lib/schemas/settings";

function parseDomain(domain: unknown) {
  return clinicSettingsInputSchema.safeParse({businessProfile: {domain}});
}

describe("normalizeIssuerDomain", () => {
  it.each([
    ["acmevet.com", "acmevet.com"],
    ["https://acmevet.com", "acmevet.com"],
    ["https://acmevet.com/", "acmevet.com"],
    ["http://AcmeVet.com//", "acmevet.com"],
    ["  https://dogtagapp.com/  ", "dogtagapp.com"],
    ["acmevet.com/", "acmevet.com"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeIssuerDomain(input)).toBe(expected);
  });

  it("leaves a path in place so validation still rejects it", () => {
    expect(normalizeIssuerDomain("https://acmevet.com/clinic/")).toBe("acmevet.com/clinic");
  });
});

describe("clinicSettingsInputSchema - businessProfile.domain", () => {
  it("saves a pasted URL as the bare domain", () => {
    const parsed = parseDomain("https://DogTagApp.com/");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.businessProfile?.domain).toBe("dogtagapp.com");
  });

  it("still accepts an omitted domain", () => {
    expect(clinicSettingsInputSchema.safeParse({businessProfile: {}}).success).toBe(true);
  });

  it.each(["https://acmevet.com/clinic", "acmevet", "https://", "acme vet.com"])("rejects %j at the domain path", (domain) => {
    const parsed = parseDomain(domain);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["businessProfile", "domain"]);
      expect(parsed.error.issues[0]?.message).toBe("Enter a bare domain, e.g. acmevet.com");
    }
  });
});
