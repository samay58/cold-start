import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { GenerationLlmCallTrace } from "@cold-start/core";

export type AnthropicCallStage = GenerationLlmCallTrace["stage"];

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
};

export type AnthropicTelemetrySink = (call: GenerationLlmCallTrace) => void;

const modelEnvByStage: Record<AnthropicCallStage, string> = {
  research_plan: "ANTHROPIC_RESEARCH_PLAN_MODEL",
  extract_full: "ANTHROPIC_EXTRACT_MODEL",
  extract_block: "ANTHROPIC_BLOCK_MODEL",
  synthesis: "ANTHROPIC_SYNTHESIS_MODEL",
  verify: "ANTHROPIC_VERIFIER_MODEL",
};

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

export function anthropicModelForStage(stage: AnthropicCallStage, fallback = process.env.ANTHROPIC_MODEL) {
  return anthropicModel(process.env[modelEnvByStage[stage]] ?? fallback);
}

function perMillionTokenPricing(model: string) {
  const normalized = model.toLowerCase();
  if (normalized.includes("haiku")) {
    return { input: 1, output: 5 };
  }
  if (normalized.includes("sonnet")) {
    return { input: 3, output: 15 };
  }
  if (normalized.includes("opus-4-7") || normalized.includes("opus-4-6") || normalized.includes("opus-4-5")) {
    return { input: 5, output: 25 };
  }
  if (normalized.includes("opus")) {
    return { input: 15, output: 75 };
  }
  return null;
}

function tokenCost(tokens: number | undefined, perMillionUsd: number) {
  return ((tokens ?? 0) / 1_000_000) * perMillionUsd;
}

export function estimateAnthropicCostUsd(model: string, usage?: AnthropicUsage) {
  const pricing = perMillionTokenPricing(model);
  if (!pricing || !usage) {
    return undefined;
  }

  const cacheCreation = usage.cache_creation;
  const cacheCreationCost = cacheCreation
    ? tokenCost(cacheCreation.ephemeral_5m_input_tokens, pricing.input * 1.25) +
      tokenCost(cacheCreation.ephemeral_1h_input_tokens, pricing.input * 2)
    : tokenCost(usage.cache_creation_input_tokens, pricing.input * 1.25);
  const total =
    tokenCost(usage.input_tokens, pricing.input) +
    tokenCost(usage.cache_read_input_tokens, pricing.input * 0.1) +
    cacheCreationCost +
    tokenCost(usage.output_tokens, pricing.output);

  return Number(total.toFixed(6));
}

function callTrace(input: {
  durationMs: number;
  error?: unknown;
  label: string;
  model: string;
  stage: AnthropicCallStage;
  status: GenerationLlmCallTrace["status"];
  usage?: AnthropicUsage;
}): GenerationLlmCallTrace {
  const estimatedCostUsd = estimateAnthropicCostUsd(input.model, input.usage);
  return {
    stage: input.stage,
    label: input.label,
    model: input.model,
    status: input.status,
    durationMs: input.durationMs,
    ...(input.usage?.input_tokens !== undefined ? { inputTokens: input.usage.input_tokens } : {}),
    ...(input.usage?.output_tokens !== undefined ? { outputTokens: input.usage.output_tokens } : {}),
    ...(input.usage?.cache_creation_input_tokens !== undefined
      ? { cacheCreationInputTokens: input.usage.cache_creation_input_tokens }
      : {}),
    ...(input.usage?.cache_read_input_tokens !== undefined ? { cacheReadInputTokens: input.usage.cache_read_input_tokens } : {}),
    ...(input.usage?.cache_creation
      ? {
          cacheCreation: {
            ...(input.usage.cache_creation.ephemeral_5m_input_tokens !== undefined
              ? { ephemeral5mInputTokens: input.usage.cache_creation.ephemeral_5m_input_tokens }
              : {}),
            ...(input.usage.cache_creation.ephemeral_1h_input_tokens !== undefined
              ? { ephemeral1hInputTokens: input.usage.cache_creation.ephemeral_1h_input_tokens }
              : {}),
          },
        }
      : {}),
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
    ...(input.error ? { error: input.error instanceof Error ? input.error.message.slice(0, 300) : String(input.error).slice(0, 300) } : {}),
  };
}

export async function createTracedAnthropicMessage(input: {
  client: Anthropic;
  label: string;
  model: string;
  params: Parameters<Anthropic["messages"]["create"]>[0];
  stage: AnthropicCallStage;
  telemetry?: AnthropicTelemetrySink | undefined;
}): Promise<Message> {
  const startedAt = Date.now();
  try {
    const response = (await input.client.messages.create(input.params)) as Message & { usage?: AnthropicUsage };
    input.telemetry?.(
      callTrace({
        durationMs: Date.now() - startedAt,
        label: input.label,
        model: input.model,
        stage: input.stage,
        status: "ok",
        usage: response.usage,
      }),
    );
    return response;
  } catch (error) {
    input.telemetry?.(
      callTrace({
        durationMs: Date.now() - startedAt,
        error,
        label: input.label,
        model: input.model,
        stage: input.stage,
        status: "failed",
      }),
    );
    throw error;
  }
}
