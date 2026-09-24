import type { GenerationLlmCallTrace } from "@cold-start/core";
import { isProviderUnavailableLlmError } from "./transient-error";

export type LlmCallStage = GenerationLlmCallTrace["stage"];

export type ResolvedLlmModel = {
  provider: string;
  model: string;
  raw: string;
};

export type LlmRequestOptions = {
  signal: AbortSignal;
  maxRetries: number;
  timeout: number;
  excludedProviders?: readonly string[];
};

// "deepseek/deepseek-v4-flash" -> { provider: "deepseek", model: "deepseek-v4-flash" }.
// Unprefixed strings are Anthropic model ids. Split on the FIRST slash only: Fireworks
// model ids ("accounts/fireworks/models/...") contain slashes of their own.
export function parseModelString(raw: string): ResolvedLlmModel {
  const slash = raw.indexOf("/");
  if (slash <= 0 || slash === raw.length - 1) {
    return { provider: "anthropic", model: raw, raw };
  }

  return {
    provider: raw.slice(0, slash).toLowerCase(),
    model: raw.slice(slash + 1),
    raw,
  };
}

// Stage env resolution: LLM_<STAGE>_MODEL -> ANTHROPIC_<STAGE>_MODEL -> ANTHROPIC_MODEL.
// research_section and person_read fall back to the synthesis model chain because both
// piggyback on the synthesis stage's judgment; unset envs keep that behavior.
const stageEnvChain: Record<LlmCallStage, string[]> = {
  research_plan: ["LLM_RESEARCH_PLAN_MODEL", "ANTHROPIC_RESEARCH_PLAN_MODEL"],
  extract_full: ["LLM_EXTRACT_MODEL", "ANTHROPIC_EXTRACT_MODEL"],
  extract_block: ["LLM_BLOCK_MODEL", "ANTHROPIC_BLOCK_MODEL"],
  synthesis: ["LLM_SYNTHESIS_MODEL", "ANTHROPIC_SYNTHESIS_MODEL"],
  verify: ["LLM_VERIFIER_MODEL", "ANTHROPIC_VERIFIER_MODEL"],
  research_section: ["LLM_RESEARCH_SECTION_MODEL", "LLM_SYNTHESIS_MODEL", "ANTHROPIC_SYNTHESIS_MODEL"],
  person_read: ["LLM_PERSON_READ_MODEL", "LLM_SYNTHESIS_MODEL", "ANTHROPIC_SYNTHESIS_MODEL"],
  expanded_description: ["LLM_EXPANDED_DESCRIPTION_MODEL", "LLM_SYNTHESIS_MODEL", "ANTHROPIC_SYNTHESIS_MODEL"],
  emphasis_read: ["LLM_EMPHASIS_READ_MODEL", "LLM_SYNTHESIS_MODEL", "ANTHROPIC_SYNTHESIS_MODEL"],
  how_it_wins: ["LLM_HOW_IT_WINS_MODEL", "LLM_SYNTHESIS_MODEL", "ANTHROPIC_SYNTHESIS_MODEL"],
};

export type LlmFallbackStage = Extract<
  LlmCallStage,
  "extract_full" | "synthesis" | "verify" | "research_section" | "person_read" | "expanded_description" | "emphasis_read" | "how_it_wins"
>;

const stageFallbackEnv: Record<LlmFallbackStage, string> = {
  extract_full: "LLM_EXTRACT_FALLBACK_MODEL",
  synthesis: "LLM_SYNTHESIS_FALLBACK_MODEL",
  verify: "LLM_VERIFIER_FALLBACK_MODEL",
  research_section: "LLM_RESEARCH_SECTION_FALLBACK_MODEL",
  person_read: "LLM_PERSON_READ_FALLBACK_MODEL",
  expanded_description: "LLM_EXPANDED_DESCRIPTION_FALLBACK_MODEL",
  emphasis_read: "LLM_EMPHASIS_READ_FALLBACK_MODEL",
  how_it_wins: "LLM_HOW_IT_WINS_FALLBACK_MODEL",
};

export function modelForStage(stage: LlmCallStage, fallback = process.env.ANTHROPIC_MODEL): string {
  for (const envName of stageEnvChain[stage]) {
    const value = process.env[envName]?.trim();
    if (value) {
      return value;
    }
  }

  if (!fallback) {
    throw new Error(`No model configured for stage ${stage}: set ${stageEnvChain[stage][0]} or ANTHROPIC_MODEL`);
  }

  return fallback;
}

export type FallbackModelOptions = {
  // Last link of the chain, after the stage env and LLM_FALLBACK_MODEL. Extraction passes
  // ANTHROPIC_MODEL so a flipped primary still has the Anthropic path left to recover on.
  defaultModel?: string | undefined;
};

// Chain: LLM_<STAGE>_FALLBACK_MODEL -> LLM_FALLBACK_MODEL -> options.defaultModel. An explicit
// "off" at whichever link answers first turns recovery off for that stage; a fallback on the
// primary's own provider is no fallback at all.
export function fallbackModelForStage(
  stage: LlmFallbackStage,
  primaryModel: string,
  options?: FallbackModelOptions,
): string | null {
  const fallback = process.env[stageFallbackEnv[stage]]?.trim()
    || process.env.LLM_FALLBACK_MODEL?.trim()
    || options?.defaultModel?.trim();
  if (!fallback || fallback.toLowerCase() === "off") {
    return null;
  }
  if (parseModelString(fallback).provider === parseModelString(primaryModel).provider) {
    return null;
  }
  return fallback;
}

// Two provider names can sit behind one gateway host. Falling back onto the host that just
// failed buys nothing and hides the outage, so it is a configuration error, not a retry.
export function assertDistinctProviderHost(primaryModel: string, fallbackModel: string, cause?: unknown): void {
  const primaryProvider = parseModelString(primaryModel).provider;
  const fallbackProvider = parseModelString(fallbackModel).provider;
  const primaryHost = providerEndpointHost(primaryProvider);
  if (primaryHost && primaryHost === providerEndpointHost(fallbackProvider)) {
    throw new Error(
      `Provider fallback "${fallbackProvider}" resolves to the primary endpoint host ${primaryHost}`,
      { cause },
    );
  }
}

export async function withProviderFallback<T>(
  stage: LlmFallbackStage,
  primaryModel: string,
  run: (model: string) => Promise<T>,
): Promise<T> {
  try {
    return await run(primaryModel);
  } catch (error) {
    const fallback = fallbackModelForStage(stage, primaryModel);
    if (!fallback || !isProviderUnavailableLlmError(error)) {
      throw error;
    }
    assertDistinctProviderHost(primaryModel, fallback, error);
    return run(fallback);
  }
}

export type OpenAiCompatProviderConfig = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  extraBody?: Record<string, unknown>;
};

const defaultOpenAiCompatTimeoutMs = 120_000;

type ProviderDefaults = {
  apiKeyEnv: string;
  baseUrlEnv: string;
  defaultBaseUrl?: string;
  extraBody?: Record<string, unknown>;
};

type ProviderRequestContext = {
  model: string;
  stage: string;
  excludedProviders?: readonly string[];
};

const providerDefaults: Record<string, ProviderDefaults> = {
  deepinfra: {
    apiKeyEnv: "DEEPINFRA_API_KEY",
    baseUrlEnv: "DEEPINFRA_BASE_URL",
    defaultBaseUrl: "https://api.deepinfra.com/v1/openai",
  },
  deepseek: {
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com",
    // DeepSeek v4 models default to thinking-enabled, and thinking mode rejects the
    // temperature parameter every flipped stage sends. Disable unless overridden.
    extraBody: { thinking: { type: "disabled" } },
  },
  fireworks: {
    apiKeyEnv: "FIREWORKS_API_KEY",
    baseUrlEnv: "FIREWORKS_BASE_URL",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
  },
  together: {
    apiKeyEnv: "TOGETHER_API_KEY",
    baseUrlEnv: "TOGETHER_BASE_URL",
    defaultBaseUrl: "https://api.together.xyz/v1",
  },
  openrouter: {
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrlEnv: "OPENROUTER_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    // OpenRouter usage accounting: requesting it returns usage.cost (the actual billed USD) on
    // every response. createTracedOpenAiCompatMessage prefers that reported cost over the
    // pricing.ts estimate table whenever it is present, so this is worth the extra response field
    // on every OpenRouter call, not only Kimi K3.
    extraBody: { usage: { include: true } },
  },
};

export type ModelQuirks = {
  // The model's request schema rejects temperature/top_p outright. K3's documented schema omits
  // them; K2.x precedent returns invalid_request_error on unsupported sampling params. Strip them
  // from the request rather than let the provider 400 on every call.
  omitSamplingParams?: boolean;
  // Raise the max_tokens floor above the shared 8192 default. Reasoning-mandatory models (K3 has
  // no disable parameter, only effort "max") count reasoning tokens against the completion
  // budget, and reasoning can exceed 10k tokens on trivial prompts; 8192 truncates mid-reasoning
  // before any structured output is emitted.
  minMaxTokens?: number;
  // Model rejects a NAMED forced tool_choice while thinking is enabled (Moonshot: "tool_choice
  // 'specified' is incompatible with thinking enabled", observed live 2026-07-18). "required" is
  // accepted and equivalent for this codebase: every stage call supplies exactly one tool.
  forceToolChoiceRequired?: boolean;
  // The Anthropic API accepts `thinking: {type: "disabled"}` for this model, and the model thinks
  // before a tool call under tool_choice auto unless told not to. Callers that want an answer, not
  // a long think, send the switch only where it is accepted: Opus 5.5 rejects it with a 400.
  canDisableThinking?: boolean;
};

const modelQuirksTable: Array<{ modelIncludes: string; quirks: ModelQuirks }> = [
  { modelIncludes: "kimi-k3", quirks: { omitSamplingParams: true, minMaxTokens: 32768, forceToolChoiceRequired: true } },
  // Opus 5 and every later 5.x always reason and reject temperature outright, on the Anthropic
  // path and through any gateway that forwards the parameter. The thinking switch is not here:
  // see acceptsThinkingOff.
  { modelIncludes: "opus-5", quirks: { omitSamplingParams: true } },
];

// Only Opus 5 itself accepts `thinking: {type: "disabled"}` (with a dated snapshot or a provider
// prefix). Opus 5.5 rejects it with a 400, so this is an exact match: a later Opus 5.x id must not
// inherit the switch by containing "opus-5".
const acceptsThinkingOff = /^(?:[a-z0-9._-]+\/)?claude-opus-5(?:-\d{8})?$/;

// Stage-scoped request policy, the counterpart to quirksForModel: these fragments belong to one
// pipeline stage rather than to a model, so they are keyed by stage and never by model id. Full
// extraction is the only stage that pins routing; every other stage keeps provider defaults.
type StageRequestPolicy = (input: {
  provider: string;
  model: string;
  excludedProviders: readonly string[];
}) => Record<string, unknown> | undefined;

const stageRequestPolicies: Record<string, StageRequestPolicy> = {
  extract_full: ({ provider, model, excludedProviders }) => {
    if (provider === "openrouter") {
      const excluded = [...new Set(excludedProviders.map((value) => value.trim().toLowerCase()).filter(Boolean))];
      const deepSeekProviders = ["baseten", "fireworks", "novita"].filter((value) => !excluded.includes(value));
      return {
        ...(/deepseek|gemini-2\.5-flash/i.test(model) ? { reasoning: { enabled: false } } : {}),
        provider: {
          ...(/deepseek/i.test(model) ? { only: deepSeekProviders } : {}),
          ...(excluded.length > 0 ? { ignore: excluded } : {}),
          allow_fallbacks: true,
          require_parameters: true,
          data_collection: "deny",
          sort: "latency",
        },
      };
    }
    if (provider === "deepinfra" && /deepseek/i.test(model)) {
      return { reasoning_effort: "none", service_tier: "priority", fail_fast: true };
    }
    return undefined;
  },
};

export function quirksForModel(model: string): ModelQuirks {
  const normalized = model.toLowerCase();
  const row = modelQuirksTable.find((entry) => normalized.includes(entry.modelIncludes));
  const quirks = row?.quirks ?? {};
  return acceptsThinkingOff.test(normalized) ? { ...quirks, canDisableThinking: true } : quirks;
}

function timeoutMsFromEnv() {
  const raw = process.env.LLM_OPENAI_COMPAT_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultOpenAiCompatTimeoutMs;
}

function providerBaseUrl(provider: string): string | undefined {
  const upper = provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const defaults = providerDefaults[provider];
  const baseUrlEnv = defaults?.baseUrlEnv ?? `LLM_PROVIDER_${upper}_BASE_URL`;
  return (process.env[baseUrlEnv]?.trim() || defaults?.defaultBaseUrl)?.replace(/\/+$/, "");
}

export function providerEndpointHost(provider: string): string | null {
  const baseUrl = provider === "anthropic"
    ? process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com"
    : providerBaseUrl(provider);
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).host.toLowerCase();
  } catch {
    return null;
  }
}

export function providerConfigFor(provider: string, context?: ProviderRequestContext): OpenAiCompatProviderConfig {
  const upper = provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const defaults = providerDefaults[provider];
  const apiKeyEnv = defaults?.apiKeyEnv ?? `LLM_PROVIDER_${upper}_API_KEY`;
  const baseUrlEnv = defaults?.baseUrlEnv ?? `LLM_PROVIDER_${upper}_BASE_URL`;

  const apiKey = process.env[apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new Error(`${apiKeyEnv} is required to call provider "${provider}"`);
  }

  const baseUrl = providerBaseUrl(provider);
  if (!baseUrl) {
    throw new Error(`${baseUrlEnv} is required to call provider "${provider}"`);
  }

  const stagePolicy = context ? stageRequestPolicies[context.stage] : undefined;
  const stageBody = stagePolicy?.({
    provider,
    model: context!.model,
    excludedProviders: context!.excludedProviders ?? [],
  });
  const extraBody = stageBody ? { ...defaults?.extraBody, ...stageBody } : defaults?.extraBody;
  return {
    provider,
    baseUrl,
    apiKey,
    timeoutMs: timeoutMsFromEnv(),
    ...(extraBody ? { extraBody } : {}),
  };
}

function isSchemaParseError(error: unknown): boolean {
  if (error instanceof SyntaxError) {
    return true;
  }

  if (error && typeof error === "object" && (error as { name?: string }).name === "ZodError") {
    return true;
  }

  return error instanceof Error && / tool use returned/.test(error.message);
}

// One re-ask when a non-Anthropic model returns output the stage parser rejects. Anthropic
// behavior stays bit-for-bit identical: forced tool choice there has not needed retries, and
// keeping the path untouched preserves the existing failure semantics.
export async function withSchemaRetry<T>(modelRaw: string, run: (previousError?: unknown) => Promise<T>): Promise<T> {
  if (parseModelString(modelRaw).provider === "anthropic") {
    return run();
  }

  try {
    return await run();
  } catch (error) {
    if (!isSchemaParseError(error)) {
      throw error;
    }

    return run(error);
  }
}
