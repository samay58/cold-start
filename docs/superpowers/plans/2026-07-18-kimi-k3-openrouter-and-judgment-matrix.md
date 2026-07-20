# Kimi K3 via OpenRouter and Judgment-Stage Provider Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Kimi K3 into Cold Start's LLM stack through OpenRouter only, and extend the provider-matrix eval harness to score the two judgment stages (synthesis, research_section) so K3 and future judgment-stage candidates can be compared on quality, not just extraction fidelity.

**Architecture:** Packet 1 teaches the existing provider-routing chokepoint in `packages/llm` (`createTracedAnthropicMessage` dispatching to `createTracedOpenAiCompatMessage` for any provider-prefixed model string) about OpenRouter's request quirks (no `temperature`/`top_p`, a reasoning-inflated `max_tokens` floor) and its usage-accounting response shape (`usage.cost`, `usage.prompt_tokens_details.cached_tokens`), reusing the exact dispatch path every other non-Anthropic provider already goes through. Packet 2 extends `eval/provider-matrix/run-matrix.ts` past its three extraction/verify stages into `synthesis` (a paired `synthesizeCard` + `verifySynthesis` judge replay against a fixed judge model) and `research_section` (a `synthesizeResearchSection` replay over evidence mirrored offline from the production Inngest worker), scored by two new pure functions in `score.mjs` and rendered blind, before the model identities are revealed, in a `side-by-side.md`. Packet 3 documents the smoke test, fixture refresh, and full comparison run as commands with expected output, not code.

**Tech Stack:** TypeScript (`packages/llm`, `eval/provider-matrix/run-matrix.ts`), plain dependency-free JS (`score.mjs` files, `node --test`), Vitest (`packages/llm/tests`), OpenRouter's OpenAI-compatible `chat/completions` endpoint.

## Context

Kimi K3 (Moonshot AI, released 2026-07-16) is a synthesis/research-section candidate, wired through OpenRouter only; the moonshot-direct path was explicitly rejected, so `providerDefaults` gets no `moonshot` entry. Model string: `openrouter/moonshotai/kimi-k3`. Pricing: $3/M input, $15/M output, $0.30/M cache-read (Claude Sonnet price parity). K3's reasoning is always on (only effort "max", no disable parameter); its documented request schema omits `temperature`/`top_p` entirely (K2.x precedent returns `invalid_request_error` on unsupported sampling params sent to it). Reasoning tokens count toward the completion budget and can exceed 10k tokens on trivial prompts, so the shared 8192 `max_tokens` floor truncates K3 mid-reasoning before any structured output lands. OpenRouter normalizes usage to OpenAI convention: `usage.prompt_tokens` is the TOTAL prompt size including cached tokens, `usage.prompt_tokens_details.cached_tokens` is the cached subset, `usage.completion_tokens` is output; requesting `usage: {include: true}` on the request body additionally returns `usage.cost`, the actual billed USD for that call. Today's provider-matrix eval (`eval/provider-matrix/run-matrix.ts`) only replays `extract_full`, `extract_block`, and `verify`; it has no harness for the two judgment stages (`synthesis`, `research_section`), which this plan adds, closing the report's standing false-keep gap for `verify` along the way and creating the harness a planned DeepSeek v4-pro `research_section` test also needs.

## Global Constraints

- OpenRouter is the only new wiring path for Kimi K3; no `moonshot` entry is added to `providerDefaults`.
- The eval-matrix model string for K3 is exactly `openrouter/moonshotai/kimi-k3`.
- Zero behavior change for existing providers when no new env is set: DeepSeek request bodies stay byte-identical (temperature kept, 8192 floor, thinking disabled), and the Anthropic path is untouched.
- `npm run check` green is the done bar for each packet; never pipe `check` through `tail` or `head` (it eats the exit code, a known repo gotcha).
- `eval/provider-matrix/score.mjs` and `eval/investor-lens/score.mjs` stay dependency-free plain JS runnable under `node --test`.
- No em-dashes anywhere in this document or in any code comment it specifies; no "delve"; no "furthermore"; prose headers, not bureaucratic numbering.
- One commit per task, imperative mood matching repo history, each ending with the line `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `OPENROUTER_API_KEY` lives only in `.env.local`; never commit it.

---

## Files Touched

All changes are edits to existing files; this plan creates no new files.

- `packages/llm/src/llm-provider.ts`: add the `openrouter` entry to `providerDefaults`, add `ModelQuirks`/`quirksForModel`.
- `packages/llm/tests/llm-provider.test.ts`: cover the above.
- `packages/llm/src/openai-compat.ts`: apply quirks to the request body, map OpenRouter's usage shape, prefer `usage.cost` for cost telemetry.
- `packages/llm/tests/openai-compat.test.ts`: cover the above.
- `packages/llm/src/pricing.ts`: add the `openrouter`/`kimi-k3` pricing row.
- `packages/llm/tests/pricing.test.ts`: cover the above.
- `eval/investor-lens/score.mjs`: export `GENERIC_PHRASES`, `genericPhraseCount`, `hasConcreteTension`, `hasTestableQuestion` for reuse (zero behavior change).
- `eval/provider-matrix/score.mjs`: add `scoreSynthesis`, `scoreResearchSection`.
- `eval/provider-matrix/score.test.mjs`: cover the above.
- `eval/provider-matrix/run-matrix.ts`: add the `synthesis` and `research_section` stages, the `--judge`/`--sections` flags, the blind `side-by-side.md`/`answer-key.json` writer, and the judgment-stage report table.
- `CLAUDE.md` and `AGENTS.md`: document the OpenRouter provider entry, `quirksForModel`, cost-telemetry preference, and the matrix's judgment stages, kept in sync per this repo's convention.

---

## Packet 1: OpenRouter Provider, Model Quirks, Usage, and Pricing (packages/llm)

This packet teaches `packages/llm` about OpenRouter and Kimi K3's request/response quirks. Every change routes through the existing `createTracedAnthropicMessage` to `createTracedOpenAiCompatMessage` dispatch; no call site outside `packages/llm` changes.

### Task 1: OpenRouter provider defaults and model quirks

**Files:**
- Modify: `packages/llm/src/llm-provider.ts` (around line 72, the `providerDefaults` block)
- Test: `packages/llm/tests/llm-provider.test.ts`

**Interfaces:**
- Produces: `export type ModelQuirks = { omitSamplingParams?: boolean; minMaxTokens?: number }` and `export function quirksForModel(model: string): ModelQuirks`, both consumed by Task 2. `providerDefaults.openrouter` consumed by `providerConfigFor("openrouter")`, used by Task 2's `createTracedOpenAiCompatMessage` path (already wired, no change needed there for provider resolution).

- [ ] **Step 1: Write the failing tests**

In `packages/llm/tests/llm-provider.test.ts`, update the import line:

Replace:
```ts
import { modelForStage, parseModelString, providerConfigFor, withSchemaRetry } from "../src/index";
```

With:
```ts
import { modelForStage, parseModelString, providerConfigFor, quirksForModel, withSchemaRetry } from "../src/index";
```

Update the `stageEnvNames` array so the new env vars get the same save/restore treatment as `DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`:

Replace:
```ts
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "LLM_PROVIDER_CUSTOMHOST_API_KEY",
  "LLM_PROVIDER_CUSTOMHOST_BASE_URL",
];
```

With:
```ts
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "LLM_PROVIDER_CUSTOMHOST_API_KEY",
  "LLM_PROVIDER_CUSTOMHOST_BASE_URL",
];
```

Add a new `describe("quirksForModel", ...)` block right after `describe("parseModelString", ...)` closes and before `describe("modelForStage", ...)` opens:

Replace:
```ts
  it("lowercases the provider segment", () => {
    expect(parseModelString("DeepSeek/deepseek-v4-flash").provider).toBe("deepseek");
  });
});

describe("modelForStage", () => {
```

With:
```ts
  it("lowercases the provider segment", () => {
    expect(parseModelString("DeepSeek/deepseek-v4-flash").provider).toBe("deepseek");
  });
});

describe("quirksForModel", () => {
  it("flags kimi-k3 as omitting sampling params with a raised max_tokens floor", () => {
    expect(quirksForModel("moonshotai/kimi-k3")).toEqual({ omitSamplingParams: true, minMaxTokens: 32768 });
  });

  it("matches kimi-k3 case-insensitively anywhere in the model string", () => {
    expect(quirksForModel("moonshotai/Kimi-K3")).toEqual({ omitSamplingParams: true, minMaxTokens: 32768 });
  });

  it("returns no quirks for deepseek and anthropic models", () => {
    expect(quirksForModel("deepseek-v4-flash")).toEqual({});
    expect(quirksForModel("claude-sonnet-4-6")).toEqual({});
  });
});

describe("modelForStage", () => {
```

Add an OpenRouter case inside the existing `describe("providerConfigFor", ...)` block:

Replace:
```ts
describe("providerConfigFor", () => {
  it("uses deepseek defaults including disabled thinking", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const config = providerConfigFor("deepseek");
    expect(config.baseUrl).toBe("https://api.deepseek.com");
    expect(config.extraBody).toEqual({ thinking: { type: "disabled" } });
  });
```

With:
```ts
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -w @cold-start/llm -- llm-provider`
Expected: FAIL. `quirksForModel` is not exported from `../src/index` (import error), and the `providerConfigFor("openrouter")` test throws `OPENROUTER_API_KEY is required to call provider "openrouter"` mapped to the generic unknown-provider env scheme rather than resolving `https://openrouter.ai/api/v1`.

- [ ] **Step 3: Implement `quirksForModel` and the `openrouter` provider defaults**

In `packages/llm/src/llm-provider.ts`, replace the `providerDefaults` block:

Replace:
```ts
const providerDefaults: Record<string, ProviderDefaults> = {
  deepseek: {
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com",
    // DeepSeek v4 models default to thinking-enabled, and thinking mode rejects the
    // temperature parameter every flipped stage sends. Disable unless overridden.
    extraBody: { thinking: { type: "disabled" } },
  },
  fireworks: {
    apiKeyEnv: "FIREWORKS_API_KEY",
    baseUrlEnv: "FIREWORKS_BASE_URL",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
  },
  together: {
    apiKeyEnv: "TOGETHER_API_KEY",
    baseUrlEnv: "TOGETHER_BASE_URL",
    defaultBaseUrl: "https://api.together.xyz/v1",
  },
};
```

With:
```ts
const providerDefaults: Record<string, ProviderDefaults> = {
  deepseek: {
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com",
    // DeepSeek v4 models default to thinking-enabled, and thinking mode rejects the
    // temperature parameter every flipped stage sends. Disable unless overridden.
    extraBody: { thinking: { type: "disabled" } },
  },
  fireworks: {
    apiKeyEnv: "FIREWORKS_API_KEY",
    baseUrlEnv: "FIREWORKS_BASE_URL",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
  },
  together: {
    apiKeyEnv: "TOGETHER_API_KEY",
    baseUrlEnv: "TOGETHER_BASE_URL",
    defaultBaseUrl: "https://api.together.xyz/v1",
  },
  openrouter: {
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrlEnv: "OPENROUTER_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    // OpenRouter usage accounting: requesting it returns usage.cost (the actual billed USD) on
    // every response. createTracedOpenAiCompatMessage prefers that reported cost over the
    // pricing.ts estimate table whenever it is present, so this is worth the extra response field
    // on every OpenRouter call, not only Kimi K3.
    extraBody: { usage: { include: true } },
  },
};

export type ModelQuirks = {
  // The model's request schema rejects temperature/top_p outright. K3's documented schema omits
  // them; K2.x precedent returns invalid_request_error on unsupported sampling params. Strip them
  // from the request rather than let the provider 400 on every call.
  omitSamplingParams?: boolean;
  // Raise the max_tokens floor above the shared 8192 default. Reasoning-mandatory models (K3 has
  // no disable parameter, only effort "max") count reasoning tokens against the completion
  // budget, and reasoning can exceed 10k tokens on trivial prompts; 8192 truncates mid-reasoning
  // before any structured output is emitted.
  minMaxTokens?: number;
};

const modelQuirksTable: Array<{ modelIncludes: string; quirks: ModelQuirks }> = [
  { modelIncludes: "kimi-k3", quirks: { omitSamplingParams: true, minMaxTokens: 32768 } },
];

export function quirksForModel(model: string): ModelQuirks {
  const normalized = model.toLowerCase();
  const row = modelQuirksTable.find((entry) => normalized.includes(entry.modelIncludes));
  return row?.quirks ?? {};
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -w @cold-start/llm -- llm-provider`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/llm-provider.ts packages/llm/tests/llm-provider.test.ts
git commit -m "$(cat <<'EOF'
Add OpenRouter provider defaults and model quirks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Apply model quirks to the OpenAI-compat request body

**Files:**
- Modify: `packages/llm/src/openai-compat.ts` (the `openAiCompatBodyFromAnthropicParams` function, around line 71)
- Test: `packages/llm/tests/openai-compat.test.ts`

**Interfaces:**
- Consumes: `quirksForModel(model: string): ModelQuirks` from Task 1.
- Produces: unchanged signature `openAiCompatBodyFromAnthropicParams(params, model, extraBody?)`; behavior now omits `temperature` and raises the `max_tokens` floor when `quirksForModel(model)` says so. Consumed unchanged by `createTracedOpenAiCompatMessage` (Task 4 touches that function next).

- [ ] **Step 1: Write the failing tests**

In `packages/llm/tests/openai-compat.test.ts`, add two tests at the end of the `describe("openAiCompatBodyFromAnthropicParams", ...)` block:

Replace:
```ts
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
```

With:
```ts
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
});
```

- [ ] **Step 2: Run the tests and confirm the new ones fail**

Run: `npm test -w @cold-start/llm -- openai-compat`
Expected: FAIL on the new "omits temperature and raises the max_tokens floor for kimi-k3" test. `body.max_tokens` is `8192`, not `32768`, because nothing floors it past the shared default yet.

- [ ] **Step 3: Wire `quirksForModel` into the body builder**

In `packages/llm/src/openai-compat.ts`, update the import line:

Replace:
```ts
import { providerConfigFor, type ResolvedLlmModel } from "./llm-provider";
```

With:
```ts
import { providerConfigFor, quirksForModel, type ResolvedLlmModel } from "./llm-provider";
```

Replace the body-builder function:

Replace:
```ts
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
```

With:
```ts
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -w @cold-start/llm -- openai-compat`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/openai-compat.ts packages/llm/tests/openai-compat.test.ts
git commit -m "$(cat <<'EOF'
Apply model quirks to the OpenAI-compat request body

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

### Task 3: Map OpenRouter usage accounting into traced token counts

**Files:**
- Modify: `packages/llm/src/openai-compat.ts` (`OpenAiCompatResponse["usage"]` type and `usageFromOpenAiCompatResponse`, around lines 20-39 and 122-134)
- Test: `packages/llm/tests/openai-compat.test.ts`

**Interfaces:**
- Produces: `usageFromOpenAiCompatResponse` now handles both the DeepSeek `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens` shape (unchanged, takes precedence) and the OpenAI/OpenRouter `prompt_tokens_details.cached_tokens` shape (new). Consumed by `createTracedOpenAiCompatMessage` (unchanged call site, Task 4 changes an adjacent line in the same function).

- [ ] **Step 1: Write the failing tests**

In `packages/llm/tests/openai-compat.test.ts`, add two tests at the end of `describe("usageFromOpenAiCompatResponse", ...)`:

Replace:
```ts
  it("falls back to prompt_tokens when cache fields are absent", () => {
    expect(usageFromOpenAiCompatResponse({ prompt_tokens: 5_000, completion_tokens: 100 })).toEqual({
      input_tokens: 5_000,
      output_tokens: 100,
    });
  });
});
```

With:
```ts
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
```

- [ ] **Step 2: Run the tests and confirm the new ones fail**

Run: `npm test -w @cold-start/llm -- openai-compat`
Expected: FAIL on the "maps OpenRouter/OpenAI convention usage" test. Today's code computes `inputTokens = usage.prompt_cache_miss_tokens ?? usage.prompt_tokens`, so with only `prompt_tokens`/`prompt_tokens_details` set, it returns `input_tokens: 1000` (the full total, cache not subtracted) instead of `600`, and drops `cache_read_input_tokens` entirely.

- [ ] **Step 3: Extend the usage type and mapping function**

In `packages/llm/src/openai-compat.ts`, extend the response usage type:

Replace:
```ts
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
};
```

With:
```ts
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
  };
};
```

Replace the mapping function:

Replace:
```ts
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
```

With:
```ts
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -w @cold-start/llm -- openai-compat`
Expected: PASS, all tests in the file green, including the pre-existing "falls back to prompt_tokens when cache fields are absent" test (that case now falls through to the new branch: `cached` is `undefined`, so `inputTokens = 5000 - 0 = 5000`, matching the old result exactly).

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/openai-compat.ts packages/llm/tests/openai-compat.test.ts
git commit -m "$(cat <<'EOF'
Map OpenRouter usage accounting into traced token counts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

### Task 4: Prefer OpenRouter's billed cost over the pricing estimate

**Files:**
- Modify: `packages/llm/src/openai-compat.ts` (`createTracedOpenAiCompatMessage`, around line 264)
- Test: `packages/llm/tests/openai-compat.test.ts`

**Interfaces:**
- Consumes: `payload.usage?.cost` (Task 3's type extension) and the existing `estimateLlmCostUsd` fallback.
- Produces: `createTracedOpenAiCompatMessage`'s emitted `GenerationLlmCallTrace.estimatedCostUsd` now equals the provider's billed cost when reported, otherwise the same pricing-table estimate as before. No signature change; nothing downstream needs to change.

- [ ] **Step 1: Write the failing test**

In `packages/llm/tests/openai-compat.test.ts`, add a new test inside `describe("createTracedOpenAiCompatMessage", ...)`, right after the first `it` block:

Replace:
```ts
    // 800 in * 0.14/M + 200 cache * 0.0028/M + 50 out * 0.28/M
    expect(traces[0]?.estimatedCostUsd).toBeCloseTo(0.000127, 6);
  });

  it("retries 429 and 5xx then succeeds", async () => {
```

With:
```ts
    // 800 in * 0.14/M + 200 cache * 0.0028/M + 50 out * 0.28/M
    expect(traces[0]?.estimatedCostUsd).toBeCloseTo(0.000127, 6);
  });

  it("prefers the provider's billed usage.cost over the pricing-table estimate when present", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...okPayload, usage: { ...okPayload.usage, cost: 0.0123 } }));
    const traces: GenerationLlmCallTrace[] = [];

    await createTracedOpenAiCompatMessage({ ...callInput(), telemetry: (call) => traces.push(call) });

    expect(traces).toHaveLength(1);
    expect(traces[0]?.estimatedCostUsd).toBe(0.0123);
  });

  it("retries 429 and 5xx then succeeds", async () => {
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -w @cold-start/llm -- openai-compat`
Expected: FAIL. `traces[0]?.estimatedCostUsd` is the pricing-table estimate (`0.000127`-scale number), not `0.0123`, because `payload.usage.cost` is not read yet.

- [ ] **Step 3: Prefer `payload.usage.cost` when present**

In `packages/llm/src/openai-compat.ts`, inside `createTracedOpenAiCompatMessage`:

Replace:
```ts
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
```

With:
```ts
  const usage = usageFromOpenAiCompatResponse(payload.usage);
  // Prefer the provider's own billed cost when it reports one (OpenRouter usage accounting, via
  // providerDefaults.openrouter.extraBody usage.include). Ground truth beats the static per-model
  // estimate table in pricing.ts, and this applies to any provider that starts reporting cost,
  // not only OpenRouter.
  const estimatedCostUsd = payload.usage?.cost ?? estimateLlmCostUsd(input.resolved.provider, input.resolved.model, usage);
  input.telemetry?.(
    buildLlmCallTrace({
      durationMs: Date.now() - startedAt,
      estimatedCostUsd,
      label: input.label,
      model: input.resolved.model,
      provider: input.resolved.provider,
      stage: input.stage,
      status: "ok",
      ...(usage ? { usage } : {}),
    })
  );
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -w @cold-start/llm -- openai-compat`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/openai-compat.ts packages/llm/tests/openai-compat.test.ts
git commit -m "$(cat <<'EOF'
Prefer OpenRouter's billed cost over the pricing estimate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

### Task 5: Price Kimi K3 in the OpenRouter pricing table, then verify Packet 1

**Files:**
- Modify: `packages/llm/src/pricing.ts` (`pricingTable`, around line 20)
- Test: `packages/llm/tests/pricing.test.ts`

**Interfaces:**
- Produces: `pricingFor("openrouter", "moonshotai/kimi-k3")` resolves `{ input: 3, cacheRead: 0.3, output: 15 }`, the fallback `estimateLlmCostUsd` uses when a response carries no `usage.cost` (Task 4 already prefers `usage.cost` when present; this row only matters when it is absent).

- [ ] **Step 1: Write the failing test**

In `packages/llm/tests/pricing.test.ts`:

Replace:
```ts
describe("pricingFor", () => {
  it("matches deepseek current and deprecated model names to the same rates", () => {
    expect(pricingFor("deepseek", "deepseek-v4-flash")).toEqual({ input: 0.14, cacheRead: 0.0028, output: 0.28 });
    expect(pricingFor("deepseek", "deepseek-chat")).toEqual({ input: 0.14, cacheRead: 0.0028, output: 0.28 });
    expect(pricingFor("deepseek", "deepseek-v4-pro")?.output).toBe(0.87);
  });

  it("returns null for unknown provider or model", () => {
    expect(pricingFor("together", "deepseek-v4-flash")).toBeNull();
    expect(pricingFor("deepseek", "some-future-model")).toBeNull();
  });
});
```

With:
```ts
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -w @cold-start/llm -- pricing`
Expected: FAIL. `pricingFor("openrouter", "moonshotai/kimi-k3")` returns `null`.

- [ ] **Step 3: Add the pricing row**

In `packages/llm/src/pricing.ts`:

Replace:
```ts
const pricingTable: Array<{ provider: string; modelIncludes: string; pricing: TokenPricing }> = [
  // deepseek-v4-flash is the current name; deepseek-chat is the deprecated alias (same model,
  // same price) until 2026-07-24. The flash row must come before the pro row only if substrings
  // could collide; they cannot, so order is alphabetical.
  { provider: "deepseek", modelIncludes: "deepseek-v4-flash", pricing: { input: 0.14, cacheRead: 0.0028, output: 0.28 } },
  { provider: "deepseek", modelIncludes: "deepseek-chat", pricing: { input: 0.14, cacheRead: 0.0028, output: 0.28 } },
  { provider: "deepseek", modelIncludes: "deepseek-v4-pro", pricing: { input: 0.435, cacheRead: 0.003625, output: 0.87 } },
  { provider: "deepseek", modelIncludes: "deepseek-reasoner", pricing: { input: 0.435, cacheRead: 0.003625, output: 0.87 } },
];
```

With:
```ts
const pricingTable: Array<{ provider: string; modelIncludes: string; pricing: TokenPricing }> = [
  // deepseek-v4-flash is the current name; deepseek-chat is the deprecated alias (same model,
  // same price) until 2026-07-24. The flash row must come before the pro row only if substrings
  // could collide; they cannot, so order is alphabetical.
  { provider: "deepseek", modelIncludes: "deepseek-v4-flash", pricing: { input: 0.14, cacheRead: 0.0028, output: 0.28 } },
  { provider: "deepseek", modelIncludes: "deepseek-chat", pricing: { input: 0.14, cacheRead: 0.0028, output: 0.28 } },
  { provider: "deepseek", modelIncludes: "deepseek-v4-pro", pricing: { input: 0.435, cacheRead: 0.003625, output: 0.87 } },
  { provider: "deepseek", modelIncludes: "deepseek-reasoner", pricing: { input: 0.435, cacheRead: 0.003625, output: 0.87 } },
  // Kimi K3 (Moonshot AI, released 2026-07-16), OpenRouter only. Rates verified 2026-07-16
  // against platform.kimi.ai/docs/pricing/chat-k3 and openrouter.ai/moonshotai/kimi-k3. This row
  // is a fallback only: createTracedOpenAiCompatMessage prefers the response's own usage.cost
  // (OpenRouter usage accounting) whenever present, so this row prices a call only when that
  // field is absent.
  { provider: "openrouter", modelIncludes: "kimi-k3", pricing: { input: 3, cacheRead: 0.3, output: 15 } },
];
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm test -w @cold-start/llm -- pricing`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Verify Packet 1 end to end**

Run: `npm run check`
Expected: exit 0. Run it directly, not piped through `tail` or `head` (a known repo gotcha that eats the exit code). This chains lint, typecheck, test, build, the Firefox build, `eval:golden --dry-run --limit 12`, knip, secrets:check, and audit:deps; all of Packet 1's changes are inside `packages/llm`, a workspace package, so this is the first point they get full-repo typecheck and lint coverage (the per-file `npm test -w @cold-start/llm` runs in Steps 2/4 only exercised Vitest).

- [ ] **Step 6: Commit**

```bash
git add packages/llm/src/pricing.ts packages/llm/tests/pricing.test.ts
git commit -m "$(cat <<'EOF'
Price Kimi K3 in the OpenRouter pricing table

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Packet 2: Judgment-Stage Replay in the Provider Matrix (eval/)

This packet extends `eval/provider-matrix/run-matrix.ts` with two judgment stages and their scorers, a blind side-by-side read, and a second report table. Every new call goes through the same production stage functions the existing extraction/verify cells already call (`synthesizeCard`, `verifySynthesis`, `synthesizeResearchSection`), so Kimi K3 (or any other provider-routed model) gets the OpenRouter dispatch path from Packet 1 for free; nothing in this packet is K3-specific.

### Task 6: Score synthesis and research-section judgment replays

**Files:**
- Modify: `eval/investor-lens/score.mjs` (export 4 existing declarations, zero behavior change)
- Modify: `eval/provider-matrix/score.mjs` (add `scoreSynthesis`, `scoreResearchSection`)
- Test: `eval/provider-matrix/score.test.mjs`

**Interfaces:**
- Consumes: `genericPhraseCount`, `hasConcreteTension`, `hasTestableQuestion`, `GENERIC_PHRASES` from `eval/investor-lens/score.mjs` (newly exported this task).
- Produces: `scoreSynthesis({ synthesis, verifierResults, cardCitationIds })` returning `{ claimCounts: {bullCase, bearCase, openQuestions}, citationMarkerViolations: string[], verifierSurvivalRate: number | null, genericPhraseCount: number, hasConcreteTension: boolean, hasTestableQuestion: boolean }`, and `scoreResearchSection({ content, evidenceCitationIds })` returning `{ status, itemCount, citationIdViolations: string[], genericPhraseCount, avgItemChars }`. Both consumed by Task 7 (`run-matrix.ts` cell wiring) and Task 9 (report table).

- [ ] **Step 1: Export the four helpers `eval/provider-matrix/score.mjs` needs**

In `eval/investor-lens/score.mjs`, make these four declarations exported (pure addition of the `export` keyword; the functions themselves do not change, so `eval/investor-lens/score.test.mjs` keeps passing unmodified):

Replace:
```js
const GENERIC_PHRASES = [
```

With:
```js
export const GENERIC_PHRASES = [
```

Replace:
```js
function genericPhraseCount(card) {
```

With:
```js
export function genericPhraseCount(card) {
```

Replace:
```js
function hasConcreteTension(card) {
```

With:
```js
export function hasConcreteTension(card) {
```

Replace:
```js
function hasTestableQuestion(card) {
```

With:
```js
export function hasTestableQuestion(card) {
```

- [ ] **Step 2: Write the failing tests**

In `eval/provider-matrix/score.test.mjs`, update the import line:

Replace:
```js
import { aggregate, scoreCitationDiscipline, scoreFillRate, scoreFundingFaithfulness, scoreSignalRedundancy, scoreVerify } from "./score.mjs";
```

With:
```js
import { aggregate, scoreCitationDiscipline, scoreFillRate, scoreFundingFaithfulness, scoreResearchSection, scoreSignalRedundancy, scoreSynthesis, scoreVerify } from "./score.mjs";
```

Append two new `describe` blocks at the end of the file (after the closing `});` of `describe("aggregate", ...)`):

```js

describe("scoreSynthesis", () => {
  const cardCitationIds = ["c1", "c2"];
  const baseSynthesis = () => ({
    whyItMatters: { text: "Acme sells anvils to a captured buyer with budget urgency [c1].", citationIds: ["c1"] },
    bullCase: [{ text: "Named customer proof beats claims [c1].", citationIds: ["c1"] }],
    bearCase: [{ text: "Adoption breaks if the incumbent undercuts price unless retention holds [c2].", citationIds: ["c2"] }],
    openQuestions: [{ question: "Which buyer owns budget for this workflow expansion?", category: "buyer_budget" }],
    marketStructureAndTiming: null
  });

  it("counts claims, finds no marker violations, and computes verifier survival", () => {
    const synthesis = baseSynthesis();
    const score = scoreSynthesis({
      synthesis,
      verifierResults: [
        { claimIndex: 0, text: synthesis.whyItMatters.text, citationIds: ["c1"], status: "supported" },
        { claimIndex: 1, text: synthesis.bullCase[0].text, citationIds: ["c1"], status: "unsupported" }
      ],
      cardCitationIds
    });
    assert.deepEqual(score.claimCounts, { bullCase: 1, bearCase: 1, openQuestions: 1 });
    assert.equal(score.citationMarkerViolations.length, 0);
    assert.equal(score.verifierSurvivalRate, 0.5);
    assert.equal(score.genericPhraseCount, 0);
    assert.equal(score.hasConcreteTension, true);
    assert.equal(score.hasTestableQuestion, true);
  });

  it("flags a citation marker that does not resolve to the card's citations", () => {
    const synthesis = baseSynthesis();
    synthesis.bearCase = [{ text: "Adoption breaks unless retention holds [ghost].", citationIds: ["ghost"] }];
    const score = scoreSynthesis({ synthesis, verifierResults: [], cardCitationIds });
    assert.deepEqual(score.citationMarkerViolations, ["ghost"]);
  });

  it("returns a null survival rate when nothing was judged", () => {
    const score = scoreSynthesis({ synthesis: baseSynthesis(), verifierResults: [], cardCitationIds });
    assert.equal(score.verifierSurvivalRate, null);
  });
});

describe("scoreResearchSection", () => {
  const evidenceCitationIds = ["c1", "c2"];

  it("counts items and flags citation ids outside the section's evidence set", () => {
    const content = {
      status: "available",
      summary: "Acme has named pilot customers with usage evidence.",
      items: [
        { label: "Pilot A", text: "Acme piloted with Globex starting Q1.", citationIds: ["c1"] },
        { label: "Pilot B", text: "Acme piloted with Initech in March.", citationIds: ["ghost"] }
      ],
      confidence: "medium"
    };
    const score = scoreResearchSection({ content, evidenceCitationIds });
    assert.equal(score.status, "available");
    assert.equal(score.itemCount, 2);
    assert.deepEqual(score.citationIdViolations, ["ghost"]);
    assert.equal(score.genericPhraseCount, 0);
    assert.ok(score.avgItemChars > 0);
  });

  it("flags generic phrases in the summary and item text", () => {
    const content = {
      status: "available",
      summary: "This is a massive market with clear enterprise demand.",
      items: [],
      confidence: "low"
    };
    const score = scoreResearchSection({ content, evidenceCitationIds });
    assert.equal(score.genericPhraseCount, 2);
  });

  it("handles an empty section with zero items", () => {
    const score = scoreResearchSection({
      content: { status: "empty", summary: null, items: [], confidence: "low" },
      evidenceCitationIds
    });
    assert.equal(score.itemCount, 0);
    assert.equal(score.avgItemChars, 0);
    assert.equal(score.citationIdViolations.length, 0);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `node --test eval/provider-matrix/score.test.mjs`
Expected: FAIL. `scoreSynthesis` and `scoreResearchSection` are `undefined` (not yet exported from `./score.mjs`), so every new test throws `TypeError: scoreSynthesis is not a function`.

- [ ] **Step 4: Implement `scoreSynthesis` and `scoreResearchSection`**

In `eval/provider-matrix/score.mjs`, add the import at the top, right after the existing `signalClusterStats` import:

Replace:
```js
import { signalClusterStats } from "../../packages/core/src/signal-clusters.mjs";
```

With:
```js
import { signalClusterStats } from "../../packages/core/src/signal-clusters.mjs";
import { genericPhraseCount, hasConcreteTension, hasTestableQuestion, GENERIC_PHRASES } from "../investor-lens/score.mjs";
```

Add the two new scorers right before `export function aggregate(values) {`:

Replace:
```js
export function aggregate(values) {
```

With:
```js
const citationMarkerRegex = /\[([A-Za-z0-9_-]+)\]/g;

function visibleCitationMarkers(text) {
  return Array.from(String(text ?? "").matchAll(citationMarkerRegex), (match) => match[1]);
}

function synthesisClaimTexts(synthesis) {
  const market = synthesis?.marketStructureAndTiming;
  const marketClaims = market
    ? [
        market.buyerBudget,
        market.painSeverity,
        market.adoptionTrigger,
        market.marketStructure,
        market.profitPool,
        market.expansionPath,
        market.timingRisk
      ].filter(Boolean)
    : [];
  return [synthesis?.whyItMatters, ...(synthesis?.bullCase ?? []), ...(synthesis?.bearCase ?? []), ...marketClaims].filter(Boolean);
}

// Paired synthesis+verify replay: synthesis is a FRESH synthesizeCard output (not the production
// card's), verifierResults come from an immediate verifySynthesis judge pass over synthesis's own
// claims. citationMarkerViolations reimplements synthesis.ts's visible-marker regex in plain JS
// so this file stays dependency-free; a violation means the model printed a citation marker whose
// id does not resolve to the card's citations[], the same failure mode citedSynthesisSchema
// guards against at parse time in production.
export function scoreSynthesis({ synthesis, verifierResults, cardCitationIds }) {
  const cardCitationIdSet = new Set(cardCitationIds);
  const citationMarkerViolations = [];
  for (const claim of synthesisClaimTexts(synthesis)) {
    for (const marker of visibleCitationMarkers(claim.text)) {
      if (!cardCitationIdSet.has(marker)) {
        citationMarkerViolations.push(marker);
      }
    }
  }

  const judged = verifierResults.length;
  const supported = verifierResults.filter((result) => result.status === "supported").length;

  return {
    claimCounts: {
      bullCase: synthesis?.bullCase?.length ?? 0,
      bearCase: synthesis?.bearCase?.length ?? 0,
      openQuestions: synthesis?.openQuestions?.length ?? 0
    },
    citationMarkerViolations,
    verifierSurvivalRate: judged > 0 ? Number((supported / judged).toFixed(4)) : null,
    genericPhraseCount: genericPhraseCount({ synthesis }),
    hasConcreteTension: hasConcreteTension({ synthesis }),
    hasTestableQuestion: hasTestableQuestion({ synthesis })
  };
}

function genericPhraseCountInTexts(texts) {
  const haystack = texts
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join("\n");
  return GENERIC_PHRASES.filter((phrase) => haystack.includes(phrase)).length;
}

// evidenceCitationIds is the section's evidence set (every citation id the model was shown), not
// the whole card's citations: a research-section citationId is a violation if it names a source
// the model was never given, even if that source exists somewhere else on the card.
export function scoreResearchSection({ content, evidenceCitationIds }) {
  const evidenceIdSet = new Set(evidenceCitationIds);
  const citationIdViolations = [];
  for (const item of content?.items ?? []) {
    for (const citationId of item.citationIds ?? []) {
      if (!evidenceIdSet.has(citationId)) {
        citationIdViolations.push(citationId);
      }
    }
  }

  const items = content?.items ?? [];
  return {
    status: content?.status ?? "empty",
    itemCount: items.length,
    citationIdViolations,
    genericPhraseCount: genericPhraseCountInTexts([content?.summary, ...items.map((item) => item.text)]),
    avgItemChars: items.length > 0 ? Number((items.reduce((sum, item) => sum + item.text.length, 0) / items.length).toFixed(1)) : 0
  };
}

export function aggregate(values) {
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test eval/provider-matrix/score.test.mjs`
Expected: PASS, all tests in the file green.

Run: `node --test eval/investor-lens/score.test.mjs`
Expected: PASS, unaffected by the new `export` keywords (Step 1 changed visibility only, not behavior).

- [ ] **Step 6: Commit**

```bash
git add eval/investor-lens/score.mjs eval/provider-matrix/score.mjs eval/provider-matrix/score.test.mjs
git commit -m "$(cat <<'EOF'
Score synthesis and research-section judgment replays

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Replay synthesis and research-section stages in the provider matrix

`eval/provider-matrix/run-matrix.ts` has no test file today (it is a `tsx`-run script, not a workspace package; `npm run typecheck` only covers `apps/*`/`packages/*` workspaces, so this file gets no `tsc` gate from `npm run check`). Verification for this task is a syntax check plus `eslint` (both real gates: `npm run lint` does cover `eval/**`), with full behavioral verification deferred to Packet 3's smoke run. This matches how `run-matrix.ts` and `build-bundles.ts` already ship in this repo.

**Files:**
- Modify: `eval/provider-matrix/run-matrix.ts`

**Interfaces:**
- Consumes: `scoreSynthesis`, `scoreResearchSection` (Task 6); `synthesizeCard` from `packages/llm/src/synthesis.ts`; `synthesizeResearchSection`, `RESEARCH_SECTION_DEFINITIONS_BY_ID` from `packages/core`/`packages/llm` (already exist, unmodified by this plan).
- Produces: the `Stage` union gains `"synthesis" | "research_section"`; `CellResult` gains `section?: string`, `judgeCostUsd?: number | null`, `output?: unknown`; a `researchSectionEvidence`/`evidenceForSection` pair per fixture, consumed by Task 8 (side-by-side) and Task 9 (report table) in the same file.

- [ ] **Step 1: Update imports, add the `Stage` union member, the judge-model constant, and extend `CellResult`**

Replace:
```ts
import type Anthropic from "@anthropic-ai/sdk";
import type { GenerationLlmCallTrace, SourcedText } from "@cold-start/core";
import {
  createAnthropicClient,
  extractCompanyBlockClaims,
  extractCompanyClaims,
  fallbackResearchPlan,
  parseModelString,
  verifySynthesis,
  type BlockEnrichmentId,
} from "@cold-start/llm";
import { buildEvidenceLedger } from "@cold-start/pipeline";
import type { ProviderSource } from "@cold-start/providers";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore score.mjs is plain JS shared with the node:test suite
import { aggregate, scoreExtraction, scoreVerify } from "./score.mjs";
import type { ProviderMatrixFixture } from "./build-bundles";
```

With:
```ts
import type Anthropic from "@anthropic-ai/sdk";
import {
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  type GenerationLlmCallTrace,
  type ResearchSectionContent,
  type ResearchSectionId,
  type SourcedText,
} from "@cold-start/core";
import {
  createAnthropicClient,
  extractCompanyBlockClaims,
  extractCompanyClaims,
  fallbackResearchPlan,
  parseModelString,
  synthesizeCard,
  synthesizeResearchSection,
  verifySynthesis,
  type BlockEnrichmentId,
} from "@cold-start/llm";
import { buildEvidenceLedger } from "@cold-start/pipeline";
import type { ProviderSource } from "@cold-start/providers";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore score.mjs is plain JS shared with the node:test suite
import { aggregate, scoreExtraction, scoreResearchSection, scoreSynthesis, scoreVerify } from "./score.mjs";
import type { ProviderMatrixFixture } from "./build-bundles";
```

Replace:
```ts
type Stage = "extract_full" | "extract_block" | "verify";

type CellResult = {
  slug: string;
  model: string;
  stage: Stage;
  block?: string;
  attempt: number;
  ok: boolean;
  retried: boolean;
  error?: string;
  durationMs: number;
  costUsd: number | null;
  score?: ReturnType<typeof scoreExtraction> | ReturnType<typeof scoreVerify>;
};
```

With:
```ts
type Stage = "extract_full" | "extract_block" | "verify" | "synthesis" | "research_section";

// VERIFY_JUDGE_MODEL is the fixed judge for the synthesis stage's paired synthesis+verify replay
// (see the synthesis cell below): every candidate's fresh synthesis gets judged by the SAME
// model, so the judge is never a variable when comparing candidates against each other. Override
// via --judge for a different fixed judge; deepseek-v4-flash is cheap enough that judge cost
// never dominates the comparison.
const VERIFY_JUDGE_MODEL = "deepseek/deepseek-v4-flash";

type CellResult = {
  slug: string;
  model: string;
  stage: Stage;
  block?: string;
  section?: string;
  attempt: number;
  ok: boolean;
  retried: boolean;
  error?: string;
  durationMs: number;
  costUsd: number | null;
  // Set only on synthesis cells: the paired verify judge's own cost, kept separate from costUsd
  // (candidate cost) so a model's price/performance row never silently includes judge spend.
  judgeCostUsd?: number | null;
  score?: ReturnType<typeof scoreExtraction> | ReturnType<typeof scoreVerify> | ReturnType<typeof scoreSynthesis> | ReturnType<typeof scoreResearchSection>;
  // Set only on synthesis and research_section cells (captureOutput): the raw generated content,
  // read by writeSideBySide for the blind read. Extraction cells never carry this; their sections
  // objects are large enough that persisting them per cell would bloat results.json for no reader.
  output?: unknown;
};
```

- [ ] **Step 2: Add `--judge`/`--sections` CLI flags and extend `needsAnthropic`**

Replace:
```ts
  const models = listArg("--models", ["claude-sonnet-4-6", "claude-haiku-4-5", "deepseek/deepseek-v4-flash"]);
  const stages = listArg("--stages", ["extract_full", "extract_block", "verify"]) as Stage[];
  const k = Number(argValue("--k", "1"));
  const concurrency = Number(argValue("--concurrency", "4"));
  const limit = Number(argValue("--limit", "100"));
```

With:
```ts
  const models = listArg("--models", ["claude-sonnet-4-6", "claude-haiku-4-5", "deepseek/deepseek-v4-flash"]);
  const stages = listArg("--stages", ["extract_full", "extract_block", "verify"]) as Stage[];
  const k = Number(argValue("--k", "1"));
  const concurrency = Number(argValue("--concurrency", "4"));
  const limit = Number(argValue("--limit", "100"));
  const judgeModel = argValue("--judge", VERIFY_JUDGE_MODEL);
  const sectionIds = listArg("--sections", ["customer_proof", "financing"]) as ResearchSectionId[];
```

Replace:
```ts
  const needsAnthropic = models.some((model) => parseModelString(model).provider === "anthropic");
```

With:
```ts
  const needsAnthropic =
    models.some((model) => parseModelString(model).provider === "anthropic") ||
    (stages.includes("synthesis") && parseModelString(judgeModel).provider === "anthropic");
```

- [ ] **Step 3: Refactor `synthesisClaims` to take a synthesis object directly, and add the offline `evidenceForSection` mirror**

Replace:
```ts
function synthesisClaims(card: ProviderMatrixFixture["card"]): SourcedText[] {
  const synthesis = card.synthesis;
  if (!synthesis) {
    return [];
  }
  const market = synthesis.marketStructureAndTiming;
  const marketClaims = market
    ? [market.buyerBudget, market.painSeverity, market.adoptionTrigger, market.marketStructure, market.profitPool, market.expansionPath, market.timingRisk].filter(
        (claim): claim is SourcedText => claim !== null && claim !== undefined
      )
    : [];
  return [synthesis.whyItMatters, ...synthesis.bullCase, ...synthesis.bearCase, ...marketClaims];
}
```

With:
```ts
// Takes the synthesis object directly (not the whole card) so the same helper covers both the
// verify stage's production-card claims and the synthesis stage's freshly generated claims.
function synthesisClaims(synthesis: ProviderMatrixFixture["card"]["synthesis"]): SourcedText[] {
  if (!synthesis) {
    return [];
  }
  const market = synthesis.marketStructureAndTiming;
  const marketClaims = market
    ? [market.buyerBudget, market.painSeverity, market.adoptionTrigger, market.marketStructure, market.profitPool, market.expansionPath, market.timingRisk].filter(
        (claim): claim is SourcedText => claim !== null && claim !== undefined
      )
    : [];
  return [synthesis.whyItMatters, ...synthesis.bullCase, ...synthesis.bearCase, ...marketClaims];
}

function normalizedUrlKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

// Mirrors evidenceForSection in apps/web/src/inngest/research-section-generation.ts exactly: same
// URL-normalization key, same rawText-or-snippet fallback, same drop-when-blank rule. Kept as a
// faithful copy rather than a shared import because the production function is typed against the
// DB row shape (findSourcesBySlug) and this one runs offline against frozen fixture JSON; the two
// shapes are structurally compatible but not the same type.
function evidenceForSection(fixture: ProviderMatrixFixture) {
  const sourcesByUrl = new Map(fixture.sources.map((source) => [normalizedUrlKey(source.url), source]));

  return fixture.card.citations.flatMap((citation) => {
    const source = sourcesByUrl.get(normalizedUrlKey(citation.url));
    const text = source?.rawText || citation.snippet || "";
    if (!text.trim()) {
      return [];
    }

    return [
      {
        citationId: citation.id,
        url: citation.url,
        title: citation.title,
        sourceType: citation.sourceType,
        text,
      },
    ];
  });
}
```

- [ ] **Step 4: Compute research-section evidence per fixture, with a skip log when empty**

Replace:
```ts
  for (const fixture of fixtures) {
    const providerSources = fixture.sources as ProviderSource[];
    const evidenceLedger = buildEvidenceLedger({ domain: fixture.domain, sources: providerSources });
    const researchPlan = fallbackResearchPlan(fixture.domain);
    const bundleSourceUrls = fixture.sources.map((source) => source.url);
    const bundleText = fixture.sources.map((source) => source.rawText).join("\n");
    const claims = synthesisClaims(fixture.card);
    const citationSources = fixture.card.citations.map((citation) => ({
      id: citation.id,
      url: citation.url,
      title: citation.title,
      ...(citation.snippet ? { snippet: citation.snippet } : {}),
    }));
    const blocks = (fixture.reference.blocksRun.length > 0 ? fixture.reference.blocksRun : ["funding"]) as BlockEnrichmentId[];
```

With:
```ts
  for (const fixture of fixtures) {
    const providerSources = fixture.sources as ProviderSource[];
    const evidenceLedger = buildEvidenceLedger({ domain: fixture.domain, sources: providerSources });
    const researchPlan = fallbackResearchPlan(fixture.domain);
    const bundleSourceUrls = fixture.sources.map((source) => source.url);
    const bundleText = fixture.sources.map((source) => source.rawText).join("\n");
    const claims = synthesisClaims(fixture.card.synthesis);
    const citationSources = fixture.card.citations.map((citation) => ({
      id: citation.id,
      url: citation.url,
      title: citation.title,
      ...(citation.snippet ? { snippet: citation.snippet } : {}),
    }));
    const blocks = (fixture.reference.blocksRun.length > 0 ? fixture.reference.blocksRun : ["funding"]) as BlockEnrichmentId[];
    const researchSectionEvidence = stages.includes("research_section") ? evidenceForSection(fixture) : [];
    const researchSectionEvidenceCitationIds = researchSectionEvidence.map((source) => source.citationId);
    if (stages.includes("research_section") && researchSectionEvidence.length === 0) {
      console.log(`skip research_section for ${fixture.slug}: no evidence`);
    }
```

- [ ] **Step 5: Extend `makeCell` with a `section`/`captureOutput` options parameter and the `research_section` score branch**

Replace:
```ts
    for (const model of models) {
      for (let attempt = 0; attempt < k; attempt += 1) {
        const makeCell = (stage: Stage, block: BlockEnrichmentId | undefined, run: (telemetry: (call: GenerationLlmCallTrace) => void) => Promise<unknown>) => {
          tasks.push(async (): Promise<CellResult> => {
            const calls: GenerationLlmCallTrace[] = [];
            const startedAt = Date.now();
            const base = {
              slug: fixture.slug,
              model,
              stage,
              ...(block ? { block } : {}),
              attempt,
            };
            try {
              const output = await run((call) => calls.push(call));
              const costs = calls.map((call) => call.estimatedCostUsd).filter((cost): cost is number => typeof cost === "number");
              const score =
                stage === "verify"
                  ? scoreVerify({ results: output, claims })
                  : scoreExtraction({ sections: output, bundleSourceUrls, bundleText, companyDomain: fixture.domain });
              return {
                ...base,
                ok: true,
                retried: calls.filter((call) => call.status === "ok").length > 1,
                durationMs: Date.now() - startedAt,
                costUsd: costs.length > 0 ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6)) : null,
                score,
              };
            } catch (error) {
              const costs = calls.map((call) => call.estimatedCostUsd).filter((cost): cost is number => typeof cost === "number");
              return {
                ...base,
                ok: false,
                retried: calls.length > 1,
                error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
                durationMs: Date.now() - startedAt,
                costUsd: costs.length > 0 ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6)) : null,
              };
            }
          });
        };
```

With:
```ts
    for (const model of models) {
      for (let attempt = 0; attempt < k; attempt += 1) {
        const makeCell = (
          stage: Stage,
          block: BlockEnrichmentId | undefined,
          run: (telemetry: (call: GenerationLlmCallTrace) => void) => Promise<unknown>,
          options: { section?: string; captureOutput?: boolean } = {}
        ) => {
          tasks.push(async (): Promise<CellResult> => {
            const calls: GenerationLlmCallTrace[] = [];
            const startedAt = Date.now();
            const base = {
              slug: fixture.slug,
              model,
              stage,
              ...(block ? { block } : {}),
              ...(options.section ? { section: options.section } : {}),
              attempt,
            };
            try {
              const output = await run((call) => calls.push(call));
              const costs = calls.map((call) => call.estimatedCostUsd).filter((cost): cost is number => typeof cost === "number");
              const score =
                stage === "verify"
                  ? scoreVerify({ results: output, claims })
                  : stage === "research_section"
                    ? scoreResearchSection({ content: output, evidenceCitationIds: researchSectionEvidenceCitationIds })
                    : scoreExtraction({ sections: output, bundleSourceUrls, bundleText, companyDomain: fixture.domain });
              return {
                ...base,
                ok: true,
                retried: calls.filter((call) => call.status === "ok").length > 1,
                durationMs: Date.now() - startedAt,
                costUsd: costs.length > 0 ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6)) : null,
                score,
                ...(options.captureOutput ? { output } : {}),
              };
            } catch (error) {
              const costs = calls.map((call) => call.estimatedCostUsd).filter((cost): cost is number => typeof cost === "number");
              return {
                ...base,
                ok: false,
                retried: calls.length > 1,
                error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
                durationMs: Date.now() - startedAt,
                costUsd: costs.length > 0 ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6)) : null,
              };
            }
          });
        };
```

- [ ] **Step 6: Add the `synthesis` cell (paired synthesize + judge replay) and the `research_section` cells**

Replace:
```ts
        if (stages.includes("verify") && claims.length > 0) {
          makeCell("verify", undefined, (telemetry) =>
            verifySynthesis({ client: anthropic, model, claims, sources: citationSources, telemetry })
          );
        }
      }
    }
  }
```

With:
```ts
        if (stages.includes("verify") && claims.length > 0) {
          makeCell("verify", undefined, (telemetry) =>
            verifySynthesis({ client: anthropic, model, claims, sources: citationSources, telemetry })
          );
        }

        // Paired synthesis+verify replay: a fresh synthesizeCard call, then an immediate
        // verifySynthesis judge pass over that candidate's OWN claims using a fixed judge model.
        // This is the false-keep direction the plain verify replay above cannot see: verify above
        // only replays the production card's SURVIVING claims, so it can only disagree by
        // dropping (false-drop). Here, a false-keep shows up as a high verifierSurvivalRate over
        // claims the judge should have rejected.
        if (stages.includes("synthesis")) {
          tasks.push(async (): Promise<CellResult> => {
            const candidateCalls: GenerationLlmCallTrace[] = [];
            const judgeCalls: GenerationLlmCallTrace[] = [];
            const startedAt = Date.now();
            const base = { slug: fixture.slug, model, stage: "synthesis" as const, attempt };
            const sumCost = (traces: GenerationLlmCallTrace[]) => {
              const costs = traces.map((call) => call.estimatedCostUsd).filter((cost): cost is number => typeof cost === "number");
              return costs.length > 0 ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6)) : null;
            };
            try {
              const freshSynthesis = await synthesizeCard({
                client: anthropic,
                model,
                card: fixture.card,
                telemetry: (call) => candidateCalls.push(call),
              });
              const freshClaims = synthesisClaims(freshSynthesis);
              const verifierResults =
                freshClaims.length > 0
                  ? await verifySynthesis({
                      client: anthropic,
                      model: judgeModel,
                      claims: freshClaims,
                      sources: citationSources,
                      telemetry: (call) => judgeCalls.push(call),
                    })
                  : [];
              const cardCitationIds = fixture.card.citations.map((citation) => citation.id);
              return {
                ...base,
                ok: true,
                retried: candidateCalls.filter((call) => call.status === "ok").length > 1,
                durationMs: Date.now() - startedAt,
                costUsd: sumCost(candidateCalls),
                judgeCostUsd: sumCost(judgeCalls),
                score: scoreSynthesis({ synthesis: freshSynthesis, verifierResults, cardCitationIds }),
                output: { synthesis: freshSynthesis, verifierResults },
              };
            } catch (error) {
              return {
                ...base,
                ok: false,
                retried: candidateCalls.length > 1,
                error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
                durationMs: Date.now() - startedAt,
                costUsd: sumCost(candidateCalls),
                judgeCostUsd: sumCost(judgeCalls),
              };
            }
          });
        }

        if (stages.includes("research_section") && researchSectionEvidence.length > 0) {
          for (const sectionId of sectionIds) {
            makeCell(
              "research_section",
              undefined,
              (telemetry) =>
                synthesizeResearchSection({
                  client: anthropic,
                  definition: RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId],
                  evidence: researchSectionEvidence,
                  model,
                  company: { domain: fixture.domain, name: fixture.card.identity.name.value ?? fixture.domain },
                  telemetry,
                }),
              { section: sectionId, captureOutput: true }
            );
          }
        }
      }
    }
  }
```

- [ ] **Step 7: Verify syntax and lint**

Run: `node --experimental-strip-types --check eval/provider-matrix/run-matrix.ts`
Expected: no output, exit 0 (this is a syntax-only check via Node's type-stripping; it does not catch cross-file type errors, but it does catch typos, mismatched braces, and malformed TypeScript syntax).

Run: `npx eslint eval/provider-matrix/run-matrix.ts`
Expected: no errors (warnings for `@typescript-eslint/no-unused-vars` are off for `eval/**` per `eslint.config.mjs`; any other warning should be reviewed, not ignored).

- [ ] **Step 8: Commit**

```bash
git add eval/provider-matrix/run-matrix.ts
git commit -m "$(cat <<'EOF'
Replay synthesis and research-section stages in the provider matrix

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Write a blind side-by-side read for judgment-stage cells

**Files:**
- Modify: `eval/provider-matrix/run-matrix.ts`

**Interfaces:**
- Consumes: `CellResult[]` (with `output` populated for synthesis/research_section cells, from Task 7), `runDir` (already computed in `main()`).
- Produces: `runs/<timestamp>/side-by-side.md` and `runs/<timestamp>/answer-key.json` on every run that includes at least one synthesis or research_section cell.

- [ ] **Step 1: Import `createHash`**

Replace:
```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
```

With:
```ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
```

- [ ] **Step 2: Add the render helpers and `writeSideBySide`, placed after `runPool` and before `async function main()`**

Replace:
```ts
async function main() {
  loadRepoRootEnv();
```

With:
```ts
function labelForIndex(index: number): string {
  return `Output ${String.fromCharCode(65 + index)}`;
}

function renderSynthesisOutput(synthesis: NonNullable<ProviderMatrixFixture["card"]["synthesis"]>): string {
  const lines = [`Why it matters: ${synthesis.whyItMatters.text}`, "", "Bull case:"];
  for (const claim of synthesis.bullCase) {
    lines.push(`- ${claim.text}`);
  }
  if (synthesis.bullCase.length === 0) {
    lines.push("- (none)");
  }
  lines.push("", "Bear case:");
  for (const claim of synthesis.bearCase) {
    lines.push(`- ${claim.text}`);
  }
  if (synthesis.bearCase.length === 0) {
    lines.push("- (none)");
  }
  lines.push("", "Open questions:");
  for (const question of synthesis.openQuestions) {
    lines.push(`- [${question.category ?? "uncategorized"}] ${question.question}`);
  }
  return lines.join("\n");
}

function renderResearchSectionOutput(content: ResearchSectionContent): string {
  const lines = [`Status: ${content.status}`, `Summary: ${content.summary ?? "(none)"}`, "", "Items:"];
  for (const item of content.items) {
    lines.push(`- ${item.label}: ${item.text}${item.meta ? ` (${item.meta})` : ""}`);
  }
  if (content.items.length === 0) {
    lines.push("- (none)");
  }
  return lines.join("\n");
}

type SideBySideEntry = { fixture: string; stage: string; section?: string; label: string; model: string };

// Blind quality eyeball before any routing decision: side-by-side.md groups every judgment-stage
// cell by (fixture, stage, section) and renders each participating model's output under an
// anonymous "Output A"/"Output B"/... label. Label order is a hash of (fixture slug + model), not
// alphabetical model name or arrival order, so nothing about the label hints at which model wrote
// it and the order differs across fixtures (a reader cannot learn "A is always Claude" from one
// fixture and carry that assumption into the next). answer-key.json is the only place the mapping
// is written; read the outputs before opening the key.
async function writeSideBySide(results: CellResult[], runDir: string): Promise<void> {
  const groups = new Map<string, CellResult[]>();
  for (const result of results) {
    if (!result.ok || result.attempt !== 0 || (result.stage !== "synthesis" && result.stage !== "research_section")) {
      continue;
    }
    const key = [result.slug, result.stage, result.section ?? ""].join("::");
    const bucket = groups.get(key) ?? [];
    bucket.push(result);
    groups.set(key, bucket);
  }

  if (groups.size === 0) {
    return;
  }

  const answerKey: SideBySideEntry[] = [];
  const lines = ["# Provider Matrix Blind Side-by-Side", "", "Blind quality eyeball before any routing decision. Read outputs before the key.", ""];

  for (const [key, cells] of groups) {
    const [slug, stage, section] = key.split("::");
    const ordered = [...cells].sort((a, b) => {
      const hashFor = (cell: CellResult) => createHash("sha1").update(`${slug}${cell.model}`).digest("hex");
      return hashFor(a).localeCompare(hashFor(b));
    });

    lines.push(`## ${slug} / ${stage}${section ? ` / ${section}` : ""}`, "");
    ordered.forEach((cell, index) => {
      const label = labelForIndex(index);
      answerKey.push({ fixture: slug, stage, ...(section ? { section } : {}), label, model: cell.model });
      const rendered =
        stage === "synthesis"
          ? renderSynthesisOutput((cell.output as { synthesis: NonNullable<ProviderMatrixFixture["card"]["synthesis"]> }).synthesis)
          : renderResearchSectionOutput(cell.output as ResearchSectionContent);
      lines.push(`### ${label}`, "", rendered, "");
    });
  }

  await writeFile(path.join(runDir, "side-by-side.md"), lines.join("\n"));
  await writeFile(path.join(runDir, "answer-key.json"), JSON.stringify(answerKey, null, 2));
}

async function main() {
  loadRepoRootEnv();
```

- [ ] **Step 3: Call `writeSideBySide` after the results are written**

Replace:
```ts
  await writeFile(path.join(runDir, "results.json"), JSON.stringify({ models, stages, k, fixtures: fixtures.map((fixture) => fixture.slug), results }, null, 2));

  const lines = [
    "# Provider Matrix Report",
```

With:
```ts
  await writeFile(path.join(runDir, "results.json"), JSON.stringify({ models, stages, k, fixtures: fixtures.map((fixture) => fixture.slug), results }, null, 2));

  await writeSideBySide(results, runDir);

  const lines = [
    "# Provider Matrix Report",
```

- [ ] **Step 4: Verify syntax and lint**

Run: `node --experimental-strip-types --check eval/provider-matrix/run-matrix.ts`
Expected: no output, exit 0.

Run: `npx eslint eval/provider-matrix/run-matrix.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add eval/provider-matrix/run-matrix.ts
git commit -m "$(cat <<'EOF'
Write a blind side-by-side read for judgment-stage cells

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Report judgment-stage quality in the provider matrix

**Files:**
- Modify: `eval/provider-matrix/run-matrix.ts`

**Interfaces:**
- Consumes: `results: CellResult[]` and `models`/`stages`/`judgeModel` already in scope in `main()`; `scoreSynthesis`/`scoreResearchSection` return shapes (Task 6).
- Produces: `runs/<timestamp>/report.md` gains a second table, "Judgment Stages", and the "Notes" section reflects that the false-keep gap is closed.

- [ ] **Step 1: Add the judgment-stage table after the existing extraction table's loop**

Replace:
```ts
      );
    }
  }

  const failures = results.filter((result) => !result.ok);
```

With:
```ts
      );
    }
  }

  const judgmentStages = stages.filter((stage): stage is "synthesis" | "research_section" => stage === "synthesis" || stage === "research_section");
  if (judgmentStages.length > 0) {
    lines.push(
      "",
      "## Judgment Stages",
      "",
      "| Model | Stage | Cells | Parse ok | Median candidate cost | Median latency | Survival (med) | Generic phrases (med) | Empty rate | Citation violations (med) |",
      "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"
    );

    for (const model of models) {
      for (const stage of judgmentStages) {
        const cells = results.filter((result) => result.model === model && result.stage === stage);
        if (cells.length === 0) {
          continue;
        }
        const okCells = cells.filter((cell) => cell.ok);
        const synthesisScores = okCells
          .map((cell) => cell.score)
          .filter((score): score is ReturnType<typeof scoreSynthesis> => Boolean(score) && stage === "synthesis");
        const sectionScores = okCells
          .map((cell) => cell.score)
          .filter((score): score is ReturnType<typeof scoreResearchSection> => Boolean(score) && stage === "research_section");
        const survivalStats = stage === "synthesis" ? aggregate(synthesisScores.map((score) => score.verifierSurvivalRate)) : null;
        const genericPhraseCounts = stage === "synthesis" ? synthesisScores.map((score) => score.genericPhraseCount) : sectionScores.map((score) => score.genericPhraseCount);
        const citationViolationCounts =
          stage === "synthesis"
            ? synthesisScores.map((score) => score.citationMarkerViolations.length)
            : sectionScores.map((score) => score.citationIdViolations.length);
        const emptyCount =
          stage === "synthesis"
            ? synthesisScores.filter((score) => score.claimCounts.bullCase === 0 && score.claimCounts.bearCase === 0).length
            : sectionScores.filter((score) => score.status === "empty").length;
        const emptyRate = okCells.length > 0 ? emptyCount / okCells.length : 0;
        const fmt = (stats: { median: number } | null, digits = 4) => (stats ? stats.median.toFixed(digits) : "-");

        lines.push(
          [
            model,
            stage,
            String(cells.length),
            `${okCells.length}/${cells.length}`,
            fmt(aggregate(okCells.map((cell) => cell.costUsd)), 5),
            `${fmt(aggregate(okCells.map((cell) => cell.durationMs)), 0)}ms`,
            fmt(survivalStats),
            fmt(aggregate(genericPhraseCounts), 1),
            `${(emptyRate * 100).toFixed(0)}%`,
            fmt(aggregate(citationViolationCounts), 1),
          ].join(" | ").replace(/^/, "| ").replace(/$/, " |")
        );
      }
    }
  }

  const failures = results.filter((result) => !result.ok);
```

Note: "Empty rate" is a design decision this plan locks in, since the source spec did not define it precisely. For `synthesis` cells, empty means both `claimCounts.bullCase === 0` and `claimCounts.bearCase === 0` (the model found nothing worth a bull or bear line). For `research_section` cells, empty means `score.status === "empty"` (the production section-content contract's own empty signal). Both read as "this candidate found nothing" in their respective stage.

- [ ] **Step 2: Update the Notes section to reflect the closed false-keep gap**

Replace:
```ts
  lines.push(
    "",
    "## Notes",
    "",
    "- Verify replays run against the production card's surviving synthesis claims, so disagreement is the false-DROP direction; false-keep needs a paired synthesis+verify replay.",
    "- Reference production baseline: see reference.llmCalls in each fixture for the original model, cost, and latency.",
    ""
  );
```

With:
```ts
  lines.push(
    "",
    "## Notes",
    "",
    "- Verify replays (the `verify` stage) run against the production card's surviving synthesis claims, so disagreement there is the false-DROP direction only.",
    `- The \`synthesis\` stage closes the false-keep gap: it pairs a fresh synthesizeCard call with an immediate verifySynthesis judge pass (fixed judge: ${judgeModel}) over the candidate's own claims, so a false-keep shows up as a high verifierSurvivalRate over claims the judge should have rejected.`,
    "- Reference production baseline: see reference.llmCalls in each fixture for the original model, cost, and latency.",
    ""
  );
```

- [ ] **Step 3: Verify syntax and lint**

Run: `node --experimental-strip-types --check eval/provider-matrix/run-matrix.ts`
Expected: no output, exit 0.

Run: `npx eslint eval/provider-matrix/run-matrix.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add eval/provider-matrix/run-matrix.ts
git commit -m "$(cat <<'EOF'
Report judgment-stage quality in the provider matrix

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Document OpenRouter routing and the judgment-stage matrix, then verify Packet 2

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add the new Conventions bullet to `CLAUDE.md`**

The bullet immediately after this one is identical, character for character, in both `CLAUDE.md` and `AGENTS.md` (verified: both files are 179 lines, and this specific bullet is one of the many shared verbatim between them). Insert the new bullet right after it.

Replace:
```
- LLM providers are swappable per pipeline stage. `modelForStage(stage)` in `packages/llm/src/llm-provider.ts` resolves `LLM_<STAGE>_MODEL` → `ANTHROPIC_<STAGE>_MODEL` → `ANTHROPIC_MODEL`. Model strings may carry a provider prefix (`deepseek/deepseek-v4-flash`); unprefixed strings are Anthropic. `createTracedAnthropicMessage` dispatches prefixed models to the OpenAI-compat adapter (`packages/llm/src/openai-compat.ts`, raw fetch, retries, telemetry); the Anthropic path is unchanged. Non-Anthropic pricing lives in `packages/llm/src/pricing.ts`; add a row there for every new eval-matrix model. The `research_section` and `person_read` stages fall back through the synthesis model chain (both piggyback on the synthesis stage's judgment). Read `docs/anthropic-llm-call-map.md` before touching any of this.
```

With:
```
- LLM providers are swappable per pipeline stage. `modelForStage(stage)` in `packages/llm/src/llm-provider.ts` resolves `LLM_<STAGE>_MODEL` → `ANTHROPIC_<STAGE>_MODEL` → `ANTHROPIC_MODEL`. Model strings may carry a provider prefix (`deepseek/deepseek-v4-flash`); unprefixed strings are Anthropic. `createTracedAnthropicMessage` dispatches prefixed models to the OpenAI-compat adapter (`packages/llm/src/openai-compat.ts`, raw fetch, retries, telemetry); the Anthropic path is unchanged. Non-Anthropic pricing lives in `packages/llm/src/pricing.ts`; add a row there for every new eval-matrix model. The `research_section` and `person_read` stages fall back through the synthesis model chain (both piggyback on the synthesis stage's judgment). Read `docs/anthropic-llm-call-map.md` before touching any of this.
- OpenRouter is a provider entry in `providerDefaults` (`packages/llm/src/llm-provider.ts`), addressed with model strings like `openrouter/moonshotai/kimi-k3`. `providerConfigFor` sends `usage: {include: true}` on every OpenRouter call, so responses carry OpenRouter's billed `usage.cost`; `createTracedOpenAiCompatMessage` prefers that reported cost over the `pricing.ts` estimate table whenever it is present, for any provider that starts reporting it. A model's request quirks (rejecting `temperature`/`top_p` outright, or needing a `max_tokens` floor above 8192 because reasoning tokens count against the completion budget) live in `quirksForModel` next to `providerDefaults`; add a row there before wiring a new reasoning-mandatory model, not a special case inside `openAiCompatBodyFromAnthropicParams`. `eval/provider-matrix/run-matrix.ts` covers two judgment stages past extraction and verify: `synthesis` pairs a fresh `synthesizeCard` call with an immediate `verifySynthesis` judge pass over the candidate's own claims (a fixed judge model via `--judge`, default `deepseek/deepseek-v4-flash`, so the judge never varies while candidates are compared), and `research_section` replays `synthesizeResearchSection` for the section ids in `--sections` (default `customer_proof,financing`) using evidence mirrored offline from `apps/web/src/inngest/research-section-generation.ts`'s `evidenceForSection`. Both stages write a blind `side-by-side.md` plus `answer-key.json` under the run directory, read before the model-identified report table. The scorers for both live in `eval/provider-matrix/score.mjs`, tested in `eval/provider-matrix/score.test.mjs`, already covered by the `node --test eval/**/*.test.mjs` glob in `npm run test`; no `package.json` change was needed.
```

- [ ] **Step 2: Add the identical bullet to `AGENTS.md`**

Apply the exact same Replace/With pair from Step 1 to `AGENTS.md` (the old string is character-for-character identical in both files).

- [ ] **Step 3: Confirm the test glob already covers the new tests, with no `package.json` change**

Run: `grep -n '"test"' package.json`
Expected: `"test": "npm run test --workspaces --if-present && node --test eval/*.test.mjs eval/**/*.test.mjs"`. `eval/**/*.test.mjs` already matches `eval/provider-matrix/score.test.mjs` (Task 6's tests live in an existing file, not a new one), so this confirms no `package.json` edit is needed, matching what Step 1's new bullet states.

- [ ] **Step 4: Verify Packet 2 end to end**

Run: `npm run check`
Expected: exit 0, run directly (not piped through `tail` or `head`).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "$(cat <<'EOF'
Document OpenRouter routing and the judgment-stage matrix

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Packet 3: Smoke Test and Live Comparison Run

These tasks document commands and expected output; they write no tracked code, so none of them ends with a commit. `runs/` is already the harness's own output directory (untracked, per its existing usage in `eval/provider-matrix/runs/`).

### Task 11: Smoke K3 through OpenRouter

**Precondition:** `OPENROUTER_API_KEY` is set in `.env.local` (spelled exactly `OPENROUTER_API_KEY`; never commit it). Samay provides the key.

- [ ] **Step 1: Run the smoke command**

```bash
set -a; source .env.local; set +a
npm run eval:providers:matrix -- --models "openrouter/moonshotai/kimi-k3" --stages extract_full --limit 1 --k 1
```

Expected: `1 cells: 1 fixtures x 1 models, stages [extract_full], k=1` printed up front, then a report table row with `Parse ok` = `1/1`. Open `eval/provider-matrix/runs/<timestamp>/results.json` and confirm the one cell's `provider` is `"openrouter"` and `costUsd` is a small positive number (sourced from `usage.cost`, not the `pricing.ts` estimate, per Task 4). Confirm there is no JSON parse error in the cell's `error` field; that would indicate the extraction tool-call arguments truncated mid-string, the exact failure mode `quirksForModel`'s `minMaxTokens: 32768` floor (Task 1/2) exists to prevent.

- [ ] **Step 2: Stop and report on auth or truncation failure**

If the cell's `ok` is `false`, read the `error` field. An auth error (401/403) means `OPENROUTER_API_KEY` is missing or wrong; stop and ask Samay to confirm it, do not proceed to Task 12. A JSON parse error or a `max_tokens`-adjacent failure means the quirks table in Packet 1 needs a second look before any further spend; stop and report the exact error text rather than silently retrying with a larger limit.

### Task 12: Refresh fixtures (read-only production reads)

- [ ] **Step 1: Run the fixture-refresh command**

```bash
set -a; source .env.production.migrate.local; set +a
npm run eval:providers:bundles -- --limit 12
```

Expected: up to 12 lines of `wrote <slug>: N sources, M reference llm calls, blocks [...]`, then `<written> fixture(s) in eval/provider-matrix/fixtures`. This command only runs `SELECT` queries (see `eval/provider-matrix/build-bundles.ts`); it writes fixture JSON files locally, never to the database.

### Task 13: Run the full comparison and deliver a verdict

- [ ] **Step 1: Run the full matrix across all four models and all four stages**

```bash
npm run eval:providers:matrix -- --models "claude-sonnet-4-6,deepseek/deepseek-v4-flash,deepseek/deepseek-v4-pro,openrouter/moonshotai/kimi-k3" --stages extract_full,verify,synthesis,research_section --k 1 --concurrency 4 --limit 12
```

Budget guard: expected ceiling is around $25, dominated by K3's output tokens ($15/M, inflated further by mandatory reasoning tokens counting as output). If Task 11's smoke run showed the single K3 `extract_full` call costing over $0.50, rerun this command with `--limit 6` instead of `--limit 12` to keep total spend proportional to what the smoke test implied, rather than running the full $25-scale command on an unverified per-call cost.

- [ ] **Step 2: Collect the deliverables**

Confirm all four files exist under `eval/provider-matrix/runs/<timestamp>/`:
- `report.md`: the extraction-stage table (unchanged from before this plan) plus the new "Judgment Stages" table from Task 9.
- `side-by-side.md`: the blind read from Task 8, covering every `synthesis` and `research_section` cell at `attempt 0`.
- `answer-key.json`: the fixture/stage/section/label to model mapping.
- `results.json`: every cell, including `judgeCostUsd` on synthesis cells.

- [ ] **Step 3: Read the blind side-by-side before the answer key**

Open `side-by-side.md` first and form an independent quality read per fixture/stage/section group. Only then open `answer-key.json` to see which label was which model. Write a short verdict (in the chat response to Samay, not a new file, unless he asks for one) covering median cost, median latency, and quality signals (survival rate, generic-phrase count, empty rate, citation violations) per model per stage from `report.md`'s two tables, plus whether the blind read agreed with what the numbers suggested.

- [ ] **Step 4: Flag the re-run condition**

Note explicitly in the verdict: K3's open weights land 2026-07-27. Third-party hosts already present in `providerDefaults` (`fireworks`, `together`) may reprice K3 far below OpenRouter's $3/$15 input/output once that happens. Today's run is directional only; re-run this matrix once those arms are live before treating any routing decision as final.

---

## Self-Review

**Spec coverage.** Walked every lettered item in the user's Packet 1/2/3 spec against the tasks above:
- 1a (openrouter providerDefaults, no moonshot entry): Task 1. Confirmed no `moonshot` key anywhere in this plan.
- 1b (`ModelQuirks`/`quirksForModel`, substring table): Task 1.
- 1c (quirks wired into the body builder, `max_tokens` field name kept): Task 2.
- 1d (usage shape handling, DeepSeek precedence, type extension): Task 3.
- 1e (`usage.cost` preferred): Task 4.
- 1f (pricing row, comment with verification date and sources): Task 5.
- Packet 1 tests (quirksForModel, body builder, providerConfigFor, usage mapping, cost preference, pricingFor): all six covered across Tasks 1-5's Step 1/Step 2 pairs.
- 2a (stage union, `--stages` default unchanged): Task 7 Step 1 (default stays `["extract_full", "extract_block", "verify"]`, untouched).
- 2b (paired synthesis+verify, fixed judge via `--judge`, `judgeCostUsd` separated, Notes update): Task 7 Step 6, Task 9 Step 2.
- 2c (research_section mirror of `evidenceForSection`, skip-on-empty without recording a failure, `--sections` default, one cell per fixture/model/section/attempt): Task 7 Steps 3, 4, 6.
- 2d (`scoreSynthesis`, `scoreResearchSection`, investor-lens re-exports): Task 6.
- 2e (blind side-by-side, deterministic sha1 label order, answer key): Task 8.
- 2f (second report table): Task 9 Step 1.
- 2g (CLAUDE.md/AGENTS.md sync, test-glob confirmation): Task 10.
- Packet 3 (smoke, fixture refresh, full run, budget guard, deliverables, post-2026-07-27 re-run note): Tasks 11-13.
- Global constraints (zero behavior change, `npm run check` gate, dependency-free score.mjs, no em-dash/slop words, commit format, secret handling): stated in the header's Global Constraints section and enforced task by task (Task 3's fallback-path test proves zero behavior change for the DeepSeek-absent case; Task 5 and Task 10 run the full `npm run check` gate).

**Placeholder scan.** No "TBD"/"TODO"/"handle edge cases" phrasing anywhere in the task steps; every code step shows complete replace/with pairs, not descriptions of changes. The one place this plan intentionally departs from a red/green test cycle is `run-matrix.ts` (Tasks 7-9), because that file has no test harness in this repo today; each of those tasks says so explicitly and substitutes a syntax check plus `eslint` plus, in Packet 3, an actual paid smoke run, rather than silently skipping verification.

**Type consistency.** `CellResult.score`'s union (`ReturnType<typeof scoreExtraction> | scoreVerify | scoreSynthesis | scoreResearchSection`) is introduced in Task 7 and consumed identically in Task 9's report table. `synthesisClaims`'s new signature (`synthesis: ProviderMatrixFixture["card"]["synthesis"]`, not `card`) is changed and its one call site updated in the same task (Task 7 Step 4), and reused again for `freshSynthesis` in Task 7 Step 6 without a second signature. `evidenceForSection`'s return shape (`{citationId, url, title, sourceType, text}`) matches `ResearchSectionEvidenceSource` structurally (verified against `packages/llm/src/research-section.ts`'s `EvidenceSource` type, which has `intent` as optional, so its absence here is not a type error). `writeSideBySide`'s `SideBySideEntry` type and `answerKey` push both use `label`/`model`/`fixture`/`stage`/optional `section` consistently.

**Known gap, flagged rather than resolved.** Kimi K3's exact OpenRouter response shape for reasoning content is not confirmed from a primary source in this plan (unlike DeepSeek's `reasoning_content` precedent, which this codebase does not special-case either). If K3 surfaces reasoning text inline before/around the JSON payload in the `verify` stage's plain-text response (not a tool call), `verifier.ts`'s existing `stripJsonFence` (bracket-slicing, not fence-matching) should tolerate it, but this is untested against a real K3 response. Task 11's smoke test is the first real signal on this; if it fails in a reasoning-leakage-shaped way, that is new information for a follow-up decision, not something this plan pre-solves.

