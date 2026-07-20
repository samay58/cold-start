#!/usr/bin/env node
/*
 * Two guards over the extension's component CSS, both required for dark mode to
 * stay correct:
 *
 * 1. No raw color literals in styles.css. Color must route through theme-aware
 *    tokens so dark can re-map it; theme.tokens.css is the one home for raw
 *    values (the token definitions themselves).
 *
 * 2. No border/outline that collapses onto the dark ground. A paint triplet used
 *    in a border or outline must not resolve, in dark, to within a hair of the
 *    page ground, or the edge vanishes. This is the exact class of bug where a
 *    light border token (e.g. --cs-c-230-223-201) was mapped to a near-ground
 *    fill value in dark and its borders disappeared.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");
const partialsDir = join(srcDir, "styles");
const styleFiles = [
  join(srcDir, "styles.css"),
  ...readdirSync(partialsDir)
    .filter((name) => name.endsWith(".css"))
    .sort()
    .map((name) => join(partialsDir, name))
];
const tokensPath = join(srcDir, "theme.tokens.css");

const styleSources = styleFiles.map((path) => ({
  label: path.slice(srcDir.length - "src".length),
  text: readFileSync(path, "utf8")
}));
const css = styleSources.map((source) => source.text).join("\n");
const tokensCss = readFileSync(tokensPath, "utf8");

const failures = [];

// ---- Guard 1: no raw color literals ----------------------------------------
// Hex (#abc / #aabbcc / #aabbccdd) and rgb()/rgba()/hsl() with a numeric first arg.
const LITERAL = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\(\s*[0-9.]/g;
const literalHits = [];
for (const source of styleSources) {
  source.text.split("\n").forEach((line, index) => {
    const matches = line.match(LITERAL);
    if (matches) {
      literalHits.push({ file: source.label, line: index + 1, text: line.trim() });
    }
  });
}
if (literalHits.length > 0) {
  failures.push(
    `Raw color literals in the extension stylesheets (use rgb(var(--cs-c-*) / a) or a --cs-* token):\n` +
      literalHits.map((hit) => `  ${hit.file}:${hit.line}: ${hit.text}`).join("\n")
  );
}

// ---- Guard 2: borders must not collapse onto the dark ground ----------------
const MIN_BORDER_GROUND_CONTRAST = 1.5;

function hexToRgb(hex) {
  const v = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}
const relLuminance = ([r, g, b]) =>
  [r, g, b]
    .map((c) => c / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)))
    .reduce((sum, lin, i) => sum + lin * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// Dark ground: the dark-block --cs-paper-field hex.
const darkBlocks = [...tokensCss.matchAll(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/g)].map((m) => m[1]);
const darkBody = darkBlocks.join("\n");
const groundMatch = darkBody.match(/--cs-paper-field:\s*#([0-9a-fA-F]{3,6})/);
if (!groundMatch) {
  failures.push("theme.tokens.css: could not find the dark --cs-paper-field ground to audit border collapse against.");
}
const ground = groundMatch ? hexToRgb(groundMatch[1]) : null;

// Dark triplet values: --cs-c-NAME: R G B;
const darkTriplets = new Map();
for (const match of darkBody.matchAll(/(--cs-c-[0-9a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
  darkTriplets.set(match[1], [Number(match[2]), Number(match[3]), Number(match[4])]);
}

if (ground && darkTriplets.size > 0) {
  const collapses = [];
  // Border/outline declarations and the triplet vars inside their values.
  for (const decl of css.matchAll(/\b(border[a-z-]*|outline[a-z-]*)\s*:\s*([^;{}]*)/g)) {
    const property = decl[1];
    const value = decl[2];
    for (const ref of value.matchAll(/var\((--cs-c-[0-9a-z-]+)\)/g)) {
      const token = ref[1];
      const rgb = darkTriplets.get(token);
      if (!rgb) {
        continue;
      }
      const ratio = contrast(rgb, ground);
      if (ratio < MIN_BORDER_GROUND_CONTRAST) {
        collapses.push(
          `  ${property}: ${token} -> dark ${rgb.join(" ")} is ${ratio.toFixed(2)}:1 vs ground (min ${MIN_BORDER_GROUND_CONTRAST})`
        );
      }
    }
  }
  if (collapses.length > 0) {
    const unique = [...new Set(collapses)];
    failures.push(
      `Border/outline tokens collapse onto the dark ground (remap their dark value to a visible warm taupe):\n` +
        unique.join("\n")
    );
  }
}

// ---- Report ----------------------------------------------------------------
if (failures.length > 0) {
  console.error(failures.join("\n\n"));
  console.error(`\naudit-css-literals: ${failures.length} guard(s) failed.`);
  process.exit(1);
}

console.log(`audit-css-literals: ${styleSources.length} stylesheet(s) clean (no raw literals, no dark border collapse).`);
