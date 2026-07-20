# Investor Lens Overhaul and Person Hovercard Craft Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Record findings inline as `**Finding (date):**` / `**Done (date):**` blocks under each task, following the conventions of the Firefox and Kimi plans in this directory.

**Goal:** Kill the silent synthesis withhold and the stale-TTL dead end, get analysis p50 under 60s with free wins only, rebuild the read as a memo, dock the person dossier so occlusion is structurally impossible, and leave behind a fixture gallery that makes all of it cheap to iterate.

**Architecture:** Five sequential slices, each gated on `npm run check` green plus a slice-specific review. Slice 1 makes withholding server truth (`synthesisEvidenceGate` in `packages/pipeline/src/generate-card.ts` refactors to a floor-plus-advisory decision backed by a new shared `packages/core/src/synthesis-evidence.ts`; the route in `apps/web/src/app/api/generate/route.ts` gains a free pre-check; the extension replaces its guessing heuristic with a withheld card fed by gated card JSON). Slice 1.5 builds the reference library. Slice 2 rebuilds `InvestorReadCard` (extracted to its own file) on a documented type scale with one-source-of-truth CSS, iterated inside a new fixture gallery. Slice 3 gives `SharedTooltip` a docked placement mode plus open intent. Slice 4 splits synthesis and verify into separate Inngest steps, gates source re-fetch behind a flag with a shadow bar, and builds the analysis wait from the building arc's instrument family.

**Tech Stack:** Next.js 15 App Router, Inngest v4, Drizzle/Neon (HTTP driver), Vite + CRXJS MV3 extension, React 19, Framer Motion, Playwright, vitest, zod.

**Design authority:** `docs/superpowers/specs/2026-07-20-investor-lens-overhaul-design.md` (the approved decision record). Where this plan and the spec disagree, the spec wins; flag the conflict instead of guessing.

## Global Constraints

- Synthesis, person reads, and the new `synthesisWithheld` record never reach the public card path. `publicCard()` strips them all.
- Every synthesis sentence resolves to a citation ID in top-level `citations[]`; the verifier verdict is final; empty bull/bear sections are honest states, never padded.
- Synthesis stays on `claude-sonnet-4-6` (or `ANTHROPIC_SYNTHESIS_MODEL`). No routing, prompt, max_tokens, or quality-gate change anywhere in this plan.
- Any re-fetch or gate behavior change that could alter synthesis quality promotes only after 20+ comparable shadow runs show no drop in verifier-surviving claims, `hasUsablePublicProfile`, or `hasInvestorUsableProfile` (cost-quality playbook bar).
- Route or response shape changes bump `packages/core/api-contract.json` and require an extension rebuild; note the deployed-extension upgrade path in the slice gate.
- Inngest event names and step ids are frozen once shipped. New step ids introduced by this plan deploy in a quiet window; `npm run repair:stuck-runs` covers stragglers.
- Neon HTTP driver: no interactive transactions, no `SELECT ... FOR UPDATE`. Multi-statement writes use `db.batch`; contended updates use optimistic CAS.
- Catalogue Card language per `DESIGN.md`: At Umami display face in the extension, IBM Plex Sans body, At Textual receipt accents, one lilac seal accent (`--color-seal #6E5C9E`), light-first, 6px radii, evidence colors as small marks only, no pervasive mono.
- Motion: acknowledgment under 120ms, transitions 160-260ms, one signature progress loop at a time, transform/opacity only. `prefers-reduced-motion` is a reduction, never a freeze; essential loading indicators still animate. Samay reviews with macOS Reduce Motion ON by default; remind him to turn it OFF, and treat a frozen screen under reduced motion as a bug.
- No em-dashes in any UI copy or generated docs. Run `python3 ~/.claude/scripts/slopcheck.py <file>` on every prose artifact.
- SPEC.md updates in the same branch as any gating or mode behavior change. AGENTS.md stays in sync with CLAUDE.md when file pointers move.
- `npm run check` green is the bar for every slice. Worktrees fail lint (known); run the gate from the main tree. Do not pipe `check` through `tail` (eats the exit code).
- File:line anchors in this plan were verified 2026-07-20. Re-grep before editing; code moves.
- Env for prod reads: `set -a; source .env.production.migrate.local; set +a`. Read-only SELECTs unless a task says otherwise.

---

## Phase 1: Correctness and observability (Slice 1)

Phase exit gate: the 11 known silent-gate slugs re-run into either a read or an honest withheld card naming real missing evidence; a withheld run is distinguishable from success and from failure in both DB and UI; re-click on unchanged evidence costs nothing; the stale-TTL 404 is unreachable; a latency baseline report exists; contract bumped once; `npm run check` green; deployed.

### Task 1.1: Shared evidence-signals module in core

**Files:**
- Create: `packages/core/src/synthesis-evidence.ts`
- Create: `packages/core/tests/synthesis-evidence.test.ts`
- Modify: `packages/core/src/index.ts` (export the new module the same way `card-quality.ts` is exported)

**Interfaces:**
- Consumes: `ColdStartCard` from `packages/core/src/card.ts`.
- Produces (later tasks rely on these exact names):

```ts
export type SynthesisGateReason = "citation-floor" | "no-usable-source-type";
export type SynthesisAdvisory = "single-source-class" | "no-funding-evidence" | "no-named-team";

export type SynthesisEvidenceSignals = {
  citationCount: number;
  nonEnrichmentSourceTypes: string[];
  hasFundingEvidence: boolean;
  hasNamedTeamMember: boolean;
};

export type SynthesisGateDecision = {
  blocked: boolean;
  reasons: SynthesisGateReason[];
  advisories: SynthesisAdvisory[];
  signals: SynthesisEvidenceSignals;
};

export function synthesisEvidenceSignals(card: ColdStartCard): SynthesisEvidenceSignals;
export function synthesisGateDecision(card: ColdStartCard, minCitations: number): SynthesisGateDecision;
```

Semantics, copied from the approved spec: `blocked` is true only when `citationCount < minCitations` OR `nonEnrichmentSourceTypes.length < 1`. Diversity below 2, missing funding evidence, and missing named team member populate `advisories`, never `reasons`. Signal extraction logic ports verbatim from the existing gate at `packages/pipeline/src/generate-card.ts:107-138` (non-enrichment source-type set, `hasCitedFact` on `totalRaisedUsd`/`lastRound`, trimmed founder/exec names) so behavior is identical for the pieces that survive.

- [x] **Step 1: Write failing tests.** Fixture cards built inline (follow the fixture style already in `packages/core/tests/first-payoff.test.ts`). Cases: (a) news-only card with 20 citations blocks nothing, advisories `["single-source-class", ...]` as applicable; (b) card with 5 citations blocks with `["citation-floor"]`; (c) card whose citations are all `enrichment` blocks with `["no-usable-source-type"]`; (d) rich card returns no reasons, no advisories; (e) card missing team but rich otherwise gets `advisories: ["no-named-team"]`, `blocked: false`.
- [x] **Step 2: Run and confirm fail.** `npm test -w @cold-start/core -- synthesis-evidence`. Expected: module not found.
- [x] **Step 3: Implement the module.** Port the signal extraction from the pipeline gate; keep core dependency-free (no DB, no providers).
- [x] **Step 4: Run and confirm pass.** Same command. Expected: all green.
- [x] **Step 5: Commit.** `git commit -m "Add shared synthesis evidence signals and gate decision to core"`

**Done (2026-07-20):** Commit `bb134d8`. 6/6 new tests, core suite 173/173, typecheck clean. Review approved. Boundary note for Task 1.2: the pipeline's old gate short-circuits `{ ok: true }` when `minCitations <= 0`; the core decision has no such bypass, so the pipeline caller must preserve gate-disabled semantics at floor <= 0.

### Task 1.2: Gate refactor in pipeline, diagnostics persisted to trace

**Files:**
- Modify: `packages/pipeline/src/generate-card.ts` (gate at :107-138, caller/tracePatch at :829-871, throw guard at :860)
- Modify: `packages/core/src/generation-trace.ts` (`GenerationTrace["synthesis"]` at :215-222)
- Test: `packages/pipeline/tests/generate-card.test.ts` (existing gate tests around :576)

**Interfaces:**
- Consumes: `synthesisGateDecision` from Task 1.1. `analysisSynthesisMinCitations()` (env `ANALYSIS_SYNTHESIS_MIN_CITATIONS`, default 8) stays the floor source.
- Produces: `tracePatch.synthesis.gate` persisted for every analysis run that evaluates the gate:

```ts
// added to GenerationTrace["synthesis"], all optional for back-compat:
gate?: {
  blocked: boolean;
  reasons: string[];
  advisories: string[];
  citationCount: number;
  sourceTypeCount: number;
  hasFundingEvidence: boolean;
  hasNamedTeamMember: boolean;
};
```

The persisted-trace schema is `.passthrough()` (`generation-trace.ts:233-236`), so no migration and old rows stay valid. The no-throw behavior when gated stays exactly as is (`!verifiedSynthesis && deps.synthesisRequired && !synthesisGated` guard untouched); what changes is that gating now happens only on the floor, and everything the gate computed reaches the trace.

- [ ] **Step 1: Write failing tests.** Extend the existing gate tests: (a) news-only card (previously gated) now produces synthesis and the trace carries `gate.advisories` including `"single-source-class"`; (b) 5-citation card still gates, run does not throw, `gate.blocked === true` with `reasons: ["citation-floor"]` in the trace patch; (c) the legacy `gateMessage` field still carries a message when blocked (keep it for old readers).
- [ ] **Step 2: Run and confirm fail.** `npm test -w @cold-start/pipeline -- generate-card`.
- [ ] **Step 3: Implement.** Replace the inline gate body with a call to `synthesisGateDecision(card, minCitations)`; map decision into the trace patch; delete the now-dead inline field plumbing.
- [ ] **Step 4: Run and confirm pass.** Plus `npm run typecheck`.
- [ ] **Step 5: Commit.**

### Task 1.3: Gate study over prod cards (validation before the policy ships)

**Files:**
- Create: `scripts/study-synthesis-gate.ts` (read-only; self-loads `.env.production.migrate.local` falling back to `.env.local`, copy the loader pattern from `scripts/measure-first-usable.ts`)
- Modify: `package.json` (root): add `"study:synthesis-gate": "tsx scripts/study-synthesis-gate.ts"`

**Interfaces:**
- Consumes: `synthesisGateDecision` from Task 1.1; prod `cards.card_json` for the analysis-run population of the last 60 days.
- Produces: a console report table: slug, old-gate outcome, new-gate outcome, reasons, advisories. No writes.

- [ ] **Step 1: Implement the script.** Pull the cards for every `job_kind='analysis'` run in 60 days (dedupe by slug), run both old-condition logic and `synthesisGateDecision` over each, print the delta table. The 11 known withheld slugs (moonshot, generaltranslation, fanttik x2, nuoathletics, heynox, timescaledb x3, aside x2) must appear.
- [ ] **Step 2: Run it and record the finding here.** Expected shape: most of the 11 flip to advisory-synthesis; any card the NEW gate still blocks gets a one-line justification (genuinely under-cited). If the floor of 8 blocks a card that plainly deserves a read, raise that as a decision question before proceeding; do not silently tune the floor.
- [ ] **Step 3: Commit the script.**

### Task 1.4: Withheld record on the card, stripped from public

**Files:**
- Modify: `packages/core/src/card.ts` (schema; the strip lives wherever synthesis is stripped today, follow `publicCard()` and its tests)
- Modify: `packages/pipeline/src/generate-card.ts` (write the record when the floor blocks; clear it when synthesis is produced)
- Test: `packages/core/tests/` card schema tests; `packages/pipeline/tests/generate-card.test.ts`

**Interfaces:**
- Produces (extension reads this in Task 1.6):

```ts
// optional, gated field on ColdStartCard, sibling of synthesis:
synthesisWithheld?: {
  at: string;               // ISO timestamp of the withholding run
  reasons: string[];        // SynthesisGateReason values
  advisories: string[];     // SynthesisAdvisory values
  citationCount: number;
  sourceTypeCount: number;
};
```

- [ ] **Step 1: Failing tests.** (a) `publicCard()` output never contains `synthesisWithheld` (add to the existing public-strip test the same way synthesis is asserted absent); (b) pipeline: floor-blocked run writes the record with the run's reasons; (c) a later successful synthesis clears it (`synthesisWithheld` absent when `synthesis` present).
- [ ] **Step 2: Confirm fail.** `npm test -w @cold-start/core && npm test -w @cold-start/pipeline -- generate-card`.
- [ ] **Step 3: Implement.** Zod: optional object with the exact shape above; keep it out of citation-requirement logic (it is metadata, not a fact).
- [ ] **Step 4: Confirm pass.** Include `npm run typecheck`.
- [ ] **Step 5: Commit.**

### Task 1.5: Route behavior: free pre-check, stale-in-run, TTL semantics

**Files:**
- Modify: `apps/web/src/app/api/generate/route.ts` (cached check at :296, analysis 404 at :274-276)
- Modify: `packages/db/src/repositories/cards.ts` (`isFreshCacheRow` :61-70, `findCardBySlug` :77-99, `upsertCard` :191-227)
- Test: route tests under `apps/web` (follow the existing generate-route test file location) and `packages/db` repository tests

**Interfaces:**
- Consumes: `synthesisWithheld` from Task 1.4; existing `forceRefresh` request field (already in the API schema; the extension starts sending it in Task 1.6).
- Produces: three behaviors later tasks and the extension rely on:
  1. **Free pre-check:** analysis request + cached card + `card.synthesisWithheld` present + card row `updated_at <= synthesisWithheld.at` + `forceRefresh !== true` returns `200 { status: "withheld", card }` without queueing a run. (Response `status` string is new; contract bump in Task 1.6 covers it.)
  2. **Stale-in-run:** the analysis existence check reads the card row ignoring TTL freshness (add `findCardBySlug(db, slug, { allowStale: true })` or a sibling `findCardRowBySlug` if the flag does not exist; check the repository first). Card exists but stale: queue the analysis run (the run refreshes sources per Phase 4 policy; until then it does the full fetch it does today). Card genuinely absent: keep the 404.
  3. **TTL semantics:** `upsertCard` extends `synthesisExpiresAt` only when the written card actually carries `synthesis`; identity/signals TTL behavior unchanged.

- [ ] **Step 1: Failing tests.** Route: (a) withheld + unchanged card returns 200 withheld, no Inngest event sent (assert on the mocked queue); (b) withheld + `forceRefresh: true` queues; (c) withheld + card updated after `synthesisWithheld.at` queues; (d) stale card + analysis queues instead of 404; (e) missing card still 404s. Repository: (f) upsert without synthesis leaves `synthesisExpiresAt` unchanged; (g) upsert with synthesis extends it.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement.** Keep the pre-check *before* the active-run check so a queued duplicate is impossible. Reuse `forceRefresh`; do not invent a second flag.
- [ ] **Step 4: Confirm pass.** `npm test -w web` (or the workspace's actual name; check `apps/web/package.json`) plus `npm test -w @cold-start/db`.
- [ ] **Step 5: Commit.**

### Task 1.6: Extension honest withheld state, contract bump, SPEC update

**Files:**
- Create: `apps/extension/src/research/LensWithheldCard.tsx`
- Modify: `apps/extension/src/research/ResearchLayerPanel.tsx` (lens slot :965-976; `LensNotFiledCard` :398; delete the unreachable `LENS_WAITS_FOR_PROFILE_REASON` fallback at :612)
- Modify: `apps/extension/src/research/investor-lens.ts` (remove the dead constant if now unused)
- Modify: `apps/extension/src/sidepanel-network.ts` (heuristic at :495-510; handle the `status: "withheld"` response; send `forceRefresh: true` from the retry action)
- Modify: `apps/extension/src/shared/extension-format.ts` (`INSUFFICIENT_EVIDENCE_NOTICE` :8 retires or becomes failure-only copy)
- Modify: `packages/core/api-contract.json` (bump), `SPEC.md` (gate policy section, same branch)
- Test: `apps/extension/tests/` (new `lens-withheld.test.tsx` beside `read-region.test.tsx` conventions)

**Interfaces:**
- Consumes: `card.synthesisWithheld` (Task 1.4), route `status: "withheld"` (Task 1.5), `synthesisEvidenceSignals` from core for display derivation.
- Produces: three visually and semantically distinct lens end-states the fixtures in Phase 2 will cover: read (synthesis present), withheld (record present, honest reasons, retry affordance), failed (run status failed, generic failure copy). Withholding no longer masquerades as either of the other two.

Copy contract for the withheld card (final copy iterates in Phase 2's gallery, these are the semantics): state what ran ("Analysis ran <relative time>"), name what is missing in plain investor language mapped from reasons/advisories ("Fewer than 8 cited sources survived" / "Only news coverage is cited so far"), state what changes it ("A fresh evidence pass can clear the citation floor"), and offer exactly one action ("Refresh evidence and retry", which POSTs with `forceRefresh: true`). No apology register, no failure styling; per DESIGN, `not found` when true is a successful state.

- [ ] **Step 1: Failing tests.** (a) card with `synthesisWithheld` renders the withheld card with reason copy, not `LensNotFiledCard`; (b) run-status failure without a withheld record renders failure copy; (c) retry click issues a generate POST with `forceRefresh: true`; (d) card with synthesis renders `InvestorReadCard` untouched.
- [ ] **Step 2: Confirm fail.** `npm test -w @cold-start/extension -- lens-withheld`.
- [ ] **Step 3: Implement.** Delete the dead fallback and the conflating heuristic; the client no longer infers withholding from `!card.synthesis`.
- [ ] **Step 4: Confirm pass**, then `npm run build` (extension workspace) to prove the bundle compiles.
- [ ] **Step 5: Bump `api-contract.json`, update SPEC.md's synthesis gating paragraph to floor-plus-advisory, run slopcheck on all new UI copy.**
- [ ] **Step 6: Commit.**

### Task 1.7: measure-analysis-latency script and locked baseline

**Files:**
- Create: `scripts/measure-analysis-latency.ts`
- Modify: `package.json` (root): `"measure:analysis-latency": "tsx scripts/measure-analysis-latency.ts"`
- Modify: `CLAUDE.md` + `AGENTS.md` command tables (one line each)

**Interfaces:**
- Consumes: prod `generation_runs` (`job_kind='analysis'`, `status='complete'`), `traceJson.milestones.analysisReadyMs`, `traceJson.steps`, `research_run_events`. Self-loads `.env.production.migrate.local` like `measure-first-usable.ts`.
- Produces: percentiles (p50/p90/max) of wall duration and `analysisReadyMs`, plus mean per-step decomposition (queued to started, fetch-sources, synthesize, verify, finalize). **Mandatory artifact filter** (verified 2026-07-20): exclude rows whose trace lacks `milestones`/`synthesis` or has empty `steps`; two repair-retirement rows (`you`, `typefully`, backfilled `completed_at` 2026-06-26) otherwise poison the distribution with a 27-hour outlier. Print the exclusion count so the filter is visible in every report.

- [ ] **Step 1: Implement** (model on `measure-first-usable.ts`; SQL scoped `job_kind='analysis'`, never bare `mode='analysis'`, which mixes fast `section:*` jobs).
- [ ] **Step 2: Run against prod and record the baseline as a Finding here.** Expected ballpark from the 2026-07-20 verification: p50 ~100s, p90 ~143s, decomposition ~3s/~32s/~42s/~7s/~3s.
- [ ] **Step 3: Commit.**

### Task 1.8: Upstream evidence diagnoses (timeboxed, fix-or-file)

**Files:** investigation first; touched files depend on findings. Likely suspects: `packages/llm/src/extraction.ts` (citation selection), `packages/core/src/source-class.ts` (classification), `packages/providers/src/stableenrich/people.ts` (person extraction).

Two questions, half a day each, hard timebox:
1. **Moonshot citation collapse:** the run accepted 43 sources; the stored card cites 19 news + 1 enrichment. Trace where diversity dies: does extraction only cite news-class sources, does source classification collapse types, or does citation mapping drop non-news refs? Use `npm run trace:generation` against moonshot.ai locally for a live trace, plus the stored prod card.
2. **Generaltranslation missing founders:** founders are publicly known (YC company); the card has `founders: unknown`. Trace the people path for that domain.

- [ ] **Step 1: Diagnose both; write each up as a Finding here (mechanism, not vibes).**
- [ ] **Step 2: Fix in-slice if the fix is under ~30 lines and test-coverable; otherwise file a GitHub issue with the diagnosis attached and link it here.**
- [ ] **Step 3: Commit whatever landed.**

### Task 1.9: Phase 1 gate

- [ ] `npm run check` green from the main tree.
- [ ] Local closed-loop QA (playbook: `docs/qa/generation-trace-and-production-qa.md`): run analysis against moonshot, generaltranslation, timescaledb through the local stack. Each must land in read-or-honest-withheld; zero silent completions. Record outcomes here.
- [ ] Confirm in local DB: withheld run trace carries `synthesis.gate`; card carries `synthesisWithheld`; re-click without changes returns instantly with no new `generation_runs` row.
- [ ] Deploy (`docs/deployment.md`), rebuild the extension against the deployed origin, verify the deployed withheld flow on one slug. Note: Vercel deploys do not run Neon migrations (none needed this phase; confirm `drizzle` folder untouched).
- [ ] Update the lens-silent-gate memory/known-issues note: the gate is no longer silent as of this deploy.

---

## Phase 1.5: Gold-standard reference library

### Task 2.1: Deep research, three tracks, curated playbook

**Files:**
- Create: `docs/product/gold-standard-references.md` (tracked; links, named patterns, adopt/reject verdicts)
- Raw material (screenshots, scraped pages, video stills): `docs/motion-references/` (already fully gitignored; keep it that way)

Run the `deep-research` skill (or parallel research subagents if unavailable) on three tracks: (a) progress and waiting UX in agentic/build products (deploy pipelines, research-agent progress trees, long-running job UIs; who makes 60 seconds feel purposeful and how); (b) hovercard and popover craft (Linear, GitHub, Radix HoverCard, floating-ui safe-polygon internals; open-delay values, close-grace values, pin patterns); (c) high-density reading surfaces and memo typography (editorial products, terminal-of-record designs, annotated-document UIs).

- [ ] **Step 1: Run the three tracks in parallel; each returns named patterns with concrete parameter values where observable (delays, durations, type scales), not mood boards.**
- [ ] **Step 2: Curate into the playbook: per track, 3-7 adopted patterns with the reason, and 2-3 explicitly rejected ones with the reason. Slopcheck it.**
- [ ] **Step 3: Commit. Phases 2-4 cite this file in their design steps.**

---

## Phase 2: Result surface and CSS truth (Slice 2)

Phase exit gate: gallery screenshots of every lens phase pass Samay's review (Reduce Motion OFF); the type scale is documented; no lens-card or people-row selector is declared in more than one CSS file; `audit:css` and full `check` green.

### Task 3.1: Fixture gallery harness (lands first; it is the iteration tool)

**Files:**
- Create: `apps/extension/tests/fixtures/lens-phases/` (JSON fixtures)
- Create: gallery entry in the existing UI harness (`vite.sidepanel.config.ts` mount; follow how `qa:extension:ui` mounts the panel with the Chrome shim and mocked fetch; add a fixture-selector query param or route)
- Create: `apps/extension/tests/e2e/lens-gallery.spec.ts` (Playwright: renders each fixture phase, screenshots to `~/Downloads/cold-start-qa/<timestamp>/lens/<phase>.png`)
- Modify: `apps/extension/package.json`: `"qa:extension:gallery": "playwright test tests/e2e/lens-gallery.spec.ts"`

**Interfaces:**
- Fixtures (produce these exact files; later tasks render against them):
  - `read-full.json`: prod-shaped card with rich synthesis (mirror baseten's; pull via the extension API or prod DB read, then scrub nothing; it is public-tier plus gated synthesis and stays out of the public site anyway. Keep fixtures deterministic: freeze timestamps).
  - `read-sparse.json`: synthesis with 1 bull, 0 bear (verifier-dropped), 1 open question.
  - `withheld.json`: card with `synthesisWithheld` (reasons `["citation-floor"]`) and no synthesis.
  - `withheld-advisory.json`: card WITH synthesis plus advisories (news-only) for the posture line.
  - `running-events.json`: a recorded progress-event stream (source: `research_run_events` for the deepinfra 2026-07-20 run, read-only prod query; plus a synthetic tail containing the Phase 4 event names `synthesis.started`, `verify.started` so the wait surface can be built against it before the backend emits them).
  - `failed.json`: run-status failure with an existing card.
- Produces: `qa:extension:gallery` renders and screenshots every phase headlessly in one command.

- [ ] **Step 1: Build fixtures** (one read-only prod query for baseten card + deepinfra events; the rest synthesized from schema).
- [ ] **Step 2: Wire the gallery mount + Playwright spec; confirm one screenshot per phase lands.** Run: `npm run qa:extension:gallery -w @cold-start/extension`.
- [ ] **Step 3: Commit.**

### Task 3.2: Extract InvestorReadCard, build the memo on a documented type scale

**Files:**
- Create: `apps/extension/src/research/InvestorReadCard.tsx` (extracted from `ResearchLayerPanel.tsx:452-594`; `LensTensionSide` moves with it)
- Modify: `apps/extension/src/research/ResearchLayerPanel.tsx` (imports the component; slot logic only)
- Modify: `apps/extension/src/styles/research-trail.css` (becomes the single owner of all `.cs-investor-read*` / `.cs-lens-*` rules; Task 3.4 enforces the ownership repo-wide)
- Modify: `DESIGN.md` (type scale addition, same branch)
- Test: `apps/extension/tests/investor-lens.test.ts` stays green untouched (display model unchanged); new `apps/extension/tests/investor-read-card.test.tsx` for render states

**Interfaces:**
- Consumes: `investorReadForCard` from `investor-lens.ts` **unchanged** (the display model is sound; this is rendering only); `synthesisEvidenceSignals`-derived advisories for the posture line (compute display strings in the component from `card.synthesisWithheld?.advisories` when present alongside synthesis, or derive live via core).
- Produces: the memo layout per the approved sketch in the spec. Lens type scale, to be written into DESIGN.md verbatim:

| Role | Spec | Use |
|---|---|---|
| Lede | 16px / 1.45 / At Umami 640 | The headline read, the only display-face content text |
| Section label | 11px / At Umami 620 / seal color, sentence case | "The case", "Timing", "Next question" |
| Claim | 13px / 1.55 / IBM Plex Sans 450 | Bull/bear claims, timing, question bodies |
| Meta | 11.5px / IBM Plex Sans 480 | Posture line, "changes the read if" note |
| Receipt | 10px / At Textual 500, tabular | Citation marks, source domains, FILED stamp |

Exactly five sizes. Every rule in the card maps to one row; anything else is a bug. Opposition treatment: holds claims lead with a filled ink square mark; breaks claims lead with the conflict-class slashed square (oxide `--color-conflict`), marks only, no washes, `data-side` finally consumed in CSS. Overflow ("+N more" claims/questions) becomes inline progressive disclosure inside the card (measured-height expansion, 200ms), retiring the three lens tooltip call sites at `ResearchLayerPanel.tsx:432/502/536`; the footer sources "+N" keeps its tooltip until Phase 3 upgrades it.

- [ ] **Step 1: Failing render tests:** (a) lede text present with `data-role="lede"`; (b) holds/breaks rows carry `data-side` and the marks differ; (c) sparse fixture renders 0-bear honestly ("Nothing survived verification against the bear case" style empty state per research-module contract); (d) advisory posture line renders when advisories exist, absent otherwise; (e) inline disclosure expands moreClaims without a tooltip.
- [ ] **Step 2: Confirm fail.**
- [ ] **Step 3: Implement against the gallery.** Iterate with `qa:extension:gallery` screenshots against `read-full`, `read-sparse`, `withheld-advisory`; cite `gold-standard-references.md` choices in the PR/commit body. Check narrow width (360px) and the Playwright long-text guard.
- [ ] **Step 4: Tests pass + gallery screenshots captured for review.**
- [ ] **Step 5: Update DESIGN.md with the scale table. Update CLAUDE.md/AGENTS.md file pointers (InvestorReadCard now its own file). Commit.**

### Task 3.3: Lens slot motion: AnimatePresence swap and staged entrance

**Files:**
- Modify: `apps/extension/src/research/ResearchLayerPanel.tsx` (slot :965-976), `apps/extension/src/research/InvestorReadCard.tsx`
- Consumes: `commitSpring`/`snapSpring` from `apps/extension/src/shared/motion-primitives.ts`; `usePrefersReducedMotion`
- Test: extend `investor-read-card.test.tsx` using the repo's `skipAnimations` test-setup pattern (see `tests/sidepanel-harness.tsx` conventions and the sync-AnimatePresence precedent from the experience craft pass)

Behavior: trigger/running/result swap wrapped in `AnimatePresence` (crossfade, 180-220ms; the most important state change never hard-cuts, per DESIGN). Result entrance: one staggered spring sequence, total ~550-650ms: lede, then case block, then timing/question, then footer. Transform+opacity only, settle under critical damping, no bounce. Reduced motion: stagger collapses to a single 150ms opacity fade; nothing freezes.

- [ ] **Step 1: Failing test: exit-state coverage.** Per repo rule, record what happens when the exiting element is the final item: running card exits while result mounts; withheld card exits to trigger on retry. Assert both transitions render without orphaned nodes (jsdom-level: presence/absence after animation completion with skipAnimations).
- [ ] **Step 2: Confirm fail. Step 3: Implement. Step 4: Pass + gallery re-screenshot (motion reviewed live, not in stills; note for review session). Step 5: Commit.**

### Task 3.4: CSS truth: one owner per selector family

**Files:**
- Modify: `apps/extension/src/styles/*.css` (9 partials), `apps/extension/src/styles.css` (import manifest), `packages/ui/src/tokens.css` (`--font-mono` alias at :34)
- Verification: `npm run audit:css -w @cold-start/extension` after every family; gallery screenshots before/after each family

Approach: consolidation lands selector-family by selector-family, one commit each, screenshots proving no visual change (or the intended change). Do NOT attempt @layer adoption in this pass; the declared layer order in `foundation.css` is inert for these rules today and turning it on would invert winners silently. Families, in order:

1. `.cs-lens-*` / `.cs-investor-read*`: single owner `research-trail.css` (fold in the `evidence.css` footer rules and every `theme-and-dark.css` unconditional override, including the 76px grid override that dies with the ledger anyway).
2. `.cs-people-person` / `.cs-people-line*`: single owner (pick `signals.css`; delete the `signal-ledger.css` and `type-and-motion.css` duplicates, folding the winning 50px/7px values in explicitly).
3. `.cs-research-layer-head`: single owner; the effective composite (weight 700 + padding 12px 15px + 10px size) becomes the one authored rule.
4. `.cs-company-context h1`: single owner with the effective values (`clamp(28px,6.1vw,34px)`, weight 770, line-height 0.98).
5. `.cs-source-chip`: single owner (it styles the deck cards, not the lens; keep it where the deck's other rules live).

Also: retarget `--font-mono` to a real mono stack per DESIGN (`Berkeley Mono`/`IBM Plex Mono`) AND audit every `var(--font-mono)` use site first; any rule that visually depends on the serif alias gets rewritten to `--font-text` explicitly before the retarget. `theme-and-dark.css` shrinks to genuinely `:root[data-theme="dark"]`-scoped rules; rename is optional, shrinking is not.

- [ ] **Step 1: Per family: grep all declarations, record the effective computed rule, author it once in the owner, delete the rest, re-run `audit:css` + gallery screenshot, commit.** Five commits.
- [ ] **Step 2: `--font-mono` audit + retarget, own commit.**
- [ ] **Step 3: `theme-and-dark.css` shrink, own commit, dark-mode screenshot pass (the panel's warm paper dark mode must survive).**

### Task 3.5: Phase 2 gate

- [ ] `npm run check` green (includes extension tests + `audit:css`).
- [ ] Full gallery screenshot set posted for Samay's review; remind him: macOS Reduce Motion OFF. Iterate until approved; record verdicts here.
- [ ] Grep-proof: `grep -c "cs-investor-read\|cs-lens-" apps/extension/src/styles/*.css` shows lens rules in exactly one file.
- [ ] Firefox build (`npm run build:firefox -w @cold-start/extension`) + `web-ext lint` green (already in check); quick manual sidebar smoke via `npx web-ext run --source-dir apps/extension/dist-firefox`.

---

## Phase 3: Person hovercards (Slice 3)

Phase exit gate: the occlusion regression is green and demonstrably fails on pre-phase code; all 8 SharedTooltip call sites verified; dossier hierarchy review passed; Firefox parity held.

### Task 4.1: SharedTooltip: open intent and docked placement mode

**Files:**
- Modify: `apps/extension/src/shared/SharedTooltip.tsx` (trigger props :183, grace :72/:141-149, geometry :103-117, pin :173-182)
- Modify: `apps/extension/src/company/CompanyArc.tsx` (single `useSharedTooltip` instance :147, tooltip render :316; passes the dock anchor)
- Modify: `apps/extension/src/company/CompanyHeader.tsx` (people rows request `mode: "docked"`; provides the dock anchor ref below the people block)
- Modify: `apps/extension/src/styles/company-arc.css` (tooltip rules :326-393; new `.cs-shared-tooltip[data-mode="docked"]` block; company-arc.css stays the single owner of tooltip CSS)
- Test: `apps/extension/tests/shared-tooltip.test.tsx` (extend the existing 20-test suite)

**Interfaces:**
- Produces (consumed by 4.2/4.3):

```ts
// useSharedTooltip gains:
//   OPEN_INTENT_MS = 90 (hover only; focus/keyboard open stays immediate)
//   per-trigger option: mode?: "popover" | "docked"  (default "popover")
//   dockAnchorRef: RefObject<HTMLElement>  (the element the docked region attaches below)
// Behavior contract:
//   - hover enter starts an intent timer; leave before 90ms cancels silently (no strobe)
//   - docked mode: position = below dockAnchorRef bottom edge, full panel width minus 16px margins,
//     max-height = min(60% viewport, content), overlaying the deck with the DESIGN-allowed shallow shadow
//   - retarget between docked triggers: content crossfades 140ms (reuse the animate flag), region does not move
//   - close grace 160ms preserved for travel into the dock; pin on click/Enter (extend existing pin), Escape/blur unchanged
//   - popover mode: today's behavior plus the intent delay and a width cap; used by the other 7 call sites
```

- [ ] **Step 1: Failing unit tests:** (a) hover then leave at 50ms never opens (fake timers); (b) hover 120ms opens; (c) focus opens with no delay; (d) docked trigger renders with `data-mode="docked"`; (e) click pins, second click unpins, Escape unpins and refocuses (pointer parity with the existing keyboard pin tests); (f) plain-text triggers stay popover.
- [ ] **Step 2: Confirm fail. Step 3: Implement.** Geometry in JS stays minimal: docked top = anchor rect bottom + 6px, recomputed on open and scroll (the panel scrolls; reuse the existing position-tracking approach). 
- [ ] **Step 4: Pass. Step 5: Commit.**

### Task 4.2: Dossier content hierarchy, size budget, measured expansion

**Files:**
- Modify: `apps/extension/src/shared/SharedTooltip.tsx` (`DossierBody` :213-277)
- Modify: `apps/extension/src/company/CompanyHeader.tsx` (`PeopleLine` "+N more" expansion :460/:519-522 gets measured-height animation)
- Modify: `apps/extension/src/styles/company-arc.css` (dossier blocks :404-522)

Content hierarchy (7 font sizes collapse to 4, mapped to the Phase 2 scale): identity line (name + role, Claim role weight 560), read (Claim role, the star of the card, up to 3 lines then truncate with expand-on-pin), email per the settled 2026-07-15 contract (one email, observed over inferred, click-to-copy, basis line only for inferred, stays inside the dossier container), channels as a single receipt-face row. Provenance folds into the read's citation mark. Size budget: docked height cap from 4.1; no floor-only growth.

- [ ] **Step 1: Failing tests: dossier renders the four blocks in order; email contract assertions ported from the existing suite stay green; "+N more" people expansion animates height (assert the wrapper uses the measured pattern, skipAnimations for jsdom).**
- [ ] **Step 2-4: Fail, implement (iterate in the gallery; add a `dossier.json` fixture with a rich person + inferred-email person), pass.**
- [ ] **Step 5: Commit.**

### Task 4.3: Real-geometry regressions and call-site sweep

**Files:**
- Modify: `apps/extension/tests/e2e/sidepanel-ui.spec.ts` (existing dossier e2e at :1385-1421 hovers only row 1; extend)

- [ ] **Step 1: Write the occlusion regression RED-FIRST against pre-phase code:** check out the commit before Task 4.1, add the test (hover person row 3, then move pointer to row 1's coordinates, assert row 1's dossier content appears within 500ms), run it, confirm FAIL, record the failure output here, then rebase the test onto the phase branch and confirm PASS. This proves the net catches the actual bug.
- [ ] **Step 2: Add geometry assertions:** open dossier bounding box never intersects any `.cs-people-person` bounding box; fly-by (pointer crosses all rows in under 80ms) opens nothing.
- [ ] **Step 3: Call-site sweep:** one assertion each for the 8 SharedTooltip consumers (description "(more)", person dossier, "+N more" people chip, lens footer sources overflow, `SourceChips` on a deck layer; the three retired lens call sites assert inline disclosure instead). Reduced-motion pass: dossier opens with no transition, still functional.
- [ ] **Step 4: Firefox parity:** build + manual sidebar smoke; pointer events differ subtly, verify open-delay and pin by hand; record here.
- [ ] **Step 5: Commit. Phase gate: `npm run check` green.**

---

## Phase 4: Latency levers and the watchable wait (Slice 4)

Phase exit gate: `measure:analysis-latency` shows p50 <= 60s and p90 <= 90s over two weeks of real traffic; shadow comparison shows no quality regression; the wait surface never shows a stageless gap; `check` green.

### Task 5.1: Verify what the verifier and synthesis actually consume (decision input, half day)

Before any re-fetch change: trace the reuse-path data flow. `synthesize` provably receives only `JSON.stringify(card)`. The open question is `verifySynthesis` (`packages/llm/src/verifier.ts` + its wiring in `packages/pipeline/src/generate-card.ts:686-742`): does it read fetched source text, stored source rows, or only card citations?

- [ ] **Step 1: Read the wiring; write the answer as a Finding here with file:line.**
- [ ] **Step 2: Decision fork, pre-authorized by the spec:** if verify consumes fetched source content, the skip-fresh lever must wire stored `sources` rows into the verify input (add that plumbing to Task 5.3's scope); if it consumes only card-resident data, the skip lever is plumbing-free. Either way Task 5.3 proceeds; this finding sizes it.

### Task 5.2: Split synthesize and verify into separate Inngest steps with real events

**Files:**
- Modify: `apps/web/src/inngest/functions.ts` (step `generate-card` :579-595; event recorder; milestones :788-790)
- Modify: `apps/web/src/inngest/generation-helpers.ts` (pure helpers for the new step bodies)
- Modify: `packages/pipeline/src/generate-card.ts` (expose synthesize and verify as separately callable units; `verifiedSynthesisForCard` :686-742 splits)
- Test: pipeline tests for the split units; helper tests in `apps/web`

**Interfaces:**
- New step ids (also the trace step names that already exist, keeping trace continuity): `synthesize-card`, `verify-synthesis`. The `generate-card` step keeps its id and its extraction/assembly duties; it returns the pre-synthesis card. Step outputs are JSON (card JSON, synthesis draft, verify results); Inngest memoizes each, so a verify retry no longer re-runs the ~42s Sonnet call.
- New progress events, additive to `GenerationRunStatus.events`: `synthesis.started` ("Reading the filed evidence"), `verify.started` ("Verifying N claims against sources"), `verify.complete` ("M claims survived"). Event vocabulary is additive; older extensions ignore unknown types (verify this against `sidepanel-network.ts` event handling before assuming; if the extension switch-cases exhaustively, bump the contract).

- [ ] **Step 1: Failing tests:** pipeline unit: synthesize unit callable without verify; verify unit callable with a stored synthesis draft; gate-withheld path emits neither event. Helper test: step sequencing preserves the existing trace shape (`steps.synthesize-card`, `steps.verify-synthesis` durations still recorded).
- [ ] **Step 2-4: Fail, implement, pass.** Confirm `analysisReadyMs` semantics unchanged (stamped at card-saved with synthesis, as today).
- [ ] **Step 5: Deploy note in the commit body: new step ids alter durable-execution identity for in-flight runs; deploy in a quiet window (US evening), then `npm run repair:stuck-runs` if anything strands. Commit.**

### Task 5.3: Re-fetch policy behind a flag, shadow bar, promotion

**Files:**
- Modify: `apps/web/src/inngest/source-fetching.ts` (analysis routing :207/:223; the `signals` probe group at :155-166 gains its caller)
- Modify: `apps/web/src/inngest/worker-env.ts` (new env plumbing)
- Modify: `packages/providers/src/stableenrich.ts` (`fetchStableenrichEnrichmentSources` :42-52 reused with `skipProbeNames: stableenrichLateEnrichmentSkipsForBlocks(["signals"])`)
- Modify: `docs/product/provider-cost-assumptions.md` (cost note), `.env.example`
- Test: source-fetching unit tests (the routing is pure given mode + freshness + flag)

**Interfaces:**
- Env: `ANALYSIS_SOURCE_REFRESH=full | targeted | skip-fresh` (default `full`; nothing changes until promotion). Behavior: `skip-fresh`: signals fresh (row TTL) means no stableenrich fetch at all (plus the Task 5.1 plumbing if needed); signals stale means the 3-probe targeted group. `targeted`: 3-probe group always. `full`: today's 13-probe path.
- Cost deltas, stated per the four trace streams: skip-fresh saves the full stableenrich probe spend (~8 non-fast probes at $0.01-0.02 budget estimates, roughly $0.10-0.15 AgentCash per run) and ~30s wall; targeted saves ~$0.08-0.12 and ~20s. Anthropic, Direct Exa, and Websets streams unchanged.

- [ ] **Step 1: Failing routing tests for the three flag values x fresh/stale.**
- [ ] **Step 2-3: Fail, implement.**
- [ ] **Step 4: Shadow comparison:** 20+ analysis runs across golden-set companies (use `npm run qa:generation` fixtures), 10+ in `full`, 10+ in `skip-fresh`, matched slugs. Compare: verifier-surviving claim count, `hasInvestorUsableProfile`, citation counts, and eyeball three read pairs blind. Record the table as a Finding here.
- [ ] **Step 5: Promotion decision with Samay on the evidence (flip the Vercel env or hold). The flag stays either way as the rollback. Commit.**

### Task 5.4: Polling waste and dispatch trim

**Files:**
- Modify: `apps/extension/src/sidepanel-network.ts` (analysis branch :468-491 stops fetching the full card body every tick; card fetch only on `card.saved`/`generation.complete`/`synthesis`-bearing events plus a fallback every 6th tick, mirroring `shouldFetchCardForActiveBasics` :247)
- Test: existing polling tests in the extension suite extend to assert fetch counts per event script

- [ ] **Step 1-4: TDD as above.** No contract change (request shapes unchanged).
- [ ] **Step 5: Dispatch look (timeboxed 2h):** baseline says queued-to-started ~3s median. If the Task 1.7 report shows p90 dispatch above ~10s, investigate Inngest app polling config; otherwise record "not material" and close.
- [ ] **Step 6: Commit.**

### Task 5.5: The watchable wait

**Files:**
- Create: `apps/extension/src/research/AnalysisWaitInstrument.tsx` (stage list + verify stamp moment; sibling of `ResearchTrail.tsx` patterns, but its own component; building-arc `SourcePassInstrument` stays untouched)
- Modify: `apps/extension/src/research/ResearchLayerPanel.tsx` (`LensRunningCard` :377-396 replaced by the instrument composition)
- Modify: `apps/extension/src/company/CompanyArc.tsx` (mount `ProgressBackground` mesh while an analysis run is active in the profile phase; clippings already mount there)
- Modify: `apps/extension/src/styles/research-trail.css` (wait-surface rules, single owner)
- Test: `apps/extension/tests/analysis-wait.test.tsx` driven by the `running-events.json` fixture

**Interfaces:**
- Consumes: `GenerationRunStatus.events` already fetched every tick; Phase 4 event names from Task 5.2; `whisperCopyFromEvents` conventions from `research-progress.ts` for copy tone.
- Stage model (motion playbook language, driven by real events, never elapsed time): Queue (`generation.started`), Gather (`source.found`, with live source count; renders as "reusing filed evidence" when the run skips fetch), Read (`synthesis.started`), Verify (`verify.started`, the signature moment: claims stamp in one by one as marks, seal-family motion), File (`card.saved` crossfades into the staged entrance from Task 3.3). One signature loop at a time: the mesh is the ambient field (DESIGN's generation-moment allowance), the current stage's indicator is the single loop. Elapsed time renders in receipt face. Reduced motion: stages tick as opacity fades, the current-stage indicator keeps a subtle in-place breath (essential indicators animate), the mesh renders as DESIGN's calm still field.

- [ ] **Step 1: Failing fixture-driven tests:** replaying `running-events.json` advances stages in order; an event gap produces no blank state (previous stage holds, receipt-face elapsed keeps counting); `verify.complete` claim count renders; the final event hands off to the read without unmount flash (exit-state rule).
- [ ] **Step 2-4: Fail, implement against the gallery (add the wait phases to the gallery spec), pass. Gallery screenshots + a screen recording for review (motion cannot be reviewed in stills).**
- [ ] **Step 5: Commit.**

### Task 5.6: Phase 4 gate and the two-week measurement

- [ ] `npm run check` green; deploy (quiet window per Task 5.2); extension rebuild if the event-handling audit in 5.2 forced a contract bump.
- [ ] Immediately post-deploy: one live analysis run traced end-to-end (`npm run trace:generation` locally + a real deployed run); confirm events flow, wait surface stages, staged entrance lands, `repair:stuck-runs` finds nothing.
- [ ] Two weeks later: `npm run measure:analysis-latency` against prod; success is p50 <= 60s, p90 <= 90s on real traffic with the promoted re-fetch mode. Record the report here. If the bar is missed, the decomposition names the residual and it goes back to Samay as a decision, not silent scope creep.

---

## Risks

- **Withheld copy reads as failure.** Mitigation: copy contract in Task 1.6, iterated in the gallery, slopchecked, reviewed with fixtures.
- **Gate relaxation lets a thin read through.** Mitigation: Task 1.3's study runs before the flip ships; advisory posture renders on the read; verifier discipline unchanged; floor env-tunable without deploy.
- **Skip-fresh erodes read freshness or verify quality.** Mitigation: Task 5.1 sizes the exposure before build; flag default `full`; 20-run shadow bar; instant env rollback.
- **New step ids strand in-flight runs at deploy.** Mitigation: quiet-window deploy; runs are short; `repair:stuck-runs` swept post-deploy.
- **CSS consolidation regressions.** Mitigation: family-by-family commits, `audit:css` + gallery screenshots per family, dark-mode pass after the theme file shrink.
- **Docked dossier fights the deck.** Mitigation: explicit z-index/scroll fixtures; geometry assertion that the dock never covers people rows; pin interactions tested against deck drag.
- **Contract drift with deployed extensions.** Mitigation: single bump per phase that needs one (1 certain, possibly a second in Phase 4); deployed extension rebuilt and reloaded at each; contract header already fails loudly on mismatch.
- **Anchor drift.** Every file:line here was verified 2026-07-20; the first step of every task is re-grepping its anchors.

## Effort

Derived from verified call-site counts, not generic sizing: Phase 1 is 9 tasks across ~12 files with 2 scripts (2.5-3 focused days). Phase 1.5 is research wall-clock, mostly parallel agents (0.5-1 day). Phase 2 is the widest: 1 component extraction, 5 CSS families with 9 files in play, 1 gallery harness (3-4 days). Phase 3 touches 1 shared primitive with 8 consumers plus e2e (1.5-2 days). Phase 4 is 2 backend seams, 1 flag, 1 new surface, plus a 2-week measurement tail (2.5-3 days active). Total ~10-13 focused days plus the measurement tail, executable in slices with independent ship gates.
