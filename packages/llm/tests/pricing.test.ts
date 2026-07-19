import { describe, expect, it } from "vitest";
import { estimateLlmCostUsd, pricingFor } from "../src/index";

describe("pricingFor", () => {
  it("matches deepseek current and deprecated model names to the same rates", () => {
    expect(pricingFor("deepseek", "deepseek-v4-flash")).toEqual({ input: 0.14, cacheRead: 0.0028, output: 0.28 });
    expect(pricingFor("deepseek", "deepseek-chat")).toEqual({ input: 0.14, cacheRead: 0.0028, output: 0.28 });
    expect(pricingFor("deepseek", "deepseek-v4-pro")?.output).toBe(0.87);
  });

  it("resolves the openrouter kimi-k3 row", () => {
    expect(pricingFor("openrouter", "moonshotai/kimi-k3")).toEqual({ input: 3, cacheRead: 0.3, output: 15 });
  });

  it("returns null for unknown provider or model", () => {
    expect(pricingFor("together", "deepseek-v4-flash")).toBeNull();
    expect(pricingFor("deepseek", "some-future-model")).toBeNull();
  });
});

describe("estimateLlmCostUsd", () => {
  it("prices input, cache reads, and output separately", () => {
    expect(
      estimateLlmCostUsd("deepseek", "deepseek-v4-flash", {
        input_tokens: 1_000_000,
        cache_read_input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      })
    ).toBe(0.4228);
  });

  it("returns undefined for unknown models or missing usage", () => {
    expect(estimateLlmCostUsd("deepseek", "unknown-model", { input_tokens: 100 })).toBeUndefined();
    expect(estimateLlmCostUsd("deepseek", "deepseek-v4-flash")).toBeUndefined();
  });
});
