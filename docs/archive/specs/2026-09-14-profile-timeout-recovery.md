Status: shipped 2026-09-14 (448415a).

# Profile extraction timeout recovery

## Problem and evidence

Two initial profiles failed on production deployment `dpl_4YotCgJWsUNC2JWa2vC95EETLioY`, commit `d91a8af`, on September 14. Read-only Neon queries and Vercel request logs agree:

| Domain | Generation run | Elapsed | Result |
| --- | --- | --- | --- |
| boski.com | `9dac072c-ca34-445c-ae70-d90be3f51c21` | 259 s | `TimeoutError` at `generate-card`; no saved card |
| dumb.co | `3fbb362d-ef1b-49cc-8cc3-8ad58a5ebaab` | 268 s | `TimeoutError` at `generate-card`; no saved card |

Source retrieval completed in 13.5 s and 23.1 s. The remaining time closely matches two 120-second model waits plus the inline executor's two-second retry pause. Both runs have `inline:` execution IDs. They ran inside Vercel's retained `/api/generate` invocation, not inside Inngest. Inngest's production app is connected to this deployment; its September 11 Vivino section run independently matches the completed Neon record.

The same deployment's preceding successful profile traces identify `deepseek-v4-flash` as the extractor. The failed runs lost their model-call telemetry, so the exact provider-side reason and number of internal requests cannot be established retrospectively. The application caught and saved both errors before its 300-second route limit. These are application request timeouts, not evidence of Neon failure or Vercel terminating the process.

## Why the failures appeared suddenly

A second read-only check of Vercel's production deployment history found no deployment after August 27. Neon contains 43 initial-profile runs since then: 27 completed, 11 failed evidence checks, three failed for other reasons, and only the two September 14 runs timed out. On September 11, Vivino and Shipveho completed in 31.4 and 30.6 seconds; their extractor calls took 18.5 and 18.8 seconds.

The requested model name does not identify an immutable deployed model. DeepSeek's September 10 announcement retired V4 Flash and redirected `deepseek-v4-flash` to V4.1 Flash. Its current [model documentation](https://api-docs.deepseek.com/quick_start/pricing/) confirms that mapping. Successful September 11 calls occurred after that announcement, so the migration alone does not establish the trigger for September 14. The provider's status page reports operational service at inspection time; it provides no incident explanation for our requests.

Provider-side stalling is the leading explanation for the new symptom, with transport conditions and request-specific behavior still unresolved. The repair addresses the confirmed application recovery and observability defects. It does not prove the provider-side trigger. Before attributing the failure to a model migration, compare bounded provider requests using an approved spend cap. The owner subsequently authorized provider configuration, paid diagnostics, deployment, and live verification. The diagnostic cap is $2; the complete verification cap is $5. See the provider verification record below.

## Defects

1. Full-profile extraction lacks the alternate-provider recovery already used by synthesis. A provider timeout repeats the same work, then fails the profile.
2. The OpenAI-compatible adapter has a per-request timeout and internal retries; the inline executor adds another retry layer. There is no extraction-wide limit. A response body can time out after successful headers, outside the adapter's retry catch.
3. `generate-card` merges its model-call telemetry only after a successful step return. A thrown transient failure discards the collector, hiding the model, elapsed time, and any completed billable calls.

DeepSeek documents keep-alive whitespace before a non-streaming response completes. Receiving HTTP headers is therefore not proof that extraction has finished: [DeepSeek request keep-alive](https://api-docs.deepseek.com/quick_start/rate_limit/). Retained Next.js work still shares the route's duration limit: [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after).

## Required behavior

- Give full-profile extraction one provider attempt, including at most one existing schema correction, within one deadline. With an alternate provider available, the primary gets 45 seconds and the alternate gets 90 seconds. Without an alternate, the primary gets 90 seconds.
- Resolve the alternate from `LLM_EXTRACT_FALLBACK_MODEL`, then `LLM_FALLBACK_MODEL`, then the existing `ANTHROPIC_MODEL`. An explicit `off` disables recovery. Never call the same provider as both primary and alternate.
- Switch only on transport failures, timeout, rate limiting, server errors, or the existing insufficient-credit classification. Authentication errors, invalid model configuration, and rejected content must remain visible. Do not switch providers to evade failed citation or schema checks.
- Reuse the exact evidence and extraction schema. Run the existing trust sanitization and usable-profile check before any write. Never save the underfilled seed merely to claim success.
- Pass cancellation through both fetch and the Anthropic SDK, including response-body consumption. Disable their transport retries for this bounded extraction operation. Schema corrections share the same deadline rather than starting another clock.
- Once recovery is exhausted, return a terminal extraction error that the inline executor cannot replay. Preserve the original cause. Durable executions also receive the terminal outcome rather than repaying the exhausted sequence.
- Record every attempted provider call in the generation trace on success and failure. Keep unknown billed cost absent; never present a timed-out call as proven free. Mark a failed extraction step failed, not complete.
- Disable provider recovery in the provider-comparison runner. A candidate's failed request must not be scored as another model's successful extraction.

The extraction allowance is at most 135 seconds. This is not a promise that every whole run fits a particular duration: retrieval, storage, and provider incidents remain separate. No change to Inngest dispatch, authentication, allowances, citation rules, database schema, or UI is required.

## Acceptance checks

1. Reproduce the old failure with a primary provider timeout and a healthy alternate. Before the fix it rejects; afterward it returns schema-valid extraction and records both attempts.
2. A stalled response body aborts at the primary deadline and reaches the alternate. Two stalled providers stop within the combined deadline. No SDK, HTTP, schema, or inline retry resets either clock.
3. Authentication and invalid-content failures do not trigger provider switching. Same-provider configuration never creates a second attempt. Explicit `off` disables recovery.
4. A failing `generate-card` step persists its call telemetry. A later successful retry in the same invocation keeps the earlier failure without duplicating successful calls. Existing card writes and failure settlement still work.
5. Run focused LLM and generation tests, then the repository verification gate. Preserve unrelated work in the original checkout.

## Release and live proof

Implement on `codex/profile-timeout-recovery` in a separate worktree. The owner authorized production changes on September 14. Before release, confirm the alternate credential and model are configured, and inspect the completed diff and tests. After deployment, run the two failed domains within an explicit spend cap and verify final cards, citations, traces, and settlement in Neon. A local passing test is not production recovery.

## Provider verification

Real extraction requests used frozen production evidence for Craftcloud3D (26 sources) and Vivino (36 sources), with the production schema and citation scorer. Each request reserved a conservative maximum cost before dispatch. Transport retries were disabled and requests had cancellable deadlines.

| Route | Craftcloud3D | Vivino | Decision |
| --- | --- | --- | --- |
| OpenRouter, Gemini 2.5 Flash | 17.1 s, valid | 31.4 s, valid | Primary |
| Direct DeepSeek Flash | 14.3 s, valid | 18.7 s, valid | Alternate |
| OpenRouter, DeepSeek V4.1 Flash | One valid 10.6 s result; one 429 | 429 | Exclude from initial release |
| DeepInfra, DeepSeek V4.1 Flash | 45 s timeout; priority fail-fast returned 429 | Not run | Exclude from initial release |
| DeepInfra, DeepSeek V4 Flash 0731 | Priority fail-fast returned 429 | Not run | Exclude from initial release |

Both selected routes returned schema-valid output with no unresolved source URLs. Gemini matched all five funding checks on Vivino. The DeepSeek scorer matched six of seven; manual inspection found the seventh amount, USD 25.0M, in the frozen source, which the scorer did not recognize. That discrepancy is a scorer limitation, not evidence of an invented amount. Production trust checks remain unchanged.

OpenRouter already supports invitation art in this repository. For full extraction it now requires parameter support, excludes providers that collect data, and disables optional reasoning for Gemini 2.5 Flash and DeepSeek. Other stages retain their routing. The optional DeepInfra adapter uses priority and fail-fast for DeepSeek extraction, but it is not selected for production after the capacity failures.

Set `LLM_EXTRACT_MODEL=openrouter/google/gemini-2.5-flash` and `LLM_EXTRACT_FALLBACK_MODEL=deepseek/deepseek-flash`. Use the owner's project OpenRouter credential and the existing direct DeepSeek credential. The latter's balance endpoint confirmed USD 21.69 available after the owner's top-up. A funded account does not establish why the earlier requests timed out.

Provider traces retain returned model, serving host, response identifier, and reported usage when available. HTTP-200 gateway error envelopes are classified as errors. Known overload codes permit bounded recovery; authentication and invalid-request errors remain terminal. Unknown call cost remains absent.

## Verification and release status

The timeout and lost-telemetry regressions failed before their fixes and passed afterward. Tests cover stalled response bodies, exhausted recovery, schema correction within the original deadline, provider-switch exclusions, failed trace persistence, and successful same-invocation retry without duplicate calls.

The first full check failed at the existing dependency audit. Scoped compatible upgrades repair the blocking advisories without changing the audit policy. The final `npm run check` passed on September 14: lint, all workspace types and tests, both real-Postgres suites, production builds, Firefox validation, golden dry run, unused-code checks, secrets scan, and dependency audit. The audit still reports its existing temporary allowances and two nonblocking moderate dependency findings; no audit policy was weakened. A forced HTTP-200 overload followed by a real DeepSeek extraction completed in 13.2 seconds with both attempts recorded.

Rollback target: production deployment `dpl_4YotCgJWsUNC2JWa2vC95EETLioY` at `d91a8af`. Only the extractor model, its alternate, and the new OpenRouter credential change in the production environment. No database migration is required. Preserve all synthesis and How it wins settings.

## Where we left off

The repair is live at production code revision `5c5a111`. Boski completed in 30.355 seconds; Dumb completed in 67.798 seconds after a real 45-second primary deadline and successful direct DeepSeek recovery. Both cards passed live public and authenticated API checks. All four background enrichment jobs completed in Inngest. The final local gate and GitHub CI passed. The [production verification record](../../qa/profile-timeout-recovery-2026-09-14.md) contains run IDs, deployment identity, spending limits, the intermediate schema failure and its correction, and rollback instructions.
