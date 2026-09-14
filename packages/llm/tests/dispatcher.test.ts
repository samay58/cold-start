import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTracedAnthropicMessage } from "../src/index";
import type { GenerationLlmCallTrace } from "@cold-start/core";

const savedEnv = new Map<string, string | undefined>();
const envNames = ["ANTHROPIC_CACHE_TTL", "DEEPSEEK_API_KEY"];

beforeEach(() => {
  for (const name of envNames) {
    savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of envNames) {
    const value = savedEnv.get(name);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

function mockAnthropicClient() {
  const create = vi.fn().mockResolvedValue({
    id: "msg_actual",
    model: "claude-sonnet-4-6-20260901",
    content: [{ type: "tool_use", name: "emit_block_claims", input: {} }],
    usage: { input_tokens: 100, output_tokens: 10 },
  });
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

const params = {
  model: "claude-sonnet-4-6",
  max_tokens: 100,
  messages: [{ role: "user" as const, content: "hi" }],
};

describe("createTracedAnthropicMessage dispatch", () => {
  it("keeps the anthropic path unchanged: same params, 1h beta header, anthropic provider trace", async () => {
    const { client, create } = mockAnthropicClient();
    const traces: GenerationLlmCallTrace[] = [];

    await createTracedAnthropicMessage({
      client,
      label: "test",
      model: "claude-sonnet-4-6",
      params,
      stage: "extract_block",
      telemetry: (call) => traces.push(call),
    });

    expect(create).toHaveBeenCalledTimes(1);
    const [sentParams, requestOptions] = create.mock.calls[0] as [typeof params, { headers: Record<string, string> }];
    expect(sentParams).toEqual(params);
    expect(requestOptions.headers["anthropic-beta"]).toBe("extended-cache-ttl-2025-04-11");
    expect(traces[0]).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      responseId: "msg_actual",
      responseModel: "claude-sonnet-4-6-20260901",
      status: "ok",
    });
  });

  it("records the Anthropic request id when the SDK call fails", async () => {
    const error = new Anthropic.APIError(
      503,
      { message: "capacity unavailable" },
      undefined,
      new Headers({ "request-id": "req_failed" }),
    );
    const create = vi.fn().mockRejectedValue(error);
    const client = { messages: { create } } as unknown as Anthropic;
    const traces: GenerationLlmCallTrace[] = [];

    await expect(createTracedAnthropicMessage({
      client,
      label: "test",
      model: "claude-sonnet-4-6",
      params,
      stage: "extract_block",
      telemetry: (call) => traces.push(call),
    })).rejects.toBe(error);

    expect(traces[0]).toMatchObject({
      provider: "anthropic",
      responseId: "req_failed",
      status: "failed",
    });
  });

  it("normalizes an explicit anthropic/ prefix to the bare model id", async () => {
    const { client, create } = mockAnthropicClient();

    await createTracedAnthropicMessage({
      client,
      label: "test",
      model: "anthropic/claude-sonnet-4-6",
      params: { ...params, model: "anthropic/claude-sonnet-4-6" },
      stage: "extract_block",
    });

    const [sentParams] = create.mock.calls[0] as [typeof params];
    expect(sentParams.model).toBe("claude-sonnet-4-6");
  });

  it("routes provider-prefixed models to the openai-compat adapter without touching the anthropic client", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const { client, create } = mockAnthropicClient();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const traces: GenerationLlmCallTrace[] = [];
    const message = await createTracedAnthropicMessage({
      client,
      label: "test",
      model: "deepseek/deepseek-v4-flash",
      params: { ...params, model: "deepseek/deepseek-v4-flash" },
      stage: "verify",
      telemetry: (call) => traces.push(call),
    });

    expect(create).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(message.content[0]).toEqual({ type: "text", text: "ok" });
    expect(traces[0]).toMatchObject({ provider: "deepseek", model: "deepseek-v4-flash", stage: "verify" });
  });
});
