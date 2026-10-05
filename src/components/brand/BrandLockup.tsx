import Image from "next/image";
import lockup from "@/components/brand/dogtag-lockup.png";
import mark from "@/components/brand/dogtag-mark.png";

/*
 * The DogTag liquid-glass mark and wordmark (docs/BRAND.md). Raster art taken from the brand deck
 * until vector files exist. Statically imported, so Next serves them from /_next/static/media -
 * a path the auth middleware already skips, which keeps them visible on signed-out pages
 * (sign-in, landing, booking) with no public/ folder.
 */

/** Mark + "dogtag" wordmark, with a small "Vet" product label. `height` is the wordmark's
 * rendered height in px. */
export function BrandLockup({height = 28, showProduct = true}: {height?: number; showProduct?: boolean}) {
  const width = Math.round((height * lockup.width) / lockup.height);
  return (
    <span className="inline-flex items-end gap-1.5">
      <Image src={lockup} alt="DogTag" width={width} height={height} priority />
      {showProduct && (
        <span className="mb-0.5 font-display text-caption font-extrabold uppercase tracking-wider text-ink-muted">Vet</span>
      )}
    </span>
  );
}

/** The red-glass "D" mark on its own. */
export function BrandMark({size = 40}: {size?: number}) {
  return <Image src={mark} alt="DogTag" width={size} height={size} />;
}
