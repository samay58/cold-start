# Cold Start Cost Latency Rescue Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the cost and latency rescue across telemetry, AgentCash spend, contact enrichment, source policy, analysis gating, extraction payload size, and QA docs without weakening trust boundaries.

**Architecture:** Keep Task 1 as the landed measurement base. Tasks 2, 5, and 8 are observability and documentation. Tasks 3, 4, 6, and 7 change behavior only behind env flags or tunable env values. No task changes the verifier, public/private synthesis boundary, citation contract, or `packages/core/src/card.ts`.

**Tech Stack:** Next.js 15 App Router, Inngest, Vitest, Drizzle/Postgres repository layer, AgentCash CLI wrapper, StableEnrich providers, Direct Exa providers, Anthropic trace telemetry.

---

## Scope

The source plan has eight tasks:

1. Fix milestone telemetry under Inngest replay. Done on `main` in commit `22f063d`.
2. Capture real AgentCash spend per run.
3. Defer contact enrichment off the visible basics path.
4. Add cheap-first source policy and hard people enrichment caps.
5. Add per-endpoint yield telemetry.
6. Add pre-synthesis evidence gate for analysis mode.
7. Tighten Anthropic extraction evidence payload.
8. Update docs and benchmark hygiene.

No paid live provider or LLM calls are allowed without an explicit operator approval message.

## Files By Responsibility

- `apps/web/src/app/api/generate/route.ts`: queue payload timestamps and generation request routing.
- `apps/web/src/inngest/functions.ts`: Inngest orchestration, trace assembly, provider ordering, contact enrichment dispatch, synthesis gating.
- `apps/web/src/inngest/contact-enrichment.ts`: new async contact enrichment function if splitting keeps `functions.ts` readable.
- `apps/web/src/app/api/inngest/route.ts`: register any new Inngest function.
- `apps/web/src/lib/env.ts`: read env flags once at startup.
- `packages/core/src/generation-trace.ts`: trace type additions only. Do not edit `packages/core/src/card.ts`.
- `packages/providers/src/agentcash.ts`: wallet snapshot helper.
- `packages/providers/src/stableenrich.ts`: caps, duplicate Apollo removal, named leader policy, endpoint budget enforcement.
- `packages/providers/src/provider-budget.ts`: endpoint call and stage budget metadata.
- `packages/providers/src/direct-exa.ts`: only cheap-source coverage metadata if needed.
- `packages/pipeline/src/cost.ts`: provider-tagged cost lines and budget helpers.
- `packages/pipeline/src/generate-card.ts`: synthesis gate and extraction trace propagation.
- `packages/pipeline/src/provider-facts.ts` and `packages/pipeline/src/seed-profile.ts`: endpoint yield propagation if existing merge traces need source endpoint tags.
- `packages/llm/src/extraction.ts` and `packages/llm/src/research-section.ts`: evidence payload budget.
- `scripts/trace-generation.ts`: trace display for wallet delta and endpoint yield.
- `scripts/evo-generation-benchmark.ts`: prefer new actual AgentCash cost when present.
- `README.md`, `docs/qa/generation-trace-and-production-qa.md`, `docs/qa/post-cost-cuts-test-guide.md`: operator docs.

## Task 2: Real AgentCash Spend Telemetry

- [ ] Write failing tests in `packages/providers/tests/agentcash.test.ts` for `parseAgentcashAccountsOutput` and `agentcashWalletSnapshot`.
- [ ] Implement `agentcashWalletSnapshot` in `packages/providers/src/agentcash.ts` using `agentcash accounts --format json`, returning total USD and accounts.
- [ ] Write failing tests around trace cost display in `scripts/trace-generation.ts` if existing script tests are present; otherwise add pure helper tests next to the script logic.
- [ ] Add optional wallet fields to `packages/core/src/generation-trace.ts`: `walletSnapshotBeforeUsd`, `walletSnapshotAfterUsd`, `walletDeltaUsd`, `costUsdAgentcash`, `costUsdAnthropic`.
- [ ] In `apps/web/src/inngest/functions.ts`, snapshot wallet at generation start and terminal completion/failure. Snapshot failures must warn in trace and never fail generation.
- [ ] Update `scripts/trace-generation.ts` to show budgeted StableEnrich cost, actual AgentCash delta, and Anthropic cost side by side.
- [ ] Run `npm test -w @cold-start/providers -- agentcash`, `npm test -w @cold-start/core -- generation-quality`, `npm run typecheck`.
- [ ] Commit as `Add AgentCash wallet telemetry`.

## Task 3: Deferred Contact Enrichment

- [ ] Write failing web tests proving `CONTACT_ENRICHMENT_ENABLED=false` does not dispatch contact enrichment and `true` dispatches `card/contact-enrichment.requested` after seed card save.
- [ ] Add env parsing in `apps/web/src/lib/env.ts` for `CONTACT_ENRICHMENT_ENABLED` and `CONTACT_ENRICHMENT_TIER`.
- [ ] Move `fetch-contact-sources`, `enrich-contacts`, and contact card writeback into a separate Inngest function or clearly isolated helper.
- [ ] Register the new function in `apps/web/src/app/api/inngest/route.ts`.
- [ ] Main basics flow must proceed to extraction after seed save without awaiting contacts.
- [ ] Contact function updates the same card row, writes `contactsReadyMs`, records sources/evidence, emits `card.contacts_enriched`.
- [ ] Add tests for no synthesis leak and public route compatibility by re-running existing route tests.
- [ ] Run `npm test -w @cold-start/web -- generate-route extension-bootstrap-route public-card-route`, then `npm run typecheck`.
- [ ] Commit as `Defer contact enrichment`.

## Task 4: Cheap-First Sources And Cost Caps

- [ ] Read current Direct Exa and StableEnrich request builders before editing.
- [ ] Write failing provider-budget tests for `maxCallsPerRun`, `maxStageCallsUsd`, and initial caps.
- [ ] Add budget fields to `packages/providers/src/provider-budget.ts`.
- [ ] Remove duplicate probe-list `apollo_people_search` from `buildStableenrichRequests`.
- [ ] Enforce operator caps in `packages/providers/src/stableenrich.ts`: 3 management enrichments, 2 fallback enrichments, 6 Hunter candidates.
- [ ] Skip Apollo people search/enrich once three named leaders with `sourceUrl` are available from cheap sources.
- [ ] Add `CHEAP_FIRST_EXA_ENABLED` and `PER_RUN_AGENTCASH_BUDGET_USD` env reads.
- [ ] In `apps/web/src/inngest/functions.ts`, skip StableEnrich Exa probes for intents already covered by Direct Exa accepted sources.
- [ ] Track running budget through provider cost lines and stop paid calls once ceiling is hit. Trace `budgetCeilingHit: true`.
- [ ] Run `npm test -w @cold-start/providers -- provider-budget stableenrich`, `npm test -w @cold-start/pipeline -- cost`, `npm run typecheck`.
- [ ] Commit as `Prefer cheap sources and cap paid enrichment`.

## Task 5: Endpoint Yield Telemetry

- [ ] Write failing pipeline test showing endpoint `factCount` can differ from `factsAppliedCount`.
- [ ] Ensure each `ProviderFactCandidate` carries provider and endpoint through merge.
- [ ] Propagate applied fact endpoint tags through seed profile and provider fact merge traces.
- [ ] Add `factsAppliedCount` to `GenerationProviderEndpointTrace`.
- [ ] Update `apps/web/src/inngest/functions.ts` endpoint trace assembly to include produced and applied facts.
- [ ] Update `scripts/trace-generation.ts --detail` to show low-yield endpoints where produced facts did not land.
- [ ] Run `npm test -w @cold-start/pipeline -- generate-card`, `npm test -w @cold-start/providers -- stableenrich`, `npm run typecheck`.
- [ ] Commit as `Track endpoint fact yield`.

## Task 6: Analysis Evidence Gate

- [ ] Write failing tests for weak-card analysis where synthesis and verifier functions are not called.
- [ ] Implement evidence gate in `packages/pipeline/src/generate-card.ts` with env threshold `ANALYSIS_SYNTHESIS_MIN_CITATIONS`, default 8.
- [ ] Gate requires at least two source types, funding evidence, and at least one named person.
- [ ] Trace gate result as `produced: false`, zero claims, and `gateMessage: "insufficient evidence for synthesis"`.
- [ ] Return public card with `synthesis: undefined` for gated analysis instead of failing the run.
- [ ] Update extension-facing tests so gated analysis is shown as unavailable rather than broken.
- [ ] Run `npm test -w @cold-start/pipeline -- generate-card`, `npm test -w @cold-start/web -- generate-route extension-bootstrap-route`, `npm run typecheck`.
- [ ] Commit as `Gate weak analysis synthesis`.

## Task 7: Extraction Evidence Budget

- [ ] Write failing tests in `packages/llm/tests/extraction.test.ts` for total evidence character cap and trust-priority ordering.
- [ ] Add `EXTRACTION_EVIDENCE_BUDGET_CHARS`, default 24000, with high value disabling behavior.
- [ ] Budget `evidenceForExtractionPrompt` by source trust priority: filing, independent analysis, company site, news, enrichment.
- [ ] Apply same cap pattern to `packages/llm/src/research-section.ts`.
- [ ] Run `npm test -w @cold-start/llm -- extraction`, `npm run verify:cache-ttl`, `npm run typecheck`.
- [ ] Commit as `Budget extraction evidence payloads`.

## Task 8: Docs And Benchmark Hygiene

- [ ] Update `README.md` env section for all new knobs.
- [ ] Update `docs/qa/generation-trace-and-production-qa.md` with milestone, wallet, and endpoint-yield fields.
- [ ] Update `docs/qa/post-cost-cuts-test-guide.md` with acceptance gates and no-paid-call instructions.
- [ ] Update `scripts/evo-generation-benchmark.ts` to prefer `walletDeltaUsd` when available for AgentCash cost scoring.
- [ ] Run `npm run trace:generation -- --limit 20 --quality`, `npm run trace:generation -- --domain modal.com --mode basics --detail --quality`, and `npm run eval:golden -- --dry-run --limit 12`.
- [ ] Commit as `Document cost rescue telemetry`.

## Final Gate And Merge

- [ ] Run `npm run check`.
- [ ] Run `git status --ignored --short .env .env.local .vercel .neon`.
- [ ] Run tracked secret scans from `SECURITY.md`.
- [ ] Review diff for AI slop: no broad refactors, no filler comments, no vague docs, no dark-mode/design drift, no verifier relaxation, no citation contract changes.
- [ ] Merge to `main` only after the full gate passes.
- [ ] Push `main`.
- [ ] Delete local and remote rescue branches after merge.
- [ ] Leave `git status --short --branch` clean.
