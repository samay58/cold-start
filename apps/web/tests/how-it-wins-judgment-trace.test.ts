import type { GenerationTrace, HowItWinsJudgment } from "@cold-start/core";
import { describe, expect, it } from "vitest";

import { mergeTracePatch } from "../src/inngest/generation-trace";

describe("How it wins judgment trace", () => {
  it("records where the verdict is stored instead of the verdict itself", () => {
    const trace: GenerationTrace = { jobKind: "analysis", mode: "analysis" };

    mergeTracePatch(trace, {
      howItWins: {
        enabled: true,
        judgmentRef: {
          id: "b8f0f0a6-0000-4000-8000-000000000000",
          evidencePacketHash: "a".repeat(64),
          promptHash: "b".repeat(64),
          cached: true
        },
        judgeSummary: {
          currentCount: 3,
          notYetCount: 2,
          openQuestionCount: 1,
          calls: [
            {
              stage: "global_judge",
              model: "claude-test",
              provider: "anthropic",
              inputTokens: 40_000,
              outputTokens: 28_000,
              latencyMs: 91_000,
              estimatedCostUsd: 1.5,
              actualCostUsd: null,
              outcome: "ok"
            }
          ]
        }
      }
    });

    expect(trace.howItWins?.judgmentRef?.cached).toBe(true);
    expect(trace.howItWins?.judgeSummary?.currentCount).toBe(3);
    expect(trace.howItWins?.judgment).toBeUndefined();
    // The whole point of the reference: the trace no longer carries the all-80 audit, so one run's
    // trace cannot grow to tens of thousands of tokens.
    expect(JSON.stringify(trace)).not.toContain("strategyEvaluations");
  });

  it("merges the block shallowly across the run's separate writes", () => {
    const trace: GenerationTrace = { jobKind: "analysis", mode: "analysis" };

    mergeTracePatch(trace, { howItWins: { enabled: true, status: "deferred" } });
    mergeTracePatch(trace, {
      howItWins: {
        enabled: true,
        status: "read",
        losses: {
          judgeCurrent: 4,
          writerCurrent: 3,
          verifiedRunning: 2,
          writerCitationDropped: 0,
          verifierDropped: 1,
          underTwoFired: false
        }
      }
    });

    expect(trace.howItWins?.status).toBe("read");
    expect(trace.howItWins?.losses?.verifierDropped).toBe(1);
  });

  it("still reads a legacy trace that carries the whole audit inline", () => {
    const judgment = { version: 1, marker: "pre-table-audit" } as unknown as HowItWinsJudgment;
    const trace: GenerationTrace = { jobKind: "analysis", mode: "analysis", howItWins: { enabled: true, judgment } };

    expect(trace.howItWins?.judgment).toBe(judgment);
  });
});
