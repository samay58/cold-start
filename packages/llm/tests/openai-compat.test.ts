import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
});

describe("createTracedOpenAiCompatMessage", () => {
  const savedKey = process.env.DEEPSEEK_API_KEY;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
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
    });
    // 800 in * 0.14/M + 200 cache * 0.0028/M + 50 out * 0.28/M
    expect(traces[0]?.estimatedCostUsd).toBeCloseTo(0.000127, 6);
  });

  it("retries 429 and 5xx then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(jsonResponse({ error: "upstream" }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(okPayload));

    const message = await createTracedOpenAiCompatMessage(callInput());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(message.content[0]).toMatchObject({ type: "tool_use" });
  }, 15_000);

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
});
