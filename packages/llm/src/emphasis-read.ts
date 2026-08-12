import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";
import {
  emphasisReadFiledSchema,
  type ColdStartCard,
  type EmphasisRead,
  type EmphasisSourceDigest
} from "@cold-start/core";
import { z } from "zod";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { investorTasteKernel } from "./investor-taste-kernel";
import { withProviderFallback, withSchemaRetry } from "./llm-provider";
import { sameCitationMultiset, sourcedTextToolSchema, visibleCitationMarkers } from "./tool-schema-fragments";
import { parseToolUse, type ToolUseLike } from "./tool-use";

const EMPHASIS_READ_TOOL_NAME = "emit_emphasis_read";

const emphasisReadTool = {
  name: EMPHASIS_READ_TOOL_NAME,
  description:
    "Emit the emphasis read: what this company is loud about, what the filed record never shows, and the smallest inference that asymmetry supports. Emit nothing_notable when no specific cited asymmetry exists.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["read", "nothing_notable"] },
      loud: { anyOf: [sourcedTextToolSchema, { type: "null" }] },
      quiet: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
      read: { anyOf: [sourcedTextToolSchema, { type: "null" }] },
      wouldChangeIf: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] }
    },
    required: ["status", "loud", "quiet", "read", "wouldChangeIf"]
  }
} satisfies Tool;

// The spec's prompt spine, verbatim. No em dashes; the last line enforces that on the model's
// own output too.
export const emphasisReadSystemPrompt = [
  investorTasteKernel,
  "You read what this company and its founders choose to be loud about, and what the filed record never shows.",
  "The proof ladder, strongest first: paying customers, then demand, then a working product, then a real problem, then team, then idea. Name where their loudest proof sits on it.",
  "Never use stage benchmarks or what companies at this stage usually disclose. The inference comes only from the observed communication: what they publish, what it leads with, who the writing is aimed at.",
  "Loud states what their own publishing leads with, cited to the digests that show it.",
  "Quiet must begin with the words Nothing filed shows, and may only ever describe this filed record. Never state that the company lacks something; absence on the web is not knowable.",
  "Read is the smallest specific inference the observed pattern supports, cited to the facts it uses. Stage is a plain fact the inference may use, never a yardstick.",
  "wouldChangeIf names the concrete thing that, if it appeared in the filed record, would break the read.",
  "The tone is loud and quiet, never accusation.",
  "The bar is a specific cited asymmetry. If the line could be pasted onto any startup, emit nothing_notable instead. Emitting nothing is never penalized.",
  "One fact, one job. If the gap is the decision hinge, the open questions already carry it; do not duplicate the bear case.",
  "Write in plain English for a sharp investor reading a narrow side panel.",
  "Never use an em dash anywhere. Use a period or a semicolon instead."
].join(" ");

const quietPrefixPattern = /^Nothing filed shows/;

// loud/read visible-marker multisets must equal their citationIds, same discipline as
// synthesis claims (packages/llm/src/synthesis.ts); quiet must open with the fixed absence
// phrase so it can never be read as a claim about what the company lacks.
const citedEmphasisReadFiledSchema = emphasisReadFiledSchema.superRefine((value, ctx) => {
  if (!quietPrefixPattern.test(value.quiet)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quiet"],
      message: 'quiet must begin with "Nothing filed shows"'
    });
  }

  for (const field of ["loud", "read"] as const) {
    const claim = value[field];
    const visibleMarkers = visibleCitationMarkers(claim.text);
    if (!sameCitationMultiset(visibleMarkers, claim.citationIds)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field, "text"],
        message: `${field} visible citation markers must exactly match citationIds`
      });
    }
  }
});

// A nothing_notable response still carries the tool's other required fields as null; the
// default "strip unknown keys" object schema below drops them, collapsing the parsed result to
// { status: "nothing_notable" } exactly as the spec requires. thin_file never reaches this
// stage (decided in code before any model call), so it is deliberately not a member here.
const emphasisReadResponseSchema = z.union([
  z.object({ status: z.literal("nothing_notable") }),
  citedEmphasisReadFiledSchema
]);

export function parseEmphasisReadToolUse(message: { content: ToolUseLike[] }): EmphasisRead {
  return parseToolUse(message, EMPHASIS_READ_TOOL_NAME, emphasisReadResponseSchema, (input) => input);
}

// Mirrors assertSynthesisCitationsExistOnCard (synthesis.ts): a claim citing an ID that never
// made it onto the card's citations array is a contradiction, not a style issue, so it throws
// rather than silently dropping. Exported so tests can exercise the check directly against a
// card fixture without a live model call.
export function assertEmphasisCitationsExistOnCard(read: EmphasisRead, card: ColdStartCard): void {
  if (read.status !== "read") {
    return;
  }

  const validCitationIds = new Set(card.citations.map((citation) => citation.id));
  for (const citationId of [...read.loud.citationIds, ...read.read.citationIds]) {
    if (!validCitationIds.has(citationId)) {
      throw new Error(`Emphasis read citation ID not found on card: ${citationId}`);
    }
  }
}

export async function synthesizeEmphasisRead(input: {
  client: Anthropic;
  model: string;
  card: ColdStartCard;
  digests: EmphasisSourceDigest[];
  telemetry?: AnthropicTelemetrySink;
}): Promise<EmphasisRead> {
  return withProviderFallback("emphasis_read", input.model, (model) => withSchemaRetry(model, async () => {
    const response: Message = await createTracedAnthropicMessage({
      client: input.client,
      label: "emphasis-read",
      model,
      stage: "emphasis_read",
      telemetry: input.telemetry,
      params: {
        model,
        max_tokens: 1200,
        temperature: 0.2,
        system: [
          {
            type: "text",
            text: emphasisReadSystemPrompt,
            cache_control: anthropicSystemCacheControl()
          }
        ],
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              company: {
                name: input.card.identity.name.value ?? input.card.domain,
                domain: input.card.domain
              },
              digests: input.digests
            })
          }
        ],
        tools: [emphasisReadTool],
        tool_choice: { type: "tool", name: EMPHASIS_READ_TOOL_NAME }
      }
    });

    const emphasisRead = parseEmphasisReadToolUse(response);
    assertEmphasisCitationsExistOnCard(emphasisRead, input.card);
    return emphasisRead;
  }));
}
