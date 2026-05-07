import { describe, expect, it } from "vitest";
import { fallbackResearchPlan, investorTasteKernel, parseResearchPlanToolUse, researchPlanTool } from "../src/index";

const validPlan = {
  companyArchetype: "legal AI workflow company",
  priorityQuestions: [
    {
      question: "Who owns the budget?",
      why: "Buyer ownership defines whether this is workflow software or a nice-to-have assistant.",
      sourceHint: "Customer pages and product pages.",
    },
    {
      question: "What proof exists outside PR?",
      why: "Independent evidence separates adoption from positioning.",
      sourceHint: "Independent reporting and analyst posts.",
    },
    {
      question: "What changed in the latest round?",
      why: "Round cadence and investor quality reveal trajectory.",
      sourceHint: "Funding coverage and investor posts.",
    },
  ],
  searchQueries: {
    funding: "harvey latest round valuation investors",
    companyProfile: "harvey legal AI product customers workflow",
    independentAnalysis: "harvey Sacra ARR analysis",
  },
  presentationFocus: ["buyer", "workflow", "funding quality"],
};

describe("researchPlanTool", () => {
  it("requires investor questions and search queries", () => {
    expect(researchPlanTool.input_schema.properties.priorityQuestions).toMatchObject({
      type: "array",
      minItems: 3,
      maxItems: 6,
    });
    expect(researchPlanTool.input_schema.properties.searchQueries).toMatchObject({
      required: ["funding", "companyProfile", "independentAnalysis"],
    });
  });
});

describe("parseResearchPlanToolUse", () => {
  it("extracts the forced research-plan payload", () => {
    expect(parseResearchPlanToolUse({
      content: [{ type: "tool_use", name: "emit_research_plan", input: validPlan }],
    })).toEqual(validPlan);
  });
});

describe("fallbackResearchPlan", () => {
  it("keeps the generic fallback question-led and source-aware", () => {
    const plan = fallbackResearchPlan("spellbook.legal");

    expect(plan.priorityQuestions[0]?.question).toContain("actually sell");
    expect(plan.searchQueries.independentAnalysis).toContain("independent analysis");
    expect(investorTasteKernel).toContain("Source incentives matter");
  });
});

