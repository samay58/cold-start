import type { GenerationLlmCallTrace } from "@cold-start/core";

export type LlmCallStage = GenerationLlmCallTrace["stage"];

export type ResolvedLlmModel = {
  provider: string;
  model: string;
  raw: string;
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

const providerDefaults: Record<string, ProviderDefaults> = {
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
};

const modelQuirksTable: Array<{ modelIncludes: string; quirks: ModelQuirks }> = [
  { modelIncludes: "kimi-k3", quirks: { omitSamplingParams: true, minMaxTokens: 32768, forceToolChoiceRequired: true } },
];

export function quirksForModel(model: string): ModelQuirks {
  const normalized = model.toLowerCase();
  const row = modelQuirksTable.find((entry) => normalized.includes(entry.modelIncludes));
  return row?.quirks ?? {};
}

function timeoutMsFromEnv() {
  const raw = process.env.LLM_OPENAI_COMPAT_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultOpenAiCompatTimeoutMs;
}

export function providerConfigFor(provider: string): OpenAiCompatProviderConfig {
  const upper = provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const defaults = providerDefaults[provider];
  const apiKeyEnv = defaults?.apiKeyEnv ?? `LLM_PROVIDER_${upper}_API_KEY`;
  const baseUrlEnv = defaults?.baseUrlEnv ?? `LLM_PROVIDER_${upper}_BASE_URL`;

  const apiKey = process.env[apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new Error(`${apiKeyEnv} is required to call provider "${provider}"`);
  }

  const baseUrl = (process.env[baseUrlEnv]?.trim() || defaults?.defaultBaseUrl)?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error(`${baseUrlEnv} is required to call provider "${provider}"`);
  }

  return {
    provider,
    baseUrl,
    apiKey,
    timeoutMs: timeoutMsFromEnv(),
    ...(defaults?.extraBody ? { extraBody: defaults.extraBody } : {}),
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
export async function withSchemaRetry<T>(modelRaw: string, run: () => Promise<T>): Promise<T> {
  if (parseModelString(modelRaw).provider === "anthropic") {
    return run();
  }

  try {
    return await run();
  } catch (error) {
    if (!isSchemaParseError(error)) {
      throw error;
    }

    return run();
  }
}
