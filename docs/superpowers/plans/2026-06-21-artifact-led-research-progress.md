# Artifact-Led Research Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the initial generation `Research progress` copy with event-driven artifact lines that show what Cold Start found, checked, or saved.

**Architecture:** Keep the current four-step progress tree and event-driven advancement. Add a focused progress formatter in `apps/extension/src/research-progress.ts` that turns run events and optional source summaries into stage proof lines, then render those lines in `SourcePassInstrument` and `ResearchLayerPanel`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Playwright.

## Global Constraints

- Scope is only the initial company-generation `Research progress` panel.
- Do not change research cards, queue behavior, generated section capsules, or the research stack.
- The tree must stay event-driven. No wall-clock progress estimation.
- Do not show `search plan`, `query plan`, `worker`, `pipeline`, `accepted sources`, or provider names in user-facing progress copy.
- Do not invent source categories. Fall back to plain counts or honest waiting states.
- Keep reduced-motion behavior readable.

---

### Task 1: Progress Artifact Formatter

**Files:**
- Modify: `apps/extension/src/research-progress.ts`
- Create: `apps/extension/tests/research-progress.test.ts`

**Interfaces:**
- Consumes: `ExtensionResearchRunEvent` and optional source-like summaries with `sourceType`, `domain`, and `snippet`.
- Produces: `buildResearchProgressPlan({ activeIndex, complete, events, sources, stageNote, stages })`, where each returned stage includes `proofLine: string`.

- [ ] **Step 1: Write failing formatter tests**

Add tests that cover no events, `source.found` count-only fallback, category-rich source artifacts, `card.partial`, `card.saved`, hidden internal copy, and deduplicated substeps.

Run: `npm test -w @cold-start/extension -- research-progress`

Expected: FAIL because `proofLine` and source-aware formatting do not exist.

- [ ] **Step 2: Implement the formatter**

Add source category helpers and a `proofLineForStage` path in `research-progress.ts`.

Required behavior:

```text
Sources -> Checking company, product, funding, and proof sources
Sources + count -> 12 sources found
Sources + categories -> Company site, docs, and funding coverage found
Evidence pending -> Waiting for sources
Evidence running -> Checking funding, product, people, and customer proof
Profile + card.partial -> First cited profile ready - 7 citations
Filed + card.saved -> Saved with sources attached
```

- [ ] **Step 3: Run formatter tests**

Run: `npm test -w @cold-start/extension -- research-progress`

Expected: PASS.

---

### Task 2: Render Artifact Lines In The Progress Tree

**Files:**
- Modify: `apps/extension/src/SourcePassInstrument.tsx`
- Modify: `apps/extension/src/ResearchLayerPanel.tsx`
- Modify: `apps/extension/src/sidepanel.tsx`
- Modify: `apps/extension/tests/sidepanel.test.tsx`
- Modify: `apps/extension/tests/e2e/sidepanel-ui.spec.ts`

**Interfaces:**
- Consumes: stage `proofLine` from Task 1.
- Produces: visible stage rows where the label is `Sources`, `Evidence`, `Profile`, or `Filed`, and the subtitle is the artifact proof line.

- [ ] **Step 1: Write failing rendered tests**

Update existing tests so they expect the new stage labels and reject the removed soft subtitles.

Run: `npm test -w @cold-start/extension -- sidepanel`

Expected: FAIL because the UI still renders old stage labels and subtitles.

- [ ] **Step 2: Wire proof lines into rendering**

Pass `sources` into `SourcePassInstrument` where available. Render `stage.proofLine` instead of `stage.note`. Keep the screen-reader text in sync with the visible proof line.

- [ ] **Step 3: Run rendered tests**

Run: `npm test -w @cold-start/extension -- sidepanel`

Expected: PASS.

---

### Task 3: Verify Extension Quality Gate

**Files:**
- Test only unless Task 1 reveals missing source category data that cannot be derived in the extension.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: verified extension behavior.

- [ ] **Step 1: Run extension unit tests**

Run: `npm test -w @cold-start/extension`

Expected: PASS.

- [ ] **Step 2: Run extension typecheck**

Run: `npm run typecheck -w @cold-start/extension`

Expected: PASS.

- [ ] **Step 3: Run focused UI QA if feasible**

Run: `npm run qa:extension:ui -w @cold-start/extension -- --grep "progress"`

Expected: PASS, or document if Playwright project filtering does not match this repo's config.

- [ ] **Step 4: Commit implementation**

Stage only implementation-plan and feature files:

```bash
git add docs/superpowers/plans/2026-06-21-artifact-led-research-progress.md \
  apps/extension/src/research-progress.ts \
  apps/extension/src/SourcePassInstrument.tsx \
  apps/extension/src/ResearchLayerPanel.tsx \
  apps/extension/src/sidepanel.tsx \
  apps/extension/tests/research-progress.test.ts \
  apps/extension/tests/sidepanel.test.tsx \
  apps/extension/tests/e2e/sidepanel-ui.spec.ts
git commit -m "Implement artifact-led research progress"
```
