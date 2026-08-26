// Pricing for non-Anthropic providers, USD per million tokens. The Anthropic table stays in
// anthropic.ts (estimateAnthropicCostUsd) so that path's telemetry is byte-identical. Add a row
// here whenever a new model joins the eval matrix; unknown models return undefined and the
// trace simply omits estimatedCostUsd, matching the Anthropic behavior for unknown models.
//
// DeepSeek rates and the peak window verified 2026-08-26 against
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

function deepSeekPricing(model: string, at: Date): TokenPricing | null {
  // Both published boundaries land on the hour, so whole UTC hours are exact. The weekend is
  // off-peak at every hour, which is the half of the rule this used to miss.
  const weekday = at.getUTCDay() >= 1 && at.getUTCDay() <= 5;
  const hour = at.getUTCHours();
  const peak = weekday && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
  const normalized = model.toLowerCase();
  if (normalized.includes("deepseek-v4-flash") || normalized.includes("deepseek-chat")) {
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
