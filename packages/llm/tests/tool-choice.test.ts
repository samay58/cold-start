import { describe, expect, it } from "vitest";
import { parseToolUse, SINGLE_TOOL_CHOICE } from "../src/tool-use";
import { howItWinsJudgeProviderRequest } from "../src/how-it-wins-judge-adapter";

// Opus 5.5 answers a forced tool_choice with HTTP 400, so no stage may force its tool.
describe("single tool choice", () => {
  it("offers the tool under auto rather than forcing it", () => {
    expect(SINGLE_TOOL_CHOICE).toEqual({ type: "auto" });
  });

  it("builds the judge request with auto and exactly one tool", () => {
    const params = howItWinsJudgeProviderRequest(
      {
        callId: "how-it-wins:critic",
        stage: "critic",
        attempt: 1,
        prompt: "p",
        payload: { evidencePacket: { cutoff: "2026-01-01T00:00:00.000Z", evidence: [{ evidenceId: "e1", text: "t", source: "s", sourceDate: null, attribution: "a", scope: "company" }], context: null } }
      },
      "claude-opus-5-5"
    );
    expect(params.tool_choice).toEqual({ type: "auto" });
    expect(params.tools).toHaveLength(1);
  });

  // Under auto, Opus 5 thinks before its tool call and the thinking counts as output: a probe on
  // 2026-09-23 wrote 3,742 output tokens under auto, 1,182 with thinking disabled and 755 forced,
  // and the judge's global call doubled its output and hit its 240 s timeout. Opus 5.5 rejects
  // disabling thinking, and Sonnet 4.6 does not think under auto.
  it("turns thinking off for a judge model whose API allows it, and leaves the rest alone", () => {
    const request = (model: string) => howItWinsJudgeProviderRequest(
      {
        callId: "how-it-wins:global_judge",
        stage: "global_judge",
        attempt: 1,
        prompt: "p",
        payload: { evidencePacket: { cutoff: "2026-01-01T00:00:00.000Z", evidence: [{ evidenceId: "e1", text: "t", source: "s", sourceDate: null, attribution: "a", scope: "company" }], context: null } }
      },
      model
    ) as Record<string, unknown>;
    expect(request("claude-opus-5").thinking).toEqual({ type: "disabled" });
    expect(request("claude-opus-5-5")).not.toHaveProperty("thinking");
    expect(request("claude-sonnet-4-6")).not.toHaveProperty("thinking");
  });

  it("fails clearly, with the stop reason, when the reply has no tool call", () => {
    expect(() =>
      parseToolUse({ content: [{ type: "text", text: "Here is my answer." }], stop_reason: "end_turn" }, "emit_x", { parse: (value) => value }, (value) => value)
    ).toThrow("No emit_x tool use returned (stop_reason: end_turn)");
  });
});
