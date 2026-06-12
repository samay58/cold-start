import type { GenerationLlmCallTrace } from "@cold-start/core";

// Usage in the Anthropic SDK's shape. The OpenAI-compat adapter maps its usage fields into
// this shape so trace building and cost math stay uniform across providers.
export type AnthropicUsage = {
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

export function buildLlmCallTrace(input: {
  durationMs: number;
  error?: unknown;
  estimatedCostUsd?: number | undefined;
  label: string;
  model: string;
  provider: string;
  stage: GenerationLlmCallTrace["stage"];
  status: GenerationLlmCallTrace["status"];
  usage?: AnthropicUsage;
}): GenerationLlmCallTrace {
  return {
    stage: input.stage,
    label: input.label,
    model: input.model,
    provider: input.provider,
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
    ...(input.estimatedCostUsd !== undefined ? { estimatedCostUsd: input.estimatedCostUsd } : {}),
    ...(input.error ? { error: input.error instanceof Error ? input.error.message.slice(0, 300) : String(input.error).slice(0, 300) } : {}),
  };
}
