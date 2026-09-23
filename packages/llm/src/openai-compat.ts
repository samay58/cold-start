import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { isRetryableHttpStatus, retryAfterMs } from "@cold-start/core";
import { buildLlmCallTrace, type AnthropicTelemetrySink, type AnthropicUsage } from "./call-trace";
import { providerConfigFor, quirksForModel, type LlmRequestOptions, type ResolvedLlmModel } from "./llm-provider";
import { estimateLlmCostUsd } from "./pricing";
import { OpenAiCompatHttpError } from "./openai-compat-error";

type AnthropicMessageParams = Parameters<Anthropic["messages"]["create"]>[0];

type OpenAiCompatBody = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  stream: false;
  tools?: Array<{ type: "function"; function: { name: string; description?: string; parameters: unknown } }>;
  tool_choice?: "auto" | "required" | { type: "function"; function: { name: string } };
  [key: string]: unknown;
};

type OpenAiCompatResponse = {
  id?: string;
  model?: string;
  provider?: string;
  error?: { code?: number | string; message?: string; metadata?: { provider_name?: string } };
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
    // OpenAI/OpenRouter convention: prompt_tokens is the TOTAL prompt size including cached
    // tokens, and cached_tokens is the subset of it served from cache.
    prompt_tokens_details?: { cached_tokens?: number };
    // OpenRouter usage accounting (requested via providerDefaults.openrouter.extraBody): the
    // actual billed USD for this call, present only when usage.include was requested and honored.
    cost?: number;
    estimated_cost?: number;
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
  const quirks = quirksForModel(model);
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
    // ceiling at 8192 so structured output is not cut off over pennies. Reasoning-mandatory
    // models (quirks.minMaxTokens) need a higher floor: their reasoning tokens count against
    // max_tokens and can exceed 10k on trivial prompts, so 8192 truncates before any structured
    // output lands. The field stays named max_tokens, not max_completion_tokens: OpenRouter
    // normalizes the field name per upstream provider itself.
    body.max_tokens = Math.max(params.max_tokens, quirks.minMaxTokens ?? 8192);
  }
  if (params.temperature !== undefined && !quirks.omitSamplingParams) {
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
    // Thinking-locked models reject naming the function; "required" forces a tool call and the
    // request always carries exactly one tool, so the same function gets called either way.
    body.tool_choice = quirks.forceToolChoiceRequired
      ? "required"
      : { type: "function", function: { name: params.tool_choice.name } };
  } else if (params.tool_choice?.type === "auto") {
    body.tool_choice = "auto";
  }

  return { ...body, ...extraBody };
}

export function usageFromOpenAiCompatResponse(usage: OpenAiCompatResponse["usage"]): AnthropicUsage | undefined {
  if (!usage) {
    return undefined;
  }

  // DeepSeek's cache_hit/cache_miss fields take precedence when present (prompt_cache_miss_tokens
  // already IS the non-cached input count, unlike prompt_tokens elsewhere). Otherwise fall back to
  // OpenAI/OpenRouter convention, where prompt_tokens is the TOTAL including cached tokens and
  // prompt_tokens_details.cached_tokens is the subset served from cache.
  if (usage.prompt_cache_hit_tokens !== undefined || usage.prompt_cache_miss_tokens !== undefined) {
    const cacheHit = usage.prompt_cache_hit_tokens;
    const inputTokens = usage.prompt_cache_miss_tokens ?? usage.prompt_tokens;
    return {
      ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
      ...(cacheHit !== undefined ? { cache_read_input_tokens: cacheHit } : {}),
      ...(usage.completion_tokens !== undefined ? { output_tokens: usage.completion_tokens } : {}),
    };
  }

  const cached = usage.prompt_tokens_details?.cached_tokens;
  const inputTokens = usage.prompt_tokens !== undefined ? usage.prompt_tokens - (cached ?? 0) : undefined;
  return {
    ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
    ...(cached !== undefined ? { cache_read_input_tokens: cached } : {}),
    ...(usage.completion_tokens !== undefined ? { output_tokens: usage.completion_tokens } : {}),
  };
}

// Extract one complete object when a provider appends prose after otherwise valid tool arguments.
// Incomplete or internally invalid JSON still reaches JSON.parse and fails normally.
function parseToolArguments(argumentsText: string | undefined): unknown {
  const raw = argumentsText ?? "{}";
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const source = raw.trimStart();
    if (!source.startsWith("{")) {
      throw error;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          return JSON.parse(source.slice(0, index + 1)) as unknown;
        }
      }
    }

    throw error;
  }
}

// Maps the OpenAI-compat choice back to the Anthropic Message content shape the stage parsers
// read: tool_calls become tool_use blocks, while plain content becomes a single text block.
export function messageFromOpenAiCompatResponse(payload: OpenAiCompatResponse, model: string): Message {
  const choice = payload.choices?.[0];
  const toolCalls = choice?.message?.tool_calls ?? [];

  const content =
    toolCalls.length > 0
      ? toolCalls.map((call, index) => ({
          type: "tool_use" as const,
          id: call.id ?? `tool-call-${index}`,
          name: call.function?.name ?? "",
          input: parseToolArguments(call.function?.arguments),
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

function responseErrorStatus(code: number | string | undefined, httpStatus: number): number {
  if (typeof code === "number") return code;
  if (code === "rate_limit_exceeded" || code === "rate_limit") return 429;
  if (code === "engine_overloaded" || code === "server_error") return 503;
  return httpStatus;
}

function reportedCostUsd(usage: OpenAiCompatResponse["usage"]): number | undefined {
  const cost = usage?.cost ?? usage?.estimated_cost;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : undefined;
}

async function readResponseTextWithAbort(input: {
  response: Response;
  signal: AbortSignal;
}): Promise<string> {
  input.signal.throwIfAborted();
  if (!input.response.body) {
    const response = input.response as Response & { json?: () => Promise<unknown> };
    const read = typeof response.text === "function"
      ? response.text()
      : response.json
        ? response.json().then((value) => JSON.stringify(value))
        : Promise.reject(new TypeError("provider response has no readable body"));
    let rejectAbort: ((reason: unknown) => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort?.(input.signal.reason);
    input.signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await Promise.race([read, aborted]);
    } finally {
      input.signal.removeEventListener("abort", onAbort);
    }
  }
  const reader = input.response.body.getReader();
  const onAbort = () => {
    void reader.cancel(input.signal.reason).catch(() => undefined);
  };
  input.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      input.signal.throwIfAborted();
      const chunk = await reader.read();
      input.signal.throwIfAborted();
      if (chunk.done) return text + decoder.decode();
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    input.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

async function postChatCompletion(input: {
  baseUrl: string;
  apiKey: string;
  body: OpenAiCompatBody;
  timeoutMs: number;
  requestOptions?: LlmRequestOptions | undefined;
}): Promise<{ payload: OpenAiCompatResponse; retryCount: number }> {
  let lastError: unknown = null;
  const attempts = input.requestOptions ? input.requestOptions.maxRetries + 1 : MAX_ATTEMPTS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    input.requestOptions?.signal.throwIfAborted();
    const isLastAttempt = attempt === attempts - 1;
    const attemptSignal = input.requestOptions
      ? AbortSignal.any([
        input.requestOptions.signal,
        AbortSignal.timeout(Math.min(input.timeoutMs, input.requestOptions.timeout))
      ])
      : AbortSignal.timeout(input.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${input.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.body),
        signal: attemptSignal,
      });
    } catch (error) {
      lastError = error;
      if (isLastAttempt || input.requestOptions?.signal.aborted) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt] ?? 1500));
      continue;
    }

    let payload: OpenAiCompatResponse | undefined;
    let bodySnippet: string;
    if (response.ok) {
      const responseText = await readResponseTextWithAbort({ response, signal: attemptSignal });
      payload = JSON.parse(responseText) as OpenAiCompatResponse;
      if (!payload?.error) return { payload, retryCount: attempt };
      bodySnippet = JSON.stringify(payload.error);
    } else {
      bodySnippet = await readResponseTextWithAbort({ response, signal: attemptSignal }).catch((error) => {
        if (attemptSignal.aborted) throw error;
        return "";
      });
      try { payload = JSON.parse(bodySnippet) as OpenAiCompatResponse; } catch { /* Non-JSON provider error. */ }
    }
    const status = response.ok ? responseErrorStatus(payload?.error?.code, response.status) : response.status;
    const responseId = payload?.id ?? response.headers.get("x-request-id") ?? undefined;
    const servingProvider = payload?.provider ?? payload?.error?.metadata?.provider_name;
    const estimatedCostUsd = reportedCostUsd(payload?.usage);
    const usage = usageFromOpenAiCompatResponse(payload?.usage);
    const error = new OpenAiCompatHttpError({
      status,
      message: `openai-compat request failed with ${status}: ${bodySnippet.split(input.apiKey).join("[redacted]").slice(0, 300)}`,
      ...(responseId ? { responseId } : {}),
      ...(payload?.model ? { responseModel: payload.model } : {}),
      ...(servingProvider ? { servingProvider } : {}),
      ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
      ...(usage ? { usage } : {})
    });
    if (!isRetryableHttpStatus(status) || isLastAttempt || input.requestOptions?.signal.aborted) throw error;
    lastError = error;

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
  requestOptions?: LlmRequestOptions | undefined;
}): Promise<Message> {
  const startedAt = Date.now();

  let payload: OpenAiCompatResponse;
  let retryCount = 0;
  try {
    const config = providerConfigFor(input.resolved.provider, { model: input.resolved.model, stage: input.stage, ...(input.requestOptions?.excludedProviders ? { excludedProviders: input.requestOptions.excludedProviders } : {}) });
    const body = openAiCompatBodyFromAnthropicParams(input.params, input.resolved.model, config.extraBody);
    const result = await postChatCompletion({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      body,
      timeoutMs: config.timeoutMs,
      requestOptions: input.requestOptions,
    });
    payload = result.payload;
    retryCount = result.retryCount;
  } catch (error) {
    const details = error as { responseId?: unknown; responseModel?: unknown; servingProvider?: unknown; estimatedCostUsd?: number; usage?: AnthropicUsage } | null;
    input.telemetry?.(
      buildLlmCallTrace({
        durationMs: Date.now() - startedAt,
        error,
        label: input.label,
        model: input.resolved.model,
        provider: input.resolved.provider,
        stage: input.stage,
        status: "failed",
        responseId: typeof details?.responseId === "string" ? details.responseId : undefined,
        responseModel: typeof details?.responseModel === "string" ? details.responseModel : undefined,
        estimatedCostUsd: details?.estimatedCostUsd,
        ...(details?.usage ? { usage: details.usage } : {}),
        servingProvider: typeof details?.servingProvider === "string" ? details.servingProvider : undefined,
      })
    );
    throw error;
  }

  const usage = usageFromOpenAiCompatResponse(payload.usage);
  // Prefer the provider's own billed cost when it reports one (OpenRouter usage accounting, via
  // providerDefaults.openrouter.extraBody usage.include). Ground truth beats the static per-model
  // estimate table in pricing.ts, and this applies to any provider that starts reporting cost,
  // not only OpenRouter.
  const estimatedCostUsd = reportedCostUsd(payload.usage)
    ?? estimateLlmCostUsd(input.resolved.provider, input.resolved.model, usage);
  input.telemetry?.(
    buildLlmCallTrace({
      durationMs: Date.now() - startedAt,
      estimatedCostUsd,
      label: input.label,
      model: input.resolved.model,
      provider: input.resolved.provider,
      retryCount,
      responseId: typeof payload.id === "string" ? payload.id : undefined,
      responseModel: typeof payload.model === "string" ? payload.model : undefined,
      servingProvider: typeof payload.provider === "string" ? payload.provider : undefined,
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
