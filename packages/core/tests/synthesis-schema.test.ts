import { describe, expect, it } from "vitest";
import { synthesisSchema } from "../src/index";

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
});
