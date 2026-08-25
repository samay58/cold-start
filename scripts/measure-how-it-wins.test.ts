import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GenerationTrace } from "@cold-start/core";

import { classifyHowItWinsRun, failMessagePrefix, traceJsonByteSize } from "./measure-how-it-wins";

describe("classifyHowItWinsRun", () => {
  it("reads a legacy inline judgment and compares judge output against the filed card", () => {
    const trace = {
      jobKind: "analysis",
      mode: "analysis",
      steps: { "how-it-wins": { status: "complete", durationMs: 4200 } },
      howItWins: {
        enabled: true,
        status: "read",
        judgment: {
          currentStrategyIds: ["a", "b", "c"],
          openQuestions: [{ questionId: "q1" }],
          calls: [
            { stage: "global_judge", model: "claude", outputTokens: 12000, latencyMs: 9000, actualCostUsd: null, estimatedCostUsd: 0.42 }
          ]
        }
      }
    } as unknown as GenerationTrace;
    const card = { synthesis: { howItWins: { status: "read", running: [{ strategy: "a" }, { strategy: "b" }], inQuestion: [{ strategy: "c" }] } } };

    const result = classifyHowItWinsRun(trace, card);

    assert.equal(result.bucket, "read");
    assert.equal(result.judgeCurrentCount, 3);
    assert.equal(result.filedRunningCount, 2);
    assert.equal(result.judgeOpenQuestionCount, 1);
    assert.equal(result.filedInQuestionCount, 1);
    assert.equal(result.judgeCalls.length, 1);
    assert.equal(result.judgeCalls[0]?.costUsd, 0.42);
    assert.equal(result.judgeCostUsd, 0.42);
  });

  it("reads a lighter judgeSummary the same way as an inline judgment", () => {
    const trace = {
      jobKind: "analysis",
      mode: "analysis",
      steps: { "how-it-wins": { status: "complete" } },
      howItWins: {
        enabled: true,
        status: "read",
        judgeSummary: {
          currentCount: 4,
          openQuestionCount: 2,
          calls: [{ stage: "critic", model: "gpt", outputTokens: 500, latencyMs: 1000, estimatedCostUsd: 0.02 }]
        }
      }
    } as unknown as GenerationTrace;

    const result = classifyHowItWinsRun(trace, null);

    assert.equal(result.bucket, "read");
    assert.equal(result.judgeCurrentCount, 4);
    assert.equal(result.judgeOpenQuestionCount, 2);
    assert.equal(result.judgeCalls.length, 1);
    assert.equal(result.filedRunningCount, null);
  });

  it("buckets a run with no how-it-wins block at all as absent", () => {
    const trace = { jobKind: "analysis", mode: "analysis", steps: {} } as unknown as GenerationTrace;

    const result = classifyHowItWinsRun(trace, null);

    assert.equal(result.bucket, "absent");
    assert.equal(result.blockStatus, null);
    assert.equal(result.judgeCurrentCount, null);
  });

  it("buckets a disabled run separately from a truly absent one", () => {
    const trace = {
      jobKind: "analysis",
      mode: "analysis",
      steps: { "how-it-wins": { status: "skipped", message: "HOW_IT_WINS_ENABLED=false" } }
    } as unknown as GenerationTrace;

    const result = classifyHowItWinsRun(trace, null);

    assert.equal(result.bucket, "enabled_false");
  });

  it("buckets a failed step as fail-closed even when the draft degraded to nothing_stands_out", () => {
    const trace = {
      jobKind: "analysis",
      mode: "analysis",
      steps: {
        "how-it-wins": {
          status: "failed",
          durationMs: 340,
          message: "Anthropic API error: streaming is required for operations that may take longer than 10 minutes"
        }
      },
      howItWins: { enabled: true, status: "nothing_stands_out", inQuestion: [] }
    } as unknown as GenerationTrace;

    const result = classifyHowItWinsRun(trace, null);

    assert.equal(result.bucket, "fail_closed");
    assert.equal(result.failMessagePrefix, "Anthropic API error");
    assert.equal(result.stepStatus, "failed");
  });

  it("buckets an honest nothing_stands_out separately from a fail-closed one", () => {
    const trace = {
      jobKind: "analysis",
      mode: "analysis",
      steps: { "how-it-wins": { status: "complete", durationMs: 5000 } },
      howItWins: { enabled: true, status: "nothing_stands_out", inQuestion: [] }
    } as unknown as GenerationTrace;

    const result = classifyHowItWinsRun(trace, null);

    assert.equal(result.bucket, "honest_nothing_stands_out");
  });

  it("names a documented forward status instead of collapsing it into unknown", () => {
    const trace = {
      jobKind: "analysis",
      mode: "analysis",
      steps: { "how-it-wins": { status: "complete" } },
      howItWins: { enabled: true, status: "deferred" }
    } as unknown as GenerationTrace;

    const result = classifyHowItWinsRun(trace, null);

    assert.equal(result.bucket, "block_deferred");
  });

  it("never crashes on a status string it has never seen and gives it its own bucket", () => {
    const trace = {
      jobKind: "analysis",
      mode: "analysis",
      steps: { "how-it-wins": { status: "complete" } },
      howItWins: { enabled: true, status: "some_future_thing" }
    } as unknown as GenerationTrace;

    const result = classifyHowItWinsRun(trace, null);

    assert.equal(result.bucket, "unknown:some_future_thing");
    assert.equal(result.blockStatus, "some_future_thing");
  });

  it("handles a missing trace and a missing card without throwing", () => {
    const result = classifyHowItWinsRun(null, null);

    assert.equal(result.bucket, "absent");
    assert.equal(result.judgeCurrentCount, null);
    assert.equal(result.filedRunningCount, null);
    assert.deepEqual(result.judgeCalls, []);
  });
});

describe("failMessagePrefix", () => {
  it("splits on the first colon to group by error class", () => {
    assert.equal(failMessagePrefix("Anthropic API error: 400 max_tokens exceeds limit"), "Anthropic API error");
  });

  it("falls back to a truncated first line when there is no colon", () => {
    const long = "x".repeat(120);
    assert.equal(failMessagePrefix(long), "x".repeat(80));
  });

  it("returns a fixed label for a missing message", () => {
    assert.equal(failMessagePrefix(null), "no message");
  });
});

describe("traceJsonByteSize", () => {
  it("returns null for a missing trace", () => {
    assert.equal(traceJsonByteSize(null), null);
    assert.equal(traceJsonByteSize(undefined), null);
  });

  it("measures the serialized byte size", () => {
    const trace = { a: 1, b: "two" };
    assert.equal(traceJsonByteSize(trace), Buffer.byteLength(JSON.stringify(trace), "utf8"));
  });
});
