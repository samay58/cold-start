import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";

const EXTRACTION_TOOL_NAME = "emit_company_claims";

export type ExtractionEvidence = {
  domain: string;
  sources: Array<{ url: string; title: string; rawText: string; sourceType: string }>;
};

export const extractionTool = {
  name: EXTRACTION_TOOL_NAME,
  description: "Emit only company claims supported by the provided public sources.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      identity: { type: "object" },
      funding: { type: "object" },
      team: { type: "object" },
      signals: { type: "array", items: { type: "object" } },
      comparables: { type: "array", items: { type: "object" } },
      citations: { type: "array", items: { type: "object" } }
    },
    required: ["identity", "funding", "team", "signals", "comparables", "citations"]
  }
} satisfies Tool;

type ToolUseLike = {
  type: string;
  name?: string;
  input?: unknown;
  id?: string;
  text?: string;
};

export function parseExtractionToolUse(message: { content: ToolUseLike[] }) {
  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === EXTRACTION_TOOL_NAME);
  if (!toolUse) {
    throw new Error("No emit_company_claims tool use returned");
  }

  return toolUse.input;
}

export async function extractCompanyClaims(input: {
  client: Anthropic;
  model: string;
  evidence: ExtractionEvidence;
}) {
  const response: Message = await input.client.messages.create({
    model: input.model,
    max_tokens: 4000,
    system: [
      {
        type: "text",
        text: "You extract investor-grade public company facts. Drop unsupported claims. Every material fact must map to a citation ID. Use null for missing facts.",
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify(input.evidence)
          }
        ]
      }
    ],
    tools: [extractionTool],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME }
  });

  return parseExtractionToolUse(response);
}
