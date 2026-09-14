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

Provider-side stalling is the leading explanation for the new symptom, with transport conditions and request-specific behavior still unresolved. The repair addresses the confirmed application recovery and observability defects. It does not prove the provider-side trigger. Before attributing the failure to a model migration, compare bounded provider requests using an approved spend cap. No paid diagnostic requests were made in this investigation.

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

Implement on `codex/profile-timeout-recovery` in a separate worktree. Do not change production variables, deploy, or rerun paid production generation during local verification. Before release, confirm the alternate credential and model are configured, and inspect the completed diff and tests. After an approved deployment, run the two failed domains within an explicit spend cap and verify final cards, citations, traces, and settlement in Neon. A local passing test is not production recovery.

## Verification

The timeout and lost-telemetry regressions failed before their fixes and passed afterward. Focused checks passed: 45 extraction and recovery tests, 20 adapter tests, and 40 generation and inline-dispatch tests. Coverage includes stalled response bodies, exhausted recovery, schema correction within the original deadline, provider-switch exclusions, failed trace persistence, and successful same-invocation retry without duplicate calls.

The full `npm run check` passed lint, workspace typechecks, unit and script tests, both real-Postgres suites, web and extension builds, Firefox validation, the golden-set dry run, unused-code checks, and the secrets scan. Firefox validation reported zero errors and seven warnings. The final dependency audit failed on existing advisories, including a critical Next.js finding. Running the same audit in the untouched original checkout reproduced the same findings. No dependency or lockfile changes are included in this repair. The complete release gate is therefore not green.

## Where we left off

The repair is implemented and tested locally in the isolated worktree. Production is unchanged. Resolve the existing dependency-audit blockers, verify the configured alternate provider, then review and deploy the repair. The two capped production reruns and their saved-card readback remain the live acceptance check. Raw traces and environment downloads stay outside the repository.
