import type Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type { ExpandedDescription } from "@cold-start/core";
import { z } from "zod";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { parseToolUse, type ToolUseLike } from "./tool-use";

const EXPANDED_DESCRIPTION_TOOL_NAME = "emit_expanded_description";

// Three short paragraphs, 120 to 220 words. The bounds below tolerate honest variance on
// both sides while rejecting a one-liner restatement or an essay.
const MIN_TOTAL_WORDS = 60;
const MAX_TOTAL_WORDS = 280;
const MAX_TOKENS = 1200;

// Phrases that mark brochure copy rather than description. A draft that leans on them is
// suppressed rather than repaired: the surface falls back to the short description, which is
// better than shipping filler.
const BANNED_PHRASES = ["platform for", "ai-powered", "ai powered", "solutions", "best-in-class", "world-class", "cutting-edge"];

const TERMINAL_PUNCTUATION = /[.!?]["')\]]*$/;

export type ExpandedDescriptionEvidence = {
  companyName: string;
  domain: string;
  cardFacts: unknown;
  sources: Array<{ citationId: string; title: string; url: string; text: string }>;
};

export type ExpandedDescriptionResult = {
  expandedDescription: ExpandedDescription | null;
  suppressionReason: "no_draft" | "banned_phrase" | "word_bounds" | "truncated" | "no_valid_citations" | null;
  usage: unknown;
};

const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;

const expandedDescriptionTool = {
  name: EXPANDED_DESCRIPTION_TOOL_NAME,
  description: "Emit the expanded company description grounded only in the supplied evidence, or null when the evidence cannot support one.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      description: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              paragraphs: { type: "array", minItems: 2, maxItems: 4, items: nonEmptyStringSchema },
              citationIds: { type: "array", minItems: 1, items: nonEmptyStringSchema }
            },
            required: ["paragraphs", "citationIds"]
          },
          { type: "null" }
        ]
      }
    },
    required: ["description"]
  }
} satisfies Tool;

const expandedDescriptionResponseSchema = z.object({
  description: z
    .object({
      paragraphs: z.array(z.string().min(1)).min(1).max(4),
      citationIds: z.array(z.string().min(1))
    })
    .nullable()
});

export const expandedDescriptionSystemPrompt = [
  "You write the long-form description a reader opens when they want to actually understand a company. Plain, declarative, concrete, in the register of a good internal memo.",
  "Write exactly three short paragraphs, 120 to 220 words in total.",
  "First paragraph: what the company makes and who uses it, explained by mechanism, so a smart outsider follows every sentence.",
  "Second paragraph: how it makes money, who pays, and price points when disclosed. When the sources do not say, write one plain sentence saying so, such as: How it charges is not publicly disclosed. Honest absence is a successful state; never guess.",
  "Third paragraph: where it sits among the players around it: what it replaces, what it complements, who it competes with.",
  "Concrete nouns and verbs only. Never write phrases like: platform for, AI-powered, solutions, best-in-class, world-class, cutting-edge, or any generic superlative. If a sentence could describe three other companies, rewrite it until it cannot.",
  "Never use em-dashes. Use a comma, colon, or a new sentence.",
  "State only what the supplied evidence backs. This is description, not judgment: no bull case, no bear case, no risk language.",
  "Set citationIds to the citation ids of the evidence you actually used, exactly as supplied. Do not invent ids.",
  "If the evidence cannot support an honest description, return null."
].join(" ");

function parseExpandedDescriptionToolUse(message: { content: ToolUseLike[] }) {
  return parseToolUse(message, EXPANDED_DESCRIPTION_TOOL_NAME, expandedDescriptionResponseSchema, (input) => input);
}

function wordCount(paragraphs: string[]): number {
  return paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
}

function firstBannedPhrase(paragraphs: string[]): string | null {
  const text = paragraphs.join(" ").toLowerCase();
  return BANNED_PHRASES.find((phrase) => text.includes(phrase)) ?? null;
}

// The correction message for a repairable first draft. Banned phrases and word bounds are
// style violations a model fixes reliably when told exactly what broke; the other
// suppression reasons (null draft, truncation, unresolvable citations) are evidence or
// budget problems a re-ask cannot repair.
export function expandedDescriptionCorrection(
  draft: { paragraphs: string[] },
  reason: "banned_phrase" | "word_bounds"
): string {
  if (reason === "banned_phrase") {
    const phrase = firstBannedPhrase(draft.paragraphs);
    return [
      `Your draft used the banned phrase "${phrase ?? "a banned phrase"}".`,
      "Rewrite the sentence around the concrete noun for what the thing actually is, then emit the corrected description.",
      "Everything else about the draft may stay."
    ].join(" ");
  }
  return [
    `Your draft was ${wordCount(draft.paragraphs)} words; the description must total 120 to 220 words across three paragraphs.`,
    "Emit the corrected description."
  ].join(" ");
}

export function validateExpandedDescriptionDraft(
  draft: { paragraphs: string[]; citationIds: string[] } | null,
  validCitationIds: Set<string>
): { expandedDescription: ExpandedDescription | null; suppressionReason: ExpandedDescriptionResult["suppressionReason"] } {
  if (!draft) {
    return { expandedDescription: null, suppressionReason: "no_draft" };
  }

  // Em- and en-dashes normalize to a comma deterministically rather than costing a re-ask:
  // the prompt bans them, but a mechanical fix beats suppressing or re-paying for one glyph.
  const paragraphs = draft.paragraphs
    .map((paragraph) => paragraph.replace(/\s*[—–]\s*/g, ", ").trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    return { expandedDescription: null, suppressionReason: "no_draft" };
  }

  const last = paragraphs[paragraphs.length - 1];
  if (last === undefined || !TERMINAL_PUNCTUATION.test(last)) {
    return { expandedDescription: null, suppressionReason: "truncated" };
  }

  if (firstBannedPhrase(paragraphs) !== null) {
    return { expandedDescription: null, suppressionReason: "banned_phrase" };
  }

  const words = wordCount(paragraphs);
  if (words < MIN_TOTAL_WORDS || words > MAX_TOTAL_WORDS) {
    return { expandedDescription: null, suppressionReason: "word_bounds" };
  }

  const citationIds = Array.from(new Set(draft.citationIds.filter((citationId) => validCitationIds.has(citationId))));
  if (citationIds.length === 0) {
    return { expandedDescription: null, suppressionReason: "no_valid_citations" };
  }

  return { expandedDescription: { paragraphs, citationIds }, suppressionReason: null };
}

export async function synthesizeExpandedDescription(input: {
  client: Anthropic;
  evidence: ExpandedDescriptionEvidence;
  model: string;
  telemetry?: AnthropicTelemetrySink;
}): Promise<ExpandedDescriptionResult> {
  const evidenceMessage = {
    role: "user" as const,
    content: [
      `Company: ${input.evidence.companyName} (${input.evidence.domain})`,
      "Card facts JSON:",
      JSON.stringify(input.evidence.cardFacts, null, 2),
      "Source evidence JSON:",
      JSON.stringify(input.evidence.sources, null, 2)
    ].join("\n\n")
  };

  const draftCall = (label: string, extraMessages: Array<{ role: "assistant" | "user"; content: string }>) =>
    createTracedAnthropicMessage({
      client: input.client,
      label,
      model: input.model,
      stage: "expanded_description",
      telemetry: input.telemetry,
      params: {
        model: input.model,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        system: [{ type: "text", text: expandedDescriptionSystemPrompt, cache_control: anthropicSystemCacheControl() }],
        tool_choice: { type: "tool", name: EXPANDED_DESCRIPTION_TOOL_NAME },
        tools: [expandedDescriptionTool],
        messages: [evidenceMessage, ...extraMessages]
      }
    });

  const validCitationIds = new Set(input.evidence.sources.map((source) => source.citationId));

  const response = await draftCall("synthesize-expanded-description", []);
  let usage = (response as { usage?: unknown }).usage;
  const parsed = parseExpandedDescriptionToolUse(response);
  const validated = validateExpandedDescriptionDraft(parsed.description, validCitationIds);

  // Style violations get exactly one corrective re-ask naming the problem; suppressing the
  // whole paid draft over one brochure word (hospitality copy leans on "solutions"
  // constantly) would silently starve the surface. Evidence-shaped failures are not
  // repairable by re-asking and suppress immediately.
  const repairable = validated.suppressionReason === "banned_phrase" || validated.suppressionReason === "word_bounds";
  if (!repairable || !parsed.description) {
    return { ...validated, usage };
  }

  const correction = expandedDescriptionCorrection(parsed.description, validated.suppressionReason as "banned_phrase" | "word_bounds");
  const retryResponse = await draftCall("synthesize-expanded-description-retry", [
    { role: "assistant", content: JSON.stringify({ description: parsed.description }) },
    { role: "user", content: correction }
  ]);
  usage = (retryResponse as { usage?: unknown }).usage ?? usage;
  const retryParsed = parseExpandedDescriptionToolUse(retryResponse);
  const retryValidated = validateExpandedDescriptionDraft(retryParsed.description, validCitationIds);

  return { ...retryValidated, usage };
}
