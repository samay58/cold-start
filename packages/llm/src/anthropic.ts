import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import type { GenerationLlmCallTrace } from "@cold-start/core";
import { buildLlmCallTrace, type AnthropicTelemetrySink, type AnthropicUsage } from "./call-trace";
import { parseModelString } from "./llm-provider";
import { createTracedOpenAiCompatMessage } from "./openai-compat";

export type AnthropicCallStage = GenerationLlmCallTrace["stage"];

export type { AnthropicTelemetrySink } from "./call-trace";


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

// Shared cache_control for stable system prompts. Defaults to "1h" (verified to land via the
// `extended-cache-ttl-2025-04-11` beta header; see scripts/verify-cache-ttl.ts). The 1h TTL
// requires that beta header; `createTracedAnthropicMessage` attaches it automatically when 1h is
// the resolved TTL. Override via ANTHROPIC_CACHE_TTL=5m to roll back to the shorter TTL without a
// redeploy if cost telemetry ever shows the 1h create cost is not amortizing through reads.
type AnthropicCacheTtl = "5m" | "1h";
const EXTENDED_CACHE_TTL_BETA = "extended-cache-ttl-2025-04-11";

function resolveCacheTtl(): AnthropicCacheTtl {
  const configured = process.env.ANTHROPIC_CACHE_TTL?.trim();
  return configured === "5m" ? "5m" : "1h";
}

export function anthropicSystemCacheControl(): { type: "ephemeral"; ttl: AnthropicCacheTtl } {
  return { type: "ephemeral", ttl: resolveCacheTtl() };
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
  return buildLlmCallTrace({
    ...input,
    provider: "anthropic",
    estimatedCostUsd: estimateAnthropicCostUsd(input.model, input.usage),
  });
}

// Provider-aware chokepoint. Unprefixed model strings run the Anthropic path exactly as before;
// "provider/model" strings (e.g. "deepseek/deepseek-v4-flash") route to the OpenAI-compat
// adapter, which translates the same Anthropic-native params. The `client` argument is unused on
// non-Anthropic routes; keeping the signature avoids churn at every call site.
export async function createTracedAnthropicMessage(input: {
  client: Anthropic;
  label: string;
  model: string;
  params: Parameters<Anthropic["messages"]["create"]>[0];
  stage: AnthropicCallStage;
  telemetry?: AnthropicTelemetrySink | undefined;
}): Promise<Message> {
  const resolved = parseModelString(input.model);
  if (resolved.provider !== "anthropic") {
    return createTracedOpenAiCompatMessage({
      label: input.label,
      params: { ...input.params, model: resolved.model },
      resolved,
      stage: input.stage,
      telemetry: input.telemetry,
    });
  }

  const startedAt = Date.now();
  // Attach the extended-cache-ttl beta header only when the resolved TTL is 1h. The API silently
  // downgrades to 5m without it; the beta name is in the SDK's known list (AnthropicBeta).
  const requestOptions =
    resolveCacheTtl() === "1h"
      ? { headers: { "anthropic-beta": EXTENDED_CACHE_TTL_BETA } }
      : undefined;
  try {
    const response = (await input.client.messages.create({ ...input.params, model: resolved.model }, requestOptions)) as Message & {
      usage?: AnthropicUsage;
    };
    input.telemetry?.(
      callTrace({
        durationMs: Date.now() - startedAt,
        label: input.label,
        model: resolved.model,
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
        model: resolved.model,
        stage: input.stage,
        status: "failed",
      }),
    );
    throw error;
  }
}
