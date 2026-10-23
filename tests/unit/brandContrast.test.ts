import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, expect, it} from "vitest";

/** WCAG contrast from the real token values in globals.css - the accessibility floor in docs/BRAND.md. */
const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
function token(name: string): string {
  const match = new RegExp(`--${name}:[ \\t]*(#[0-9a-fA-F]{6})`).exec(rootBlock);
  if (!match) throw new Error(`--${name} is not a 6-digit hex in :root`);
  return match[1]!;
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const surfaces = ["bg", "surface", "surface-2", "brand-soft"];
const textTokens = ["ink", "ink-muted", "ink-faint", "link", "ok", "warn", "danger", "info", "neutral-status"];

describe("brand contrast", () => {
  for (const text of textTokens) {
    it.each(surfaces)(`--${text} on --%s is at least 4.5:1`, (surface) => {
      expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it.each([
    ["ok", "ok-soft"],
    ["warn", "warn-soft"],
    ["danger", "danger-soft"],
    ["info", "info-soft"],
    ["neutral-status", "neutral-status-soft"],
  ])("status text --%s on its own --%s badge is at least 4.5:1", (text, surface) => {
    expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(4.5);
  });

  it("white on Tag Red (primary buttons) is at least 4.5:1", () => {
    expect(contrast(token("on-brand"), token("brand"))).toBeGreaterThanOrEqual(4.5);
  });

  it("the focus ring is at least 3:1 against the page and cards", () => {
    for (const surface of ["bg", "surface"]) expect(contrast(token("focus"), token(surface))).toBeGreaterThanOrEqual(3);
  });
});
