import type { GenerationTrace } from "@cold-start/core";
import { describe, expect, it } from "vitest";
import {
  mergeTracePatch,
  mergeGenerationTrace,
  requestedAtMsFromGenerationEvent,
  writeGenerationMilestone
} from "../src/inngest/generation-trace";

describe("generation milestone telemetry", () => {
  it("uses the durable Inngest event timestamp instead of replay-local function start time", () => {
    const requestedAtMs = Date.parse("2026-05-27T20:08:33.000Z");
    const firstReplayStartMs = requestedAtMs + 18_000;
    const secondReplayStartMs = requestedAtMs + 270_000;

    expect(
      requestedAtMsFromGenerationEvent({ ts: requestedAtMs }, firstReplayStartMs)
    ).toBe(requestedAtMs);

    const trace: GenerationTrace = { jobKind: "basics", mode: "basics" };
    writeGenerationMilestone(trace, "seedCardMs", requestedAtMs, firstReplayStartMs);
    writeGenerationMilestone(trace, "firstUsableCardMs", requestedAtMs, secondReplayStartMs);

    expect(trace.milestones?.seedCardMs).toBe(18_000);
    expect(trace.milestones?.firstUsableCardMs).toBe(270_000);
    expect(trace.milestones?.firstUsableCardMs).toBeGreaterThan(
      trace.milestones?.seedCardMs ?? 0
    );
  });

  it("keeps first usable card time stable when an Inngest replay writes the same milestone again", () => {
    const requestedAtMs = Date.parse("2026-05-27T20:08:33.000Z");
    const trace: GenerationTrace = { jobKind: "basics", mode: "basics" };

    writeGenerationMilestone(trace, "firstUsableCardMs", requestedAtMs, requestedAtMs + 85_000);
    writeGenerationMilestone(
      trace,
      "firstUsableCardMs",
      requestedAtMs,
      requestedAtMs + 414_000
    );

    expect(trace.milestones?.firstUsableCardMs).toBe(85_000);
  });

  it("preserves child contact telemetry when the parent persists its final trace later", () => {
    const childTrace: GenerationTrace = {
      jobKind: "basics",
      mode: "basics",
      milestones: {
        contactsReadyMs: 42_000
      },
      providers: {
        stableenrich: {
          sourceCount: 2,
          failureCount: 0
        },
        emailDiscovery: [
          {
            name: "Erik Bernhardsson",
            role: "Founder",
            discoverySource: "exa",
            emailFound: "erik@modal.com",
            emailSource: "hunter"
          }
        ]
      }
    };

    const parentFinalTrace: GenerationTrace = {
      jobKind: "basics",
      mode: "basics",
      steps: {
        "fetch-sources": {
          status: "complete",
          durationMs: 1200
        }
      },
      milestones: {
        seedCardMs: 11_000,
        firstUsableCardMs: 27_000
      },
      llm: {
        calls: [
          {
            stage: "extract_full",
            label: "extract",
            model: "claude-test",
            status: "ok",
            durationMs: 800,
            estimatedCostUsd: 0.12
          }
        ],
        totalEstimatedCostUsd: 0.12
      },
      costUsdAnthropic: 0.12
    };

    const merged = mergeGenerationTrace(childTrace, parentFinalTrace);

    expect(merged.milestones).toEqual({
      contactsReadyMs: 42_000,
      seedCardMs: 11_000,
      firstUsableCardMs: 27_000
    });
    expect(merged.providers?.emailDiscovery).toEqual(childTrace.providers?.emailDiscovery);
    expect(merged.steps?.["fetch-sources"]?.status).toBe("complete");
    expect(merged.costUsdAnthropic).toBe(0.12);
  });

  it("sums LLM cost across durable step trace patches", () => {
    const trace: GenerationTrace = { jobKind: "analysis", mode: "analysis" };

    mergeTracePatch(trace, {
      llm: {
        calls: [{
          stage: "extract_full",
          label: "extract",
          model: "claude-test",
          status: "ok",
          durationMs: 100,
          estimatedCostUsd: 0.012345
        }],
        totalEstimatedCostUsd: 0.012345
      }
    });
    mergeTracePatch(trace, {
      llm: {
        calls: [{
          stage: "synthesis",
          label: "section:market",
          model: "claude-test",
          status: "ok",
          durationMs: 200,
          estimatedCostUsd: 0.006789
        }],
        totalEstimatedCostUsd: 0.006789
      }
    });

    expect(trace.llm?.calls).toHaveLength(2);
    expect(trace.llm?.totalEstimatedCostUsd).toBe(0.019134);
    expect(trace.costUsdAnthropic).toBe(0.019134);
  });
});
