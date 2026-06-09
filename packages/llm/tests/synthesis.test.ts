import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { ColdStartCard } from "@cold-start/core";
import { parseSynthesisToolUse, synthesisSystemPrompt, synthesisTool, synthesizeCard } from "../src/index";

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
  marketStructureAndTiming: {
    buyerBudget: {
      text: "The buyer budget is likely contact-center automation or developer infrastructure spend [c1].",
      citationIds: ["c1"]
    },
    painSeverity: {
      text: "The pain is severe when latency blocks production voice-agent workflows [c1].",
      citationIds: ["c1"]
    },
    adoptionTrigger: {
      text: "The adoption trigger is lower-latency model infrastructure reaching production usability [c1].",
      citationIds: ["c1"]
    },
    marketStructure: null,
    profitPool: null,
    expansionPath: null,
    timingRisk: null
  },
  openQuestions: [
    { question: "How strong is retention?", category: "adoption_proof" },
    { question: "What is gross margin?", category: "unit_economics" },
    { question: "How concentrated is revenue?", category: "unit_economics" }
  ]
};

describe("synthesisTool", () => {
  it("uses non-empty string schemas for citation IDs and open questions", () => {
    const whyItMatters = synthesisTool.input_schema.properties.whyItMatters;

    expect(whyItMatters.properties.citationIds.items).toMatchObject({
      type: "string",
      minLength: 1
    });
    expect(synthesisTool.input_schema.properties.bullCase.items.properties.citationIds.items).toMatchObject({
      type: "string",
      minLength: 1
    });
    const openQuestionsItems = synthesisTool.input_schema.properties.openQuestions.items;
    expect(openQuestionsItems).toMatchObject({
      type: "object",
      properties: {
        question: { type: "string", minLength: 1 },
        category: { type: "string" }
      },
      required: ["question", "category"]
    });
    expect(openQuestionsItems.properties.category.enum).toEqual(
      expect.arrayContaining([
        "buyer_budget",
        "adoption_proof",
        "durability",
        "unit_economics",
        "technical_edge",
        "market_timing",
        "trust_regulation"
      ])
    );
  });
});

describe("synthesisSystemPrompt", () => {
  it("uses source incentives and pushes against empty skeptical evidence", () => {
    expect(synthesisSystemPrompt).toContain("source incentives");
    expect(synthesisSystemPrompt).toContain("independent technical");
    expect(synthesisSystemPrompt).toContain("Do not leave bearCase empty");
    expect(synthesisSystemPrompt).toContain("do not cite evidence ledger IDs");
  });
});

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

  it("normalizes whyItMatters text when visible citation markers are missing", () => {
    const payload = parseSynthesisToolUse({
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
    });

    expect(payload.whyItMatters).toEqual({
      text: "Cartesia is building real-time voice infrastructure [c1].",
      citationIds: ["c1"]
    });
  });

  it("normalizes bull and bear items when visible citation markers are missing", () => {
    const payload = parseSynthesisToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_investor_synthesis",
          input: {
            ...validSynthesisPayload,
            bullCase: [
              { text: "The company has a focused voice AI wedge.", citationIds: ["c1"] },
              ...validSynthesisPayload.bullCase.slice(1)
            ],
            bearCase: [
              { text: "The public sources do not prove durable differentiation.", citationIds: ["c1"] },
              ...validSynthesisPayload.bearCase.slice(1)
            ]
          }
        }
      ]
    });

    expect(payload.bullCase[0]).toEqual({
      text: "The company has a focused voice AI wedge [c1].",
      citationIds: ["c1"]
    });
    expect(payload.bearCase[0]).toEqual({
      text: "The public sources do not prove durable differentiation [c1].",
      citationIds: ["c1"]
    });
  });

  it("recovers citation IDs from visible markers when the structured list is empty", () => {
    const payload = parseSynthesisToolUse({
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
    });

    expect(payload.whyItMatters).toEqual({
      text: "Cartesia is building real-time voice infrastructure [c1].",
      citationIds: ["c1"]
    });
  });

  it("rewrites undeclared visible citation markers to match the structured citation IDs", () => {
    const payload = parseSynthesisToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_investor_synthesis",
          input: {
            ...validSynthesisPayload,
            whyItMatters: {
              text: "Cartesia is building real-time voice infrastructure [c1] [missing].",
              citationIds: ["c1"]
            }
          }
        }
      ]
    });

    expect(payload.whyItMatters).toEqual({
      text: "Cartesia is building real-time voice infrastructure [c1].",
      citationIds: ["c1"]
    });
  });

  it("deduplicates visible citation markers", () => {
    const payload = parseSynthesisToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_investor_synthesis",
          input: {
            ...validSynthesisPayload,
            whyItMatters: {
              text: "Cartesia is building real-time voice infrastructure [c1] [c1].",
              citationIds: ["c1"]
            }
          }
        }
      ]
    });

    expect(payload.whyItMatters).toEqual({
      text: "Cartesia is building real-time voice infrastructure [c1].",
      citationIds: ["c1"]
    });
  });

  it("normalizes market structure citation markers", () => {
    const payload = parseSynthesisToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_investor_synthesis",
          input: {
            ...validSynthesisPayload,
            marketStructureAndTiming: {
              ...validSynthesisPayload.marketStructureAndTiming,
              buyerBudget: {
                text: "The buyer budget is likely contact-center automation spend.",
                citationIds: ["c1"]
              }
            }
          }
        }
      ]
    });

    expect(payload.marketStructureAndTiming?.buyerBudget).toEqual({
      text: "The buyer budget is likely contact-center automation spend [c1].",
      citationIds: ["c1"]
    });
  });

  it("rejects market structure claims without citation IDs", () => {
    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: {
              ...validSynthesisPayload,
              marketStructureAndTiming: {
                ...validSynthesisPayload.marketStructureAndTiming,
                buyerBudget: {
                  text: "This still has only a visible marker [c1].",
                  citationIds: []
                }
              }
            }
          }
        ]
      })
    ).toThrow();
  });

  it("rejects short synthesis arrays", () => {
    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: { ...validSynthesisPayload, bullCase: validSynthesisPayload.bullCase.slice(0, 2) }
          }
        ]
      })
    ).toThrow("bullCase must contain exactly 3 items");

    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: { ...validSynthesisPayload, bearCase: validSynthesisPayload.bearCase.slice(0, 2) }
          }
        ]
      })
    ).toThrow("bearCase must contain exactly 3 items");

    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: { ...validSynthesisPayload, openQuestions: validSynthesisPayload.openQuestions.slice(0, 2) }
          }
        ]
      })
    ).toThrow("openQuestions must contain exactly 3 items");
  });

  it("rejects long synthesis arrays", () => {
    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: {
              ...validSynthesisPayload,
              bullCase: [
                ...validSynthesisPayload.bullCase,
                { text: "The company has an additional upside path [c1].", citationIds: ["c1"] }
              ]
            }
          }
        ]
      })
    ).toThrow("bullCase must contain exactly 3 items");

    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: {
              ...validSynthesisPayload,
              bearCase: [
                ...validSynthesisPayload.bearCase,
                { text: "The company has an additional diligence risk [c1].", citationIds: ["c1"] }
              ]
            }
          }
        ]
      })
    ).toThrow("bearCase must contain exactly 3 items");

    expect(() =>
      parseSynthesisToolUse({
        content: [
          {
            type: "tool_use",
            name: "emit_investor_synthesis",
            input: { ...validSynthesisPayload, openQuestions: [...validSynthesisPayload.openQuestions, { question: "What else matters?", category: "buyer_budget" }] }
          }
        ]
      })
    ).toThrow("openQuestions must contain exactly 3 items");
  });
});

describe("synthesizeCard", () => {
  it("rejects citation IDs that are not present on the input card", async () => {
    const client = {
      messages: {
        create: async () => ({
          content: [
            {
              type: "tool_use",
              name: "emit_investor_synthesis",
              input: {
                ...validSynthesisPayload,
                whyItMatters: {
                  text: "Cartesia is building real-time voice infrastructure [missing].",
                  citationIds: ["missing"]
                }
              }
            }
          ]
        })
      }
    } as unknown as Anthropic;
    const card = {
      citations: [{ id: "c1" }]
    } as ColdStartCard;

    await expect(synthesizeCard({ client, model: "claude-test", card })).rejects.toThrow(
      "Synthesis citation ID not found on card: missing"
    );
  });

  it("rejects market structure citation IDs that are not present on the input card", async () => {
    const client = {
      messages: {
        create: async () => ({
          content: [
            {
              type: "tool_use",
              name: "emit_investor_synthesis",
              input: {
                ...validSynthesisPayload,
                marketStructureAndTiming: {
                  ...validSynthesisPayload.marketStructureAndTiming,
                  buyerBudget: {
                    text: "The buyer budget is likely contact-center automation spend [missing].",
                    citationIds: ["missing"]
                  }
                }
              }
            }
          ]
        })
      }
    } as unknown as Anthropic;
    const card = {
      citations: [{ id: "c1" }]
    } as ColdStartCard;

    await expect(synthesizeCard({ client, model: "claude-test", card })).rejects.toThrow(
      "Synthesis citation ID not found on card: missing"
    );
  });
});
