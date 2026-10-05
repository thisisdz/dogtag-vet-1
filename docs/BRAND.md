# DogTag Vet brand: liquid glass

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

## The three glass layers

Each layer of the mark becomes a layer of the interface (utilities in `globals.css`):

1. **Frost plate → surfaces** (`.glass`): cards, the sidebar and top bar, modals, secondary
   buttons. Frosted white over the porcelain ground and its soft coral/red glow. Falls back to a
   solid plate where `backdrop-filter` is unsupported.
2. **Tag Red D → action** (`.glass-action`): primary buttons, the active nav item, active toggles.
   Red glass (Coral → Tag Red gradient) with a bright top rim.
3. **Bone glyph → detail** (`.glass-chip`, `text-on-brand`): white glass and labels sitting on red.

Dense surfaces stay solid for legibility and scroll performance: data tables and form inputs use
`bg-surface`, not glass.

## Rules

- **Errors never rely on color alone.** Ember and Tag Red are close, so every danger surface
  (danger buttons, banners, badges, snackbars, field errors) renders `AlertIcon`
  (`src/components/ui/icons.tsx`).
- **Light only.** The kit defines no dark theme, so the app has none.
- **Type:** headings (`h1`–`h3`, `font-display`) use Nunito, the rounded face closest to the
  wordmark; body copy uses Inter; ids and hashes use JetBrains Mono.
- **Shape:** controls `rounded-control` (10px), cards `rounded-card` (16px).

## Logo

`src/components/brand/` holds the mark and the "dogtag" lockup, and `src/app/icon.png` /
`apple-icon.png` are the browser and iOS icons. These are raster exports from the deck; replace
them with vector files when the designer provides them. Use `<BrandLockup>` / `<BrandMark>` rather
than referencing the images directly.

Review changes on the dev-only gallery at `/design`, which shows the palette, the three layers and
every shared component.
