import { globalJudgmentTransportSchema } from "@cold-start/core";
import { describe, expect, it } from "vitest";

import { howItWinsOutputDiagnostics, isSupportedZodError } from "../src";

function malformedCompactJudgment() {
  return {
    materialBets: [{
      statement: "One supported bet.",
      scope: "company",
      supportingEvidenceIds: ["e1"],
      scopeReasons: ["The same company scope applies."]
    }],
    strategyEvaluations: [{
      strategyId: "aggregation",
      disposition: "insufficient_evidence",
      evidenceGate: "fail"
    }],
    currentStrategyIds: [],
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: { condition: "The evidence changes.", evidenceIds: ["e1"] },
    disagreements: [],
    overrides: []
  };
}

describe("how-it-wins output diagnostics", () => {
  it("selects the union branch compatible with a valid disposition", () => {
    const candidate = malformedCompactJudgment();
    const parsed = globalJudgmentTransportSchema.safeParse(candidate);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const diagnostics = howItWinsOutputDiagnostics({
      stage: "global_judge",
      error: parsed.error,
      candidate
    });

    expect(diagnostics).toEqual([{
      stage: "global_judge",
      code: "invalid_type",
      path: "strategyEvaluations.0.dispositionReason",
      branch: "compact",
      expected: "string",
      actualType: "undefined",
      strategyId: "aggregation"
    }]);
  });

  it("requires a structurally valid Zod error instead of any object with issues", () => {
    expect(isSupportedZodError({ issues: [{ code: "invalid_type", path: [] }] })).toBe(false);
    expect(isSupportedZodError({ name: "ZodError", issues: [{ code: "made_up", path: [] }] })).toBe(false);
    expect(howItWinsOutputDiagnostics({
      stage: "global_judge",
      error: new Error("arbitrary failure"),
      candidate: malformedCompactJudgment()
    })).toBeNull();
  });

  it("never includes unknown property names or received strings", () => {
    const error = {
      name: "ZodError",
      issues: [{
        code: "unrecognized_keys",
        keys: ["privateSourceText"],
        path: ["strategyEvaluations", 0],
        message: "Unrecognized key privateSourceText"
      }]
    };

    const diagnostics = howItWinsOutputDiagnostics({
      stage: "global_judge",
      error,
      candidate: malformedCompactJudgment()
    });

    expect(JSON.stringify(diagnostics)).not.toContain("privateSourceText");
    expect(diagnostics).toMatchObject([{ code: "unrecognized_keys", path: "strategyEvaluations.0" }]);
  });

  it("caps nested issue output by count and serialized size", () => {
    const error = {
      name: "ZodError",
      issues: Array.from({ length: 50 }, (_, index) => ({
        code: "invalid_type",
        expected: "string",
        received: `private-value-${index}`,
        path: ["strategyEvaluations", index, "dispositionReason"]
      }))
    };

    const diagnostics = howItWinsOutputDiagnostics({
      stage: "global_judge",
      error,
      candidate: malformedCompactJudgment()
    });

    expect(diagnostics).toHaveLength(12);
    expect(Buffer.byteLength(JSON.stringify(diagnostics), "utf8")).toBeLessThanOrEqual(4 * 1024);
    expect(JSON.stringify(diagnostics)).not.toContain("private-value");
  });
});
