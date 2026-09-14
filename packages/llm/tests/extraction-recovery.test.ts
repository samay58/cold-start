import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withExtractionRecovery } from "../src/extraction-recovery";
import { isTransientLlmError } from "../src/transient-error";
import { withSchemaRetry, type LlmRequestOptions } from "../src/llm-provider";

function waitForAbort(_model: string, options: LlmRequestOptions): Promise<never> {
  return new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });
}
const primary = "deepseek/deepseek-v4-flash";

describe("extraction recovery budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("LLM_EXTRACT_FALLBACK_MODEL", "");
    vi.stubEnv("LLM_FALLBACK_MODEL", "");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-4-6");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("cancels a stalled primary after 45 seconds before starting the alternate", async () => {
    const run = vi.fn().mockImplementationOnce(waitForAbort).mockResolvedValueOnce("saved");
    const result = withExtractionRecovery(primary, run);
    await vi.advanceTimersByTimeAsync(44_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("saved");
    expect(run.mock.calls.map(([model]) => model)).toEqual([primary, "claude-sonnet-4-6"]);
    expect(run.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(run.mock.calls[1]![1]).toMatchObject({ timeout: 90_000, maxRetries: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("exhausts two stalled providers in 135 seconds without a retriable outer error", async () => {
    const run = vi.fn(waitForAbort);
    const result = withExtractionRecovery(primary, run).catch(error => error);
    await vi.advanceTimersByTimeAsync(135_000);
    const error = await result;
    expect(error).toBeInstanceOf(Error);
    expect(error.cause.name).toBe("TimeoutError");
    expect(isTransientLlmError(error)).toBe(false);
    expect(run).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a schema correction inside the original provider deadline", async () => {
    let primaryCalls = 0;
    const run = vi.fn((model: string, options: LlmRequestOptions) => withSchemaRetry(model, async () => {
      if (model !== primary) return "saved";
      primaryCalls += 1;
      if (primaryCalls === 1) {
        await new Promise(resolve => setTimeout(resolve, 30_000));
        throw new SyntaxError("invalid JSON");
      }
      return waitForAbort(model, options);
    }));
    const result = withExtractionRecovery(primary, run);
    await vi.advanceTimersByTimeAsync(45_000);
    await expect(result).resolves.toBe("saved");
    expect(primaryCalls).toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each(["off", "deepseek/deepseek-v4-pro"])("uses one 90-second attempt when configured with %s", async (model) => {
    vi.stubEnv("LLM_EXTRACT_FALLBACK_MODEL", model);
    const run = vi.fn(waitForAbort);
    const result = withExtractionRecovery(primary, run).catch(error => error);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(await result).toBeInstanceOf(Error);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([
    "openai-compat request failed with 401: invalid key",
    "openai-compat request failed with 400: invalid model",
    "extraction tool use returned invalid content"
  ])("does not switch providers for %s", async (message) => {
    const error = new Error(message);
    const run = vi.fn().mockRejectedValue(error);
    await expect(withExtractionRecovery(primary, run)).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["429", "503"])("switches providers on HTTP %s without retrying the primary", async (status) => {
    const run = vi.fn().mockRejectedValueOnce(new Error(`openai-compat request failed with ${status}: unavailable`))
      .mockResolvedValueOnce("saved");
    await expect(withExtractionRecovery(primary, run)).resolves.toBe("saved");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("honors the explicit alternate before the global and Anthropic defaults", async () => {
    vi.stubEnv("LLM_EXTRACT_FALLBACK_MODEL", "openrouter/example/extractor");
    vi.stubEnv("LLM_FALLBACK_MODEL", "other/extractor");
    const run = vi.fn().mockRejectedValueOnce(new Error("insufficient credits")).mockResolvedValueOnce("saved");
    await expect(withExtractionRecovery(primary, run)).resolves.toBe("saved");
    expect(run.mock.calls[1]![0]).toBe("openrouter/example/extractor");
  });
});
