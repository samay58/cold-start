import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { SourcedText } from "@cold-start/core";
import { z } from "zod";

export type VerificationStatus = "supported" | "contradicted" | "unsupported";

export type VerificationResult = {
  text: string;
  status: VerificationStatus;
};

const verificationResultSchema = z.object({
  text: z.string().min(1),
  status: z.enum(["supported", "contradicted", "unsupported"])
});

const verificationResultsSchema = z.array(verificationResultSchema);

function parseVerifierResults(text: string): VerificationResult[] {
  const parsed: unknown = JSON.parse(text);
  return verificationResultsSchema.parse(parsed);
}

export function applyVerifierResults(items: SourcedText[], results: VerificationResult[]): SourcedText[] {
  const supported = new Set(results.filter((result) => result.status === "supported").map((result) => result.text));
  return items.filter((item) => supported.has(item.text));
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
        text: "Verify whether each claim is supported by the cited source snippets. Return only JSON.",
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
