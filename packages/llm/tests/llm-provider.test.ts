import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { modelForStage, parseModelString, providerConfigFor, withSchemaRetry } from "../src/index";

const stageEnvNames = [
  "LLM_EXTRACT_MODEL",
  "LLM_BLOCK_MODEL",
  "LLM_VERIFIER_MODEL",
  "LLM_SYNTHESIS_MODEL",
  "LLM_RESEARCH_SECTION_MODEL",
  "LLM_RESEARCH_PLAN_MODEL",
  "ANTHROPIC_EXTRACT_MODEL",
  "ANTHROPIC_BLOCK_MODEL",
  "ANTHROPIC_VERIFIER_MODEL",
  "ANTHROPIC_SYNTHESIS_MODEL",
  "ANTHROPIC_RESEARCH_PLAN_MODEL",
  "ANTHROPIC_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
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

  it("aliases research_section to ANTHROPIC_SYNTHESIS_MODEL when its own env is unset", () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
    process.env.ANTHROPIC_SYNTHESIS_MODEL = "claude-haiku-4-5";
    expect(modelForStage("research_section")).toBe("claude-haiku-4-5");

    process.env.LLM_RESEARCH_SECTION_MODEL = "deepseek/deepseek-v4-flash";
    expect(modelForStage("research_section")).toBe("deepseek/deepseek-v4-flash");
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

describe("withSchemaRetry", () => {
  it("retries once on a zod error for non-anthropic models", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ZodError([]))
      .mockResolvedValueOnce("ok");

    await expect(withSchemaRetry("deepseek/deepseek-v4-flash", run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
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
