import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";
import { synthesisSchema, type ColdStartCard } from "@cold-start/core";
import { z } from "zod";

const SYNTHESIS_TOOL_NAME = "emit_investor_synthesis";
const citationMarkerPattern = "\\[[A-Za-z0-9_-]+\\]";

const sourcedTextSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: {
      type: "string",
      pattern: citationMarkerPattern,
      description: "Claim text with visible citation markers such as [c1]."
    },
    citationIds: { type: "array", minItems: 1, items: { type: "string" } }
  },
  required: ["text", "citationIds"]
} as const;

const citedSynthesisSchema = synthesisSchema.superRefine((synthesis, ctx) => {
  const fixedLengthArrays = [
    { path: ["bullCase"], value: synthesis.bullCase, label: "bullCase" },
    { path: ["bearCase"], value: synthesis.bearCase, label: "bearCase" },
    { path: ["openQuestions"], value: synthesis.openQuestions, label: "openQuestions" }
  ];

  for (const item of fixedLengthArrays) {
    if (item.value.length !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: item.path,
        message: `${item.label} must contain exactly 3 items`
      });
    }
  }

  const items = [
    { path: ["whyItMatters"], value: synthesis.whyItMatters },
    ...synthesis.bullCase.map((value, index) => ({ path: ["bullCase", index], value })),
    ...synthesis.bearCase.map((value, index) => ({ path: ["bearCase", index], value }))
  ];

  for (const item of items) {
    if (item.value.citationIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...item.path, "citationIds"],
        message: "Synthesis claim requires at least one citation ID"
      });
    }

    for (const citationId of item.value.citationIds) {
      if (!item.value.text.includes(`[${citationId}]`)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...item.path, "text"],
          message: `Synthesis claim text must include visible citation marker [${citationId}]`
        });
      }
    }
  }
});

export const synthesisTool = {
  name: SYNTHESIS_TOOL_NAME,
  description:
    "Emit gated investor synthesis where whyItMatters and every bull and bear line ends with citation markers already present on the card.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      whyItMatters: sourcedTextSchema,
      bullCase: { type: "array", minItems: 3, maxItems: 3, items: sourcedTextSchema },
      bearCase: { type: "array", minItems: 3, maxItems: 3, items: sourcedTextSchema },
      openQuestions: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } }
    },
    required: ["whyItMatters", "bullCase", "bearCase", "openQuestions"]
  }
} satisfies Tool;

type ToolUseLike = {
  type: string;
  name?: string;
  input?: unknown;
  id?: string;
  text?: string;
};

export function parseSynthesisToolUse(message: { content: ToolUseLike[] }) {
  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === SYNTHESIS_TOOL_NAME);
  if (!toolUse) {
    throw new Error("No emit_investor_synthesis tool use returned");
  }

  if (toolUse.input === undefined) {
    throw new Error("emit_investor_synthesis tool use returned no input");
  }

  return citedSynthesisSchema.parse(toolUse.input);
}

export async function synthesizeCard(input: {
  client: Anthropic;
  model: string;
  card: ColdStartCard;
}) {
  const response: Message = await input.client.messages.create({
    model: input.model,
    max_tokens: 2500,
    system: [
      {
        type: "text",
        text: "You write gated investor synthesis from validated claim-store input only. whyItMatters and every bull and bear bullet must end with citation markers. Do not use reportedly, rumored to, appears to be, is said to, or industry sources suggest.",
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [{ role: "user", content: JSON.stringify(input.card) }],
    tools: [synthesisTool],
    tool_choice: { type: "tool", name: SYNTHESIS_TOOL_NAME }
  });

  return parseSynthesisToolUse(response);
}
