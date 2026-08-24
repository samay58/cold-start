import type { GenerationTrace, HowItWinsJudgment } from "@cold-start/core";
import { describe, expect, it } from "vitest";

import { mergeTracePatch } from "../src/inngest/generation-trace";

describe("private How it wins judgment trace", () => {
  it("retains the full judgment on the run trace", () => {
    const trace: GenerationTrace = { jobKind: "analysis", mode: "analysis" };
    const judgment = { version: 1, marker: "private-all-80-audit" } as unknown as HowItWinsJudgment;

    mergeTracePatch(trace, { howItWins: { enabled: true, judgment } });

    expect(trace.howItWins?.judgment).toBe(judgment);
  });
});
