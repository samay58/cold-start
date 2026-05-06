import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { SourcedText } from "@cold-start/core";
import { z } from "zod";

export type VerificationStatus = "supported" | "contradicted" | "unsupported";

export type VerificationResult = {
  text: string;
  citationIds: string[];
  status: VerificationStatus;
};

const verificationResultSchema = z.object({
  text: z.string().min(1),
  citationIds: z.array(z.string().min(1)),
  status: z.enum(["supported", "contradicted", "unsupported"])
});

const verificationResultsSchema = z.array(verificationResultSchema);

function parseVerifierResults(text: string): VerificationResult[] {
  const parsed: unknown = JSON.parse(text);
  return verificationResultsSchema.parse(parsed);
}

function verificationKey(input: { text: string; citationIds: string[] }) {
  return JSON.stringify([input.text, [...input.citationIds].sort()]);
}

export function applyVerifierResults(items: SourcedText[], results: VerificationResult[]): SourcedText[] {
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
}): Promise<VerificationResult[]> {
  const response: Message = await input.client.messages.create({
    model: input.model,
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text: "Verify whether each claim is supported by the cited source snippets. Return only a JSON array. Each result must include the exact claim text, exact citationIds array from the claim, and status supported, contradicted, or unsupported.",
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [
      {
        role: "user",
        content: JSON.stringify({ claims: input.claims, sources: input.sources })
      }
    ]
  });

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Verifier returned no text block");
  }

  return parseVerifierResults(text.text);
}
