import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  fallbackModelForStage,
  modelForStage,
  parseModelString,
  providerEndpointHost,
  providerConfigFor,
  quirksForModel,
  withProviderFallback,
  withSchemaRetry,
} from "../src/index";

const stageEnvNames = [
  "LLM_EXTRACT_MODEL",
  "LLM_BLOCK_MODEL",
  "LLM_VERIFIER_MODEL",
  "LLM_SYNTHESIS_MODEL",
  "LLM_RESEARCH_SECTION_MODEL",
  "LLM_RESEARCH_PLAN_MODEL",
  "LLM_PERSON_READ_MODEL",
  "LLM_EXPANDED_DESCRIPTION_MODEL",
  "LLM_FALLBACK_MODEL",
  "LLM_SYNTHESIS_FALLBACK_MODEL",
  "LLM_VERIFIER_FALLBACK_MODEL",
  "LLM_RESEARCH_SECTION_FALLBACK_MODEL",
  "LLM_PERSON_READ_FALLBACK_MODEL",
  "LLM_EXPANDED_DESCRIPTION_FALLBACK_MODEL",
  "LLM_EXTRACT_FALLBACK_MODEL",
  "ANTHROPIC_EXTRACT_MODEL",
  "ANTHROPIC_BLOCK_MODEL",
  "ANTHROPIC_VERIFIER_MODEL",
  "ANTHROPIC_SYNTHESIS_MODEL",
  "ANTHROPIC_RESEARCH_PLAN_MODEL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_BASE_URL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "DEEPINFRA_API_KEY",
  "DEEPINFRA_BASE_URL",
  "FIREWORKS_BASE_URL",
  "LLM_PROVIDER_CUSTOMHOST_API_KEY",
  "LLM_PROVIDER_CUSTOMHOST_BASE_URL",
];

const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of stageEnvNames) {
    savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of stageEnvNames) {
    const value = savedEnv.get(name);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("parseModelString", () => {
  it("treats unprefixed strings as anthropic", () => {
    expect(parseModelString("claude-sonnet-4-6")).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      raw: "claude-sonnet-4-6",
    });
  });

  it("splits provider-prefixed strings", () => {
    expect(parseModelString("deepseek/deepseek-v4-flash")).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      raw: "deepseek/deepseek-v4-flash",
    });
  });

  it("splits on the first slash only so fireworks model paths survive", () => {
    expect(parseModelString("fireworks/accounts/fireworks/models/deepseek-v4")).toEqual({
      provider: "fireworks",
      model: "accounts/fireworks/models/deepseek-v4",
      raw: "fireworks/accounts/fireworks/models/deepseek-v4",
    });
  });

  it("lowercases the provider segment", () => {
    expect(parseModelString("DeepSeek/deepseek-v4-flash").provider).toBe("deepseek");
  });
});

describe("quirksForModel", () => {
  it("flags kimi-k3 as omitting sampling params with a raised max_tokens floor and forced tool_choice downgrade", () => {
    expect(quirksForModel("moonshotai/kimi-k3")).toEqual({ omitSamplingParams: true, minMaxTokens: 32768, forceToolChoiceRequired: true });
  });

  it("matches kimi-k3 case-insensitively anywhere in the model string", () => {
    expect(quirksForModel("moonshotai/Kimi-K3")).toEqual({ omitSamplingParams: true, minMaxTokens: 32768, forceToolChoiceRequired: true });
  });

  it("flags opus-5 as omitting sampling params", () => {
    expect(quirksForModel("claude-opus-5")).toEqual({ omitSamplingParams: true });
    expect(quirksForModel("anthropic/claude-opus-5")).toEqual({ omitSamplingParams: true });
  });

  it("returns no quirks for deepseek and other anthropic models", () => {
    expect(quirksForModel("deepseek-v4-flash")).toEqual({});
    expect(quirksForModel("claude-sonnet-4-6")).toEqual({});
    expect(quirksForModel("claude-opus-4-7")).toEqual({});
  });
});

describe("modelForStage", () => {
  it("prefers LLM_* over ANTHROPIC_* over the default", () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
    process.env.ANTHROPIC_EXTRACT_MODEL = "claude-haiku-4-5";
    expect(modelForStage("extract_full")).toBe("claude-haiku-4-5");

    process.env.LLM_EXTRACT_MODEL = "deepseek/deepseek-v4-flash";
    expect(modelForStage("extract_full")).toBe("deepseek/deepseek-v4-flash");
  });

  it("falls back to ANTHROPIC_MODEL when no stage env is set", () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
    expect(modelForStage("verify")).toBe("claude-sonnet-4-6");
  });

  it("aliases research_section to the synthesis model chain when its own env is unset", () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
    process.env.ANTHROPIC_SYNTHESIS_MODEL = "claude-haiku-4-5";
    expect(modelForStage("research_section")).toBe("claude-haiku-4-5");

    process.env.LLM_SYNTHESIS_MODEL = "deepseek/deepseek-v4-pro";
    expect(modelForStage("research_section")).toBe("deepseek/deepseek-v4-pro");

    process.env.LLM_RESEARCH_SECTION_MODEL = "deepseek/deepseek-v4-flash";
    expect(modelForStage("research_section")).toBe("deepseek/deepseek-v4-flash");
  });

  it("aliases person_read to the synthesis model chain when its own env is unset", () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
    process.env.ANTHROPIC_SYNTHESIS_MODEL = "claude-haiku-4-5";
    expect(modelForStage("person_read")).toBe("claude-haiku-4-5");

    process.env.LLM_SYNTHESIS_MODEL = "deepseek/deepseek-v4-pro";
    expect(modelForStage("person_read")).toBe("deepseek/deepseek-v4-pro");

    process.env.LLM_PERSON_READ_MODEL = "deepseek/deepseek-v4-flash";
    expect(modelForStage("person_read")).toBe("deepseek/deepseek-v4-flash");
  });

  it("throws when nothing is configured", () => {
    expect(() => modelForStage("extract_full")).toThrow(/LLM_EXTRACT_MODEL or ANTHROPIC_MODEL/);
  });
});

describe("providerConfigFor", () => {
  it("uses deepseek defaults including disabled thinking", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const config = providerConfigFor("deepseek");
    expect(config.baseUrl).toBe("https://api.deepseek.com");
    expect(config.extraBody).toEqual({ thinking: { type: "disabled" } });
  });

  it("uses openrouter defaults including the usage-cost extra body", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const config = providerConfigFor("openrouter");
    expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config.extraBody).toEqual({ usage: { include: true } });
  });

  it("keeps full extraction on independent OpenRouter hosts with forced-tool support", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const config = providerConfigFor("openrouter", { stage: "extract_full", model: "deepseek/deepseek-v4.1-flash" });
    expect(config.extraBody).toEqual({
      usage: { include: true }, reasoning: { enabled: false },
      provider: { only: ["baseten", "fireworks", "novita"], allow_fallbacks: true,
        require_parameters: true, data_collection: "deny", sort: "latency" },
    });
    expect(providerConfigFor("openrouter", { stage: "synthesize", model: "deepseek/deepseek-v4.1-flash" }).extraBody)
      .toEqual({ usage: { include: true } });
  });

  it("excludes the failed primary upstream from OpenRouter extraction routing", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const config = providerConfigFor("openrouter", {
      stage: "extract_full",
      model: "deepseek/deepseek-v4.1-flash",
      excludedProviders: [" Fireworks ", "fireworks"],
    });

    expect(config.extraBody).toMatchObject({
      provider: {
        only: ["baseten", "novita"],
        ignore: ["fireworks"],
      },
    });
  });

  it("configures DeepInfra extraction without changing reasoning for other stages", () => {
    process.env.DEEPINFRA_API_KEY = "test-key";
    const config = providerConfigFor("deepinfra", { stage: "extract_full", model: "deepseek-ai/DeepSeek-V4.1-Flash" });
    expect(config.baseUrl).toBe("https://api.deepinfra.com/v1/openai");
    expect(config.extraBody).toEqual({ reasoning_effort: "none", service_tier: "priority", fail_fast: true });
    expect(providerConfigFor("deepinfra", { stage: "synthesize", model: "deepseek-ai/DeepSeek-V4.1-Flash" }).extraBody)
      .toBeUndefined();
  });

  it("consults the stage request policy only for extract_full", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.DEEPINFRA_API_KEY = "test-key";
    const context = { model: "deepseek/deepseek-v4.1-flash", excludedProviders: ["fireworks"] };

    for (const stage of ["extract_block", "synthesis", "verify", "research_section", "how_it_wins"]) {
      expect(providerConfigFor("openrouter", { ...context, stage }).extraBody).toEqual({ usage: { include: true } });
      expect(providerConfigFor("deepinfra", { ...context, stage }).extraBody).toBeUndefined();
    }

    expect(providerConfigFor("openrouter", { ...context, stage: "extract_full" }).extraBody)
      .toMatchObject({ provider: { sort: "latency", ignore: ["fireworks"] } });
  });

  it("strips trailing slashes from override base URLs", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    process.env.DEEPSEEK_BASE_URL = "https://proxy.example.com/v1/";
    expect(providerConfigFor("deepseek").baseUrl).toBe("https://proxy.example.com/v1");
  });

  it("throws a named-env error when the key is missing", () => {
    expect(() => providerConfigFor("deepseek")).toThrow(/DEEPSEEK_API_KEY/);
  });

  it("resolves unknown providers through the generic env scheme", () => {
    process.env.LLM_PROVIDER_CUSTOMHOST_API_KEY = "k";
    process.env.LLM_PROVIDER_CUSTOMHOST_BASE_URL = "https://llm.customhost.dev";
    const config = providerConfigFor("customhost");
    expect(config.baseUrl).toBe("https://llm.customhost.dev");

    delete process.env.LLM_PROVIDER_CUSTOMHOST_BASE_URL;
    expect(() => providerConfigFor("customhost")).toThrow(/LLM_PROVIDER_CUSTOMHOST_BASE_URL/);
  });
});

describe("providerEndpointHost", () => {
  it("normalizes case, default ports, paths, and trailing slashes without reading credentials", () => {
    process.env.DEEPSEEK_BASE_URL = "HTTPS://Gateway.Example.com:443/deepseek/v1/";
    process.env.OPENROUTER_BASE_URL = "https://gateway.example.com/openrouter/v1";

    expect(providerEndpointHost("deepseek")).toBe("gateway.example.com");
    expect(providerEndpointHost("openrouter")).toBe("gateway.example.com");
  });

  it("uses the Anthropic SDK endpoint default without requiring an API key", () => {
    expect(providerEndpointHost("anthropic")).toBe("api.anthropic.com");
  });
});

describe("withSchemaRetry", () => {
  it("retries once on a zod error for non-anthropic models", async () => {
    const schemaError = new ZodError([]);
    const run = vi
      .fn<(previousError?: unknown) => Promise<string>>()
      .mockRejectedValueOnce(schemaError)
      .mockResolvedValueOnce("ok");

    await expect(withSchemaRetry("deepseek/deepseek-v4-flash", run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls).toEqual([[], [schemaError]]);
  });

  it("retries on malformed tool-argument JSON and missing tool use", async () => {
    const syntaxRun = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new SyntaxError("Unexpected token"))
      .mockResolvedValueOnce("ok");
    await expect(withSchemaRetry("deepseek/deepseek-v4-flash", syntaxRun)).resolves.toBe("ok");

    const toolUseRun = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("No emit_company_claims tool use returned"))
      .mockResolvedValueOnce("ok");
    await expect(withSchemaRetry("deepseek/deepseek-v4-flash", toolUseRun)).resolves.toBe("ok");
  });

  it("does not retry twice", async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(new ZodError([]));
    await expect(withSchemaRetry("deepseek/deepseek-v4-flash", run)).rejects.toBeInstanceOf(ZodError);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-schema errors", async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("openai-compat request failed with 401: nope"));
    await expect(withSchemaRetry("deepseek/deepseek-v4-flash", run)).rejects.toThrow(/401/);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never retries anthropic models", async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(new ZodError([]));
    await expect(withSchemaRetry("claude-sonnet-4-6", run)).rejects.toBeInstanceOf(ZodError);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("provider fallback", () => {
  it("prefers the stage fallback over the shared fallback", () => {
    process.env.LLM_FALLBACK_MODEL = "deepseek/deepseek-v4-flash";
    process.env.LLM_SYNTHESIS_FALLBACK_MODEL = "deepseek/deepseek-v4-pro";

    expect(fallbackModelForStage("synthesis", "claude-sonnet-4-6")).toBe("deepseek/deepseek-v4-pro");
    expect(fallbackModelForStage("person_read", "claude-sonnet-4-6")).toBe("deepseek/deepseek-v4-flash");
  });

  it("supports a verifier-specific fallback", () => {
    process.env.LLM_FALLBACK_MODEL = "deepseek/deepseek-v4-flash";
    process.env.LLM_VERIFIER_FALLBACK_MODEL = "deepseek/deepseek-v4-pro";

    expect(fallbackModelForStage("verify", "claude-sonnet-4-6")).toBe("deepseek/deepseek-v4-pro");
  });

  it.each(["off", " OFF "])("treats %j as recovery disabled on every stage", (value) => {
    process.env.LLM_FALLBACK_MODEL = value;
    expect(fallbackModelForStage("synthesis", "claude-sonnet-4-6")).toBeNull();
    expect(fallbackModelForStage("verify", "deepseek/deepseek-v4-pro")).toBeNull();

    process.env.LLM_SYNTHESIS_FALLBACK_MODEL = value;
    process.env.LLM_FALLBACK_MODEL = "deepseek/deepseek-v4-pro";
    expect(fallbackModelForStage("synthesis", "claude-sonnet-4-6")).toBeNull();
    expect(fallbackModelForStage("verify", "claude-sonnet-4-6")).toBe("deepseek/deepseek-v4-pro");
  });

  it("falls through to the caller's default model as the last link", () => {
    const options = { defaultModel: "claude-sonnet-4-6" };
    expect(fallbackModelForStage("extract_full", "deepseek/deepseek-v4-flash", options)).toBe("claude-sonnet-4-6");

    process.env.LLM_FALLBACK_MODEL = "openrouter/example/extractor";
    expect(fallbackModelForStage("extract_full", "deepseek/deepseek-v4-flash", options))
      .toBe("openrouter/example/extractor");

    process.env.LLM_EXTRACT_FALLBACK_MODEL = "off";
    expect(fallbackModelForStage("extract_full", "deepseek/deepseek-v4-flash", options)).toBeNull();
  });

  it("returns null when no distinct fallback is configured", () => {
    expect(fallbackModelForStage("synthesis", "claude-sonnet-4-6")).toBeNull();
    process.env.LLM_FALLBACK_MODEL = "claude-sonnet-4-6";
    expect(fallbackModelForStage("synthesis", "claude-sonnet-4-6")).toBeNull();
  });

  it("uses the fallback once when the primary provider has no credit", async () => {
    process.env.LLM_SYNTHESIS_FALLBACK_MODEL = "deepseek/deepseek-v4-pro";
    const run = vi.fn(async (model: string) => {
      if (model === "claude-sonnet-4-6") {
        throw new Error("Your credit balance is too low to access the Anthropic API.");
      }
      return model;
    });

    await expect(withProviderFallback("synthesis", "claude-sonnet-4-6", run)).resolves.toBe(
      "deepseek/deepseek-v4-pro",
    );
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("rejects a fallback that resolves to the same endpoint host", async () => {
    process.env.LLM_SYNTHESIS_FALLBACK_MODEL = "deepseek/deepseek-v4-pro";
    process.env.ANTHROPIC_BASE_URL = "HTTPS://Gateway.Example.com:443/anthropic";
    process.env.DEEPSEEK_BASE_URL = "https://gateway.example.com/deepseek";
    const run = vi.fn().mockRejectedValue(new Error("insufficient credits"));

    await expect(withProviderFallback("synthesis", "claude-sonnet-4-6", run)).rejects.toThrow(
      'fallback "deepseek" resolves to the primary endpoint host gateway.example.com',
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not fallback on a model-contract failure", async () => {
    process.env.LLM_SYNTHESIS_FALLBACK_MODEL = "deepseek/deepseek-v4-pro";
    const run = vi.fn(async () => {
      throw new Error("No synthesis tool use returned");
    });

    await expect(withProviderFallback("synthesis", "claude-sonnet-4-6", run)).rejects.toThrow(
      /No synthesis tool use/,
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
});
