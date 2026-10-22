/**
 * Product naming per deployment mode. DogTag's own manual-verification desk
 * (DOGTAG_APP_MODE=manual_verification, verify.dogtagapp.com) is "DogTag Verify" and calls the
 * signing organisation the "issuer"; every clinic deployment stays "DogTag Vet" with "clinic"
 * wording. Server code reads the mode via `serverBrand()` (src/lib/brand.server.ts); client
 * components read it from `useBrand()` (src/components/BrandProvider.tsx), which the root layout
 * seeds from the same server value so SSR and hydration always agree.
 */
export type AppMode = "clinic" | "manual_verification";

export interface Brand {
  mode: AppMode;
  /** Full product name, e.g. the browser tab title. */
  product: string;
  /** The small label printed beside the DogTag wordmark. */
  productLabel: string;
  description: string;
  /** The organisation that signs credentials: "issuer" / "clinic" (lower case, mid-sentence). */
  org: string;
  /** Capitalised form of `org`, for labels and sentence starts. */
  Org: string;
}

const BRANDS: Record<AppMode, Brand> = {
  clinic: {
    mode: "clinic",
    product: "DogTag Vet",
    productLabel: "Vet",
    description: "DogTag vet platform: clients, pets, tags, appointments, payments.",
    org: "clinic",
    Org: "Clinic",
  },
  manual_verification: {
    mode: "manual_verification",
    product: "DogTag Verify",
    productLabel: "Verify",
    description: "DogTag Verify: DogTag's manual review and issuance of pet credentials.",
    org: "issuer",
    Org: "Issuer",
  },
};

export function brandFor(mode: AppMode | undefined): Brand {
  return BRANDS[mode ?? "clinic"] ?? BRANDS.clinic;
}
