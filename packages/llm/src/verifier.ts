import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { SourcedText } from "@cold-start/core";
import { z } from "zod";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { withProviderFallback, withSchemaRetry } from "./llm-provider";

export type VerificationStatus = "supported" | "contradicted" | "unsupported";

export type VerificationResult = {
  claimIndex?: number | undefined;
  text: string;
  citationIds: string[];
  status: VerificationStatus;
};

export type VerificationFact = {
  path: string;
  citationIds: string[];
  value: unknown;
  status?: string;
  confidence?: string;
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
  evidenceFacts?: VerificationFact[];
  telemetry?: AnthropicTelemetrySink;
}): Promise<VerificationResult[]> {
  return withProviderFallback("verify", input.model, (model) => withSchemaRetry(model, async () => {
    const response: Message = await createTracedAnthropicMessage({
      client: input.client,
      label: "verify-synthesis",
      model,
      stage: "verify",
      telemetry: input.telemetry,
      params: {
        model,
        // Plain-JSON response must never truncate mid-claim; raised from 2000 after observed truncations under verbose routing, a cap, not a spend.
        max_tokens: 8192,
        temperature: 0,
        system: [
          {
            type: "text",
            text: [
              "Verify each claim against evidence carrying the claim's cited IDs.",
              "Both source snippets and structured card facts are valid evidence. Structured card facts were extracted and validated upstream; do not require their wording to appear verbatim in a short source snippet.",
              "Mark a disciplined analytical inference as supported when every material factual premise is grounded in the cited evidence, the conclusion follows reasonably, and the wording does not overstate certainty.",
              "Mark a claim unsupported when it introduces an ungrounded material fact, relies on a missing premise, or overstates the evidence. Mark contradicted only when cited evidence directly conflicts with it.",
              "A compound claim is supported only when every material premise is grounded.",
              "A claim with an empty citationIds array whose text begins with Nothing filed shows describes an absence in this record: mark it contradicted only when a supplied source or fact contains the thing it says is missing; otherwise mark it supported.",
              "Return only a JSON array. Each result must include claimIndex, the exact claim text, exact citationIds array from the claim, and status supported, contradicted, or unsupported."
            ].join(" "),
            cache_control: anthropicSystemCacheControl()
          }
        ],
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              claims: input.claims.map((claim, claimIndex) => ({ claimIndex, ...claim })),
              sources: input.sources,
              evidenceFacts: input.evidenceFacts ?? []
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
  }));
}
