import { describe, expect, it, vi } from "vitest";

describe("evidenceForResearchSectionPrompt", () => {
  it("applies the shared evidence budget to research-section prompts", async () => {
    const previousBudget = process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS;
    process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS = "900";
    vi.resetModules();

    try {
      const { evidenceForResearchSectionPrompt } = await import("../src/research-section");
      const evidence = evidenceForResearchSectionPrompt([
        {
          citationId: "c1",
          url: "https://stableenrich.dev/modal",
          title: "Enrichment",
          sourceType: "enrichment",
          text: "provider profile ".repeat(300),
        },
        {
          citationId: "c2",
          url: "https://modal.com/about",
          title: "Company",
          sourceType: "company_site",
          text: "company product detail ".repeat(300),
        },
        {
          citationId: "c3",
          url: "https://sec.gov/modal",
          title: "Filing",
          sourceType: "filing",
          text: "filing disclosure ".repeat(300),
        },
      ]);

      expect(evidence[0]?.citationId).toBe("c3");
      expect(evidence.reduce((sum, source) => sum + source.text.length, 0)).toBeLessThanOrEqual(900);
    } finally {
      if (previousBudget === undefined) {
        delete process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS;
      } else {
        process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS = previousBudget;
      }
      vi.resetModules();
    }
  });
});
