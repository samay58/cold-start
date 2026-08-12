import { describe, expect, it } from "vitest";
import { isReadableProse } from "../src/prose";

// Real stored source text, harvested 2026-08-11. Each entry is the leading slice of a
// sources.raw_text row exactly as the snippet pipeline would hand it to a bubble.
const REAL_OFFENDERS = [
  // Exa search envelope (cartesia.ai run)
  '{"requestId":"2f3fbeb69bc7c6b81d1bd35367afafc2","results":[{"id":"https://cartesia.ai/sonic?gad_campaignid=23084431172","title":"Real-time TTS API with AI laughter and emotion | Cartesia Sonic-3","url":"https://cartesia.ai/sonic?gad_campaignid=23084431172","author":null,"score":0.9488493204116821}',
  // Apollo organization record (cartesia.ai run)
  '{"organization":{"id":"6578dc4066927303d3b5b396","name":"Cartesia","website_url":"http://www.cartesia.ai","angellist_url":null,"linkedin_url":"http://www.linkedin.com/company/cartesia-ai"',
  // Content envelope carrying markdown nav junk (legora.com run)
  '{"url":"https://legora.com/","title":"Legora","content":"Product\\n\\n+\\n\\nSolutions\\n\\n+\\n\\n[Security](https://legora.com/security)\\n\\n[Customers](https://legora.com/customers)',
  // Markdown image/link chain with encoded query params (twelvelabs.io run)
  "[![](https://framerusercontent.com/images/J0k8tAFEkkDowBZmjeWMoRC5ZfI.png?width=200&height=200)",
  // Markdown heading start (flora.ai run)
  "###### Through July 1: Nano Banana 2 + Pro usage is on us. Pro/Max plans only.",
  // Mid-envelope slice: no leading brace, still JSON
  '"requestId":"14b1834c467eb39e32c056c091810fca","resolvedSearchType":"","results":[',
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
