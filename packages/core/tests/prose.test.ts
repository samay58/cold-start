import { describe, expect, it } from "vitest";
import { isReadableProse } from "../src/prose";

// Real stored source text, harvested 2026-08-11. Provider JSON records no longer reach this gate:
// readableSourceText turns them into text first (tests/source-text.test.ts).
const REAL_OFFENDERS = [
  // Markdown image/link chain with encoded query params (twelvelabs.io run)
  "[![](https://framerusercontent.com/images/J0k8tAFEkkDowBZmjeWMoRC5ZfI.png?width=200&height=200)",
  // Markdown heading start (flora.ai run)
  "###### Through July 1: Nano Banana 2 + Pro usage is on us. Pro/Max plans only.",
  // A bare URL as the whole string
  "https://cartesia.ai/sonic?gad_campaignid=23084431172",
];

const REAL_PROSE = [
  // Stored source titles and clean raw_text rows from the same DB
  "Real-time TTS API with AI laughter and emotion | Cartesia Sonic-3",
  "Legora raises $550 million Series D to fuel US growth",
  "Public commit authors on cartesia.ai: 10 work email(s).",
  "GitHub org makenotion.",
  // Strings the existing clipping tests already rely on
  "Exa raises a Series B round",
  "The company sells workflow software to regional clinics. A second sentence is omitted.",
  // Short but clean: a bare product name must pass (current bubbles show these)
  "Exa",
];

describe("isReadableProse", () => {
  it("rejects every real stored offender", () => {
    for (const junk of REAL_OFFENDERS) {
      expect(isReadableProse(junk), junk.slice(0, 60)).toBe(false);
    }
  });

  it("accepts real titles and clean sentences, including short names", () => {
    for (const prose of REAL_PROSE) {
      expect(isReadableProse(prose), prose.slice(0, 60)).toBe(true);
    }
  });

  it("rejects empty and whitespace-only strings", () => {
    expect(isReadableProse("")).toBe(false);
    expect(isReadableProse("   ")).toBe(false);
  });

  it("rejects markup, escaped-newline runs, and query-pair runs even mid-string", () => {
    expect(isReadableProse("Read the <div class=\"hero\">launch post</div> today")).toBe(false);
    expect(isReadableProse("Meet Sonic-3\\n\\nLearn more\\n\\nPricing")).toBe(false);
    expect(isReadableProse("thumbnail.png?width=1200&height=630&fit=crop")).toBe(false);
  });
});
