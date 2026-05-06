import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";
import type { ColdStartCard } from "@cold-start/core";

const SYNTHESIS_TOOL_NAME = "emit_investor_synthesis";

export const synthesisTool = {
  name: SYNTHESIS_TOOL_NAME,
  description:
    "Emit gated investor synthesis where every bull and bear line ends with citation markers already present on the card.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      whyItMatters: { type: "object" },
      bullCase: { type: "array", minItems: 3, maxItems: 3, items: { type: "object" } },
      bearCase: { type: "array", minItems: 3, maxItems: 3, items: { type: "object" } },
      openQuestions: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } }
    },
    required: ["whyItMatters", "bullCase", "bearCase", "openQuestions"]
  }
} satisfies Tool;

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
        text: "You write gated investor synthesis from validated claim-store input only. Every bull and bear bullet must end with citation markers. Do not use reportedly, rumored to, appears to be, is said to, or industry sources suggest.",
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [{ role: "user", content: JSON.stringify(input.card) }],
    tools: [synthesisTool],
    tool_choice: { type: "tool", name: SYNTHESIS_TOOL_NAME }
  });

  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === SYNTHESIS_TOOL_NAME);
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("No emit_investor_synthesis tool use returned");
  }

  return toolUse.input;
}
