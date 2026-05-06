import { describe, expect, it } from "vitest";
import { parseSynthesisToolUse } from "../src/index";

const validSynthesisPayload = {
  whyItMatters: { text: "Cartesia is building real-time voice infrastructure [c1].", citationIds: ["c1"] },
  bullCase: [
    { text: "The company has a focused voice AI wedge [c1].", citationIds: ["c1"] },
    { text: "Its public product surface targets developer adoption [c1].", citationIds: ["c1"] },
    { text: "The category has clear enterprise demand [c1].", citationIds: ["c1"] }
  ],
  bearCase: [
    { text: "The public sources do not prove durable differentiation [c1].", citationIds: ["c1"] },
    { text: "Pricing power is not visible from the cited material [c1].", citationIds: ["c1"] },
    { text: "Customer concentration is still an open risk [c1].", citationIds: ["c1"] }
  ],
  openQuestions: ["How strong is retention?", "What is gross margin?", "How concentrated is revenue?"]
};

describe("parseSynthesisToolUse", () => {
  it("extracts and validates the synthesis tool payload", () => {
    const payload = parseSynthesisToolUse({
      content: [{ type: "tool_use", name: "emit_investor_synthesis", input: validSynthesisPayload }]
    });

    expect(payload).toEqual(validSynthesisPayload);
  });

  it("rejects missing synthesis tool input", () => {
    expect(() =>
      parseSynthesisToolUse({
        content: [{ type: "tool_use", name: "emit_investor_synthesis" }]
      })
    ).toThrow("emit_investor_synthesis tool use returned no input");
  });

  it("rejects malformed synthesis payloads", () => {
    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: { ...validSynthesisPayload, whyItMatters: { text: "", citationIds: [] } }
          }
        ]
      })
    ).toThrow();
  });
});
