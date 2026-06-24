#!/usr/bin/env node
/*
 * Guard: component CSS must route color through theme-aware tokens, not raw
 * literals, so dark mode stays correct. styles.css is the migrated surface and
 * must stay at zero raw literals; theme.tokens.css is the one allowed home for
 * raw values (the token definitions themselves).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "src", "styles.css");

// Hex (#abc / #aabbcc / #aabbccdd) and rgb()/rgba()/hsl() with a numeric first arg.
const LITERAL = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\(\s*[0-9.]/g;

const css = readFileSync(target, "utf8");
const lines = css.split("\n");
const hits = [];
lines.forEach((line, index) => {
  const matches = line.match(LITERAL);
  if (matches) {
    hits.push({ line: index + 1, text: line.trim(), matches });
  }
});

if (hits.length > 0) {
  console.error(`Raw color literals found in src/styles.css (use rgb(var(--cs-c-*) / a) or a --cs-* token):\n`);
  for (const hit of hits) {
    console.error(`  ${hit.line}: ${hit.text}`);
  }
  console.error(`\n${hits.length} line(s) with raw literals. Dark mode breaks when paint bypasses the token tier.`);
  process.exit(1);
}

console.log("audit-css-literals: src/styles.css is clean (0 raw color literals).");
