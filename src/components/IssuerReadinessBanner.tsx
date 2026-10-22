import Link from "next/link";
import {Banner} from "@/components/ui/Banner";
import {serverBrand} from "@/lib/brand.server";
import {issuerReadiness, type IssuerReadinessInput} from "@/lib/issuerReadiness";

/**
 * Shown where credentials get signed (Issue tag, a pet's page, a manual-verification review) only
 * while the issuer profile is incomplete, naming what is missing. The wallet item is left to the
 * existing wallet banners on those pages, so this never repeats them.
 */
export function IssuerReadinessBanner({input}: {input: IssuerReadinessInput}) {
  const missing = issuerReadiness(input, serverBrand()).items.filter((item) => item.key !== "wallet" && !item.done);
  if (missing.length === 0) return null;
  return (
    <div className="mb-6">
      <Banner
        tone="warn"
        title="Issuer attestations aren't ready yet"
        action={
          <Link href="/settings" className="text-body font-medium text-link hover:underline">
            Open settings
          </Link>
        }
      >
        Credentials can still be issued on chain, but signing their issuer attestation needs:{" "}
        {missing.map((item) => item.label.toLowerCase()).join(", ")}.
      </Banner>
    </div>
  );
}
