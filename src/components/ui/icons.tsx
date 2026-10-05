/** Shared inline icons. `currentColor` throughout, so each takes its color from the surrounding text. */

/** Alert (circle + exclamation). Every danger/error surface renders this next to its text: Ember
 * (--danger) sits close to Tag Red (--brand), so meaning must never depend on color alone
 * (docs/BRAND.md). */
export function AlertIcon({size = 16, className}: {size?: number; className?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.75v3.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.9" fill="currentColor" />
    </svg>
  );
}
