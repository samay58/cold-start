#!/usr/bin/env tsx
// One-shot verifier for the Anthropic ephemeral cache TTL parameter on the current SDK.
// Sends a single small request with cache_control.ttl set, prints the usage object, and reports
// whether the response shows ephemeral_1h_input_tokens (success) or ephemeral_5m_input_tokens
// (the API silently downgraded) or no cache creation tokens at all (prompt too small or API
// rejected caching). Cost: typically under $0.01 per run on Haiku.
//
// Usage:
//   npm run verify:cache-ttl                # uses current ANTHROPIC_CACHE_TTL setting
//   ANTHROPIC_CACHE_TTL=1h npm run verify:cache-ttl
//   ANTHROPIC_CACHE_TTL=5m npm run verify:cache-ttl

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import { anthropicSystemCacheControl, createTracedAnthropicMessage } from "@cold-start/llm";

function loadRootEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

// ~3000 tokens of stable system content. This is above the 1024/2048 token minimums Anthropic
// requires for ephemeral caching. A run-unique nonce forces a fresh cache entry per invocation,
// so we observe creation behavior rather than reading a still-warm cache from a prior run.
const RUN_NONCE = process.env.VERIFY_CACHE_NONCE ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const STABLE_PROMPT = [
  `Run nonce: ${RUN_NONCE}.`,
  ...Array.from({ length: 250 }, (_, index) =>
    `Line ${index}: Stable verification text for ephemeral cache TTL behavior on the current SDK version.`
  ),
].join("\n");

type CacheCreationUsage = {
  ephemeral_5m_input_tokens?: number;
  ephemeral_1h_input_tokens?: number;
};
type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: CacheCreationUsage;
};

async function main() {
  loadRootEnv();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing from env. Source .env.local first.");
  }

  // Prefer the cheapest verifier model available, falling back to whatever ANTHROPIC_MODEL is set.
  const model =
    process.env.ANTHROPIC_VERIFIER_MODEL ??
    process.env.ANTHROPIC_MODEL ??
    "claude-haiku-4-5-20251001";

  const cacheControl = anthropicSystemCacheControl();
  console.log(`model: ${model}`);
  console.log(`requested cache_control: ${JSON.stringify(cacheControl)}`);
  console.log(`prompt size (chars): ${STABLE_PROMPT.length}`);

  const client = new Anthropic({ apiKey });
  // Route through the shared traced helper so we exercise the same beta-header logic the pipeline uses.
  const response = await createTracedAnthropicMessage({
    client,
    label: "verify-cache-ttl",
    model,
    stage: "verify",
    params: {
      model,
      max_tokens: 32,
      temperature: 0,
      system: [
        {
          type: "text",
          text: STABLE_PROMPT,
          cache_control: cacheControl,
        },
      ],
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    },
  });

  const usage = (response.usage ?? {}) as AnthropicUsage;
  console.log("\nusage:");
  console.log(JSON.stringify(usage, null, 2));

  const cacheCreation = usage.cache_creation;
  const ephemeral1h = cacheCreation?.ephemeral_1h_input_tokens ?? 0;
  const ephemeral5m = cacheCreation?.ephemeral_5m_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  console.log("\nresult:");
  if (cacheControl.ttl === "1h" && ephemeral1h > 0) {
    console.log(`PASS: 1h cache created: ephemeral_1h_input_tokens=${ephemeral1h}`);
  } else if (cacheControl.ttl === "1h" && ephemeral5m > 0 && ephemeral1h === 0) {
    console.log(`FAIL: API silently downgraded to 5m cache: ephemeral_5m_input_tokens=${ephemeral5m}`);
    console.log("Add betas:['extended-cache-ttl-2025-04-11'] to the request params, or upgrade @anthropic-ai/sdk.");
    process.exit(2);
  } else if (cacheControl.ttl === "5m" && ephemeral5m > 0) {
    console.log(`PASS: 5m cache created: ephemeral_5m_input_tokens=${ephemeral5m}`);
  } else if (cacheRead > 0) {
    console.log(`HIT (cache already warm): cache_read_input_tokens=${cacheRead}`);
    console.log("Re-run after the cache TTL expires to verify creation behavior.");
  } else {
    console.log("INCONCLUSIVE: no cache creation or read tokens reported.");
    console.log("Prompt may be below the model's min-cacheable-tokens threshold.");
    process.exit(3);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
