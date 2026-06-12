// Pricing for non-Anthropic providers, USD per million tokens. The Anthropic table stays in
// anthropic.ts (estimateAnthropicCostUsd) so that path's telemetry is byte-identical. Add a row
// here whenever a new model joins the eval matrix; unknown models return undefined and the
// trace simply omits estimatedCostUsd, matching the Anthropic behavior for unknown models.
//
// DeepSeek rates verified 2026-06-11 against api-docs.deepseek.com/quick_start/pricing.

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
  // deepseek-v4-flash is the current name; deepseek-chat is the deprecated alias (same model,
  // same price) until 2026-07-24. The flash row must come before the pro row only if substrings
  // could collide; they cannot, so order is alphabetical.
  { provider: "deepseek", modelIncludes: "deepseek-v4-flash", pricing: { input: 0.14, cacheRead: 0.0028, output: 0.28 } },
  { provider: "deepseek", modelIncludes: "deepseek-chat", pricing: { input: 0.14, cacheRead: 0.0028, output: 0.28 } },
  { provider: "deepseek", modelIncludes: "deepseek-v4-pro", pricing: { input: 0.435, cacheRead: 0.003625, output: 0.87 } },
  { provider: "deepseek", modelIncludes: "deepseek-reasoner", pricing: { input: 0.435, cacheRead: 0.003625, output: 0.87 } },
];

export function pricingFor(provider: string, model: string): TokenPricing | null {
  const normalizedModel = model.toLowerCase();
  const row = pricingTable.find(
    (entry) => entry.provider === provider && normalizedModel.includes(entry.modelIncludes)
  );
  return row?.pricing ?? null;
}

export function estimateLlmCostUsd(provider: string, model: string, usage?: AnthropicUsageLike): number | undefined {
  const pricing = pricingFor(provider, model);
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
