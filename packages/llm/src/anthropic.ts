import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient(apiKey = process.env.ANTHROPIC_API_KEY) {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }

  return new Anthropic({ apiKey });
}

export function anthropicModel(model = process.env.ANTHROPIC_MODEL) {
  if (!model) {
    throw new Error("ANTHROPIC_MODEL is required");
  }

  return model;
}
