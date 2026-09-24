import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { coldStartCardSchema, type ColdStartCard } from "@cold-start/core";
import { describe, expect, it } from "vitest";
import { howItWinsEvidencePacketFromCard } from "../src";

const testDir = dirname(fileURLToPath(import.meta.url));
const card = JSON.parse(readFileSync(resolve(testDir, "fixtures/how-it-wins-card.json"), "utf8")) as ColdStartCard;
const fetchedAt = "2026-08-01T00:00:00.000Z";
const TIERS = new Set([
  "independent_technical",
  "independent_analysis",
  "independent_report",
  "primary_company",
  "press_release",
  "founder_authored",
  "enrichment",
  "unknown"
]);

describe("howItWinsEvidencePacketFromCard labels", () => {
  const packet = howItWinsEvidencePacketFromCard({
    ...card,
    citations: [
      ...card.citations,
      {
        // Stored before intake typed hosts correctly: the company's own page, typed news.
        id: "x1",
        url: "https://keelsonlabs.example.com/blog/release-notes",
        title: "Keelson Labs release notes",
        fetchedAt,
        sourceType: "news",
        sourceQuality: { tier: "independent_report", label: "Reporting", rationale: "r", incentive: "i" }
      },
      { id: "x2", url: "https://keelsonlabs.example.com/about", title: "About Keelson Labs", fetchedAt, sourceType: "company_site" }
    ]
  });
  const attribution = (id: string) => packet.evidence.find((item) => item.evidenceId === id)?.attribution;

  it("labels the company's own pages as the company speaking, whatever they were typed", () => {
    expect(attribution("x1")).toBe("primary_company");
    expect(attribution("x2")).toBe("primary_company");
  });

  it("uses the source-quality tier names only, never source types", () => {
    for (const item of packet.evidence) {
      expect(TIERS.has(item.attribution), `${item.evidenceId}: ${item.attribution}`).toBe(true);
    }
  });
});

describe("howItWinsEvidencePacketFromCard dates", () => {
  it("gives the judge each source's publish date, and null when it has none", () => {
    const packet = howItWinsEvidencePacketFromCard({
      ...card,
      citations: [
        ...card.citations,
        { id: "d1", url: "https://news.example/dated", title: "Dated", fetchedAt, sourceType: "news", publishedAt: "2026-05-01T00:00:00.000Z" },
        { id: "d2", url: "https://news.example/undated", title: "Undated", fetchedAt, sourceType: "news" }
      ]
    });
    const date = (id: string) => packet.evidence.find((item) => item.evidenceId === id)?.sourceDate;

    expect(date("d1")).toBe("2026-05-01T00:00:00.000Z");
    expect(date("d2")).toBeNull();
  });
});

describe("howItWinsEvidencePacketFromCard context", () => {
  it("sends each snippet once, in the evidence list, not again in the card context", () => {
    const packet = howItWinsEvidencePacketFromCard(card);

    expect(packet.context.citations.some((citation) => "snippet" in citation)).toBe(false);
    // Compared against the parsed card: the schema turns a stored JSON snippet into its page text.
    const withSnippet = coldStartCardSchema.parse(card).citations.find((citation) => citation.snippet);
    expect(withSnippet).toBeDefined();
    expect(packet.evidence.find((item) => item.evidenceId === withSnippet?.id)?.text).toBe(withSnippet?.snippet?.trim());
  });
});
