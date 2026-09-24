import { describe, expect, it } from "vitest";
import { fallbackResearchPlan, investorTasteKernel } from "../src/index";

describe("fallbackResearchPlan", () => {
  it("keeps the generic fallback question-led and source-aware", () => {
    const plan = fallbackResearchPlan();

    expect(plan.priorityQuestions[0]?.question).toContain("actually sell");
    expect(plan).not.toHaveProperty("searchQueries");
    expect(investorTasteKernel).toContain("Source incentives matter");
  });
});
