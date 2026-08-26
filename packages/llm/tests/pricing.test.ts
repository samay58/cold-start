import { describe, expect, it } from "vitest";
import { estimateLlmCostUsd, pricingFor } from "../src/index";

describe("pricingFor", () => {
  it("uses DeepSeek's weekday peak and off-peak schedules", () => {
    const offPeak = new Date("2026-08-24T04:30:00.000Z"); // Monday, between the two peak windows
    const peak = new Date("2026-08-24T06:30:00.000Z"); // Monday, inside the second peak window
    expect(pricingFor("deepseek", "deepseek-v4-flash", offPeak)).toEqual({ input: 0.22, cacheRead: 0.007, output: 0.66 });
    expect(pricingFor("deepseek", "deepseek-v4-flash", peak)).toEqual({ input: 0.44, cacheRead: 0.014, output: 1.32 });
    expect(pricingFor("deepseek", "deepseek-v4-pro", offPeak)).toEqual({ input: 0.66, cacheRead: 0.022, output: 1.98 });
    expect(pricingFor("deepseek", "deepseek-v4-pro", peak)).toEqual({ input: 1.32, cacheRead: 0.044, output: 3.96 });
  });

  it("prices every weekend hour off-peak, peak-window clock or not", () => {
    const saturday = new Date("2026-08-22T06:30:00.000Z"); // inside the weekday peak window
    const sunday = new Date("2026-08-23T02:00:00.000Z"); // inside the other weekday peak window
    expect(pricingFor("deepseek", "deepseek-v4-flash", saturday)).toEqual({ input: 0.22, cacheRead: 0.007, output: 0.66 });
    expect(pricingFor("deepseek", "deepseek-v4-pro", sunday)).toEqual({ input: 0.66, cacheRead: 0.022, output: 1.98 });
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
      }, new Date("2026-08-22T04:30:00.000Z"))
    ).toBe(0.887);
  });

  it("returns undefined for unknown models or missing usage", () => {
    expect(estimateLlmCostUsd("deepseek", "unknown-model", { input_tokens: 100 })).toBeUndefined();
    expect(estimateLlmCostUsd("deepseek", "deepseek-v4-flash")).toBeUndefined();
  });
});
