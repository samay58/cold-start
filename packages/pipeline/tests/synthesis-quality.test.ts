import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "@cold-start/core";
import { applySynthesisUsefulnessGate } from "../src/synthesis-quality";

type Synthesis = NonNullable<ColdStartCard["synthesis"]>;

function claim(text: string, citationIds = ["c1"]) {
  return { text, citationIds };
}

function synthesis(overrides: Partial<Synthesis> = {}): Synthesis {
  return {
    whyItMatters: claim("The company matters because buyer workflow evidence is visible [c1]."),
    bullCase: [],
    bearCase: [],
    openQuestions: [
      {
        question: "Which buyer owns the expansion budget?",
        category: "buyer_budget"
      }
    ],
    ...overrides
  };
}

describe("applySynthesisUsefulnessGate", () => {
  it("drops generic upside claims without concrete buyer or workflow proof", () => {
    const result = applySynthesisUsefulnessGate(synthesis({
      bullCase: [
        claim("The company is well positioned in a massive market [c1]."),
        claim("Engineering teams use the workflow daily and the buyer owns productivity budget [c1].")
      ]
    }));

    expect(result.synthesis.bullCase).toEqual([
      claim("Engineering teams use the workflow daily and the buyer owns productivity budget [c1].")
    ]);
    expect(result.droppedClaimCount).toBe(1);
  });

  it("drops funding-as-traction claims unless framed as investor demand", () => {
    const result = applySynthesisUsefulnessGate(synthesis({
      bullCase: [
        claim("The company raised a Series B, which proves customer demand [c1]."),
        claim("The round is evidence of investor demand, not customer demand [c1].")
      ]
    }));

    expect(result.synthesis.bullCase).toEqual([
      claim("The round is evidence of investor demand, not customer demand [c1].")
    ]);
    expect(result.droppedClaimCount).toBe(1);
  });

  it("drops unsupported timing fields and omits market timing when nothing survives", () => {
    const result = applySynthesisUsefulnessGate(synthesis({
      marketStructureAndTiming: {
        buyerBudget: null,
        painSeverity: null,
        adoptionTrigger: null,
        marketStructure: null,
        profitPool: null,
        expansionPath: null,
        timingRisk: claim("Timing looks attractive because of AI tailwinds [c1].")
      }
    }));

    expect(result.synthesis.marketStructureAndTiming).toBeUndefined();
    expect(result.droppedClaimCount).toBe(1);
  });

  it("keeps timing when a real mechanism is named", () => {
    const result = applySynthesisUsefulnessGate(synthesis({
      marketStructureAndTiming: {
        buyerBudget: null,
        painSeverity: null,
        adoptionTrigger: claim("The adoption trigger is a latency drop that unlocks production support workflows [c1]."),
        marketStructure: null,
        profitPool: null,
        expansionPath: null,
        timingRisk: null
      }
    }));

    expect(result.synthesis.marketStructureAndTiming?.adoptionTrigger).toEqual(
      claim("The adoption trigger is a latency drop that unlocks production support workflows [c1].")
    );
    expect(result.droppedClaimCount).toBe(0);
  });
});
