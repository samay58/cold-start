import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { buildLlmCallTrace, type AnthropicTelemetrySink, type AnthropicUsage } from "./call-trace";
import { providerConfigFor, type ResolvedLlmModel } from "./llm-provider";
import { estimateLlmCostUsd } from "./pricing";

type AnthropicMessageParams = Parameters<Anthropic["messages"]["create"]>[0];

type OpenAiCompatBody = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  stream: false;
  tools?: Array<{ type: "function"; function: { name: string; description?: string; parameters: unknown } }>;
  tool_choice?: "auto" | { type: "function"; function: { name: string } };
  [key: string]: unknown;
};

type OpenAiCompatResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
};

function systemText(system: AnthropicMessageParams["system"]): string | null {
  if (!system) {
    return null;
  }

  if (typeof system === "string") {
    return system;
  }

  const parts = system
    .filter((block) => block.type === "text")
    .map((block) => block.text);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function messageText(content: AnthropicMessageParams["messages"][number]["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((block) => {
      if (block.type !== "text") {
        throw new Error(`openai-compat does not support content block type "${block.type}"`);
      }
      return block.text;
    })
    .join("\n\n");
}

export function openAiCompatBodyFromAnthropicParams(
  params: AnthropicMessageParams,
  model: string,
  extraBody?: Record<string, unknown>
): OpenAiCompatBody {
  const system = systemText(params.system);
  const body: OpenAiCompatBody = {
    model,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...params.messages.map((message) => ({ role: message.role, content: messageText(message.content) })),
    ],
    stream: false,
  };

  if (params.max_tokens !== undefined) {
    // The Anthropic call sites cap max_tokens to bound Sonnet-priced output. These providers
    // price output 20-30x lower, and models like DeepSeek emit less compact tool-argument JSON;
    // the matrix showed extract_full tool calls truncating mid-string at the 4000 cap. Floor the
    // ceiling at 8192 so structured output is not cut off over pennies.
    body.max_tokens = Math.max(params.max_tokens, 8192);
  }
  if (params.temperature !== undefined) {
    body.temperature = params.temperature;
  }

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools.map((tool) => {
      if (!("input_schema" in tool)) {
        throw new Error(`openai-compat only supports custom tools; got "${tool.name}"`);
      }
      return {
        type: "function" as const,
        function: {
          name: tool.name,
          ...(tool.description ? { description: tool.description } : {}),
          parameters: tool.input_schema,
        },
      };
    });
  }

  if (params.tool_choice?.type === "tool") {
    body.tool_choice = { type: "function", function: { name: params.tool_choice.name } };
  } else if (params.tool_choice?.type === "auto") {
    body.tool_choice = "auto";
  }

  return { ...body, ...extraBody };
}

export function usageFromOpenAiCompatResponse(usage: OpenAiCompatResponse["usage"]): AnthropicUsage | undefined {
  if (!usage) {
    return undefined;
  }

  const cacheHit = usage.prompt_cache_hit_tokens;
  const inputTokens = usage.prompt_cache_miss_tokens ?? usage.prompt_tokens;
  return {
    ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
    ...(cacheHit !== undefined ? { cache_read_input_tokens: cacheHit } : {}),
    ...(usage.completion_tokens !== undefined ? { output_tokens: usage.completion_tokens } : {}),
  };
}

// Maps the OpenAI-compat choice back to the Anthropic Message content shape the stage parsers
// read: tool_calls become tool_use blocks (arguments JSON.parse here, so a malformed-arguments
// failure surfaces as a SyntaxError in the caller, same place a zod failure would), plain
// content becomes a single text block.
export function messageFromOpenAiCompatResponse(payload: OpenAiCompatResponse, model: string): Message {
  const choice = payload.choices?.[0];
  const toolCalls = choice?.message?.tool_calls ?? [];

  const content =
    toolCalls.length > 0
      ? toolCalls.map((call, index) => ({
          type: "tool_use" as const,
          id: call.id ?? `tool-call-${index}`,
          name: call.function?.name ?? "",
          input: JSON.parse(call.function?.arguments ?? "{}") as unknown,
        }))
      : [{ type: "text" as const, text: choice?.message?.content ?? "" }];

  return {
    id: payload.id ?? "openai-compat",
    type: "message",
    role: "assistant",
    model: payload.model ?? model,
    content,
    stop_reason: toolCalls.length > 0 ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: usageFromOpenAiCompatResponse(payload.usage),
  } as unknown as Message;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500];

function isRetryableStatus(status: number) {
  return status === 429 || (status >= 500 && status < 600);
}

function retryAfterMs(response: Response, fallbackMs: number) {
  const header = response.headers.get("retry-after");
  if (!header) {
    return fallbackMs;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 10_000);
  }
  return fallbackMs;
}

async function postChatCompletion(input: {
  baseUrl: string;
  apiKey: string;
  body: OpenAiCompatBody;
  timeoutMs: number;
}): Promise<OpenAiCompatResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
    let response: Response;
    try {
      response = await fetch(`${input.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.body),
        signal: AbortSignal.timeout(input.timeoutMs),
      });
    } catch (error) {
      lastError = error;
      if (isLastAttempt) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt] ?? 1500));
      continue;
    }

    if (response.ok) {
      return (await response.json()) as OpenAiCompatResponse;
    }

    const bodySnippet = (await response.text().catch(() => "")).slice(0, 300);
    if (!isRetryableStatus(response.status) || isLastAttempt) {
      throw new Error(`openai-compat request failed with ${response.status}: ${bodySnippet}`);
    }

    await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response, BACKOFF_MS[attempt] ?? 1500)));
  }

  throw lastError instanceof Error ? lastError : new Error("openai-compat request exhausted retries");
}

export async function createTracedOpenAiCompatMessage(input: {
  label: string;
  params: AnthropicMessageParams;
  resolved: ResolvedLlmModel;
  stage: Parameters<typeof buildLlmCallTrace>[0]["stage"];
  telemetry?: AnthropicTelemetrySink | undefined;
}): Promise<Message> {
  const startedAt = Date.now();

  let payload: OpenAiCompatResponse;
  try {
    const config = providerConfigFor(input.resolved.provider);
    const body = openAiCompatBodyFromAnthropicParams(input.params, input.resolved.model, config.extraBody);
    payload = await postChatCompletion({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      body,
      timeoutMs: config.timeoutMs,
    });
  } catch (error) {
    input.telemetry?.(
      buildLlmCallTrace({
        durationMs: Date.now() - startedAt,
        error,
        label: input.label,
        model: input.resolved.model,
        provider: input.resolved.provider,
        stage: input.stage,
        status: "failed",
      })
    );
    throw error;
  }

  const usage = usageFromOpenAiCompatResponse(payload.usage);
  input.telemetry?.(
    buildLlmCallTrace({
      durationMs: Date.now() - startedAt,
      estimatedCostUsd: estimateLlmCostUsd(input.resolved.provider, input.resolved.model, usage),
      label: input.label,
      model: input.resolved.model,
      provider: input.resolved.provider,
      stage: input.stage,
      status: "ok",
      ...(usage ? { usage } : {}),
    })
  );
  // Tool-argument JSON.parse happens after the ok trace is emitted: the HTTP call succeeded, and
  // a malformed-arguments failure surfaces in the caller exactly like a zod failure on the
  // Anthropic path (no second "failed" trace for the same HTTP call).
  return messageFromOpenAiCompatResponse(payload, input.resolved.model);
}
