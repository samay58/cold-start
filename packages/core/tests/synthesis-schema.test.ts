import { describe, expect, it } from "vitest";
import {
  type ColdStartCard,
  coldStartCardSchema,
  emphasisReadFiledSchema,
  emphasisReadSchema,
  synthesisSchema
} from "../src/index";

// The synthesis system prompt (packages/llm/src/synthesis.ts) tells the model: "marketStructureAndTiming
// should be sparse. Use null when sources do not support a field." Models occasionally read that as
// license to null the whole container rather than each of its seven fields (observed in shadow
// production runs: rippling twice, elevenlabs once). Before the fix, synthesisSchema declared
// marketStructureAndTiming with `.optional()`, which accepts a missing key or `undefined` but rejects
// an explicit `null`, turning every one of those responses into a permanent parse failure.
function validDraft(marketStructureAndTiming: unknown) {
  return {
    whyItMatters: { text: "Acme sells to mid-market ops teams. [c1]", citationIds: ["c1"] },
    bullCase: [],
    bearCase: [],
    openQuestions: [{ question: "Who owns the renewal decision?", category: "buyer_budget" }],
    marketStructureAndTiming
  };
}

describe("synthesisSchema", () => {
  it("synthesisSchema-parses-null-container: accepts marketStructureAndTiming: null on an otherwise valid draft", () => {
    const result = synthesisSchema.parse(validDraft(null));

    expect(result.marketStructureAndTiming).toBeUndefined();
  });

  it("still accepts an omitted marketStructureAndTiming key", () => {
    const draft = validDraft(undefined) as Record<string, unknown>;
    delete draft.marketStructureAndTiming;

    const result = synthesisSchema.parse(draft);

    expect(result.marketStructureAndTiming).toBeUndefined();
  });

  it("still accepts a fully-populated marketStructureAndTiming object", () => {
    const market = {
      buyerBudget: { text: "Ops leaders own the renewal budget. [c1]", citationIds: ["c1"] },
      painSeverity: null,
      adoptionTrigger: null,
      marketStructure: null,
      profitPool: null,
      expansionPath: null,
      timingRisk: null
    };

    const result = synthesisSchema.parse(validDraft(market));

    expect(result.marketStructureAndTiming).toEqual(market);
  });

  it("still rejects a malformed (non-null, non-object) marketStructureAndTiming", () => {
    expect(() => synthesisSchema.parse(validDraft("not an object"))).toThrow();
  });

  // The same prompt license reaches one level deeper: models sometimes null the text inside a
  // claim object instead of the claim itself ({text: null} rather than null). Production runs
  // for varda (twice) and adaptivesecurity died on exactly this shape on 2026-07-26, after
  // paying for synthesis. A leaf-null claim means the same honest absence as a null claim.
  it("normalizes a claim whose text is null to an absent claim", () => {
    const market = {
      buyerBudget: { text: "Ops leaders own the renewal budget. [c1]", citationIds: ["c1"] },
      painSeverity: null,
      adoptionTrigger: null,
      marketStructure: null,
      profitPool: { text: null, citationIds: [] },
      expansionPath: null,
      timingRisk: { text: null, citationIds: ["c1"] }
    };

    const result = synthesisSchema.parse(validDraft(market));

    expect(result.marketStructureAndTiming?.profitPool).toBeNull();
    // Citation crumbs next to a null text change nothing: there is still no claim to render.
    expect(result.marketStructureAndTiming?.timingRisk).toBeNull();
    expect(result.marketStructureAndTiming?.buyerBudget?.text).toContain("renewal budget");
  });

  it("normalizes an empty-text claim to an absent claim", () => {
    const market = {
      buyerBudget: { text: "Ops leaders own the renewal budget. [c1]", citationIds: ["c1"] },
      painSeverity: { text: "", citationIds: [] },
      adoptionTrigger: null,
      marketStructure: null,
      profitPool: null,
      expansionPath: null,
      timingRisk: null
    };

    const result = synthesisSchema.parse(validDraft(market));

    expect(result.marketStructureAndTiming?.painSeverity).toBeNull();
  });

  it("collapses a container whose claims all normalize away to undefined", () => {
    const market = {
      buyerBudget: { text: null, citationIds: [] },
      painSeverity: null,
      adoptionTrigger: null,
      marketStructure: null,
      profitPool: null,
      expansionPath: null,
      timingRisk: null
    };

    const result = synthesisSchema.parse(validDraft(market));

    expect(result.marketStructureAndTiming).toBeUndefined();
  });

  // A claim with real text but broken citations is a contradictory partial, not an honest
  // absence. Those stay invalid (see the alpha readiness reliability receipt).
  it("still rejects a claim with text but malformed citations", () => {
    const market = {
      buyerBudget: { text: "Ops leaders own the renewal budget. [c1]", citationIds: null },
      painSeverity: null,
      adoptionTrigger: null,
      marketStructure: null,
      profitPool: null,
      expansionPath: null,
      timingRisk: null
    };

    expect(() => synthesisSchema.parse(validDraft(market))).toThrow();
  });
});

describe("emphasisRead", () => {
  it("parses a legacy synthesis without the field unchanged", () => {
    const fixture = validDraft(undefined) as Record<string, unknown>;
    delete fixture.marketStructureAndTiming;

    const result = synthesisSchema.parse(fixture);

    expect(result.emphasisRead).toBeUndefined();
  });

  it("parses a filed read with all four parts", () => {
    const parsed = emphasisReadSchema.parse({
      status: "read",
      loud: { text: "Their launch posts lead with model speed [fv1].", citationIds: ["fv1"] },
      quiet: "Nothing filed shows a named paying customer.",
      read: { text: "The loudest proof sits at working product, not demand [fv1] [c2].", citationIds: ["fv1", "c2"] },
      wouldChangeIf: "A named customer deployment appears in the filed record."
    });
    expect(parsed.status).toBe("read");
  });

  it("parses both empty states", () => {
    expect(emphasisReadSchema.parse({ status: "thin_file" }).status).toBe("thin_file");
    expect(emphasisReadSchema.parse({ status: "nothing_notable" }).status).toBe("nothing_notable");
  });

  it("rejects a filed read missing quiet", () => {
    expect(() => emphasisReadFiledSchema.parse({
      status: "read",
      loud: { text: "x [c1].", citationIds: ["c1"] },
      read: { text: "y [c1].", citationIds: ["c1"] },
      wouldChangeIf: "z"
    })).toThrow();
  });

  it("fails full-card validation when an emphasis citation does not resolve", () => {
    const card: ColdStartCard = {
      slug: "acme",
      domain: "acme.example",
      generatedAt: "2026-08-11T12:00:00.000Z",
      generationCostUsd: 0.1,
      cacheStatus: "miss",
      identity: {
        name: { value: "Acme", status: "verified", confidence: "high", citationIds: ["c1"] },
        logoUrl: null,
        oneLiner: { value: "Acme sells to mid-market ops teams.", status: "verified", confidence: "high", citationIds: ["c1"] },
        hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "high", citationIds: ["c1"] },
        foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: ["c1"] },
        status: "private"
      },
      funding: {
        totalRaisedUsd: { value: 1000000, status: "verified", confidence: "high", citationIds: ["c1"] },
        lastRound: {
          value: { name: "Seed", amountUsd: 1000000, announcedAt: "2025-01-01", leadInvestors: [] },
          status: "verified",
          confidence: "high",
          citationIds: ["c1"]
        },
        investors: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] }
      },
      team: {
        founders: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] },
        keyExecs: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] },
        headcount: { value: { value: 5, asOf: "2026-08-11" }, status: "verified", confidence: "high", citationIds: ["c1"] }
      },
      signals: [],
      comparables: [],
      citations: [
        { id: "c1", url: "https://acme.example", title: "Acme", fetchedAt: "2026-08-11T12:00:00.000Z", sourceType: "company_site" }
      ],
      synthesis: {
        whyItMatters: { text: "Acme sells to mid-market ops teams. [c1]", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [],
        emphasisRead: {
          status: "read",
          loud: { text: "Their launch posts lead with model speed [c1].", citationIds: ["c1"] },
          quiet: "Nothing filed shows a named paying customer.",
          read: { text: "The loudest proof sits at working product, not demand [c1] [missing].", citationIds: ["c1", "missing"] },
          wouldChangeIf: "A named customer deployment appears in the filed record."
        }
      }
    };

    expect(coldStartCardSchema.safeParse(card).success).toBe(false);
  });
});
