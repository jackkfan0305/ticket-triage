import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

/**
 * Contrast is measured from the OKLCH source values, converted through OKLab
 * and linear sRGB by hand. getComputedStyle hands back `oklch()` strings that
 * naive RGB parsing and canvas both mis-convert, which is how two earlier
 * measurement passes reported the wrong numbers.
 */
type Oklch = { l: number; c: number; h: number };

function parseOklch(value: string): Oklch | null {
  const match = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim());
  if (!match) return null;
  return { l: Number(match[1]) / 100, c: Number(match[2]), h: Number(match[3]) };
}

function oklchToLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  // OKLab -> LMS' -> LMS -> linear sRGB (Björn Ottosson's matrices)
  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;

  const L = lp ** 3;
  const M = mp ** 3;
  const S = sp ** 3;

  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

/** WCAG relative luminance, computed on linear light before any gamma step. */
function relativeLuminance(oklch: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(oklch);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Reads one `--token: oklch(...)` declaration out of a css block. */
function tokensIn(css: string, blockStart: string): Record<string, Oklch> {
  const start = css.indexOf(blockStart);
  if (start < 0) throw new Error(`block not found: ${blockStart}`);
  const open = css.indexOf("{", start);
  const end = css.indexOf("\n}", open);
  const block = css.slice(open, end);

  const out: Record<string, Oklch> = {};
  for (const line of block.split("\n")) {
    const match = /^\s*(--[\w-]+)\s*:\s*(oklch\([^)]*\))\s*;/.exec(line);
    if (!match) continue;
    const colour = parseOklch(match[2] as string);
    if (colour) out[match[1] as string] = colour;
  }
  return out;
}

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

const THEMES = {
  light: tokensIn(CSS, ":root {"),
  dark: tokensIn(CSS, ':root[data-theme="dark"] {'),
};

/** Every text token, against every surface it is actually rendered on. */
const SURFACES = ["--ground", "--panel", "--panel-2"] as const;
const TEXT = ["--ink", "--ink-2", "--ink-3", "--p-low", "--p-normal", "--p-high", "--p-urgent"] as const;

/** Priority chips put their own text on their own tinted background. */
const CHIPS: [string, string][] = [
  ["--p-low", "--p-low-bg"],
  ["--p-normal", "--p-normal-bg"],
  ["--p-high", "--p-high-bg"],
  ["--p-urgent", "--p-urgent-bg"],
  ["--warn-ink", "--warn-bg"],
];

const MINIMUM = 4.5;

for (const theme of ["light", "dark"] as const) {
  describe(`contrast in the ${theme} theme`, () => {
  const tokens = THEMES[theme];

  test("every token in the block parsed as oklch", () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(15);
  });

  for (const ink of TEXT) {
    for (const surface of SURFACES) {
      test(`${ink} on ${surface} clears ${MINIMUM}:1`, () => {
        const ratio = contrastRatio(tokens[ink] as Oklch, tokens[surface] as Oklch);
        expect(ratio).toBeGreaterThanOrEqual(MINIMUM);
      });
    }
  }

  for (const [ink, surface] of CHIPS) {
    test(`${ink} on ${surface} clears ${MINIMUM}:1`, () => {
      const ratio = contrastRatio(tokens[ink] as Oklch, tokens[surface] as Oklch);
      expect(ratio).toBeGreaterThanOrEqual(MINIMUM);
    });
  }

    test("the brand button's own label clears the floor against its fill", () => {
      const ratio = contrastRatio(tokens["--brand-ink"] as Oklch, tokens["--brand"] as Oklch);
      expect(ratio).toBeGreaterThanOrEqual(MINIMUM);
    });
  });
}

test("the light and dark blocks define the same token set", () => {
  expect(Object.keys(THEMES.light).sort()).toEqual(Object.keys(THEMES.dark).sort());
});
