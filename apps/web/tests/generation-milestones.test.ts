import type { GenerationTrace } from "@cold-start/core";
import { describe, expect, it } from "vitest";
import {
  requestedAtMsFromGenerationEvent,
  writeGenerationMilestone
} from "../src/inngest/functions";

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
});
