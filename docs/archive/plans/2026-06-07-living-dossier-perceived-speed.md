# Living Dossier Perceived Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:using-git-worktrees before implementation, then use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cold Start feel useful within seconds by turning generation into a readable, sourced, progressively filing research dossier instead of a wait behind a spinner.

**Architecture:** Preserve the existing API contract and trust model. Reuse stored cards, stored research sections, real generation events, source summaries, and the existing interim-card polling path. The extension should enter a read-first state as soon as it has a usable public card or source receipt, while late enrichment and section generation continue as clearly scoped background work.

**Tech Stack:** Chrome MV3 side panel, React 19, Vite, Framer Motion, TypeScript, existing extension bootstrap/generation APIs, Vitest, Playwright extension QA, Next.js public card route.

---

## Worktree Strategy

This work must land in an isolated worktree because it touches the core extension experience and could easily make the product feel busier or less premium if the interaction model is wrong.

Recommended branch:

```bash
git worktree add .worktrees/living-dossier-speed -b codex/living-dossier-speed main
cd .worktrees/living-dossier-speed
npm ci
npm run check
```

Precondition: the current root checkout should be clean or intentionally committed first. If `.worktrees/` is not ignored, add it to `.gitignore` in a small separate commit before creating the worktree.

Rollback path: delete the worktree and branch. No database migration is required for this plan.

```bash
git worktree remove .worktrees/living-dossier-speed
git branch -D codex/living-dossier-speed
```

## Product Bar

Cold Start should feel like a research file opening in front of the user. The first useful moment is not "generation complete." The first useful moment is "I can see what Cold Start has found and what is already safe to read."

The interface should stay calm. No fake progress, no uncited draft claims, no animated spectacle pretending to be work. Motion should orient the user to state changes: sources arrived, a starter profile filed, a section resolved, a deeper module is running.

## Non-Negotiable Constraints

- Public `/c/{slug}` and public APIs must never expose synthesis.
- Source receipts can show source metadata and snippets, but must not render extracted facts until the card or section has citation-backed content.
- The extension may show stale cards only when freshness is explicit.
- Existing extension contract headers and response shapes must remain compatible.
- `verifier drops stay dropped` remains untouched.
- No paid provider or LLM call may start in the background without the existing explicit generation confirmation.

## Files By Responsibility

- Modify `apps/extension/src/sidepanel-network.ts`: expose interim cards and source receipts in the polling path without changing API contracts.
- Modify `apps/extension/src/sidepanel.tsx`: add request states for source receipt, interim usable card, stale readable card, and scoped section running.
- Modify `apps/extension/src/ResearchLayerPanel.tsx`: make source receipt, section states, and filing transitions feel like one dossier surface.
- Modify `apps/extension/src/research-progress.ts`: keep profile progress events separate from section-run events.
- Modify `apps/extension/src/styles.css`: add restrained Catalogue Card styling for receipt rows, freshness marks, and filed states.
- Modify `apps/extension/tests/sidepanel.test.tsx`: add regression coverage for source-first, interim card, stale card, and section-specific running states.
- Modify `apps/extension/tests/research-layer.test.ts`: protect section-state mapping and empty-state behavior.
- Modify `apps/extension/tests/e2e/sidepanel-ui.spec.ts`: add screenshot and interaction coverage for the new dossier lifecycle.
- Optionally modify `apps/web/src/lib/cards.ts` only if stale/fresh section metadata needs a public read helper. Do not change public/private filtering.

## UX States To Implement

### Missing Card

The panel opens to the current company and one primary action: generate a fast public profile. If bootstrap already knows no card exists but a run is active, it shows the live source receipt or run log.

### Source Receipt

Once `source.found` or bootstrap `sources` exist, the user sees a compact receipt:

```text
Sources found
company  Company site
reported TechCrunch
reported LinkedIn
```

This is not a fact card. It is evidence inventory.

### Starter Card

Once a usable public card is available, the panel switches to the full research panel. Late enrichment continues in the progress drawer. Empty facts stay absent. Public sections can resolve one by one.

### Stale Readable Card

If a cached card exists but section TTLs are stale, the user can read it immediately with freshness marks. Refresh runs are shown as updating that dossier, not blocking access.

### Section Running

When the user starts one research module, the module expands and owns the running state. The global profile progress should not spin unless the profile itself is running.

## Task 1: Add A Source Receipt View Model

**Files:**
- Modify: `apps/extension/src/sidepanel-network.ts`
- Modify: `apps/extension/src/sidepanel.tsx`
- Test: `apps/extension/tests/sidepanel.test.tsx`

- [ ] **Step 1: Write failing test for source receipt without a card**

Add a test named:

```ts
it("shows a source receipt while profile generation is running before a card exists", async () => {
  // Bootstrap returns no card, active basics run, two source summaries, and source.found event.
  // Expected: the panel renders source titles and source class marks.
  // Expected: no company fact rows render.
  // Expected: the primary status does not say the profile is complete.
});
```

Use existing `renderSidePanel`, `jsonResponse`, and bootstrap mocks in `apps/extension/tests/sidepanel.test.tsx`. The mock source summaries should include one `company_site` source and one `news` source.

- [ ] **Step 2: Add a request-state shape for source receipt**

In `apps/extension/src/sidepanel.tsx`, extend the successful or generating state so source summaries and events can render even when `card` is null. Prefer extending existing state rather than adding a parallel progress system.

Expected behavior:

```ts
type SourceReceiptState = {
  domain: string;
  events?: ExtensionResearchRunEvent[];
  sources?: ExtensionSourceSummary[];
};
```

Do not expose raw provider facts or synthesis.

- [ ] **Step 3: Render the receipt**

Add a compact receipt panel in the missing/running card frame:

- Source class mark.
- Source title.
- Source domain.
- Fetched or current marker when present.

Use short labels: `company`, `reported`, `filing`, `other`. Avoid long explanatory copy.

- [ ] **Step 4: Run the focused test**

```bash
npm test -w @cold-start/extension -- sidepanel.test.tsx -t "source receipt"
```

Expected: the new test passes and existing sidepanel tests remain green.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/sidepanel.tsx apps/extension/src/sidepanel-network.ts apps/extension/tests/sidepanel.test.tsx
git commit -m "Show source receipt during profile generation"
```

## Task 2: Make Interim Usable Cards The Primary Moment

**Files:**
- Modify: `apps/extension/src/sidepanel-network.ts`
- Modify: `apps/extension/src/sidepanel.tsx`
- Test: `apps/extension/tests/sidepanel.test.tsx`

- [ ] **Step 1: Write failing test for starter card before enrichment finishes**

Add a test named:

```ts
it("switches to the research panel when an interim usable basics card is saved", async () => {
  // POST /api/generate returns queued.
  // First status poll returns running plus card.partial event.
  // The card fetch returns a usable public card.
  // Later status still says running.
  // Expected: ResearchLayerPanel renders with the card.
  // Expected: progress still shows enrichment running.
});
```

- [ ] **Step 2: Wire `onInterimCard` from the basics poller**

`pollGenerationUntilCard` already accepts `onInterimCard`. Thread it through `startGenerationAndPoll` options so the panel can swap to read mode before the run is terminal.

Expected option shape:

```ts
options: {
  forceRefresh?: boolean;
  latestCard?: ColdStartCard | null;
  latestSections?: ResearchSection[];
  waitForRunCompletion?: boolean;
  onInterimCard?: (result: GenerationPollResult) => void;
}
```

- [ ] **Step 3: Update sidepanel state on interim card**

When interim card arrives:

- Set request state to `success`.
- Preserve `profileRun` as running.
- Preserve events and sources.
- Do not mark analysis complete.

- [ ] **Step 4: Run tests**

```bash
npm test -w @cold-start/extension -- sidepanel.test.tsx -t "interim usable basics card"
npm test -w @cold-start/extension -- sidepanel.test.tsx -t "generation gate"
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/sidepanel-network.ts apps/extension/src/sidepanel.tsx apps/extension/tests/sidepanel.test.tsx
git commit -m "Render interim usable cards immediately"
```

## Task 3: Add Stale-But-Readable Card Treatment

**Files:**
- Modify: `apps/extension/src/ResearchLayerPanel.tsx`
- Modify: `apps/extension/src/sidepanel.tsx`
- Modify: `apps/extension/src/styles.css`
- Test: `apps/extension/tests/sidepanel.test.tsx`

- [ ] **Step 1: Write failing test for stale readable card**

Add a test named:

```ts
it("renders a stale cached card as readable while refresh runs", async () => {
  // Bootstrap returns a card with cacheStatus: "stale" and basics run running.
  // Expected: the card content renders.
  // Expected: a freshness mark is visible.
  // Expected: refresh progress is visible but does not block reading.
});
```

- [ ] **Step 2: Add freshness display helpers**

Add a local helper in `ResearchLayerPanel.tsx`:

```ts
function freshnessLabel(card: ColdStartCard) {
  return card.cacheStatus === "stale" ? "refreshing" : null;
}
```

Keep this local unless multiple files need it.

- [ ] **Step 3: Style the freshness mark**

Add CSS that feels like a filed stamp, not an alert:

```css
.cs-freshness-mark {
  border: 1px solid var(--color-rule-strong);
  border-radius: 4px;
  color: var(--color-muted);
  font-family: var(--font-receipt);
  font-size: 10px;
  letter-spacing: 0;
  padding: 2px 5px;
}
```

Use existing token names. Adjust if exact token names differ.

- [ ] **Step 4: Run tests**

```bash
npm test -w @cold-start/extension -- sidepanel.test.tsx -t "stale cached card"
npm run typecheck -w @cold-start/extension
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/ResearchLayerPanel.tsx apps/extension/src/sidepanel.tsx apps/extension/src/styles.css apps/extension/tests/sidepanel.test.tsx
git commit -m "Keep stale cards readable during refresh"
```

## Task 4: Treat Empty Sections As Resolved Work

**Files:**
- Modify: `apps/extension/src/ResearchLayerPanel.tsx`
- Modify: `apps/extension/src/research-layer.ts`
- Test: `apps/extension/tests/research-layer.test.ts`
- Test: `apps/extension/tests/sidepanel.test.tsx`

- [ ] **Step 1: Write failing test for empty section display**

Add a test named:

```ts
it("renders empty research sections as resolved rather than failed", () => {
  // Given a section with status "empty".
  // Expected: layer state is resolved/empty, not failed.
  // Expected: action can refresh the section if supported.
});
```

- [ ] **Step 2: Normalize section state vocabulary**

Map core statuses into UI states:

```ts
not_started -> ready
running -> running
available -> populated
empty -> empty
failed -> failed
stale -> stale
```

Avoid treating `empty` as `failed`.

- [ ] **Step 3: Render empty section copy from definitions**

Use `RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].emptyState`. Do not invent per-call explanation copy in the component.

- [ ] **Step 4: Run tests**

```bash
npm test -w @cold-start/extension -- research-layer sidepanel.test.tsx -t "empty"
npm run typecheck -w @cold-start/extension
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/ResearchLayerPanel.tsx apps/extension/src/research-layer.ts apps/extension/tests/research-layer.test.ts apps/extension/tests/sidepanel.test.tsx
git commit -m "Treat empty research sections as resolved"
```

## Task 5: Add Visual Regression Coverage For The Dossier Lifecycle

**Files:**
- Modify: `apps/extension/tests/e2e/sidepanel-ui.spec.ts`
- Modify: `apps/extension/package.json` only if a new named test script is useful.

- [ ] **Step 1: Add e2e fixtures**

Create test fixtures inside the existing e2e spec for:

- Missing card with source receipt.
- Starter card with profile run still running.
- Stale card refreshing.
- One running gated section.
- Empty section resolved.

- [ ] **Step 2: Add screenshots**

Use existing screenshot conventions in the repo. Name screenshots:

```text
living-dossier-source-receipt
living-dossier-starter-card-running
living-dossier-stale-refreshing
living-dossier-section-running
living-dossier-empty-section
```

- [ ] **Step 3: Add assertions beyond snapshots**

Assert:

- No synthesis text appears in public or source receipt states.
- Running section does not set the global progress dot to running.
- Source receipt rows do not render claim text.
- Stale card has a freshness mark.

- [ ] **Step 4: Run extension QA**

```bash
npm run qa:extension:ui -w @cold-start/extension
npm run qa:extension:smoke -w @cold-start/extension
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/tests/e2e/sidepanel-ui.spec.ts apps/extension/package.json
git commit -m "Cover living dossier extension states"
```

## Task 6: Public Boundary And Contract Audit

**Files:**
- Test: `apps/web/tests/public-card-route.test.ts`
- Test: `apps/web/tests/extension-card-route.test.ts`
- Test: `apps/web/tests/extension-bootstrap-route.test.ts`

- [ ] **Step 1: Re-run public and extension route tests**

```bash
npm test -w @cold-start/web -- public-card-route extension-card-route extension-bootstrap-route
```

Expected:

- Public card route never includes `synthesis`.
- Extension card route still requires auth.
- Bootstrap returns sections and sources without changing required fields.

- [ ] **Step 2: Run contract snapshot check**

```bash
npm test -w @cold-start/core -- research-sections generation-quality trust
```

Expected: all pass.

- [ ] **Step 3: Run full gate**

```bash
npm run check
```

Expected: full gate passes. Non-blocking dependency audit advisories are acceptable only if the guarded audit script exits zero.

- [ ] **Step 4: Manual QA**

Run local app:

```bash
docker-compose up -d postgres
npm run dev:full
```

Build local extension:

```bash
VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN=true VITE_COLD_START_API_ORIGIN=http://localhost:3000 npm run build -w @cold-start/extension
```

Manually verify:

- Missing domain shows source receipt once sources arrive.
- Starter card appears before late enrichment completes.
- Public card route strips synthesis.
- A gated section run expands only its module.

- [ ] **Step 5: Commit QA docs if manual notes are added**

```bash
git add docs/qa
git commit -m "Document living dossier QA"
```

## Merge Gate

- [ ] `npm run check` passes.
- [ ] `npm run qa:extension:ui -w @cold-start/extension` passes.
- [ ] `npm run qa:extension:smoke -w @cold-start/extension` passes.
- [ ] Public route response has no `synthesis`.
- [ ] Extension route still rejects missing auth.
- [ ] No new provider or LLM calls are started without user confirmation.
- [ ] Visual review confirms the extension feels calmer and more useful, not busier.
- [ ] Diff does not touch `packages/core/src/card.ts` unless a reviewer explicitly approves the reason.
