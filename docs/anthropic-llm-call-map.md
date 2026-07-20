# Anthropic / LLM Call Map

Every place Cold Start calls Anthropic's API or any LLM. First mapped at commit `66362f0` (2026-06-11); updated the same day for per-stage provider routing, and on 2026-07-20 for person reads and OpenRouter. Line numbers drift; the stable identifiers are the trace `stage`, `label`, and `provider` values, which are recorded on every call.

The one-sentence summary: every production LLM call goes through a single provider-aware chokepoint, `createTracedAnthropicMessage` in `packages/llm/src/anthropic.ts` (`client.messages.create` at line 134 for Anthropic models; provider-prefixed model strings dispatch to the OpenAI-compat adapter). There are exactly seven call functions wrapping that chokepoint, six of them live, one dormant. Anthropic is the default provider for every stage; DeepSeek or any OpenAI-compatible host can be flipped in per stage via env. Outside production there is one more direct Anthropic caller (a cache diagnostic script) and the provider-matrix replay harness which calls the same stage functions over frozen fixtures.

## The chokepoint and routing: packages/llm/src/

Four files own the client, routing, caching, cost estimation, and telemetry:

- **`anthropic.ts`**: the chokepoint. `createTracedAnthropicMessage` (line 107) resolves the model string; unprefixed models run the Anthropic path exactly as before (1h-cache beta header, `estimateAnthropicCostUsd`); prefixed models (`deepseek/...`) delegate to the adapter with the same Anthropic-native params. The `client` argument is unused on non-Anthropic routes (kept to avoid call-site churn). `createAnthropicClient` builds the SDK client from `ANTHROPIC_API_KEY`; `anthropicModel` reads `ANTHROPIC_MODEL` (`claude-sonnet-4-6` currently). `modelForStage` in `llm-provider.ts` is the only stage-to-model resolver.
- **`llm-provider.ts`**: routing. `parseModelString` splits `provider/model` on the first slash (unprefixed = anthropic). `modelForStage` is the canonical per-stage resolver (env chains below). `providerConfigFor` maps a provider to its key/base-URL envs, with defaults for `deepseek` (incl. the mandatory `thinking: {type:"disabled"}` extra body; DeepSeek v4 defaults to thinking-enabled, which rejects the `temperature` our stages send), `fireworks`, `together`, `openrouter` (base `https://openrouter.ai/api/v1`, key `OPENROUTER_API_KEY`; every call sends `usage: {include: true}` so responses carry OpenRouter's billed `usage.cost`), and a generic `LLM_PROVIDER_<NAME>_API_KEY/BASE_URL` scheme for anything else. `quirksForModel` holds per-model request quirks (dropping `temperature`/`top_p`, a `max_tokens` floor for reasoning models, downgrading a named forced `tool_choice` to `"required"` when thinking rejects it); add a row there for a new reasoning-mandatory model, never a special case in the adapter. `withSchemaRetry` re-asks ONCE when a non-Anthropic model returns unparseable output (ZodError, JSON SyntaxError, missing tool use); Anthropic calls never retry, preserving the original semantics.
- **`openai-compat.ts`**: the adapter. Raw fetch to `{baseUrl}/chat/completions` (no SDK dependency), translating Anthropic-native params (system blocks → system message, `cache_control` dropped since these providers prefix-cache automatically, forced `tool_choice {type:"tool"}` → `{type:"function"}`) and translating responses back to the Message shape the stage parsers read (`tool_calls` → `tool_use` blocks). Usage maps DeepSeek's `prompt_cache_hit/miss_tokens` into the Anthropic usage shape, and when a provider reports billed `usage.cost` (OpenRouter does), the traced cost prefers that over the `pricing.ts` estimate. Retries mirror direct-exa: 3 attempts on 429/5xx/network/timeout, none on other 4xx. Timeout 120s, env `LLM_OPENAI_COMPAT_TIMEOUT_MS`.
- **`pricing.ts`**: non-Anthropic pricing registry (DeepSeek v4-flash/pro rows verified 2026-06-11; OpenRouter Kimi K3 row verified 2026-07-18). Unknown models → trace omits `estimatedCostUsd`. The Anthropic table stays in `anthropic.ts` (haiku 1/5, sonnet 3/15, opus-4-5/6/7 5/25, other opus 15/75 USD per million, cache-creation multipliers 1.25x/2x, cache-read 0.1x). **Add a pricing row whenever a model joins the eval matrix.**
- **`call-trace.ts`**: shared `GenerationLlmCallTrace` builder used by both paths; every call now records `provider` (absent on rows written before routing existed; absence means anthropic).

Stage env chains, resolved by `modelForStage` (zero env changes = all-Anthropic behavior, byte-identical):

| Stage | Checked first | Then | Then |
|---|---|---|---|
| `extract_full` | `LLM_EXTRACT_MODEL` | `ANTHROPIC_EXTRACT_MODEL` | `ANTHROPIC_MODEL` |
| `extract_block` | `LLM_BLOCK_MODEL` | `ANTHROPIC_BLOCK_MODEL` | `ANTHROPIC_MODEL` |
| `verify` | `LLM_VERIFIER_MODEL` | `ANTHROPIC_VERIFIER_MODEL` | `ANTHROPIC_MODEL` |
| `synthesis` | `LLM_SYNTHESIS_MODEL` | `ANTHROPIC_SYNTHESIS_MODEL` | `ANTHROPIC_MODEL` |
| `research_section` | `LLM_RESEARCH_SECTION_MODEL` | `LLM_SYNTHESIS_MODEL`, then `ANTHROPIC_SYNTHESIS_MODEL` | `ANTHROPIC_MODEL` |
| `person_read` | `LLM_PERSON_READ_MODEL` | `LLM_SYNTHESIS_MODEL`, then `ANTHROPIC_SYNTHESIS_MODEL` | `ANTHROPIC_MODEL` |
| `research_plan` (dormant) | `LLM_RESEARCH_PLAN_MODEL` | `ANTHROPIC_RESEARCH_PLAN_MODEL` | `ANTHROPIC_MODEL` |

`anthropicSystemCacheControl()` still attaches `cache_control: { type: "ephemeral", ttl: "1h" }` at every call site (override `ANTHROPIC_CACHE_TTL=5m`); the chokepoint adds the `anthropic-beta: extended-cache-ttl-2025-04-11` header when 1h resolves, Anthropic path only.

`investor-taste-kernel.ts` and `evidence-budget.ts` make no API calls. The kernel exports two shared system-prompt strings (`investorTasteKernel`, prefixed to extraction and research-section prompts, and `researchPlannerSystemPrompt` for the dormant planner). Evidence-budget trims source text to a prompt character budget (`EXTRACTION_EVIDENCE_BUDGET_CHARS`).

## The seven call functions in packages/llm

Every one funnels through the chokepoint. All use forced tool choice for structured output except the verifier, which parses a plain JSON text response.

| # | Function | File:line | Stage | Label | Max tokens | Temp | Tool | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | `planCompanyResearch` | `research-plan.ts:128` | `research_plan` | `research-plan` | 1200 | 0 | `emit_research_plan` | DORMANT |
| 2 | `extractCompanyClaims` | `extraction.ts:778` | `extract_full` | `extract-company-claims` | 4000 | 0 | `emit_company_claims` | live |
| 3 | `extractCompanyBlockClaims` | `extraction.ts:835` | `extract_block` | `extract-block:{block}` | 1800 | 0 | `emit_block_claims` | live |
| 4 | `synthesizeCard` | `synthesis.ts:285` | `synthesis` | `synthesize-card` | 2500 | 0.2 | `emit_investor_synthesis` | live |
| 5 | `verifySynthesis` | `verifier.ts:100` | `verify` | `verify-synthesis` | 2000 | 0 | none (JSON text) | live |
| 6 | `synthesizeResearchSection` | `research-section.ts:165` | `research_section` | `research-section:{sectionId}` | 1800 | 0 | `emit_research_section` | live |
| 7 | `synthesizePersonReads` | `person-read.ts:154` | `person_read` | `synthesize-person-reads` | 220/person, floor-and-cap guarded | 0 | `emit_person_reads` | live |

Functions 2 through 5 wrap their call-and-parse in `withSchemaRetry`, so a non-Anthropic model gets one re-ask on unparseable output; on Anthropic models the wrapper is a no-op. Functions 6 and 7 do not wrap it.

Purposes:

1. **Research plan** (dormant): given only a domain, emit a company archetype, 3-6 priority questions, six provider search queries, and presentation focus. Unplugged in commit `fc7fc92` ("Cut generation cost"): the production `plan-research` step now calls `fallbackResearchPlan(domain)`, a deterministic template in `research-plan.ts:78`, with zero LLM cost. The function, its tool schema, and `ANTHROPIC_RESEARCH_PLAN_MODEL` all still exist and could be rewired.
2. **Full extraction**: turn the budgeted evidence bundle (sources + evidence ledger + research plan) into the cited card sections: identity, funding, team, signals, comparables, citations. The system prompt enforces citation discipline, the funding round-ledger standard, and description quality rules.
3. **Block enrichment**: re-extract one weak block (`description`, `funding`, `team`, `signals`, or `comparables`) with block-specific guidance and block-filtered sources, returning a patch merged over the full extraction.
4. **Card synthesis**: from the finished cited card, write the gated investor layer: `whyItMatters`, 3 bull case claims, 3 bear case claims, sparse `marketStructureAndTiming`, and 3 categorized open questions. Every claim must carry citation markers that exist on the card (`assertSynthesisCitationsExistOnCard`, `synthesis.ts:273`). The only call with non-zero temperature.
5. **Synthesis verification**: LLM-as-judge over the synthesis claims against citation snippets, returning supported/contradicted/unsupported per claim. `applyVerifierResults` (`verifier.ts:56`) then drops everything not exactly-once-supported; the pipeline never restores drops.
6. **Research section**: write one extension research-layer section (schema in `packages/core/src/research-sections.ts`) from stored card evidence, with permission to return `status: "empty"` when evidence is weak. It has its own `research_section` stage (split from `synthesis` when provider routing landed) and its own `LLM_RESEARCH_SECTION_MODEL` env, falling back to `ANTHROPIC_SYNTHESIS_MODEL` so unset envs preserve the old aliasing. Traces written before the split carry stage `synthesis` with a `research-section:` label prefix.
7. **Person reads** (added 2026-07-05, live): one batched call per contact-enrichment run turning cited people plus their source snippets into the short `read` line on each person dossier. Runs inside the contact-enrichment worker's `person-reads` step, validated per person and suppressed on thin evidence. `max_tokens` scales with the batch instead of staying flat.

## Where production calls happen: apps/web/src/inngest/

The worker registration and step boundaries live in `apps/web/src/inngest/functions.ts`. `generateCardFunction` (line 333) builds the client and resolves the five live stage models once per run via `modelForStage` (lines 486-490, including `sectionModel` for `research_section`), then injects closures into the pipeline. The section branch delegates the pure evidence-to-section work to `apps/web/src/inngest/research-section-generation.ts`, but the Inngest `generate-section` step, trace merge, and event writes stay in `functions.ts`. `packages/pipeline/src/generate-card.ts` never imports any LLM client itself; it sequences the injected functions.

Call wiring, in run order:

- `plan-research` step (`functions.ts:603`): `fallbackResearchPlan(domain)`. No LLM call.
- Section job branch (`functions.ts:493`): when the generation event carries a `requestedSectionId`, the run does only `generateStoredResearchSection` inside `step.run("generate-section")`. That helper calls `synthesizeResearchSection` in `research-section-generation.ts:125` over stored card evidence and returns. If evidence is empty it saves an empty section with no LLM call, and the trace marks provenance `derived` instead of `deep` (`functions.ts:551`).
- `extractSectionsForCard` (`functions.ts:720`): wraps `extractCompanyClaims` (`functions.ts:729`). When `mode === "analysis"` and the existing stored card is investor-usable (`reuseExistingForAnalysis`), it reparses the existing card instead and makes no call (`functions.ts:725`).
- `enrichSectionsForCard` (`functions.ts:736`): wraps `extractCompanyBlockClaims` (`functions.ts:744`). Driven by `runBlockEnrichments` in `generate-card.ts:521`: only blocks failing `blockNeedsEnrichment` checks run, in parallel via `Promise.all`, max five. Skipped entirely when `skipBlockEnrichment` (basics mode, or analysis reuse; `functions.ts:801`).
- `synthesize` and `verify` closures (`functions.ts:774-775`): injected only when `mode === "analysis"`, with `synthesisRequired: true`. The pipeline's `verifiedSynthesisForCard` (`generate-card.ts:651`) calls them back-to-back: one synthesis call, then one verify call over all synthesis claims, then drops.

Expected Anthropic calls per run:

| Run shape | Calls |
|---|---|
| `basics` | 1 (`extract_full` only) |
| `analysis`, fresh | 3 to 8 (1 `extract_full` + 0-5 `extract_block` + 1 `synthesis` + 1 `verify`) |
| `analysis`, reusing stored profile | 2 (1 `synthesis` + 1 `verify`) |
| Section job | 1 or 0 (`research-section:{id}`, skipped when evidence is empty) |
| Contact enrichment | 1 or 0 (`person_read`, one batched call; skipped when disabled or no cited people) |

`contactEnrichmentFunction` (apps/web/src/inngest/contact-enrichment.ts) makes at most one LLM call: its `person-reads` step batches every cited person into a single `synthesizePersonReads` call, skipped when `PERSON_READS_ENABLED=false` (default on) or no people qualify. Everything else in that worker is provider-only. The seed profile step (`seed-profile-card`, `functions.ts:663`, built by `packages/pipeline/src/seed-profile.ts`) is provider-facts-only; it imports only a schema and a type from `@cold-start/llm`.

## Direct Anthropic callers outside production

- `scripts/verify-cache-ttl.ts` (call at line 79): diagnostic for the 1h cache TTL beta header. Builds its own client and makes one real call through `createTracedAnthropicMessage` (stage `verify`, label `verify-cache-ttl`), defaulting to `ANTHROPIC_VERIFIER_MODEL`, then `ANTHROPIC_MODEL`, then `claude-haiku-4-5-20251001`. Run via `npm run verify:cache-ttl` after SDK upgrades. Under $0.01 per run.

## Non-Anthropic LLM usage

Per-stage provider routing (the `LLM_*_MODEL` env chains) is the only non-Anthropic LLM usage; every such call goes through the chokepoint. The Sakana Fugu comparison eval was removed in July 2026 after its free beta quota expired (June 7 2026); it lives in git history if access is ever renewed.

## Indirect LLM consumers (no SDK usage; they trigger the pipeline over HTTP or read its output)

- `eval/run-golden.mjs` (`npm run eval:golden`): hits `/api/generate` and the card routes on a deployed or local origin. LLM cost is incurred by the server-side pipeline, not the script. The `--dry-run` mode used in `npm run check` makes no generate calls.
- `scripts/trace-generation.ts` and `scripts/qa-generation-suite.ts`: trigger generation through the API and read traces from the DB.
- `scripts/optimize-generation.ts`, `scripts/evo-generation-benchmark.ts`, `scripts/repair-research-sections.ts`: read DB traces and rows only.

## Surfaces with zero LLM usage (verified, not assumed)

- `packages/providers`: Exa, StableEnrich, Firecrawl, SEC EDGAR, RDAP are data retrieval APIs; AgentCash is payments. No model calls.
- `apps/extension`: talks only to the Cold Start API. No SDK, no keys.
- `apps/web` outside `src/inngest/functions.ts`: routes queue Inngest events or read the DB. `next.config.ts` lists `@cold-start/llm` only for transpilation.
- `packages/db`, `packages/core`, `packages/ui`: schema, storage, rendering.

## Environment variables that control LLM behavior

| Var | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | required for any Anthropic call |
| `ANTHROPIC_MODEL` | default model for every stage (`claude-sonnet-4-6` currently) |
| `LLM_EXTRACT_MODEL`, `LLM_BLOCK_MODEL`, `LLM_VERIFIER_MODEL`, `LLM_SYNTHESIS_MODEL`, `LLM_RESEARCH_SECTION_MODEL`, `LLM_PERSON_READ_MODEL`, `LLM_RESEARCH_PLAN_MODEL` | per-stage provider routing; accept `provider/model` strings; checked before the ANTHROPIC_* equivalents |
| `ANTHROPIC_EXTRACT_MODEL`, `ANTHROPIC_BLOCK_MODEL`, `ANTHROPIC_SYNTHESIS_MODEL`, `ANTHROPIC_VERIFIER_MODEL`, `ANTHROPIC_RESEARCH_PLAN_MODEL` | legacy per-stage overrides, second in the chain |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` | DeepSeek credentials (base defaults to `https://api.deepseek.com`) |
| `FIREWORKS_API_KEY`, `TOGETHER_API_KEY`, `OPENROUTER_API_KEY`, `LLM_PROVIDER_<NAME>_API_KEY/BASE_URL` | other OpenAI-compatible hosts |
| `PERSON_READS_ENABLED` | `false` disables the person-reads step in contact enrichment (default on) |
| `LLM_OPENAI_COMPAT_TIMEOUT_MS` | adapter request timeout (default 120000) |
| `ANTHROPIC_CACHE_TTL` | `1h` (default) or `5m` system-prompt cache, Anthropic path only |
| `EXTRACTION_EVIDENCE_BUDGET_CHARS` | prompt-size budget for extraction and research-section evidence |

Rollback from any provider flip = unset the `LLM_*` stage env and redeploy; Vercel env changes only apply to new deployments.

## Cost streams per profile

`generation_runs.cost_usd` and `costUsdAnthropic` carry total LLM spend (named for the era when Anthropic was the only provider; the key is persisted, so it stays). `costUsdAgentcash` is the StableEnrich wallet delta. `providers.directExa.estimatedCostUsd` is Direct Exa search spend (~$0.007/request, billed to the Exa account; tracked since June 2026). Total profile cost is the sum of the three.

## The provider-matrix replay harness: eval/provider-matrix/

`npm run eval:providers:bundles` (read-only DB SELECTs) freezes real cards, their stored sources (`sources.raw_text`), and reference traces into `fixtures/{slug}.json`. `npm run eval:providers:matrix` replays the REAL stage functions over those fixtures across a model list (default `--stages extract_full,extract_block,verify`, i.e. #2, #3, #5; `synthesis` and `research_section` replay #4 and #6 as judgment stages with a fixed judge model), scoring schema validity, citation discipline, funding verbatim-faithfulness, fill rate, verify false-drop rate, cost, and latency into `runs/{ts}/report.md`. Matrix runs spend LLM tokens only; retrieval already happened in production. Fixtures and runs are gitignored (they contain scraped source text).

## Invariants to preserve when touching any of this

- New LLM calls of any provider must go through `createTracedAnthropicMessage` so routing, telemetry, cost, and the cache beta header stay uniform.
- Stage names are part of the `GenerationLlmCallTrace` schema in `packages/core/src/generation-trace.ts`; adding a stage means updating that schema, the `stageEnvChain` map in `llm-provider.ts`, and the legacy `modelEnvByStage` map together (TS Record exhaustiveness enforces the last two).
- Every model added to the eval matrix or flipped into a stage needs a row in `pricing.ts`, or its calls trace without cost and the savings math goes blind.
- DeepSeek requests must keep `thinking: {type:"disabled"}` (the provider default extra body); v4 models reject `temperature` in thinking mode.
- `withSchemaRetry` stays a no-op for Anthropic models; do not add retries to the Anthropic path.
- Group ad-hoc trace SQL by (provider, model), not model alone.
- The verifier's drops stay dropped, and `synthesizeCard` output must pass `assertSynthesisCitationsExistOnCard`. Both are correctness gates, not style.
- Synthesis only ever runs extension-gated (`analysis` mode or section jobs). Nothing on the public card path may call `synthesizeCard`.
