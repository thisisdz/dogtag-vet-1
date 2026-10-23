"use client";

import {useId} from "react";
import {BrandMark} from "@/components/brand/BrandLockup";
import {useBrand} from "@/components/BrandProvider";

/**
 * The DogTag seal - this app's one signature element (docs/BRAND.md). A round stamped mark that
 * echoes a physical dog tag: the red "D" ringed by who vouches for the credential ("Verified by
 * DogTag" on the verification desk, "Issued by <clinic>" on a clinic deployment).
 *
 * It appears only where a credential becomes real - the claim page, a request once issued, and the
 * settings readiness state - never as decoration. `stamp` plays the single 180ms stamp-in, which
 * prefers-reduced-motion turns off (globals.css).
 */
export function Seal({size = 96, issuerName, stamp = false}: {size?: number; issuerName?: string; stamp?: boolean}) {
  const brand = useBrand();
  const pathId = useId().replace(/:/g, "");
  const ringText = (
    brand.mode === "manual_verification" ? "Verified by DogTag" : `Issued by ${issuerName?.trim() || "this clinic"}`
  ).toUpperCase();
  // Repeat the phrase around the ring so short and long names both close the circle.
  const ring = `${ringText} • ${ringText} • `;

  return (
    <span
      role="img"
      aria-label={brand.mode === "manual_verification" ? "Verified by DogTag" : `Issued by ${issuerName?.trim() || "this clinic"}`}
      className={`relative inline-flex shrink-0 items-center justify-center ${stamp ? "seal-stamp" : ""}`}
      style={{width: size, height: size}}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="absolute inset-0">
        <defs>
          <path id={pathId} d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0" />
        </defs>
        <circle cx="50" cy="50" r="48" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="29" fill="var(--surface)" stroke="var(--brand)" strokeWidth="1" strokeDasharray="1.5 2.5" />
        <text fill="var(--link)" fontSize="7.2" fontWeight="700" letterSpacing="1.1" fontFamily="var(--font-inter), system-ui, sans-serif">
          <textPath href={`#${pathId}`} textLength="228" lengthAdjust="spacingAndGlyphs">
            {ring.length > 60 ? `${ringText} • ` : ring}
          </textPath>
        </text>
      </svg>
      <span className="relative">
        <BrandMark size={Math.round(size * 0.36)} priority />
      </span>
    </span>
  );
}
