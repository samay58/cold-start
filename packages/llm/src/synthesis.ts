import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";
import { synthesisSchema, type ColdStartCard, type SourcedText } from "@cold-start/core";
import { z } from "zod";

const SYNTHESIS_TOOL_NAME = "emit_investor_synthesis";
const citationMarkerPattern = "\\[[A-Za-z0-9_-]+\\]";
const citationMarkerRegex = /\[([A-Za-z0-9_-]+)\]/g;
const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;

const sourcedTextSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: {
      type: "string",
      pattern: citationMarkerPattern,
      description: "Claim text with visible citation markers such as [c1]."
    },
    citationIds: { type: "array", minItems: 1, items: nonEmptyStringSchema }
  },
  required: ["text", "citationIds"]
} as const;

function visibleCitationMarkers(text: string): string[] {
  return Array.from(text.matchAll(citationMarkerRegex), (match) => match[1]).filter(
    (citationId): citationId is string => citationId !== undefined
  );
}

function sortedCitationIds(citationIds: string[]): string[] {
  return [...citationIds].sort();
}

function sameCitationMultiset(left: string[], right: string[]) {
  const sortedLeft = sortedCitationIds(left);
  const sortedRight = sortedCitationIds(right);
  return sortedLeft.length === sortedRight.length && sortedLeft.every((citationId, index) => citationId === sortedRight[index]);
}

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
    const visibleMarkers = visibleCitationMarkers(item.value.text);

    if (item.value.citationIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...item.path, "citationIds"],
        message: "Synthesis claim requires at least one citation ID"
      });
    }

    if (!sameCitationMultiset(visibleMarkers, item.value.citationIds)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...item.path, "text"],
        message: "Synthesis claim visible citation markers must exactly match citationIds"
      });
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
      openQuestions: { type: "array", minItems: 3, maxItems: 3, items: nonEmptyStringSchema }
    },
    required: ["whyItMatters", "bullCase", "bearCase", "openQuestions"]
  }
} satisfies Tool;

export const synthesisSystemPrompt = [
  "You write gated investor synthesis from validated claim-store input only.",
  "whyItMatters and every bull and bear bullet must end with citation markers.",
  "Use only citation IDs present in card.citations; do not cite evidence ledger IDs such as [e1].",
  "Treat source incentives as part of the judgment: independent technical and independent analysis sources deserve more weight for market and product evaluation than press releases or company-authored claims.",
  "Do not leave bearCase empty when any cited risk, uncertainty, missing proof point, or unresolved diligence question exists on the card.",
  "Do not use reportedly, rumored to, appears to be, is said to, or industry sources suggest."
].join(" ");

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

function synthesisClaims(synthesis: NonNullable<ColdStartCard["synthesis"]>): SourcedText[] {
  return [synthesis.whyItMatters, ...synthesis.bullCase, ...synthesis.bearCase];
}

function assertSynthesisCitationsExistOnCard(synthesis: NonNullable<ColdStartCard["synthesis"]>, card: ColdStartCard) {
  const validCitationIds = new Set(card.citations.map((citation) => citation.id));

  for (const claim of synthesisClaims(synthesis)) {
    for (const citationId of claim.citationIds) {
      if (!validCitationIds.has(citationId)) {
        throw new Error(`Synthesis citation ID not found on card: ${citationId}`);
      }
    }
  }
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
        text: synthesisSystemPrompt,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [{ role: "user", content: JSON.stringify(input.card) }],
    tools: [synthesisTool],
    tool_choice: { type: "tool", name: SYNTHESIS_TOOL_NAME }
  });

  const synthesis = parseSynthesisToolUse(response);
  assertSynthesisCitationsExistOnCard(synthesis, input.card);
  return synthesis;
}
