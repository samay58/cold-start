// Pricing for every provider, USD per million tokens. Add a row here whenever a new model joins
// the eval matrix or a stage config; unknown models return null, and the trace simply omits
// estimatedCostUsd. Anthropic's cache multipliers are applied by estimateAnthropicCostUsd.
//
// DeepSeek rates and the peak window verified 2026-09-14 against
// https://api-docs.deepseek.com/quick_start/pricing, which reads: "Off-peak rates are half of
// the peak rates. Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday (all
// other hours are off-peak)."

type AnthropicUsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
};

export type TokenPricing = {
  input: number;
  output: number;
  cacheRead?: number;
};

const pricingTable: Array<{ provider: string; modelIncludes: string; pricing: TokenPricing }> = [
  // Kimi K3 (Moonshot AI, released 2026-07-16), OpenRouter only. Rates verified 2026-07-16
  // against platform.kimi.ai/docs/pricing/chat-k3 and openrouter.ai/moonshotai/kimi-k3. This row
  // is a fallback only: createTracedOpenAiCompatMessage prefers the response's own usage.cost
  // (OpenRouter usage accounting) whenever present, so this row prices a call only when that
  // field is absent.
  { provider: "openrouter", modelIncludes: "kimi-k3", pricing: { input: 3, cacheRead: 0.3, output: 15 } },
];

// Anthropic rows match an exact model id or that id plus a dated snapshot suffix
// (claude-opus-5-20260901), never a substring: a substring match once priced Opus 5.5 as Opus 5,
// and silently priced any unknown sonnet or opus name. Opus 5.5 list price checked September 22,
// 2026.
const anthropicPricingTable: Array<{ id: string; pricing: TokenPricing }> = [
  { id: "claude-opus-5-5", pricing: { input: 4, output: 20 } },
  { id: "claude-opus-5", pricing: { input: 5, output: 25 } },
  { id: "claude-opus-4-7", pricing: { input: 5, output: 25 } },
  { id: "claude-opus-4-6", pricing: { input: 5, output: 25 } },
  { id: "claude-opus-4-5", pricing: { input: 5, output: 25 } },
  { id: "claude-opus-4-1", pricing: { input: 15, output: 75 } },
  { id: "claude-opus-4", pricing: { input: 15, output: 75 } },
  { id: "claude-3-opus", pricing: { input: 15, output: 75 } },
  { id: "claude-sonnet-5", pricing: { input: 3, output: 15 } },
  { id: "claude-sonnet-4-6", pricing: { input: 3, output: 15 } },
  { id: "claude-sonnet-4-5", pricing: { input: 3, output: 15 } },
  { id: "claude-sonnet-4", pricing: { input: 3, output: 15 } },
  { id: "claude-haiku-4-5", pricing: { input: 1, output: 5 } }
].sort((a, b) => b.id.length - a.id.length);

// Cache-token rates as multiples of the input rate, per Anthropic's published prompt caching
// pricing: a 5-minute write, a 1-hour write, and a read.
export const ANTHROPIC_CACHE_RATE_MULTIPLIERS = { write5m: 1.25, write1h: 2, read: 0.1 } as const;

function anthropicPricing(model: string): TokenPricing | null {
  const normalized = model.toLowerCase();
  const row = anthropicPricingTable.find(
    (entry) => normalized === entry.id || new RegExp(`^${entry.id}-\\d{8}$`).test(normalized)
  );
  return row?.pricing ?? null;
}

function deepSeekPricing(model: string, at: Date): TokenPricing | null {
  // Both published boundaries land on the hour, so whole UTC hours are exact. The weekend is
  // off-peak at every hour, which is the half of the rule this used to miss.
  const weekday = at.getUTCDay() >= 1 && at.getUTCDay() <= 5;
  const hour = at.getUTCHours();
  const peak = weekday && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
  const normalized = model.toLowerCase();
  if (normalized.includes("deepseek-flash") || normalized.includes("deepseek-v4.1-flash")
    || normalized.includes("deepseek-v4-flash") || normalized.includes("deepseek-chat")) {
    // V4 aliases switched to V4.1 Flash on September 10. Keep historical estimates intact.
    if (at.getTime() >= Date.parse("2026-09-10T04:00:00Z")) {
      return peak
        ? { input: 0.3, cacheRead: 0.006, output: 1.2 }
        : { input: 0.15, cacheRead: 0.003, output: 0.6 };
    }
    return peak
      ? { input: 0.44, cacheRead: 0.014, output: 1.32 }
      : { input: 0.22, cacheRead: 0.007, output: 0.66 };
  }
  if (normalized.includes("deepseek-v4-pro") || normalized.includes("deepseek-reasoner")) {
    return peak
      ? { input: 1.32, cacheRead: 0.044, output: 3.96 }
      : { input: 0.66, cacheRead: 0.022, output: 1.98 };
  }
  return null;
}

export function pricingFor(provider: string, model: string, at = new Date()): TokenPricing | null {
  if (provider === "anthropic") return anthropicPricing(model);
  if (provider === "deepseek") return deepSeekPricing(model, at);
  const normalizedModel = model.toLowerCase();
  const row = pricingTable.find(
    (entry) => entry.provider === provider && normalizedModel.includes(entry.modelIncludes)
  );
  return row?.pricing ?? null;
}

export function estimateLlmCostUsd(
  provider: string,
  model: string,
  usage?: AnthropicUsageLike,
  at = new Date()
): number | undefined {
  const pricing = pricingFor(provider, model, at);
  if (!pricing || !usage) {
    return undefined;
  }

  const perToken = (tokens: number | undefined, perMillionUsd: number) => ((tokens ?? 0) / 1_000_000) * perMillionUsd;
  const total =
    perToken(usage.input_tokens, pricing.input) +
    perToken(usage.cache_read_input_tokens, pricing.cacheRead ?? pricing.input) +
    perToken(usage.output_tokens, pricing.output);

  return Number(total.toFixed(6));
}
