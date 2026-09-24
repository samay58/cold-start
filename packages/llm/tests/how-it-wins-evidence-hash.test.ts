import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ColdStartCard } from "@cold-start/core";
import { describe, expect, it } from "vitest";
import { hashHowItWinsJudgeValue, howItWinsEvidencePacketFromCard } from "../src";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(testDir, "fixtures/how-it-wins-card.json"), "utf8")) as ColdStartCard;
const fetchedAt = "2026-08-01T00:00:00.000Z";

// The fixture already mixes stored tiers, JSON-slice snippets and the company's own pages typed as
// news. These add the other inputs the packet reads: an analyst host, a dated and an undated source.
const card: ColdStartCard = {
  ...fixture,
  citations: [
    ...fixture.citations,
    { id: "h1", url: "https://sacra.com/research/keelson-labs/", title: "Keelson Labs revenue and valuation", fetchedAt, sourceType: "news" },
    { id: "h2", url: "https://news.example/dated", title: "Dated", fetchedAt, sourceType: "news", publishedAt: "2026-05-01T00:00:00.000Z" },
    { id: "h3", url: "https://news.example/undated", title: "Undated", fetchedAt, sourceType: "news" }
  ]
};

// Every filed judge verdict (about $1.70 a company) is memoized under the evidence-packet hash, and
// a job whose packet hash moves mid-flight ends as stale_evidence. The packet is built by live code:
// the card schema, readableSourceText, sourceSnippet and the source-quality classifier all feed it.
// This pin fails when a change to any of them alters this card's packet, so a move is deliberate.
// When it moves on purpose, update the value here and say in the commit which cards miss their memo.
describe("How it wins evidence-packet hash", () => {
  it("stays byte-identical for a fixed card", () => {
    expect(hashHowItWinsJudgeValue(howItWinsEvidencePacketFromCard(card))).toBe("f6b5ab8cb9b4a5d59d97f5cade4587da30d208d9b95aef21433e2a4a06b02b97");
  });
});
