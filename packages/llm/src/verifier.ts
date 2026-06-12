import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { SourcedText } from "@cold-start/core";
import { z } from "zod";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { withSchemaRetry } from "./llm-provider";

export type VerificationStatus = "supported" | "contradicted" | "unsupported";

export type VerificationResult = {
  claimIndex?: number | undefined;
  text: string;
  citationIds: string[];
  status: VerificationStatus;
};

const verificationResultSchema = z.object({
  claimIndex: z.number().int().nonnegative().optional(),
  text: z.string().min(1),
  citationIds: z.array(z.string().min(1)),
  status: z.enum(["supported", "contradicted", "unsupported"])
});

const verificationResultsSchema = z.array(verificationResultSchema);

function parseVerifierResults(text: string): VerificationResult[] {
  const parsed: unknown = JSON.parse(stripJsonFence(text));
  return verificationResultsSchema.parse(parsed);
}

// Robust to: well-formed fences (```json ... ```), truncated responses with only an opening
// fence and no closing fence, chatty prose before/after the JSON block, and plain unfenced JSON.
// The verifier saw real production failures from truncated responses where the strict
// open-AND-close regex did not match and the raw backticks reached JSON.parse.
//
// Strategy: ignore fences entirely. Locate the first [ or { and slice from there to the matching
// last ] or }. Trailing fence backticks or prose after the JSON body fall outside the slice.
function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const firstBracket = trimmed.search(/[[{]/);
  if (firstBracket === -1) {
    return trimmed;
  }
  const opener = trimmed[firstBracket];
  const closer = opener === "[" ? "]" : "}";
  const lastBracket = trimmed.lastIndexOf(closer);
  if (lastBracket <= firstBracket) {
    return trimmed.slice(firstBracket).trim();
  }
  return trimmed.slice(firstBracket, lastBracket + 1).trim();
}

function verificationKey(input: { text: string; citationIds: string[] }) {
  return JSON.stringify([input.text, [...input.citationIds].sort()]);
}

export function applyVerifierResults(items: SourcedText[], results: VerificationResult[], indexOffset = 0): SourcedText[] {
  const indexedResults = results.filter((result) => result.claimIndex !== undefined);
  if (indexedResults.length > 0) {
    const resultCounts = new Map<number, { count: number; status: VerificationStatus }>();

    for (const result of indexedResults) {
      const index = result.claimIndex === undefined ? undefined : result.claimIndex - indexOffset;
      if (index === undefined || index < 0 || index >= items.length) {
        continue;
      }

      const existing = resultCounts.get(index);
      resultCounts.set(index, {
        count: (existing?.count ?? 0) + 1,
        status: result.status
      });
    }

    return items.filter((_, index) => {
      const result = resultCounts.get(index);
      return result?.count === 1 && result.status === "supported";
    });
  }

  const resultCounts = new Map<string, { count: number; status: VerificationStatus }>();

  for (const result of results) {
    const key = verificationKey(result);
    const existing = resultCounts.get(key);
    resultCounts.set(key, {
      count: (existing?.count ?? 0) + 1,
      status: result.status
    });
  }

  const supported = new Set(
    Array.from(resultCounts.entries())
      .filter(([, result]) => result.count === 1 && result.status === "supported")
      .map(([key]) => key)
  );
  return items.filter((item) => supported.has(verificationKey(item)));
}

export async function verifySynthesis(input: {
  client: Anthropic;
  model: string;
  claims: SourcedText[];
  sources: Array<{ id: string; url: string; title: string; snippet?: string }>;
  telemetry?: AnthropicTelemetrySink;
}): Promise<VerificationResult[]> {
  return withSchemaRetry(input.model, async () => {
    const response: Message = await createTracedAnthropicMessage({
      client: input.client,
      label: "verify-synthesis",
      model: input.model,
      stage: "verify",
      telemetry: input.telemetry,
      params: {
        model: input.model,
        max_tokens: 2000,
        temperature: 0,
        system: [
          {
            type: "text",
            text: "Verify whether each claim is supported by the cited source snippets. Return only a JSON array. Each result must include claimIndex, the exact claim text, exact citationIds array from the claim, and status supported, contradicted, or unsupported.",
            cache_control: anthropicSystemCacheControl()
          }
        ],
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              claims: input.claims.map((claim, claimIndex) => ({ claimIndex, ...claim })),
              sources: input.sources
            })
          }
        ]
      },
    });

    const text = response.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("Verifier returned no text block");
    }

    return parseVerifierResults(text.text);
  });
}
