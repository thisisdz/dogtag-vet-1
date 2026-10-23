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

/** Check in a circle - a completed step or a ready state (paired with --ok, never color alone). */
export function CheckCircleIcon({size = 16, className}: {size?: number; className?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.25 8.25l1.9 1.9 3.6-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Empty circle - a step not done yet. */
export function EmptyCircleIcon({size = 16, className}: {size?: number; className?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Three-line menu glyph (the mobile nav button). */
export function MenuIcon({size = 20, className}: {size?: number; className?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Close (x) glyph. */
export function CloseIcon({size = 20, className}: {size?: number; className?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
