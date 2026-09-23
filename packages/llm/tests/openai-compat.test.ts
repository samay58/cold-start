import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OpenAiCompatTruncatedError,
  createTracedOpenAiCompatMessage,
  messageFromOpenAiCompatResponse,
  openAiCompatBodyFromAnthropicParams,
  usageFromOpenAiCompatResponse,
} from "../src/index";
import type { GenerationLlmCallTrace } from "@cold-start/core";

type AnthropicParams = Parameters<typeof openAiCompatBodyFromAnthropicParams>[0];

const baseParams: AnthropicParams = {
  model: "deepseek-v4-flash",
  max_tokens: 1800,
  temperature: 0,
  system: [
    { type: "text", text: "You extract facts.", cache_control: { type: "ephemeral", ttl: "1h" } },
  ],
  messages: [
    { role: "user", content: [{ type: "text", text: '{"domain":"acme.dev"}' }] },
  ],
  tools: [
    {
      name: "emit_block_claims",
      description: "Emit one block.",
      input_schema: { type: "object", properties: {} },
    },
  ],
  tool_choice: { type: "tool", name: "emit_block_claims" },
};

describe("openAiCompatBodyFromAnthropicParams", () => {
  it("flattens system blocks, translates tools and forced tool choice, and appends extra body", () => {
    const body = openAiCompatBodyFromAnthropicParams(baseParams, "deepseek-v4-flash", {
      thinking: { type: "disabled" },
    });

    expect(body.messages[0]).toEqual({ role: "system", content: "You extract facts." });
    expect(body.messages[1]).toEqual({ role: "user", content: '{"domain":"acme.dev"}' });
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "emit_block_claims",
          description: "Emit one block.",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "emit_block_claims" } });
    // Anthropic-tuned caps are floored at 8192 on cheap providers so tool JSON never truncates.
    expect(body.max_tokens).toBe(8192);
    expect(body.temperature).toBe(0);
    expect(body.stream).toBe(false);
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("accepts plain-string system and user content (the verifier shape)", () => {
    const body = openAiCompatBodyFromAnthropicParams(
      {
        model: "deepseek-v4-flash",
        max_tokens: 2000,
        system: "Verify claims.",
        messages: [{ role: "user", content: '{"claims":[]}' }],
      },
      "deepseek-v4-flash"
    );

    expect(body.messages).toEqual([
      { role: "system", content: "Verify claims." },
      { role: "user", content: '{"claims":[]}' },
    ]);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("throws on non-text content blocks", () => {
    expect(() =>
      openAiCompatBodyFromAnthropicParams(
        {
          model: "m",
          max_tokens: 10,
          messages: [
            {
              role: "user",
              content: [{ type: "image", source: { type: "url", url: "https://x.test/i.png" } }],
            },
          ],
        } as AnthropicParams,
        "m"
      )
    ).toThrow(/content block type "image"/);
  });

  it("omits temperature and raises the max_tokens floor for kimi-k3 (reasoning-mandatory, no sampling params)", () => {
    const body = openAiCompatBodyFromAnthropicParams(baseParams, "moonshotai/kimi-k3");
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBe(32768);
  });

  it("keeps temperature and the 8192 floor for models with no quirks", () => {
    const body = openAiCompatBodyFromAnthropicParams(baseParams, "deepseek-v4-flash", { thinking: { type: "disabled" } });
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(8192);
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("downgrades a named forced tool_choice to required for kimi-k3 (thinking rejects named tool_choice)", () => {
    const body = openAiCompatBodyFromAnthropicParams(
      { ...baseParams, tools: [{ name: "emit_x", input_schema: { type: "object" } }], tool_choice: { type: "tool", name: "emit_x" } } as AnthropicParams,
      "moonshotai/kimi-k3"
    );
    expect(body.tool_choice).toBe("required");
  });

  it("keeps the named forced tool_choice for models without the quirk", () => {
    const body = openAiCompatBodyFromAnthropicParams(
      { ...baseParams, tools: [{ name: "emit_x", input_schema: { type: "object" } }], tool_choice: { type: "tool", name: "emit_x" } } as AnthropicParams,
      "deepseek-v4-flash"
    );
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "emit_x" } });
  });
});

describe("messageFromOpenAiCompatResponse", () => {
  it("maps tool_calls to tool_use blocks with parsed arguments", () => {
    const message = messageFromOpenAiCompatResponse(
      {
        id: "resp-1",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: "call-1", function: { name: "emit_block_claims", arguments: '{"blockId":"funding","citations":[]}' } },
              ],
            },
          },
        ],
      },
      "deepseek-v4-flash"
    );

    expect(message.content).toEqual([
      { type: "tool_use", id: "call-1", name: "emit_block_claims", input: { blockId: "funding", citations: [] } },
    ]);
    expect(message.stop_reason).toBe("tool_use");
  });

  it("keeps a complete tool object when the provider appends trailing content", () => {
    const message = messageFromOpenAiCompatResponse(
      {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: "emit_block_claims",
                    arguments: '{"blockId":"funding","citations":["c1"]}\nextra provider content',
                  },
                },
              ],
            },
          },
        ],
      },
      "deepseek-v4-flash"
    );

    expect(message.content[0]).toMatchObject({
      type: "tool_use",
      name: "emit_block_claims",
      input: { blockId: "funding", citations: ["c1"] },
    });
  });

  it("maps plain content to a text block", () => {
    const message = messageFromOpenAiCompatResponse(
      { choices: [{ message: { content: '[{"claimIndex":0}]' } }] },
      "deepseek-v4-flash"
    );
    expect(message.content).toEqual([{ type: "text", text: '[{"claimIndex":0}]' }]);
    expect(message.stop_reason).toBe("end_turn");
  });

  it("throws SyntaxError on malformed tool arguments so the schema retry engages", () => {
    expect(() =>
      messageFromOpenAiCompatResponse(
        {
          choices: [
            { message: { tool_calls: [{ function: { name: "emit_block_claims", arguments: "{not json" } }] } },
          ],
        },
        "deepseek-v4-flash"
      )
    ).toThrow(SyntaxError);
  });

  it("throws a truncation error, not a SyntaxError, when a tool call is cut off at max_tokens", () => {
    const run = () =>
      messageFromOpenAiCompatResponse(
        {
          choices: [
            {
              finish_reason: "length",
              message: { tool_calls: [{ function: { name: "emit_block_claims", arguments: '{"claims":[{"text":"cut' } }] },
            },
          ],
        },
        "deepseek-v4-flash"
      );
    expect(run).toThrow(OpenAiCompatTruncatedError);
    expect(run).toThrow("response truncated at max_tokens");
    expect(run).not.toThrow(SyntaxError);
  });

  it("maps finish_reason length on a text reply to stop_reason max_tokens", () => {
    const message = messageFromOpenAiCompatResponse(
      { choices: [{ finish_reason: "length", message: { content: "partial" } }] },
      "deepseek-v4-flash"
    );
    expect(message.stop_reason).toBe("max_tokens");
    expect(message.content).toEqual([{ type: "text", text: "partial" }]);
  });
});

describe("usageFromOpenAiCompatResponse", () => {
  it("maps deepseek cache hit and miss fields", () => {
    expect(
      usageFromOpenAiCompatResponse({
        prompt_tokens: 60_000,
        completion_tokens: 1_200,
        prompt_cache_hit_tokens: 50_000,
        prompt_cache_miss_tokens: 10_000,
      })
    ).toEqual({ input_tokens: 10_000, cache_read_input_tokens: 50_000, output_tokens: 1_200 });
  });

  it("falls back to prompt_tokens when cache fields are absent", () => {
    expect(usageFromOpenAiCompatResponse({ prompt_tokens: 5_000, completion_tokens: 100 })).toEqual({
      input_tokens: 5_000,
      output_tokens: 100,
    });
  });

  it("maps OpenRouter/OpenAI convention usage: prompt_tokens is the TOTAL, so cached subtracts out of input", () => {
    expect(
      usageFromOpenAiCompatResponse({
        prompt_tokens: 1_000,
        prompt_tokens_details: { cached_tokens: 400 },
        completion_tokens: 200,
      })
    ).toEqual({ input_tokens: 600, cache_read_input_tokens: 400, output_tokens: 200 });
  });

  it("prefers deepseek cache_hit/cache_miss fields over prompt_tokens_details when both are present", () => {
    expect(
      usageFromOpenAiCompatResponse({
        prompt_tokens: 1_000,
        prompt_cache_hit_tokens: 200,
        prompt_cache_miss_tokens: 800,
        prompt_tokens_details: { cached_tokens: 999 },
        completion_tokens: 50,
      })
    ).toEqual({ input_tokens: 800, cache_read_input_tokens: 200, output_tokens: 50 });
  });
});

describe("createTracedOpenAiCompatMessage", () => {
  const savedKey = process.env.DEEPSEEK_API_KEY;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-22T04:30:00.000Z"));
    process.env.DEEPSEEK_API_KEY = "test-key";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (savedKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = savedKey;
    }
  });

  const okPayload = {
    id: "resp-1",
    model: "deepseek-v4-flash",
    choices: [
      {
        message: {
          tool_calls: [{ id: "c1", function: { name: "emit_block_claims", arguments: "{}" } }],
        },
      },
    ],
    usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_cache_hit_tokens: 200, prompt_cache_miss_tokens: 800 },
  };

  function jsonResponse(payload: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
    return new Response(JSON.stringify(payload), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...init.headers },
    });
  }

  const callInput = () => ({
    label: "extract-block:funding",
    params: baseParams,
    resolved: { provider: "deepseek", model: "deepseek-v4-flash", raw: "deepseek/deepseek-v4-flash" },
    stage: "extract_block" as const,
  });

  it("posts the translated body with auth, disabled thinking, and emits an ok trace with provider and cost", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(okPayload));
    const traces: GenerationLlmCallTrace[] = [];

    const message = await createTracedOpenAiCompatMessage({ ...callInput(), telemetry: (call) => traces.push(call) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "emit_block_claims" } });

    expect(message.content[0]).toMatchObject({ type: "tool_use", name: "emit_block_claims" });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      stage: "extract_block",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      status: "ok",
      inputTokens: 800,
      cacheReadInputTokens: 200,
      outputTokens: 50,
      retryCount: 0,
    });
    expect(traces[0]?.estimatedCostUsd).toBeCloseTo(0.00021, 6);
  });

  it("prefers the provider's billed usage.cost over the pricing-table estimate when present", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...okPayload, usage: { ...okPayload.usage, cost: 0.0123 } }));
    const traces: GenerationLlmCallTrace[] = [];

    await createTracedOpenAiCompatMessage({ ...callInput(), telemetry: (call) => traces.push(call) });

    expect(traces).toHaveLength(1);
    expect(traces[0]?.estimatedCostUsd).toBe(0.0123);
  });

  it("retains the serving identity and DeepInfra's reported estimate", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...okPayload, model: "served-model", provider: "actual-host",
      usage: { ...okPayload.usage, estimated_cost: 0.0042 } }));
    const traces: GenerationLlmCallTrace[] = [];
    await createTracedOpenAiCompatMessage({ ...callInput(), telemetry: call => traces.push(call) });
    expect(traces[0]).toMatchObject({ model: "deepseek-v4-flash", responseId: "resp-1",
      responseModel: "served-model", servingProvider: "actual-host", estimatedCostUsd: 0.0042 });
  });

  it("does not invent serving identity when the provider omits it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...okPayload, id: undefined, model: undefined }));
    const traces: GenerationLlmCallTrace[] = [];
    await createTracedOpenAiCompatMessage({ ...callInput(), telemetry: call => traces.push(call) });
    expect(traces[0]).not.toHaveProperty("responseId");
    expect(traces[0]).not.toHaveProperty("responseModel");
    expect(traces[0]).not.toHaveProperty("servingProvider");
  });

  it("rejects negative reported costs instead of subtracting them from the ledger", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...okPayload, usage: { ...okPayload.usage, cost: -1 } }));
    const traces: GenerationLlmCallTrace[] = [];
    await createTracedOpenAiCompatMessage({ ...callInput(), telemetry: call => traces.push(call) });
    expect(traces[0]?.estimatedCostUsd).toBeGreaterThanOrEqual(0);
  });

  it("treats an HTTP-200 gateway error as a failure and retains its request details", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 503, message: "test-key overloaded",
      metadata: { provider_name: "actual-host" } } }, { headers: { "x-request-id": "request-123" } }));
    const traces: GenerationLlmCallTrace[] = [];
    await expect(createTracedOpenAiCompatMessage({ ...callInput(), telemetry: call => traces.push(call),
      requestOptions: { signal: new AbortController().signal, timeout: 1000, maxRetries: 0 },
    })).rejects.toThrow("openai-compat request failed with 503: ");
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ status: "failed", responseId: "request-123", servingProvider: "actual-host" });
    expect(traces[0]?.error).not.toContain("test-key");
    expect(traces[0]).not.toHaveProperty("estimatedCostUsd");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["engine_overloaded", 503], ["server_error", 503], ["rate_limit_exceeded", 429],
    ["invalid_request_error", 200], ["invalid_api_key", 200],
  ])("classifies error envelope %s without retrying semantic failures", async (code, expected) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code, message: "provider error" },
      id: "failed-call", model: "served-model", provider: "served-host", usage: { cost: 0.012, prompt_tokens: 123 } }));
    const traces: GenerationLlmCallTrace[] = [];
    await expect(createTracedOpenAiCompatMessage({ ...callInput(), telemetry: call => traces.push(call),
      requestOptions: { signal: new AbortController().signal, timeout: 1000, maxRetries: 0 },
    })).rejects.toThrow(`failed with ${expected}:`);
    expect(traces[0]).toMatchObject({ status: "failed", responseId: "failed-call", responseModel: "served-model",
      servingProvider: "served-host", estimatedCostUsd: 0.012, inputTokens: 123 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and 5xx then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(jsonResponse({ error: "upstream" }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(okPayload));

    const traces: GenerationLlmCallTrace[] = [];
    const pending = createTracedOpenAiCompatMessage({ ...callInput(), telemetry: (call) => traces.push(call) });
    // Both backoffs (500ms after the 429's zero Retry-After, 1500ms after the 503) on the fake clock.
    await vi.advanceTimersByTimeAsync(2_000);
    const message = await pending;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(message.content[0]).toMatchObject({ type: "tool_use" });
    expect(traces[0]?.retryCount).toBe(2);
  });

  it("retries network errors", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(jsonResponse(okPayload));
    await expect(createTracedOpenAiCompatMessage(callInput())).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable 4xx and emits a failed trace", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: "bad request" } }, { status: 400 }));
    const traces: GenerationLlmCallTrace[] = [];

    await expect(
      createTracedOpenAiCompatMessage({ ...callInput(), telemetry: (call) => traces.push(call) })
    ).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ status: "failed", provider: "deepseek" });
    expect(traces[0]?.error).toMatch(/400/);
  });

  it("cancels a stalled response body when the caller aborts", async () => {
    let bodyCancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"id":"unfinished"'));
      },
      cancel() {
        bodyCancelled = true;
      }
    });
    fetchMock.mockResolvedValueOnce(new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const controller = new AbortController();
    const pending = createTracedOpenAiCompatMessage({
      ...callInput(),
      requestOptions: { signal: controller.signal, timeout: 10_000, maxRetries: 0 }
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    controller.abort(new DOMException("caller cancelled", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(bodyCancelled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
