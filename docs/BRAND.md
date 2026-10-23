# DogTag brand: liquid glass (DogTag Vet and DogTag Verify)

This app follows the DogTag "liquid glass" brand kit (the DogTag Brand Before/After deck). This file
is this repo's brand reference. `protocol/design/design-system.md` is vendored from
`dogtag-protocol` and is regenerated from upstream, so do not edit it for brand changes; where the
two disagree on color, shape or theme, this file wins for this app.

## Palette

| Name        | Hex       | Token(s)                     | Use                                                       |
| ----------- | --------- | ---------------------------- | --------------------------------------------------------- |
| Tag Red     | `#CE372D` | `--brand`                    | Every action, active state and icon                       |
| Coral       | `#E4584C` | `--coral`                    | Gradient highlights only (white on Coral fails AA)        |
| Ember       | `#A4241C` | `--danger`                   | Errors and destructive actions, always with an alert icon |
| Blush Frost | `#F8E9E6` | `--brand-soft`               | Soft fills, hover states, text selection                  |
| Porcelain   | `#F2EEEC` | `--bg`                       | The page ground                                           |
| Ink         | `#1E1A19` | `--ink`                      | Text                                                      |

Red text on porcelain uses `--link` (`#A82D24`), a darker red that stays comfortably above AA.
Status colors (`--ok`, `--warn`, `--info`, `--neutral-status`) are warm-tuned to sit on porcelain.

All values live in `src/app/globals.css`; nothing else hardcodes a hex color, with two documented
exceptions that cannot read CSS: the invoice PDF (`src/lib/payments/pdf.ts`) and the QR encoder
(`src/components/ui/QrSurface.tsx`). Update those by hand when a token changes.

## Two layers: content and controls

Apple's materials guidance (the `apple-design` review, 2026-10-23) splits every screen in two, and
this app follows it:

- **Content layer → solid cards** (`.card`): everything people read or fill in - form sections,
  tables, panels, the sign-in and claim cards, secondary buttons. White on the porcelain ground with
  a hairline border and a soft shadow.
- **Functional layer → glass** (`.glass`): only the sidebar, the top bar, the landing header, the
  sticky form action bar, dialogs and the snackbar. Glass on content made nothing stand out; do not
  add it back to cards.

The three layers of the mark still map onto these (utilities in `globals.css`):

1. **Frost plate → the functional layer** (`.glass`). Frosted white over the porcelain ground and
   its soft coral/red glow. Becomes an opaque plate under Reduce Transparency / Increase Contrast
   and where `backdrop-filter` is unsupported.
2. **Tag Red D → action** (`.glass-action`): the ONE primary button per view, and active toggles.
   Red glass (Coral → Tag Red gradient) with a bright top rim. The active nav item is ink on Blush
   Frost with a Tag Red marker, not a red fill - red is saved for the primary action and status.
3. **Bone glyph → detail** (`.glass-chip`, `text-on-brand`): white glass and labels sitting on red.

Dense surfaces stay solid for legibility and scroll performance: data tables and form inputs use
`bg-surface`, not glass.

## The seal (signature element)

`<Seal>` (`src/components/brand/Seal.tsx`) is the one thing this product is remembered by: a round
stamped mark like a dog tag, the red D ringed by "Verified by DogTag" (verification desk) or "Issued
by <clinic>" (clinic deployments). It appears only where a credential becomes real - the owner's
claim page, a request once issued, and the settings readiness state - and plays its single 180ms
stamp-in there. Never use it as decoration or repeat it on other screens.

## Accessibility floor

- Text contrast ≥ 4.5:1 on every surface it sits on (enforced by `tests/unit/brandContrast.test.ts`).
  `--ink-faint` is #706765 (4.77:1 on porcelain); the old #958A87 (2.9:1) failed.
- Keyboard focus: a solid 2px `--focus` (#A82D24) outline, offset 2px, on every focusable element.
- `prefers-reduced-transparency`, `prefers-contrast: more` and `prefers-reduced-motion` are honoured
  in `globals.css`.
- Below `lg` the sidebar becomes a drawer (`MobileNav`); inputs are 16px on phones and buttons
  44px tall, so nothing zooms or is too small to tap.

## Rules

- **Errors never rely on color alone.** Ember and Tag Red are close, so every danger surface
  (danger buttons, banners, badges, snackbars, field errors) renders `AlertIcon`
  (`src/components/ui/icons.tsx`).
- **Light only.** The kit defines no dark theme, so the app has none.
- **Type:** page titles and hero text (`h1`) use Nunito, the rounded face closest to the
  wordmark; section headings and body copy use Inter, so sections sit a clear step below the page
  title; ids and hashes use JetBrains Mono.
- **Shape:** controls `rounded-control` (10px), cards `rounded-card` (16px).

## Logo

`src/components/brand/` holds the mark and the "dogtag" lockup, and `src/app/icon.png` /
`apple-icon.png` are the browser and iOS icons. These are raster exports from the deck; replace
them with vector files when the designer provides them. Use `<BrandLockup>` / `<BrandMark>` rather
than referencing the images directly.

Review changes on the dev-only gallery at `/design`, which shows the palette, the three layers and
every shared component.
