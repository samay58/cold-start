import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ColdStartCard } from "@cold-start/core";
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
