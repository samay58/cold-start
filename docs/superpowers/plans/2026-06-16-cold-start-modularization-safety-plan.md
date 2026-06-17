# Cold Start Modularization Safety Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the maintenance risk in Cold Start's largest hand-written runtime files without changing runtime behavior, API contracts, Inngest observability, database query shape, or documentation source-of-truth semantics.

**Architecture:** This is a mechanical extraction plan, not a product rewrite. Keep existing public imports working through barrel exports, move cohesive helper groups into focused modules, preserve Inngest function registration and step names, and verify each extraction with the smallest relevant test command before proceeding.

**Tech Stack:** TypeScript, Next.js App Router, Inngest, Drizzle, Vitest, node:test, Playwright, npm workspaces.

## Global Constraints

- Do not change product behavior, response shapes, route paths, Inngest event names, Inngest step names, database schema, provider request payloads, prompt text, or generated card JSON shape.
- Do not add dependencies.
- Do not add extra provider calls, LLM calls, database reads, database writes, or Inngest steps.
- Do not move code across an Inngest `step.run` or `step.sleep` boundary unless the step name, retry boundary, timing capture, and serialized return value stay byte-for-byte equivalent from the caller's point of view.
- Do not convert parallel provider work into serial work, or serial cheap-first work into parallel work. Preserve `Promise.allSettled`, `allSettledLimited`, cheap-first Direct Exa ordering, and Websets polling as written.
- Do not create package-level barrels that export app-only modules. Keep app helpers under `apps/web/src/inngest/*`; only package barrels under `packages/*/src/index.ts` may expose package APIs.
- Preserve `@cold-start/db`, `@cold-start/pipeline`, `@cold-start/providers`, and app-level import paths unless a task explicitly rewires a barrel export.
- Keep `SPEC.md`, `DESIGN.md`, `README.md`, `AGENTS.md`, and `CLAUDE.md` as source-of-truth docs. Update them only if file locations referenced there become misleading.
- Keep `docs/learn/manifest.yml`, `docs/learn/trail-0-queue-a-company-profile.md`, `docs/learn/trail-1-open-a-public-card.md`, `docs/anthropic-llm-call-map.md`, and QA playbooks current when moved files invalidate their path or line-location guidance.
- Keep `apps/web/src/inngest/functions.ts` exporting `generateCardFunction` and `contactEnrichmentFunction`.
- Keep `packages/db/src/repository.ts` exporting the same names until all callers are updated or the barrel export is proven safe.
- Keep compatibility exports from `apps/web/src/inngest/functions.ts` for helpers already imported by tests: `contactEnrichmentEnabled`, `buildContactEnrichmentRequestedEvent`, `preserveExistingBasics`, `prepareCardForStorage`, and `underfilledBasicsErrorMessage`.
- Before any runtime refactor, record the current file-size inventory and baseline tests in this plan or the execution log.
- After each task, run the targeted test listed in the task. After the final task, run `npm run typecheck`, `npm run test`, and `npm run lint`. Run `npm run check` before merging.

---

## Review Findings Incorporated

This plan was reviewed against the live repo on 2026-06-16 before execution. The review changed the draft in four material ways:

- The generate route is no longer an extraction target. `apps/web/src/app/api/generate/route.ts` is only 458 lines and is contract-dense. Splitting it now would create abstraction churn around status codes, auth gates, timing headers, active-run conflict handling, and queue failure cleanup.
- `latestProviderFailureSummary` belongs with generation-run persistence, not research events. It reads `generation_runs.trace_json`, depends on trace parsing, and should move with `findLatestGenerationRun*`, `markGenerationRun`, and `updateGenerationRunTrace`.
- `docs/learn/*` and `docs/anthropic-llm-call-map.md` are active onboarding and debugging surfaces. They must be updated after file moves; older historical implementation plans under `docs/superpowers/plans/` can remain historical unless they are the active plan being executed.
- StableEnrich is the highest line-count file, but it is also the most internally coupled. It should be split only after the DB/Inngest compatibility exports are green, and it needs an explicit dependency direction to avoid circular imports between request building, people parsing, email discovery, source conversion, and fact conversion.

## Current Size Inventory

Largest hand-written editable source files, excluding `node_modules`, build outputs, lockfiles, images, generated Drizzle snapshots, large JSON fixtures, and SpecStory archives:

| Lines | File | Read |
| ---: | --- | --- |
| 2514 | `packages/providers/src/stableenrich.ts` | Highest-risk provider monolith. Mixes endpoint config, request selection, email discovery, Apollo/Minerva/Clado/Hunter followups, source conversion, fact extraction, people parsing, ranking, and validation. |
| 2103 | `apps/web/src/inngest/functions.ts` | Highest-risk orchestration monolith. Mixes Inngest registration, env loading, source fetching, generation flow, contact enrichment, trace accounting, storage rules, and section generation. |
| 1676 | `apps/extension/src/ResearchLayerPanel.tsx` | Large UI component. Mixes panel state helpers, people rendering, progress rendering, dormant pile rendering, layer content rendering, and main layout. |
| 1490 | `apps/extension/src/sidepanel.tsx` | Large extension controller. Mixes Chrome settings, generation state, polling, networking, panels, settings form, and shell rendering. |
| 1130 | `packages/db/src/repository.ts` | Large DB repository. Mixes card cache, public summaries, research sections, sources, research events, generation runs, evidence, and trace parsing. |
| 900 | `packages/pipeline/src/generate-card.ts` | Large but more cohesive. It owns card assembly, enrichment, synthesis verification, and trace patching. Watchlist, not first split. |
| 888 | `packages/llm/src/extraction.ts` | Large but mostly cohesive. It owns extraction schema, normalization, and LLM calls. Watchlist, not first split. |
| 842 | `apps/extension/src/research-layer.ts` | Medium-large view model. It owns research layer mapping and display derivation. Watchlist, not first split. |
| 816 | `packages/ui/src/CardShell.tsx` | Medium-large shared UI. It owns public card rendering. Watchlist, not first split. |

Largest tests:

| Lines | File | Read |
| ---: | --- | --- |
| 2421 | `apps/extension/tests/sidepanel.test.tsx` | Too large, but useful as behavioral protection. Split only after runtime seams are stable. |
| 1559 | `packages/pipeline/tests/generate-card.test.ts` | Large, valuable regression net. Do not split during the first modularization pass. |
| 1383 | `packages/providers/tests/stableenrich.test.ts` | Keep intact during provider extraction. Splitting tests is separate cleanup, not part of this plan. |
| 1309 | `packages/db/tests/repository.test.ts` | Keep intact during repository extraction so the compatibility barrel stays covered. |
| 1113 | `apps/web/tests/generate-route.test.ts` | Large, but valuable as a route contract safety net. Do not split the route in this plan. |

Largest CSS files:

| Lines | File | Read |
| ---: | --- | --- |
| 5812 | `apps/extension/src/styles.css` | Very large visual surface. Split only with a CSS import strategy and visual regression check. Not part of first runtime refactor. |
| 1457 | `packages/ui/src/tokens.css` | Design-token dense. Large but acceptable if it is structured. Do not split first. |
| 898 | `apps/web/src/app/globals.css` | Medium-large app styling. Do not split first. |

## File Structure After Safe Refactor

### Inngest

- Keep: `apps/web/src/inngest/functions.ts`
  - Responsibility: register and export Inngest functions only.
  - Exports: `generateCardFunction`, `contactEnrichmentFunction`.
- Create: `apps/web/src/inngest/env.ts`
  - Responsibility: read provider env subsets and contact enrichment feature flags.
  - Exports: `stableenrichEnvFromProcess`, `directExaEnvFromProcess`, `websetsEnvFromProcess`, `contactEnrichmentEnabled`, `directExaEnabled`.
- Create: `apps/web/src/inngest/provider-trace.ts`
  - Responsibility: StableEnrich endpoint budget/yield accounting, AgentCash budget ceilings, failed endpoint summaries, and source-gate trace fragments.
  - Exports: `failedStableenrichEndpoint`, `withStableenrichEndpointBudgets`, `applyStableenrichEndpointYield`, `agentcashBudgetCeilingUsd`, `mergeEndpointFactCounts`, `remainingAgentcashBudgetUsd`. Keep `stableenrichEndpointBudgetUsd` private unless a real external caller appears.
- Create: `apps/web/src/inngest/source-fetching.ts`
  - Responsibility: fetch and merge initial Direct Exa and StableEnrich sources, compute cheap-first skips, apply source gate trace. It must not own Inngest `step.run` wrappers.
  - Exports: `fetchInitialSourcesForGeneration`, `fetchLateEnrichmentSources`.
- Create: `apps/web/src/inngest/contact-enrichment.ts`
  - Responsibility: build contact enrichment event, derive people hints, run contact source fetching, merge provider facts, store enriched card.
  - Exports: `buildContactEnrichmentRequestedEvent`, `contactEnrichmentFunction`, `cardHasContactTargets`. Keep people-hint helpers private unless tests or callers prove they need a public seam.
- Create: `apps/web/src/inngest/card-storage.ts`
  - Responsibility: preserve existing basics, prepare snapshots for storage, underfilled-card checks.
  - Exports: `preserveExistingBasics`, `prepareCardForStorage`, `underfilledBasicsErrorMessage`, `canStoreCardSnapshot`.
- Create: `apps/web/src/inngest/research-section-generation.ts`
  - Responsibility: generate one research section from stored card and sources.
  - Exports: `generateStoredResearchSection`.

### DB

- Keep: `packages/db/src/repository.ts`
  - Responsibility: barrel export for compatibility while callers migrate.
- Create: `packages/db/src/repositories/cards.ts`
  - Responsibility: card cache reads, public card reads, public summary list, upsert card, expiry dates.
- Create if needed: `packages/db/src/repositories/shared.ts`
  - Responsibility: row parsers and helpers needed by more than one repository module, such as trace parsing or research-section row conversion. Use this only to avoid import cycles.
- Create: `packages/db/src/repositories/research-sections.ts`
  - Responsibility: research section row parsing, reads, upserts, running/failed/stale transitions.
- Create: `packages/db/src/repositories/sources.ts`
  - Responsibility: stored source reads, source summaries, source writes.
- Create: `packages/db/src/repositories/research-events.ts`
  - Responsibility: research run event writes and slug/run lookup.
- Create: `packages/db/src/repositories/generation-runs.ts`
  - Responsibility: active/latest generation run lookup, stale retirement, mark run, update trace, provider failure summary derived from `generation_runs.trace_json`.
- Create: `packages/db/src/repositories/evidence.ts`
  - Responsibility: record card evidence rows.

### Providers

- Keep: `packages/providers/src/stableenrich.ts`
  - Responsibility: compatibility barrel for StableEnrich exports during migration.
- Create: `packages/providers/src/stableenrich/config.ts`
  - Responsibility: endpoint paths, env validation, endpoint URL resolution, timeout lookup.
- Create: `packages/providers/src/stableenrich/types.ts`
  - Responsibility: shared StableEnrich-only types that would otherwise create cycles between request, people, source, fact, and fetch modules.
- Create: `packages/providers/src/stableenrich/requests.ts`
  - Responsibility: build and select StableEnrich probes by tier.
- Create: `packages/providers/src/stableenrich/sources.ts`
  - Responsibility: convert probe results to provider sources.
- Create: `packages/providers/src/stableenrich/facts.ts`
  - Responsibility: convert probe results to provider fact candidates.
- Create: `packages/providers/src/stableenrich/people.ts`
  - Responsibility: people record parsing, ranking, role scoring, dedupe, hint conversion.
- Create: `packages/providers/src/stableenrich/email-discovery.ts`
  - Responsibility: Exa email discovery, Apollo discovery, Apollo enrich, Minerva, Clado, Hunter verification, email discovery summary.
- Create: `packages/providers/src/stableenrich/results.ts`
  - Responsibility: combine probe results, failures, sources, and fact candidates into the public result shape without importing the top-level fetch orchestrator.
- Create: `packages/providers/src/stableenrich/fetch.ts`
  - Responsibility: public fetch functions: `fetchStableenrichSources`, `fetchStableenrichFastSources`, `fetchStableenrichEnrichmentSources`, `fetchStableenrichPeopleEmailSources`.

Dependency direction for StableEnrich modules:

- `types.ts` and `config.ts` may be imported by any StableEnrich submodule.
- `requests.ts` may import `types.ts` and `config.ts`; it must not import `fetch.ts`.
- `people.ts` may import `types.ts` and small utilities only; it must not import `email-discovery.ts` or `fetch.ts`.
- `sources.ts` and `facts.ts` may import `types.ts`, `config.ts`, and `people.ts`; they must not import `fetch.ts`.
- `email-discovery.ts` may import `types.ts`, `config.ts`, `people.ts`, `sources.ts`, and `facts.ts`; it must not import `fetch.ts`.
- `results.ts` may import `types.ts`, `sources.ts`, and `facts.ts`; it must not import `fetch.ts`.
- `fetch.ts` is the only orchestrator module. It may import the other StableEnrich submodules.

### Extension UI

- Keep first pass unchanged. Do not include UI extraction in the same branch as DB, Inngest, or provider extraction.
- Later split `apps/extension/src/ResearchLayerPanel.tsx` into:
  - `research-layer-panel/people-line.tsx`
  - `research-layer-panel/progress-panel.tsx`
  - `research-layer-panel/layer-content.tsx`
  - `research-layer-panel/dormant-pile-card.tsx`
  - `research-layer-panel/profile-context.tsx`
- Later split `apps/extension/src/sidepanel.tsx` into:
  - `sidepanel/settings.ts`
  - `sidepanel/generation-state.ts`
  - `sidepanel/panels.tsx`
  - `sidepanel/SidePanel.tsx`

## Refactor Order

### First Wave

Start with `repository.ts`, then `functions.ts` pure helpers, contact enrichment, source fetching, and research-section generation. These are easiest to verify mechanically and reduce the worst orchestration concentration while preserving app-level import paths.

### Second Wave

Split `stableenrich.ts` in a separate branch after the Inngest code has a clearer contact-enrichment seam. StableEnrich is bigger, but it has more internal coupling, so it should not be the first cut.

### Third Wave

Write a separate extension UI plan after runtime behavior is stable. UI extraction carries visual regression risk and should use extension component tests plus Playwright smoke.

### Deferred

Do not split `apps/web/src/app/api/generate/route.ts`, `generate-card.ts`, `extraction.ts`, `research-layer.ts`, `CardShell.tsx`, or CSS files in the first modularization wave. They are large or contract-dense, but their current cohesion is stronger than the top-risk files.

## Task 1: Baseline Safety Snapshot

**Files:**
- Read: `apps/web/src/inngest/functions.ts`
- Read: `packages/db/src/repository.ts`
- Read: `packages/providers/src/stableenrich.ts`
- Read: `apps/extension/src/ResearchLayerPanel.tsx`
- Read: `apps/extension/src/sidepanel.tsx`
- Read: `apps/web/src/app/api/generate/route.ts`
- Modify: none

**Interfaces:**
- Consumes: current repo state.
- Produces: baseline command output attached to execution notes.

- [ ] **Step 1: Record source-size inventory and worktree state**

Run:

```bash
git status --short --branch
find apps packages eval scripts -path '*/node_modules/*' -prune -o -path '*/dist/*' -prune -o -path '*/dist-dev/*' -prune -o -path '*/.next/*' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.js' \) -print0 | xargs -0 wc -l | sort -nr | head -50
```

Expected: output includes `packages/providers/src/stableenrich.ts`, `apps/web/src/inngest/functions.ts`, `apps/extension/src/ResearchLayerPanel.tsx`, `apps/extension/src/sidepanel.tsx`, and `packages/db/src/repository.ts` near the top.

- [ ] **Step 2: Record baseline docs reference search**

Run:

```bash
rg -n "apps/web/src/inngest/functions\\.ts|packages/db/src/repository\\.ts|packages/providers/src/stableenrich\\.ts|apps/web/src/app/api/generate/route\\.ts|ResearchLayerPanel|sidepanel\\.tsx|generate-card\\.ts|extraction\\.ts|CardShell" AGENTS.md CLAUDE.md README.md SPEC.md DESIGN.md docs
```

Expected: active references are visible before file moves. Review `docs/learn/manifest.yml`, `docs/learn/trail-0-queue-a-company-profile.md`, `docs/learn/trail-1-open-a-public-card.md`, `docs/anthropic-llm-call-map.md`, and QA playbooks especially closely because they contain source-location guidance. Historical implementation plans under `docs/superpowers/plans/` can remain historical unless this plan depends on them.

- [ ] **Step 3: Record baseline tests for first wave**

Run:

```bash
npm test -w @cold-start/db -- repository
npm test -w @cold-start/providers -- stableenrich
npm test -w @cold-start/pipeline -- generate-card source-gate
npm test -w @cold-start/web -- generate-route generate-contact-dispatch contact-enrichment card-preservation generation-milestones
npm test -w @cold-start/extension -- research-layer sidepanel
```

Expected: all selected suites pass before refactor. If a suite already fails on main, stop and document the pre-existing failure before changing files.

- [ ] **Step 4: Record typecheck baseline**

Run:

```bash
npm run typecheck
```

Expected: typecheck passes before refactor. If it fails, stop and capture the existing error.

## Task 2: Split DB Repository Behind Compatibility Barrel

**Files:**
- Create only if needed: `packages/db/src/repositories/shared.ts`
- Create: `packages/db/src/repositories/cards.ts`
- Create: `packages/db/src/repositories/research-sections.ts`
- Create: `packages/db/src/repositories/sources.ts`
- Create: `packages/db/src/repositories/research-events.ts`
- Create: `packages/db/src/repositories/generation-runs.ts`
- Create: `packages/db/src/repositories/evidence.ts`
- Modify: `packages/db/src/repository.ts`
- Modify only if needed: `packages/db/src/index.ts`
- Test: `packages/db/tests/repository.test.ts`

**Interfaces:**
- Consumes: every current export from `packages/db/src/repository.ts`.
- Produces: same exports from `packages/db/src/repository.ts`; no caller import changes required.

- [ ] **Step 1: Move card cache functions into cards repository**

Move these existing exports with unchanged signatures:

```ts
export function cardExpiryDates(now = new Date())
export async function findCardBySlug(db: ColdStartDb, slug: string, options: CardCacheOptions = {}): Promise<ColdStartCard | null>
export async function findPublicCardBySlug(db: ColdStartDb, slug: string, options: CardCacheOptions = { mode: "basics" }): Promise<Omit<ColdStartCard, "synthesis"> | null>
export async function listPublicCardSummaries(db: ColdStartDb): Promise<PublicCardSummary[]>
export async function upsertCard(db: ColdStartDb, card: ColdStartCard)
```

Keep helper functions they directly need in `cards.ts`: `isFreshCacheRow`, `parseCachedCard`, public claim helpers, and TTL constants.

If `listPublicCardSummaries` needs research-section row conversion, do not import `cards.ts` from `research-sections.ts` or `research-sections.ts` from `cards.ts` in both directions. Either export a one-way `researchSectionFromRow` helper from `research-sections.ts` for `cards.ts` to consume, or place the row mapper in `repositories/shared.ts`.

- [ ] **Step 2: Move research section functions**

Move these existing exports with unchanged signatures:

```ts
export async function findResearchSectionsBySlug(db: ColdStartDb, slug: string): Promise<ResearchSection[]>
export async function upsertResearchSection(db: ColdStartDb, section: ResearchSection): Promise<ResearchSection | null>
export async function upsertResearchSections(db: ColdStartDb, sectionsToWrite: ResearchSection[]): Promise<void>
export async function markResearchSectionRunning(db: ColdStartDb, input: { slug: string; domain: string; sectionId: ResearchSectionId; visibility: "public" | "gated"; runId?: string | null })
export async function markResearchSectionFailed(db: ColdStartDb, input: { slug: string; domain: string; sectionId: ResearchSectionId; visibility: "public" | "gated"; error: string; runId?: string | null })
export async function retireStaleResearchSections(db: ColdStartDb, input: { slug: string; now?: Date; staleAfterMs?: number })
```

Keep `researchSectionFromRow` and `jsonStringArray` with this module unless another module consumes them.

- [ ] **Step 3: Move source functions**

Move these existing exports with unchanged signatures:

```ts
export type StoredSource = {
  id: string;
  url: string;
  title: string;
  sourceType: SourceType;
  fetchedAt: string;
  rawText: string;
}
export type SourceSummary = Omit<StoredSource, "rawText"> & {
  domain: string;
  snippet: string;
}
export async function findSourcesBySlug(db: ColdStartDb, slug: string): Promise<StoredSource[]>
export async function findSourceSummariesBySlug(db: ColdStartDb, slug: string, options: { limit?: number } = {}): Promise<SourceSummary[]>
export async function recordSource(db: ColdStartDb, input: { cardId: string; url: string; title: string; sourceType: SourceType; fetchedAt: string; rawText: string })
```

Keep `sourceDomain` and `compactSnippet` with source summaries.

- [ ] **Step 4: Move research event functions**

Move these existing exports with unchanged signatures:

```ts
export type ResearchRunEvent = {
  id: string;
  runId: string;
  slug: string;
  domain: string;
  sectionId: ResearchSectionId | null;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export async function recordResearchRunEvent(db: ColdStartDb, input: { runId: string; slug: string; domain: string; sectionId?: ResearchSectionId | null; type: string; message: string; metadata?: Record<string, unknown> }): Promise<ResearchRunEvent | null>
export async function findResearchRunEventsBySlug(db: ColdStartDb, slug: string, options: { limit?: number } = {}): Promise<ResearchRunEvent[]>
export async function findResearchRunEventsByRunId(db: ColdStartDb, runId: string, options: { limit?: number } = {}): Promise<ResearchRunEvent[]>
```

Do not move `latestProviderFailureSummary` here. It reads generation-run trace JSON, not research event rows.

- [ ] **Step 5: Move generation run functions**

Move these existing exports with unchanged signatures:

```ts
export const generationRunStaleAfterMs = 15 * 60 * 1000
export type GenerationRunSummary = {
  slug: string;
  domain: string;
  mode: GenerationMode;
  jobKind: GenerationJobKind | string;
  status: GenerationStatus;
  id?: string;
  error?: string | null;
  costUsd?: string | null;
  traceJson?: GenerationTrace | null;
  inngestEventId?: string | null;
  inngestRunId?: string | null;
  startedAt?: Date;
  completedAt?: Date | null;
}
export type GenerationRunStatusSummary = Omit<GenerationRunSummary, "traceJson" | "inngestEventId" | "inngestRunId">
export async function findActiveGenerationRunBySlug(db: ColdStartDb, slug: string, mode: GenerationMode, jobKind?: GenerationJobKind): Promise<(GenerationRunSummary & { status: ActiveGenerationStatus }) | null>
export async function findActiveGenerationRunStatusBySlug(db: ColdStartDb, slug: string, mode: GenerationMode, jobKind?: GenerationJobKind): Promise<(GenerationRunStatusSummary & { status: ActiveGenerationStatus }) | null>
export async function findLatestGenerationRunBySlug(db: ColdStartDb, slug: string, mode: GenerationMode, jobKind?: GenerationJobKind): Promise<GenerationRunSummary | null>
export async function findLatestGenerationRunStatusBySlug(db: ColdStartDb, slug: string, mode: GenerationMode, jobKind?: GenerationJobKind): Promise<GenerationRunStatusSummary | null>
export async function retireStaleGenerationRuns(db: ColdStartDb, input: { slug: string; mode: GenerationMode; jobKind?: GenerationJobKind; now?: Date; staleAfterMs?: number })
export async function markGenerationRun(db: ColdStartDb, input: { slug: string; domain: string; mode: GenerationMode; jobKind: GenerationJobKind; status: GenerationStatus; error?: string; costUsd?: number; traceJson?: GenerationTrace; inngestEventId?: string; inngestRunId?: string })
export async function updateGenerationRunTrace(db: ColdStartDb, input: { id: string; patch: (trace: GenerationTrace | null) => GenerationTrace })
export async function latestProviderFailureSummary(db: ColdStartDb, slug: string): Promise<ProviderFailureSummary>
```

Keep `safeParseTraceJson`, `generationRunSummary`, `generationRunStatusSummary`, `providerFailureSummaryFromTrace`, and provider error categorization with this module. If `safeParseTraceJson` must be shared, move it to `repositories/shared.ts` and keep the dependency one-way.

- [ ] **Step 6: Move evidence writer**

Move this existing export with unchanged signature:

```ts
export async function recordCardEvidence(db: ColdStartDb, cardId: string, card: ColdStartCard)
```

- [ ] **Step 7: Replace repository.ts with barrel exports**

`packages/db/src/repository.ts` should become:

```ts
export * from "./repositories/cards";
export * from "./repositories/evidence";
export * from "./repositories/generation-runs";
export * from "./repositories/research-events";
export * from "./repositories/research-sections";
export * from "./repositories/sources";
```

- [ ] **Step 8: Verify DB behavior**

Run:

```bash
npm test -w @cold-start/db -- repository
npm run typecheck -w @cold-start/db
npm run typecheck
```

Expected: all pass. No app caller imports should need to change.

## Task 3: Extract Inngest Pure Helpers

**Files:**
- Create: `apps/web/src/inngest/env.ts`
- Create: `apps/web/src/inngest/card-storage.ts`
- Create: `apps/web/src/inngest/provider-trace.ts`
- Modify: `apps/web/src/inngest/functions.ts`
- Test: `apps/web/tests/generate-contact-dispatch.test.ts`
- Test: `apps/web/tests/card-preservation.test.ts`
- Test: `apps/web/tests/generation-milestones.test.ts`

**Interfaces:**
- Consumes: helper functions currently embedded in `functions.ts`.
- Produces:

```ts
export function stableenrichEnvFromProcess(): StableenrichEnv
export function directExaEnvFromProcess(): DirectExaEnv
export function websetsEnvFromProcess(): WebsetsEnv
export function contactEnrichmentEnabled(input: { CONTACT_ENRICHMENT_ENABLED: boolean; CONTACT_ENRICHMENT_TIER: ContactEnrichmentTier }): boolean
export function directExaEnabled(): boolean
export function preserveExistingBasics(existing: ColdStartCard | null, next: ColdStartCard): ColdStartCard
export function prepareCardForStorage(mode: GenerationMode, existing: ColdStartCard | null, generated: ColdStartCard): ColdStartCard
export function underfilledBasicsErrorMessage(card: ColdStartCard): string
```

- [ ] **Step 1: Move env helpers**

Move these existing functions and constants with unchanged behavior:

```ts
readEnvSubset
STABLEENRICH_ENV_KEYS
DIRECT_EXA_ENV_KEYS
WEBSETS_ENV_KEYS
stableenrichEnvFromProcess
directExaEnvFromProcess
websetsEnvFromProcess
contactEnrichmentEnabled
directExaEnabled
```

Keep the `ContactEnrichmentTier` type export in `env.ts`.

- [ ] **Step 2: Move card storage helpers**

Move these existing functions with unchanged behavior:

```ts
preserveFact
preserveOptionalFact
preserveExistingBasics
prepareCardSnapshotForStorage
prepareCardForStorage
underfilledBasicsErrorMessage
canStoreCardSnapshot
noteSkippedUnderfilledSnapshot
assertTerminalCardQuality
```

Only export the helpers used outside the module. `apps/web/src/inngest/functions.ts` must continue to re-export `preserveExistingBasics`, `prepareCardForStorage`, and `underfilledBasicsErrorMessage` for existing tests.

- [ ] **Step 3: Move provider trace helpers**

Move these existing functions with unchanged behavior:

```ts
failedStableenrichEndpoint
withStableenrichEndpointBudgets
applyStableenrichEndpointYield
agentcashBudgetCeilingUsd
stableenrichEndpointBudgetUsd
mergeEndpointFactCounts
remainingAgentcashBudgetUsd
```

Keep provider trace helpers pure. They must not import `inngest`, `step`, or route modules. Export only helpers used by another module; `stableenrichEndpointBudgetUsd` should stay private if it is only used by `remainingAgentcashBudgetUsd`.

- [ ] **Step 4: Update imports in functions.ts**

Replace local helper definitions with imports:

```ts
import {
  contactEnrichmentEnabled,
  directExaEnabled,
  directExaEnvFromProcess,
  stableenrichEnvFromProcess,
  websetsEnvFromProcess
} from "./env";
import {
  canStoreCardSnapshot,
  prepareCardForStorage,
  underfilledBasicsErrorMessage
} from "./card-storage";
import {
  agentcashBudgetCeilingUsd,
  applyStableenrichEndpointYield,
  mergeEndpointFactCounts,
  remainingAgentcashBudgetUsd
} from "./provider-trace";
```

- [ ] **Step 5: Verify first Inngest helper extraction**

Run:

```bash
npm test -w @cold-start/web -- generate-contact-dispatch
npm test -w @cold-start/web -- card-preservation
npm test -w @cold-start/web -- generation-milestones
npm run typecheck
```

Expected: all pass.

## Task 4: Extract Contact Enrichment Flow

**Files:**
- Create: `apps/web/src/inngest/contact-enrichment.ts`
- Modify: `apps/web/src/inngest/functions.ts`
- Test: `apps/web/tests/generate-contact-dispatch.test.ts`
- Test: `packages/providers/tests/stableenrich.test.ts`

**Interfaces:**
- Consumes: existing DB functions, provider functions, trace helpers, and storage helpers.
- Produces:

```ts
export function buildContactEnrichmentRequestedEvent(input: {
  domain: string;
  slug: string;
  requestedAtMs: number;
  tier: ContactEnrichmentTier;
  parentGenerationRunId: string | null;
  parentInngestRunId?: string | null;
}): { name: "card/contact-enrichment.requested"; data: Record<string, unknown> }

export function cardHasContactTargets(card: ColdStartCard, tier: ContactEnrichmentTier): boolean
```

Also export a `contactEnrichmentFunction` constant using the same `inngest.createFunction` id, event, and handler body it uses before extraction.

- [ ] **Step 1: Move people hint helpers**

Move these existing functions with unchanged behavior:

```ts
peopleHintsFromSections
peopleHintsFromCard
cardHasContactTargets
peopleEmailCount
```

Only `cardHasContactTargets` needs to be exported for the main worker. Keep the people-hint helpers and `peopleEmailCount` private unless a caller proves the seam is needed.

- [ ] **Step 2: Move contact source fetching**

Move `fetchContactSourcesForBasics` with unchanged provider call order and unchanged trace shape.

Preserve this behavior exactly:

```ts
const [directContactResult, stableContactResult] = await Promise.allSettled([
  directContactPromise,
  stableContactPromise
]);
```

Do not serialize Direct Exa and StableEnrich contact calls.

- [ ] **Step 3: Move contact enrichment function**

Move the entire current `contactEnrichmentFunction` body and export it from `contact-enrichment.ts`.

Keep:

```ts
const CONTACT_ENRICHMENT_EVENT_NAME = "card/contact-enrichment.requested" as const
{ id: "contact-enrichment" }
{ event: CONTACT_ENRICHMENT_EVENT_NAME }
```

Keep step names:

```ts
"load-card"
"load-sources"
"create-websets-contact-search"
"fetch-contact-sources"
"contact-event-${name}"
"websets-wait-${attempt}"
"poll-websets-${attempt}"
"enrich-contacts"
"upsert-contact-card"
"record-contact-card-evidence"
"record-contact-research-sections"
"record-contact-sources"
"update-parent-contact-trace"
```

- [ ] **Step 4: Re-export from functions.ts**

`apps/web/src/inngest/functions.ts` should import `contactEnrichmentFunction` and keep exporting it:

```ts
export { contactEnrichmentFunction } from "./contact-enrichment";
```

If tests import `buildContactEnrichmentRequestedEvent` from `functions.ts`, keep a compatibility export:

```ts
export { buildContactEnrichmentRequestedEvent } from "./contact-enrichment";
```

Also keep compatibility exports for `contactEnrichmentEnabled` from `functions.ts`, even if its implementation now lives in `env.ts`.

- [ ] **Step 5: Verify contact behavior**

Run:

```bash
npm test -w @cold-start/web -- generate-contact-dispatch
npm test -w @cold-start/providers -- stableenrich
npm run typecheck
```

Expected: all pass.

## Task 5: Extract Initial Source Fetching and Late Enrichment Fetching

**Files:**
- Create: `apps/web/src/inngest/source-fetching.ts`
- Modify: `apps/web/src/inngest/functions.ts`
- Test: `packages/pipeline/tests/source-gate.test.ts`
- Test: `packages/pipeline/tests/generate-card.test.ts`
- Test: `apps/web/tests/generate-route.test.ts`

**Interfaces:**
- Consumes: `fetchDirectExaFundamentalsSources`, `fetchStableenrichFastSources`, `fetchStableenrichSources`, `fetchStableenrichEnrichmentSources`, `filterSourcesForDomain`, trace helpers.
- Produces:

```ts
export async function fetchInitialSourcesForGeneration(input: {
  mode: GenerationMode;
  domain: string;
  researchPlan: ProviderResearchPlan;
  runtimeEnv: ReturnType<typeof webEnv>;
  stableEnv: StableenrichEnv;
  directExaEnv: DirectExaEnv;
  agentcashBudgetCeiling: number | null;
}): Promise<{
  sources: ProviderSource[];
  providerFacts: ProviderFactCandidate[];
  failureCount: number;
  trace: Pick<GenerationTrace, "providers" | "sourceGate">;
  error: string | null;
}>

export async function fetchLateEnrichmentSources(input: {
  domain: string;
  researchPlan: ProviderResearchPlan;
  acceptedSources: ProviderSource[];
  stableEnv: StableenrichEnv;
  remainingBudgetUsd: number | null;
  missingBlocks: BlockEnrichmentId[];
}): Promise<{
  sources: ProviderSource[];
  providerFacts: ProviderFactCandidate[];
  trace: Pick<GenerationTrace, "providers" | "sourceGate">;
}>
```

- [ ] **Step 1: Move source utility helpers**

Move with unchanged behavior:

```ts
mergeSources
providerSourcesFromStoredSources
stableenrichExaSkipsForDirectCoverage
stableenrichLateEnrichmentProbeNames
stableenrichLateEnrichmentProbesByBlock
stableenrichLateEnrichmentSkipsForBlocks
```

Do not move provider budget or endpoint-yield helpers into this module. Those live in `provider-trace.ts` from Task 3.

- [ ] **Step 2: Move the current `fetch-sources` logic into `fetchInitialSourcesForGeneration`**

Preserve cheap-first behavior exactly: when `runtimeEnv.CHEAP_FIRST_EXA_ENABLED` is true, await the Direct Exa result first, derive `stableSkipProbeNames` from `stableenrichExaSkipsForDirectCoverage({ directSources: directSourcesForCoverage, domain })`, then run the StableEnrich path with those skip names. When the flag is false, keep Direct Exa and StableEnrich under one `Promise.allSettled` call.

Preserve the insufficient-balance abort behavior before any LLM card generation. Preserve source-gate trace keys and failure counts exactly.

- [ ] **Step 3: Move late enrichment source fetching**

Move only the provider/source-gate portion of the current `"fetch-enrichment-sources"` step. Keep the Inngest step named `"fetch-enrichment-sources"` in `functions.ts` so step timing and naming remain unchanged.

- [ ] **Step 4: Verify source behavior**

Run:

```bash
npm test -w @cold-start/pipeline -- source-gate
npm test -w @cold-start/pipeline -- generate-card
npm test -w @cold-start/web -- generate-route
npm run typecheck
```

Expected: all pass.

## Task 6: Extract Research Section Generation Helper, Leave Generate Route Intact

**Files:**
- Create: `apps/web/src/inngest/research-section-generation.ts`
- Modify: `apps/web/src/inngest/functions.ts`
- Test: `apps/web/tests/generate-contact-dispatch.test.ts`
- Test: `apps/web/tests/generation-milestones.test.ts`

**Interfaces:**
- Consumes: existing DB reads, stored source rows, section synthesis, and section citation validation.
- Produces:

```ts
export async function generateStoredResearchSection(input: {
  db: ColdStartDb;
  slug: string;
  domain: string;
  sectionId: ResearchSectionId;
  runId: string | null;
  client: ReturnType<typeof createAnthropicClient>;
  model: string;
  telemetry: Parameters<typeof synthesizeResearchSection>[0]["telemetry"];
}): Promise<ResearchSection>;
```

- [ ] **Step 1: Move section evidence helpers**

Move:

```ts
normalizedUrlKey
evidenceForSection
citationIdsFromSectionContent
sectionFromGeneratedContent
generatedEmptySection
```

Keep citation validation behavior unchanged:

```ts
researchSectionCitationIssues(card, section)
researchSectionHasReaderFacingEvidence(card, section)
```

- [ ] **Step 2: Move the inner section generation work**

Move only the body that currently runs inside the Inngest step named `"generate-section"` into `generateStoredResearchSection`.

The helper should keep these operations in the same order:

- Load `findCardBySlug(db, slug, { allowStale: true })`.
- Guard with `hasUsablePublicProfile(existingCardForSection)`.
- Load `findSourcesBySlug(db, slug)`.
- Build `evidenceForSection(existingCardForSection, storedSources)`.
- Call `synthesizeResearchSection` with the same `client`, `definition`, `evidence`, `model`, `company`, and `telemetry` fields used before extraction.
- Convert with `sectionFromGeneratedContent(existingCardForSection, sectionId, content, runId)`.

The helper should return an empty section when there is no evidence, exactly as the current path does. It should throw `"profile not found"` for the missing or unusable profile path, exactly as the current path does.

- [ ] **Step 3: Keep Inngest step and trace ownership in functions.ts**

Keep the Inngest step named `"generate-section"` in `functions.ts`.

`functions.ts` should still own:

- The existing `timed` wrapper around the helper call.
- `createStepLlmTelemetryCollector()`.
- The `"generate-section"` trace patch.
- The post-step `trace.sections` update.
- The `research-section:` LLM call labeling and `sectionId` annotation.
- The `upsert-generated-section`, `mark-section-generation-complete`, and failure paths.

Do not move this trace post-processing into the helper unless the final trace JSON is proven identical on a before/after run.

- [ ] **Step 4: Leave `apps/web/src/app/api/generate/route.ts` unsplit**

Do not create these files in this pass:

```ts
apps/web/src/app/api/generate/request.ts
apps/web/src/app/api/generate/response.ts
apps/web/src/app/api/generate/queue.ts
```

The generate route is contract-dense and currently only 458 lines. Splitting it now is abstraction churn. If a future route refactor is needed, it must be planned separately around `apps/web/tests/generate-route.test.ts`, `apps/web/tests/generate-contact-dispatch.test.ts`, and a response-shape fixture capture.

- [ ] **Step 5: Verify section behavior and route stability**

Run:

```bash
npm test -w @cold-start/web -- generate-contact-dispatch generation-milestones
npm test -w @cold-start/web -- generate-route
npm run typecheck
```

Expected: all pass.

## Task 7: Split StableEnrich Provider Internals

**Files:**
- Create: `packages/providers/src/stableenrich/types.ts`
- Create: `packages/providers/src/stableenrich/config.ts`
- Create: `packages/providers/src/stableenrich/requests.ts`
- Create: `packages/providers/src/stableenrich/sources.ts`
- Create: `packages/providers/src/stableenrich/facts.ts`
- Create: `packages/providers/src/stableenrich/people.ts`
- Create: `packages/providers/src/stableenrich/email-discovery.ts`
- Create: `packages/providers/src/stableenrich/results.ts`
- Create: `packages/providers/src/stableenrich/fetch.ts`
- Modify: `packages/providers/src/stableenrich.ts`
- Modify only if needed: `packages/providers/src/index.ts`
- Test: `packages/providers/tests/stableenrich.test.ts`

**Interfaces:**
- Consumes: existing StableEnrich exports.
- Produces: same public exports from `packages/providers/src/stableenrich.ts`.

- [ ] **Step 1: Move shared types**

Move StableEnrich-only public and internal types that are referenced by more than one new submodule:

```ts
StableenrichEmailDiscovery
AgentcashBudgetState
StableenrichProbeFailure
StableenrichSourcesResult
```

Keep package-level provider types, such as `ProviderSource` and `ProviderFactCandidate`, in their current package files. Do not duplicate them under `stableenrich/`.

- [ ] **Step 2: Move config**

Move:

```ts
stableenrichBaseUrl
stableenrichPaths
missingStableenrichConfig
requireStableenrichConfig
stableenrichEndpointUrl
stableenrichProbeTimeoutMs
createAgentcashBudgetState
takeAgentcashBudget
```

Export only what other new modules need.

- [ ] **Step 3: Move request construction**

Move:

```ts
fastStableenrichProbeNames
selectStableenrichRequests
buildStableenrichRequests
```

Preserve exact probe names and request bodies.

- [ ] **Step 4: Move people utilities**

Move all `PersonRecord` helpers and ranking logic:

```ts
PersonRecord
extractPeopleRecords
peopleHintsFromSearchResults
peopleHintsFromProviderSources
peopleRecordsFromEmailHints
rankPeople
dedupePeopleInOrder
isUsablePersonRecord
personPath
personNameKey
```

- [ ] **Step 5: Move email discovery**

Move:

```ts
runExaEmailDiscovery
runSecEdgarDiscovery
runApolloPeopleDiscovery
runStableenrichPeopleFollowups
runPeopleFollowupRequests
runMinervaEmailFallbackRequests
runCladoEmailFallbackRequests
summarizeEmailDiscovery
emailCandidatesForPerson
hunterVerificationAccepted
hunterVerificationConfidence
```

Preserve concurrency and budget checks. Do not increase `MAX_LEADERS_FOR_ENRICHMENT`, `MAX_FALLBACK_LEADERS`, or `MAX_HUNTER_CANDIDATES`.

- [ ] **Step 6: Move source and fact conversion**

Move source conversion to `sources.ts`:

```ts
collectStableenrichSources
providerSourceFromText
providerSourcesFromProbeResult
exaResultSources
sourceTypeForProbe
intentForProbe
```

Move fact conversion to `facts.ts`:

```ts
providerFactsFromProbeResult
orgEnrichmentFacts
peopleFacts
exaEmailFacts
hunterEmailFact
personFactCandidates
signalFacts
providerFact
addStringFact
addUrlFact
```

- [ ] **Step 7: Move result assembly**

Move any result-combining code that joins probe failures, provider sources, and provider facts into `StableenrichSourcesResult`.

Do not import `fetch.ts` from `results.ts`. `fetch.ts` must remain the only public orchestration layer.

- [ ] **Step 8: Move public fetch functions**

Move:

```ts
runStableenrichProbe
fetchStableenrichSources
fetchStableenrichFastSources
fetchStableenrichEnrichmentSources
fetchStableenrichPeopleEmailSources
```

Preserve endpoint request order, `allSettledLimited` limits, AgentCash budget checks, and no-retry semantics for paid StableEnrich calls.

- [ ] **Step 9: Keep stableenrich.ts as compatibility barrel**

`packages/providers/src/stableenrich.ts` should export:

```ts
export * from "./stableenrich/types";
export * from "./stableenrich/config";
export * from "./stableenrich/fetch";
export * from "./stableenrich/requests";
export * from "./stableenrich/sources";
export * from "./stableenrich/facts";
export * from "./stableenrich/people";
export * from "./stableenrich/email-discovery";
export * from "./stableenrich/results";
```

- [ ] **Step 10: Verify provider behavior**

Run:

```bash
npm test -w @cold-start/providers -- stableenrich
npm test -w @cold-start/web -- generate-contact-dispatch
npm test -w @cold-start/pipeline -- generate-card
npm run typecheck -w @cold-start/providers
npm run typecheck
```

Expected: all pass.

## Task 8: Separate Follow-Up Plan for Extension UI, Do Not Mix With Runtime Refactor

This task is intentionally not part of the DB/Inngest/provider execution branch. Create a separate plan and branch before doing it. The outline below records the likely seams so the runtime refactor does not pretend UI risk is solved.

**Files:**
- Create: `apps/extension/src/research-layer-panel/people-line.tsx`
- Create: `apps/extension/src/research-layer-panel/progress-panel.tsx`
- Create: `apps/extension/src/research-layer-panel/layer-content.tsx`
- Create: `apps/extension/src/research-layer-panel/dormant-pile-card.tsx`
- Modify: `apps/extension/src/ResearchLayerPanel.tsx`
- Test: `apps/extension/tests/research-layer.test.ts`
- Test: `apps/extension/tests/sidepanel.test.tsx`
- Test: `apps/extension/tests/e2e/sidepanel-ui.spec.ts`

**Interfaces:**
- Consumes: current props and helper functions in `ResearchLayerPanel.tsx`.
- Produces: same `ResearchLayerPanel` export and same rendered DOM semantics.

- [ ] **Step 0: Stop if runtime refactor changes are still in the branch**

Do not start this task until DB, Inngest, source-fetching, research-section, and StableEnrich changes have either shipped or been abandoned. If the branch contains runtime extraction changes, stop and create a new branch for UI work.

- [ ] **Step 1: Extract PeopleLine**

Move people-specific helpers and component:

```ts
roleScore
preferredPerson
managementPeople
managementSourceCount
personRole
personInitials
peopleEmailCount
emailKind
personTooltipBody
peopleEmailSummary
managementConfidence
PeopleLine
```

Export:

```ts
export function managementPeople(card: ColdStartCard): CardPerson[];
export function managementSourceCount(card: ColdStartCard): number;
export function managementConfidence(card: ColdStartCard): ColdStartCard["team"]["founders"]["confidence"] | null;
export function PeopleLine(props: PeopleLineProps): JSX.Element | null;
```

- [ ] **Step 2: Extract progress panel**

Move:

```ts
ResearchProgressPanel
progressPlanHasAttention
currentProgressProof
sourceKindLabel
plural
```

- [ ] **Step 3: Extract layer content components**

Move:

```ts
LayerContent
MoneyLayerItems
SignalLayerItems
TheCaseLayerItems
SourceChips
```

- [ ] **Step 4: Extract dormant pile card**

Move:

```ts
DormantPileCard
dormantPileDepth
dormantStackNumber
```

- [ ] **Step 5: Verify extension UI**

Run:

```bash
npm test -w @cold-start/extension -- research-layer
npm test -w @cold-start/extension -- sidepanel
npm run qa:extension:ui -w @cold-start/extension
npm run qa:extension:smoke -w @cold-start/extension
```

Expected: tests pass and the compact people line still renders source count, visible people, email state, and tooltips.

## Task 9: Documentation and Contract Check

**Files:**
- Read: `AGENTS.md`
- Read: `CLAUDE.md`
- Read: `README.md`
- Read: `SPEC.md`
- Read: `DESIGN.md`
- Read: `docs/anthropic-llm-call-map.md`
- Read: `docs/qa/generation-trace-and-production-qa.md`
- Read: `docs/qa/extension-closed-loop-testing-playbook.md`
- Read: `docs/learn/manifest.yml`
- Read: `docs/learn/trail-0-queue-a-company-profile.md`
- Read: `docs/learn/trail-1-open-a-public-card.md`
- Modify only if stale path references exist: same files

**Interfaces:**
- Consumes: final refactored file layout.
- Produces: docs that point to current source files.

- [ ] **Step 1: Search docs for moved file references**

Run:

```bash
rg -n "apps/web/src/inngest/functions\\.ts|packages/db/src/repository\\.ts|packages/providers/src/stableenrich\\.ts|apps/web/src/app/api/generate/route\\.ts|ResearchLayerPanel|sidepanel\\.tsx|generate-card\\.ts|extraction\\.ts|CardShell" AGENTS.md CLAUDE.md README.md SPEC.md DESIGN.md docs
```

Expected: list of references to review.

- [ ] **Step 2: Update only misleading references**

Examples of acceptable updates:

```md
- Pipeline run debugging: `apps/web/src/inngest/functions.ts` for registration, `apps/web/src/inngest/source-fetching.ts` for provider orchestration, `apps/web/src/inngest/contact-enrichment.ts` for people/contact enrichment, and `packages/pipeline/src/generate-card.ts` for card assembly.
```

Do not rewrite product docs for style. Only fix source-location drift.

Specific doc obligations:

- `AGENTS.md` and `CLAUDE.md`: update "Workspace Layout", data flow, and "Where To Look First" only if the new layout makes the current file pointers incomplete or misleading.
- `docs/learn/manifest.yml`: update exact source file and line-location references after extraction. If line numbers moved, refresh them after the final patch, not before.
- `docs/learn/trail-0-queue-a-company-profile.md` and `docs/learn/trail-1-open-a-public-card.md`: update active learning path references to `functions.ts`, new Inngest helper modules, `repository.ts`, and new repository modules as needed.
- `docs/anthropic-llm-call-map.md`: update the production call map so it still identifies every LLM call path. Preserve the stated invariants that contact enrichment makes zero LLM calls and production LLM calls go through `createTracedAnthropicMessage`.
- `docs/qa/generation-trace-and-production-qa.md`: update only if trace-producing source locations changed. Do not change QA commands unless the command itself changed.
- `docs/qa/extension-closed-loop-testing-playbook.md`: update only if the extension UI follow-up branch changes component locations.
- Historical plans under `docs/superpowers/plans/` do not need retroactive source-location edits unless they are being used as active execution instructions.

- [ ] **Step 3: Run final verification for the branch being executed**

Run:

```bash
npm run typecheck
npm run test
npm run lint
npm run check
```

Expected: all pass. If `npm run check` is slow but available, it is the merge gate for any runtime modularization branch.

## Self-Review

Spec coverage:

- Biggest files identified and classified.
- First wave avoids UI and CSS risk.
- First wave also avoids the generate route because it is contract-dense rather than modularization-dense.
- Runtime behavior constraints are explicit.
- Inngest event and step names are protected.
- DB imports remain compatible through barrel export.
- Provider calls, budgets, and concurrency are protected.
- Active docs and learning trails are checked after path changes exist; historical plans are left historical.

Placeholder scan:

- No task uses placeholder markers or generic "add tests" language.
- Each task has exact files, exact interfaces, and exact verification commands.

Type consistency:

- `GenerationMode`, `ContactEnrichmentTier`, `ColdStartCard`, `ExtractedCardSections`, `PeopleEmailHint`, `ProviderSource`, and `ProviderFactCandidate` match existing domain types.
- Compatibility barrels preserve existing caller imports before optional migration.
- `latestProviderFailureSummary` stays with generation-run trace parsing.
- Route parsing, response serialization, queued-run cleanup, and timing headers stay inside `apps/web/src/app/api/generate/route.ts`.

## Execution Recommendation

Do not execute the whole plan in one large branch.

Execute Tasks 1 through 6 plus Task 9 documentation checks first, then pause for review. That first wave reduces the worst `functions.ts` and `repository.ts` concentration while leaving the generate route, StableEnrich internals, and extension UI alone.

Execute Task 7 only in a second branch after the first wave is green. Execute Task 8 only as a separate UI plan and branch. If the first wave exposes unstable tests or unclear trace equivalence, stop there rather than continuing into provider or UI modularization.
