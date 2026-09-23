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

  it("fails clearly, with the stop reason, when the reply has no tool call", () => {
    expect(() =>
      parseToolUse({ content: [{ type: "text", text: "Here is my answer." }], stop_reason: "end_turn" }, "emit_x", { parse: (value) => value }, (value) => value)
    ).toThrow("No emit_x tool use returned (stop_reason: end_turn)");
  });
});
