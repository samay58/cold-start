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

  it("rejects whyItMatters without visible citation markers", () => {
    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: {
              ...validSynthesisPayload,
              whyItMatters: {
                text: "Cartesia is building real-time voice infrastructure.",
                citationIds: ["c1"]
              }
            }
          }
        ]
      })
    ).toThrow("Synthesis claim text must include visible citation marker [c1]");
  });

  it("rejects bull and bear items without visible citation markers", () => {
    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: {
              ...validSynthesisPayload,
              bullCase: [
                { text: "The company has a focused voice AI wedge.", citationIds: ["c1"] },
                ...validSynthesisPayload.bullCase.slice(1)
              ]
            }
          }
        ]
      })
    ).toThrow("Synthesis claim text must include visible citation marker [c1]");

    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: {
              ...validSynthesisPayload,
              bearCase: [
                { text: "The public sources do not prove durable differentiation.", citationIds: ["c1"] },
                ...validSynthesisPayload.bearCase.slice(1)
              ]
            }
          }
        ]
      })
    ).toThrow("Synthesis claim text must include visible citation marker [c1]");
  });

  it("rejects empty citation IDs even when text has a visible marker", () => {
    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: {
              ...validSynthesisPayload,
              whyItMatters: {
                text: "Cartesia is building real-time voice infrastructure [c1].",
                citationIds: []
              }
            }
          }
        ]
      })
    ).toThrow("Synthesis claim requires at least one citation ID");
  });
});
