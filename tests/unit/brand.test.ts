import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";
import {brandFor} from "@/lib/brand";

describe("brandFor", () => {
  it("names DogTag's manual-verification desk DogTag Verify, with issuer wording", () => {
    expect(brandFor("manual_verification")).toMatchObject({product: "DogTag Verify", productLabel: "Verify", org: "issuer", Org: "Issuer"});
  });

  it("keeps clinic deployments as DogTag Vet, with clinic wording", () => {
    expect(brandFor("clinic")).toMatchObject({product: "DogTag Vet", productLabel: "Vet", org: "clinic", Org: "Clinic"});
    expect(brandFor(undefined).product).toBe("DogTag Vet");
  });
});

/** The product name must come from the brand, never a literal, on every surface both modes render. */
describe("no hard-coded product name on shared surfaces", () => {
  const files = [
    "src/app/layout.tsx",
    "src/app/page.tsx",
    "src/app/sign-in/page.tsx",
    "src/components/brand/BrandLockup.tsx",
    "src/app/(app)/settings/SettingsForm.tsx",
    "src/app/(app)/settings/page.tsx",
  ];
  it.each(files)("%s", (file) => {
    const source = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
    expect(source).not.toMatch(/DogTag Vet\b|>Vet</);
    expect(source).not.toMatch(/"Clinic name"/);
  });
});
