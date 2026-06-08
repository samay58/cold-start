import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";
import { synthesisSchema, type ColdStartCard, type SourcedText } from "@cold-start/core";
import { z } from "zod";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";

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

const nullableSourcedTextSchema = {
  anyOf: [sourcedTextSchema, { type: "null" }]
} as const;

const marketStructureAndTimingToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    buyerBudget: nullableSourcedTextSchema,
    painSeverity: nullableSourcedTextSchema,
    adoptionTrigger: nullableSourcedTextSchema,
    marketStructure: nullableSourcedTextSchema,
    profitPool: nullableSourcedTextSchema,
    expansionPath: nullableSourcedTextSchema,
    timingRisk: nullableSourcedTextSchema
  },
  required: [
    "buyerBudget",
    "painSeverity",
    "adoptionTrigger",
    "marketStructure",
    "profitPool",
    "expansionPath",
    "timingRisk"
  ]
} as const;

function visibleCitationMarkers(text: string): string[] {
  return Array.from(text.matchAll(citationMarkerRegex), (match) => match[1]).filter(
    (citationId): citationId is string => citationId !== undefined
  );
}

function sortedCitationIds(citationIds: string[]): string[] {
  return [...citationIds].sort();
}

function uniqueCitationIds(citationIds: string[]): string[] {
  return Array.from(new Set(citationIds.filter((citationId) => citationId.trim().length > 0)));
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

  const market = synthesis.marketStructureAndTiming;
  const marketItems = market
    ? [
        { path: ["marketStructureAndTiming", "buyerBudget"], value: market.buyerBudget },
        { path: ["marketStructureAndTiming", "painSeverity"], value: market.painSeverity },
        { path: ["marketStructureAndTiming", "adoptionTrigger"], value: market.adoptionTrigger },
        { path: ["marketStructureAndTiming", "marketStructure"], value: market.marketStructure },
        { path: ["marketStructureAndTiming", "profitPool"], value: market.profitPool },
        { path: ["marketStructureAndTiming", "expansionPath"], value: market.expansionPath },
        { path: ["marketStructureAndTiming", "timingRisk"], value: market.timingRisk }
      ].flatMap((item) => (item.value ? [{ path: item.path, value: item.value }] : []))
    : [];

  const items = [
    { path: ["whyItMatters"], value: synthesis.whyItMatters },
    ...synthesis.bullCase.map((value, index) => ({ path: ["bullCase", index], value })),
    ...synthesis.bearCase.map((value, index) => ({ path: ["bearCase", index], value })),
    ...marketItems
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

function textWithCitationMarkers(text: string, citationIds: string[]) {
  const base = text.replace(citationMarkerRegex, "").replace(/\s+/g, " ").trim();
  const markers = citationIds.map((citationId) => `[${citationId}]`).join(" ");
  if (citationIds.length === 0) {
    return base;
  }

  if (!base) {
    return markers;
  }

  return `${base.replace(/[.\s]+$/, "")} ${markers}.`;
}

function normalizeClaimCitations(claim: SourcedText): SourcedText {
  const visibleMarkers = uniqueCitationIds(visibleCitationMarkers(claim.text));
  const citationIds = uniqueCitationIds(claim.citationIds.length > 0 ? claim.citationIds : visibleMarkers);
  return {
    ...claim,
    citationIds,
    text: textWithCitationMarkers(claim.text, citationIds)
  };
}

function normalizeMarketClaimCitations(claim: SourcedText): SourcedText {
  const citationIds = uniqueCitationIds(claim.citationIds);
  return {
    ...claim,
    citationIds,
    text: textWithCitationMarkers(claim.text, citationIds)
  };
}

function normalizeNullableMarketClaim(claim: SourcedText | null): SourcedText | null {
  return claim ? normalizeMarketClaimCitations(claim) : null;
}

function normalizeSynthesisCitations(synthesis: NonNullable<ColdStartCard["synthesis"]>): NonNullable<ColdStartCard["synthesis"]> {
  return {
    ...synthesis,
    whyItMatters: normalizeClaimCitations(synthesis.whyItMatters),
    bullCase: synthesis.bullCase.map(normalizeClaimCitations),
    bearCase: synthesis.bearCase.map(normalizeClaimCitations),
    ...(synthesis.marketStructureAndTiming
      ? {
          marketStructureAndTiming: {
            buyerBudget: normalizeNullableMarketClaim(synthesis.marketStructureAndTiming.buyerBudget),
            painSeverity: normalizeNullableMarketClaim(synthesis.marketStructureAndTiming.painSeverity),
            adoptionTrigger: normalizeNullableMarketClaim(synthesis.marketStructureAndTiming.adoptionTrigger),
            marketStructure: normalizeNullableMarketClaim(synthesis.marketStructureAndTiming.marketStructure),
            profitPool: normalizeNullableMarketClaim(synthesis.marketStructureAndTiming.profitPool),
            expansionPath: normalizeNullableMarketClaim(synthesis.marketStructureAndTiming.expansionPath),
            timingRisk: normalizeNullableMarketClaim(synthesis.marketStructureAndTiming.timingRisk)
          }
        }
      : {})
  };
}

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
      marketStructureAndTiming: marketStructureAndTimingToolSchema,
      openQuestions: { type: "array", minItems: 3, maxItems: 3, items: nonEmptyStringSchema }
    },
    required: ["whyItMatters", "bullCase", "bearCase", "marketStructureAndTiming", "openQuestions"]
  }
} satisfies Tool;

export const synthesisSystemPrompt = [
  "You write gated investor synthesis from validated claim-store input only.",
  "whyItMatters and every bull and bear bullet must end with citation markers.",
  "Use only citation IDs present in card.citations; do not cite evidence ledger IDs such as [e1].",
  "Treat source incentives as part of the judgment: independent technical and independent analysis sources deserve more weight for market and product evaluation than press releases or company-authored claims.",
  "Do not leave bearCase empty when any cited risk, uncertainty, missing proof point, or unresolved diligence question exists on the card.",
  "Do not use reportedly, rumored to, appears to be, is said to, or industry sources suggest.",
  "marketStructureAndTiming should be sparse. Use null when sources do not support a field.",
  "Do not write top-down TAM or CAGR filler. Prefer buyer budget, pain severity, adoption trigger, market structure, profit pool, expansion path, and timing risk.",
  "openQuestions should be the 3 highest-ROI diligence prompts for this specific company. Prioritize questions that would change conviction: buyer, workflow, wedge durability, customer proof, procurement friction, margin/compute pressure, market structure, financing risk, or missing evidence.",
  "Do not default to ARR/revenue-not-public unless it is genuinely the most important company-specific uncertainty. If revenue matters, ask about revenue quality, retention, pricing power, or margin evidence."
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

  return citedSynthesisSchema.parse(normalizeSynthesisCitations(synthesisSchema.parse(toolUse.input)));
}

function synthesisClaims(synthesis: NonNullable<ColdStartCard["synthesis"]>): SourcedText[] {
  const market = synthesis.marketStructureAndTiming;
  const marketClaims = market
    ? [
        market.buyerBudget,
        market.painSeverity,
        market.adoptionTrigger,
        market.marketStructure,
        market.profitPool,
        market.expansionPath,
        market.timingRisk
      ].filter((claim): claim is SourcedText => claim !== null)
    : [];

  return [synthesis.whyItMatters, ...synthesis.bullCase, ...synthesis.bearCase, ...marketClaims];
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
  telemetry?: AnthropicTelemetrySink;
}) {
  const response: Message = await createTracedAnthropicMessage({
    client: input.client,
    label: "synthesize-card",
    model: input.model,
    stage: "synthesis",
    telemetry: input.telemetry,
    params: {
      model: input.model,
      max_tokens: 2500,
      temperature: 0.2,
      system: [
        {
          type: "text",
          text: synthesisSystemPrompt,
          cache_control: anthropicSystemCacheControl()
        }
      ],
      messages: [{ role: "user", content: JSON.stringify(input.card) }],
      tools: [synthesisTool],
      tool_choice: { type: "tool", name: SYNTHESIS_TOOL_NAME }
    },
  });

  const synthesis = parseSynthesisToolUse(response);
  assertSynthesisCitationsExistOnCard(synthesis, input.card);
  return synthesis;
}
