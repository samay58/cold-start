import type Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { sentenceCount } from "@cold-start/core";
import { z } from "zod";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { investorTasteKernel } from "./investor-taste-kernel";
import { parseToolUse, type ToolUseLike } from "./tool-use";

const PERSON_READ_TOOL_NAME = "emit_person_reads";
const maxReadSentences = 2;

export type PersonReadEvidence = {
  name: string;
  role: string | null;
  channels: { githubUrl?: string | null; xUrl?: string | null; personalUrl?: string | null };
  evidence: Array<{ citationId: string; title: string; url: string; text: string }>;
};

export type PersonReadResult = {
  name: string;
  read: { text: string; citationIds: string[] } | null;
  suppressionReason: "thin_evidence" | "no_nonobvious_claim" | null;
};

const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;

const personReadTool = {
  name: PERSON_READ_TOOL_NAME,
  description: "Emit at most one cited read per person using only the supplied evidence.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reads: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: nonEmptyStringSchema,
            read: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    text: nonEmptyStringSchema,
                    citationIds: { type: "array", minItems: 1, items: nonEmptyStringSchema }
                  },
                  required: ["text", "citationIds"]
                },
                { type: "null" }
              ]
            }
          },
          required: ["name", "read"]
        }
      }
    },
    required: ["reads"]
  }
} satisfies Tool;

const personReadResponseSchema = z.object({
  reads: z.array(
    z.object({
      name: z.string().min(1),
      read: z
        .object({
          text: z.string().min(1),
          citationIds: z.array(z.string().min(1))
        })
        .nullable()
    })
  )
});

export const personReadSystemPrompt = [
  investorTasteKernel,
  "You write one read per person: at most two sentences that are non-obvious, specific, and decision-relevant to an investor.",
  "In scope: domain fit, repeat-founder history with outcomes, trajectory outliers, honest flags such as short tenures or no public footprint.",
  "Banned: restating the role, adjectives without evidence, any filler.",
  "Use citationIds exactly as provided. Do not invent citationIds.",
  "If the evidence supports no such claim, return null for that person."
].join(" ");

function evidencePromptPayload(people: PersonReadEvidence[]) {
  return people.map((person) => ({
    name: person.name,
    role: person.role,
    channels: person.channels,
    evidence: person.evidence.map((item) => ({
      citationId: item.citationId,
      title: item.title,
      url: item.url,
      text: item.text
    }))
  }));
}

function parsePersonReadToolUse(message: { content: ToolUseLike[] }) {
  return parseToolUse(message, PERSON_READ_TOOL_NAME, personReadResponseSchema, (input) => input);
}

function validateReadForPerson(
  name: string,
  read: { text: string; citationIds: string[] } | null,
  person: PersonReadEvidence
): PersonReadResult {
  if (!read) {
    return { name, read: null, suppressionReason: "no_nonobvious_claim" };
  }

  if (sentenceCount(read.text) > maxReadSentences) {
    return { name, read: null, suppressionReason: "no_nonobvious_claim" };
  }

  const evidenceCitationIds = new Set(person.evidence.map((item) => item.citationId));
  const citationIds = read.citationIds.filter((citationId) => evidenceCitationIds.has(citationId));
  if (citationIds.length === 0) {
    return { name, read: null, suppressionReason: "no_nonobvious_claim" };
  }

  return { name, read: { text: read.text, citationIds }, suppressionReason: null };
}

export async function synthesizePersonReads(input: {
  client: Anthropic;
  companyName: string;
  domain: string;
  people: PersonReadEvidence[];
  model: string;
  telemetry?: AnthropicTelemetrySink;
}): Promise<{ reads: PersonReadResult[]; usage: unknown }> {
  const eligible = input.people.filter((person) => person.evidence.length > 0);
  const resultsByName = new Map<string, PersonReadResult>();

  for (const person of input.people) {
    if (person.evidence.length === 0) {
      resultsByName.set(person.name, { name: person.name, read: null, suppressionReason: "thin_evidence" });
    }
  }

  let usage: unknown;

  if (eligible.length > 0) {
    const response = await createTracedAnthropicMessage({
      client: input.client,
      label: "synthesize-person-reads",
      model: input.model,
      stage: "person_read",
      telemetry: input.telemetry,
      params: {
        model: input.model,
        max_tokens: 1500,
        temperature: 0,
        system: [{ type: "text", text: personReadSystemPrompt, cache_control: anthropicSystemCacheControl() }],
        tool_choice: { type: "tool", name: PERSON_READ_TOOL_NAME },
        tools: [personReadTool],
        messages: [
          {
            role: "user",
            content: [
              `Company: ${input.companyName} (${input.domain})`,
              "People evidence JSON:",
              JSON.stringify(evidencePromptPayload(eligible), null, 2)
            ].join("\n\n")
          }
        ]
      }
    });

    usage = (response as { usage?: unknown }).usage;
    const parsed = parsePersonReadToolUse(response);
    const evidenceByName = new Map(eligible.map((person) => [person.name, person]));

    for (const item of parsed.reads) {
      const person = evidenceByName.get(item.name);
      if (!person) {
        continue;
      }
      resultsByName.set(item.name, validateReadForPerson(item.name, item.read, person));
    }

    for (const person of eligible) {
      if (!resultsByName.has(person.name)) {
        resultsByName.set(person.name, { name: person.name, read: null, suppressionReason: "no_nonobvious_claim" });
      }
    }
  }

  const reads = input.people.map(
    (person) => resultsByName.get(person.name) ?? { name: person.name, read: null, suppressionReason: "thin_evidence" as const }
  );

  return { reads, usage };
}
