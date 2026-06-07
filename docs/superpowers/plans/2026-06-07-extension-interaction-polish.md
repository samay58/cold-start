# Extension Interaction Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every important Cold Start extension interaction feel crisp, direct, accessible, and mechanically correct, with visual proof and regression coverage for each meaningful motion state.

**Architecture:** Treat interaction quality as an observable contract, not taste vibes. Build a durable Playwright-driven interaction probe layer for side-panel gestures and states, then use it to audit and tune the extension surface in focused passes. Keep production changes inside existing extension architecture, Framer Motion primitives, CSS tokens, and current backend contracts.

**Tech Stack:** Chrome MV3 side panel, Vite, React 19, Framer Motion, Playwright, TypeScript, CSS tokens in `apps/extension/src/styles.css`.

---

## Quality Bar

This is a flagship polish pass. The target is not "no obvious bugs." The target is that the extension feels like a compact investor workbench: tactile, fast, legible, calm, and authored. Every interaction should answer four questions:

- Does the interface respond immediately?
- Does the moving thing stay visually attached to the user's input?
- Does motion clarify state or destination?
- Does the interaction still work through keyboard, reduced motion, and slower devices?

This pass must not blunt the app. Smooth does not mean generic, flat, or overly safe. The goal is to remove mechanical bugs and visual fights so the Catalogue Card language can come through more clearly: handled paper, filed research, precise marks, warm parchment, and a little physicality. If a detail is expressive and working, preserve it. If a detail is expressive but buggy, re-engineer it. Only remove a detail when it is confusing, expensive, inaccessible, or fighting the user's intent.

## Craft Preservation Rules

- Keep the pile metaphor active. Do not convert the dormant cards back into a generic row list.
- Keep distinctive Cold Start cues: catalogue-card edges, call-number rhythm, dusty-lilac seal accent, warm paper, and precise filing language.
- Prefer fewer better cues over many decorative cues. Tighten the stack, do not sterilize it.
- Stabilize mechanics before simplifying visuals. A broken interaction can make a good visual idea look bad.
- Do not remove motion just because it is hard. First ask whether motion ownership, timing, easing, or layout participation is wrong.
- Keyboard and reduced-motion paths should feel intentionally designed, not like degraded fallbacks.
- Tests should protect the personality of the interaction, not merely assert that DOM nodes exist.

## Files And Responsibilities

- Modify `apps/extension/src/ResearchLayerPanel.tsx` only when interaction state, ARIA, gesture ownership, or component structure needs to change.
- Modify `apps/extension/src/research-layer-motion.ts` only for thresholds, velocity projection, and click-suppression rules.
- Modify `apps/extension/src/motion-primitives.ts` only for shared spring or duration tokens after measuring multiple call sites.
- Modify `apps/extension/src/styles.css` for visual state, focus state, hover/active state, static pile quality, reduced-motion fallback, and compositor-safe transitions.
- Modify `apps/extension/tests/e2e/sidepanel-ui.spec.ts` for permanent interaction regression tests.
- Create `apps/extension/tests/e2e/interaction-probes.ts` if repeated drag, click, focus, screenshot, or transform-sampling helpers become duplicated across tests.
- Do not change generation APIs, auth, provider behavior, card schemas, or route contracts.

## Interaction Inventory

Audit these surfaces first. Each item needs mouse, keyboard, reduced-motion, and visual-state coverage unless it is explicitly non-interactive.

- Company context: logo/domain link, summary tooltip, More button, metric tooltip, people email copy.
- Research modules: expand/collapse, one-open-at-a-time behavior, running/queued states, action queue states.
- Research progress: running source pass, progress tree, details toggle, reduced-motion stillness.
- Dormant card pile: rest, hover, focus, press, short drag cancel, mid-drag preview, snap-ready, release-to-file, keyboard activation.
- Missing/partial card gate: generate action, regeneration action, disabled/running state.
- Global utility states: loading, empty, failed, stale, no-source partial profile, cached full profile.

## Task 1: Build The Interaction Contract Matrix

**Files:**
- Create: `docs/qa/extension-interaction-contract.md`

- [ ] **Step 1: Create the contract doc**

```markdown
# Extension Interaction Contract

This document is the QA checklist for Cold Start extension motion and interaction polish.

## Global Rules

- Pointer-driven objects must remain visually attached to the pointer. Target: dragged element center stays within 3px of expected pointer position after intentional offsets.
- Drag must not trigger click activation unless the user performs a plain tap/click.
- Keyboard activation must work for every pointer activation.
- Focus rings must be visible, tasteful, and not clipped.
- Reduced motion must preserve state meaning without spatial motion.
- Prefer transform and opacity. Do not animate layout for repeated or gesture-driven interactions.
- No hover state on non-interactive elements.
- No transition-all.
- No spring on helper-copy fade-outs. Use short ease-out transitions.

## Surface Matrix

| Surface | States | Required Proof |
| --- | --- | --- |
| Dormant card pile | Rest, hover, focus, press, drag cancel, preview, snap-ready, release | Screenshots plus Playwright assertions |
| Active research module | Collapsed, expanded, queued, running, populated | Playwright assertions plus screenshot |
| Progress panel | Idle, running, reduced motion | Playwright assertions plus screenshot |
| Tooltip controls | Hover, focus, dismiss | Playwright assertions |
| Gate actions | Missing card, partial card, running generation | Playwright assertions |
```

- [ ] **Step 2: Commit**

```bash
git add docs/qa/extension-interaction-contract.md
git commit -m "Document extension interaction contract"
```

## Task 2: Add Reusable Probe Helpers

**Files:**
- Create: `apps/extension/tests/e2e/interaction-probes.ts`
- Modify: `apps/extension/tests/e2e/sidepanel-ui.spec.ts`

- [ ] **Step 1: Add drag sampling helpers**

Create helpers that measure pointer attachment and capture named visual states without leaving temporary tests in the tree.

```ts
import { expect, type Locator, type Page } from "@playwright/test";

export type DragSample = {
  cardCenterY: number;
  deltaFromPointer: number;
  label: string;
  pointerY: number;
  transform: string;
};

export async function dragWithSamples({
  card,
  deltas,
  page,
  screenshotPrefix
}: {
  card: Locator;
  deltas: Array<{ label: string; y: number }>;
  page: Page;
  screenshotPrefix: string;
}) {
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return [];
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const samples: DragSample[] = [];

  await page.screenshot({ fullPage: true, path: `/private/tmp/${screenshotPrefix}-rest.png` });
  await page.mouse.move(startX, startY);
  await page.mouse.down();

  for (const delta of deltas) {
    const pointerY = startY + delta.y;
    await page.mouse.move(startX, pointerY, { steps: 6 });
    await page.waitForTimeout(80);
    const rect = await card.boundingBox();
    expect(rect).not.toBeNull();
    if (!rect) {
      continue;
    }
    const transform = await card.evaluate((element) => getComputedStyle(element).transform);
    samples.push({
      cardCenterY: rect.y + rect.height / 2,
      deltaFromPointer: rect.y + rect.height / 2 - pointerY,
      label: delta.label,
      pointerY,
      transform
    });
    await page.screenshot({ fullPage: true, path: `/private/tmp/${screenshotPrefix}-${delta.label}.png` });
  }

  return samples;
}

export function expectPointerAttached(samples: DragSample[], maxDelta = 3) {
  for (const sample of samples) {
    expect(
      Math.abs(sample.deltaFromPointer),
      `${sample.label} should stay attached to pointer, got ${sample.deltaFromPointer}px`
    ).toBeLessThanOrEqual(maxDelta);
  }
}
```

- [ ] **Step 2: Replace ad hoc probe code in tests**

Use the helper from permanent tests instead of temporary console probes.

```ts
import { dragWithSamples, expectPointerAttached } from "./interaction-probes";
```

- [ ] **Step 3: Run helper-specific tests**

```bash
npm run qa:extension:ui -w @cold-start/extension -- --grep "dormant card|dormant-card drag"
```

Expected: all matching tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/tests/e2e/interaction-probes.ts apps/extension/tests/e2e/sidepanel-ui.spec.ts
git commit -m "Add extension interaction probe helpers"
```

## Task 3: Audit Motion Ownership

**Files:**
- Modify: `apps/extension/src/ResearchLayerPanel.tsx`
- Modify: `apps/extension/src/research-layer-motion.ts`
- Modify: `apps/extension/src/styles.css`

- [ ] **Step 1: Search for competing motion owners**

```bash
rg -n "layout|drag=|animate=|useMotionValue|useSpring|useTransform|transition: all|transition:\\s*$|grid-template-rows|height|width" apps/extension/src
```

Expected: identify each place where layout, drag, CSS transition, and Framer animation can affect the same element.

- [ ] **Step 2: Classify each motion**

For each match, write one line in `docs/qa/extension-interaction-contract.md`:

```markdown
| Element | Motion owner | Safe? | Notes |
| --- | --- | --- | --- |
| Dormant card inner | Framer drag owns y | Yes | Outer frame owns pile offset. |
```

- [ ] **Step 3: Fix any mixed-owner violations**

Use this rule:

```text
If an element is pointer-dragged, it cannot also have layout animation or an animate object writing the same transform axis during the gesture.
```

- [ ] **Step 4: Run focused checks**

```bash
npm run typecheck -w @cold-start/extension
npm run qa:extension:ui -w @cold-start/extension -- --grep "drag|keyboard|reduced motion|profile-finishing"
```

Expected: typecheck passes and all focused UI tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/ResearchLayerPanel.tsx apps/extension/src/research-layer-motion.ts apps/extension/src/styles.css docs/qa/extension-interaction-contract.md
git commit -m "Tighten extension motion ownership"
```

## Task 4: Dormant Card Pile Deep QA

**Files:**
- Modify: `apps/extension/tests/e2e/sidepanel-ui.spec.ts`
- Modify: `apps/extension/src/ResearchLayerPanel.tsx`
- Modify: `apps/extension/src/styles.css`

- [ ] **Step 1: Add permanent pointer-attachment assertions**

Update the existing drag test so it samples first, middle, and last dormant cards.

```ts
for (const [label, slug] of [
  ["Who pays", "first"],
  ["Money", "middle"],
  ["Next question", "last"]
] as const) {
  const card = page.locator(".cs-dormant-card", { hasText: label });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  const samples = await dragWithSamples({
    card,
    deltas: [
      { label: "initial", y: -12 },
      { label: "mid", y: -42 },
      { label: "ready", y: -116 }
    ],
    page,
    screenshotPrefix: `cold-start-drag-${slug}`
  });
  expectPointerAttached(samples);
  await page.mouse.up();
}
```

- [ ] **Step 2: Verify cancel, snap, and keyboard paths**

Assertions required:

```ts
await expect(page.locator(".cs-module-insertion-slot")).toHaveCount(0);
await expect(page.locator(".cs-dormant-card", { hasText: "Who pays" })).toBeVisible();
await expect(page.locator(".cs-active-enrichment", { hasText: "Who pays" })).toHaveCount(0);
```

```ts
await expect(page.locator(".cs-active-enrichment", { hasText: "Next question" })).toBeVisible();
```

```ts
await card.focus();
await page.keyboard.press("Enter");
await expect(page.locator(".cs-active-enrichment", { hasText: "Who pays" })).toBeVisible();
```

- [ ] **Step 3: Run the pile tests**

```bash
npm run qa:extension:ui -w @cold-start/extension -- --grep "dormant card|keyboard activation"
```

Expected: all matching tests pass and screenshots in `/private/tmp` show attached, legible cards.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/tests/e2e/sidepanel-ui.spec.ts apps/extension/src/ResearchLayerPanel.tsx apps/extension/src/styles.css
git commit -m "Harden extension card pile interaction tests"
```

## Task 5: Active Module Interaction Pass

**Files:**
- Modify: `apps/extension/tests/e2e/sidepanel-ui.spec.ts`
- Modify: `apps/extension/src/ResearchLayerPanel.tsx`
- Modify: `apps/extension/src/styles.css`

- [ ] **Step 1: Test expand and collapse as a visual state**

Add screenshots and assertions around active module transitions:

```ts
const whoPays = page.locator(".cs-active-enrichment", { hasText: "Who pays" });
await expect(whoPays).toHaveAttribute("data-expanded", "true");
await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-active-expanded.png" });
await whoPays.locator(".cs-active-enrichment-head").click();
await expect(whoPays).toHaveAttribute("data-expanded", "true");
```

The current product rule is one module remains open. If this changes, update the contract doc first.

- [ ] **Step 2: Test queued and running clarity**

Use existing fixtures to assert:

```ts
await expect(activeSignals).toHaveAttribute("data-state", "running");
await expect(activeSignals).toContainText("Refreshing");
await expect(activeSignals.locator(".cs-layer-running-sheen")).toHaveCSS("animation-name", "cs-layer-sheen-slide");
```

- [ ] **Step 3: Inspect CSS for layout animation risk**

Check `grid-template-rows` transitions on `.cs-active-enrichment-body-frame`. This is acceptable only because it is short, local, and not pointer-driven. If jank appears, replace with measured FLIP or instant keyboard behavior.

- [ ] **Step 4: Run focused tests**

```bash
npm run qa:extension:ui -w @cold-start/extension -- --grep "active research cards|profile-finishing"
```

Expected: all matching tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/tests/e2e/sidepanel-ui.spec.ts apps/extension/src/ResearchLayerPanel.tsx apps/extension/src/styles.css
git commit -m "Polish active research module interactions"
```

## Task 6: Tooltip, Link, Button, And Copy Interactions

**Files:**
- Modify: `apps/extension/tests/e2e/sidepanel-ui.spec.ts`
- Modify: `apps/extension/src/ResearchLayerPanel.tsx`
- Modify: `apps/extension/src/styles.css`

- [ ] **Step 1: Test summary tooltip hover and keyboard focus**

```ts
const more = page.getByRole("button", { name: "Read the full company description" });
await more.focus();
await expect(page.locator("#cs-company-shared-tooltip")).toBeVisible();
await page.keyboard.press("Tab");
await expect(page.locator("#cs-company-shared-tooltip")).toHaveCount(0);
```

- [ ] **Step 2: Test source chips and external links**

```ts
await expect(page.getByLabel("Company context").getByRole("link", { name: "browserbase.com" })).toHaveAttribute("target", "_blank");
await expect(page.locator(".cs-source-chip").first()).toBeVisible();
```

- [ ] **Step 3: Test copy action if email fixtures are present**

If the fixture has email data, assert click feedback and clipboard write. If the fixture does not, add a focused fixture with one verified email and test `Copy`.

- [ ] **Step 4: Run focused tests**

```bash
npm run qa:extension:ui -w @cold-start/extension -- --grep "core metrics|cached card"
```

Expected: all matching tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/tests/e2e/sidepanel-ui.spec.ts apps/extension/src/ResearchLayerPanel.tsx apps/extension/src/styles.css
git commit -m "Cover extension tooltip and utility interactions"
```

## Task 7: Reduced Motion And Accessibility Pass

**Files:**
- Modify: `apps/extension/tests/e2e/sidepanel-ui.spec.ts`
- Modify: `apps/extension/src/ResearchLayerPanel.tsx`
- Modify: `apps/extension/src/styles.css`
- Modify: `docs/qa/extension-interaction-contract.md`

- [ ] **Step 1: Run reduced-motion visual states**

```ts
await page.emulateMedia({ reducedMotion: "reduce" });
await openSidePanel(page);
await page.screenshot({ fullPage: true, path: "/private/tmp/cold-start-reduced-motion-rest.png" });
```

- [ ] **Step 2: Assert no sweeping animation in reduced motion**

```ts
await expect(page.locator(".cs-layer-running-sheen")).toHaveCSS("animation-name", "none");
await expect(page.locator(".cs-drizzle-loader span").first()).toHaveCSS("animation-name", "none");
```

- [ ] **Step 3: Keyboard traversal**

Write a focused test that tabs through the visible side panel and asserts the focused element is always visible:

```ts
for (let i = 0; i < 12; i += 1) {
  await page.keyboard.press("Tab");
  const active = page.locator(":focus");
  await expect(active).toBeVisible();
}
```

- [ ] **Step 4: Run reduced-motion tests**

```bash
npm run qa:extension:ui -w @cold-start/extension -- --grep "reduced motion|keyboard"
```

Expected: all matching tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/tests/e2e/sidepanel-ui.spec.ts apps/extension/src/ResearchLayerPanel.tsx apps/extension/src/styles.css docs/qa/extension-interaction-contract.md
git commit -m "Harden extension reduced motion and focus states"
```

## Task 8: Visual Taste Sweep

**Files:**
- Modify: `apps/extension/src/styles.css`
- Modify: `apps/extension/src/ResearchLayerPanel.tsx`
- Modify: `DESIGN.md` only if a design rule needs to be clarified.

- [ ] **Step 1: Capture canonical screenshots**

Run Playwright or a temporary local probe and save:

```text
/private/tmp/cold-start-extension-rest.png
/private/tmp/cold-start-extension-running.png
/private/tmp/cold-start-extension-drag-mid.png
/private/tmp/cold-start-extension-drag-ready.png
/private/tmp/cold-start-extension-reduced-motion.png
```

- [ ] **Step 2: Review against taste criteria**

Check each screenshot for:

```text
No generic SaaS panel feel.
No redundant labels or fake metadata.
No purple overuse.
No clipped focus rings.
No buttony elements where the metaphor should carry the action.
No text overflow.
No awkward overlap.
No layout shift during gesture.
```

Also check for positive craft:

```text
The dormant stack still reads as filed research cards, not a settings list.
The lifted card feels held by the user, not animated by the app.
The filing slot feels like a destination, not a generic dropzone.
The seal accent acts as a verb, not a wash.
The interface keeps the investor-workbench tone: compact, sourced, warm, precise.
```

- [ ] **Step 3: Make only focused taste fixes**

Allowed fixes:

```text
Calm shadows.
Reduce competing borders.
Adjust stack offsets.
Improve focus ring placement.
Trim copy.
Tune action marks.
Tune insertion-slot copy.
Restore a tactile cue if a simplification made the stack feel generic.
```

Not allowed:

```text
Large redesign.
New backend state.
New card schema.
New animation library.
Heavy visual effects.
Flattening expressive details just to make tests easier.
Replacing authored card mechanics with generic SaaS rows.
```

- [ ] **Step 4: Run visual and focused UI tests**

```bash
npm run qa:extension:ui -w @cold-start/extension -- --grep "cached card|dragging|keyboard|reduced motion"
```

Expected: all matching tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/styles.css apps/extension/src/ResearchLayerPanel.tsx DESIGN.md
git commit -m "Polish extension interaction details"
```

## Task 9: Performance And Console Hygiene

**Files:**
- Modify only files that show issues during profiling.

- [ ] **Step 1: Run the full UI suite**

```bash
npm run qa:extension:ui -w @cold-start/extension
```

Expected: all tests pass with no app console errors.

- [ ] **Step 2: Inspect animation properties**

Search for expensive animation patterns:

```bash
rg -n "transition: all|filter|backdrop-filter|box-shadow|grid-template-rows|height|width|top|left|requestAnimationFrame|scrollY|scrollTop" apps/extension/src/styles.css apps/extension/src
```

Expected: every match is either static, one-shot, small/local, or documented in the contract.

- [ ] **Step 3: Verify no temporary artifacts**

```bash
rg -n "TEMP|console\\.log|debugger|cold-start-drag-" apps/extension/src apps/extension/tests
```

Expected: no temp probes, no debug logs, no accidental screenshot path assertions outside helpers.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src apps/extension/tests docs/qa/extension-interaction-contract.md
git commit -m "Clean extension interaction QA artifacts"
```

## Task 10: Final Gate And Ship

**Files:**
- No planned edits.

- [ ] **Step 1: Run focused extension gates**

```bash
npm run typecheck -w @cold-start/extension
npm run qa:extension:ui -w @cold-start/extension
npm run qa:extension:smoke -w @cold-start/extension
```

Expected: all pass.

- [ ] **Step 2: Run full repo gate**

```bash
npm run check
```

Expected: pass. Known non-blocking dependency audit advisories may be reported by the repo audit script.

- [ ] **Step 3: Commit any final QA doc updates**

```bash
git status --short
git add docs/qa/extension-interaction-contract.md
git commit -m "Finalize extension interaction QA plan"
```

Only run the commit if the QA doc changed.

- [ ] **Step 4: Push main**

```bash
git push origin main
```

- [ ] **Step 5: Verify production**

```bash
vercel ls
vercel inspect <new-production-deployment-url> --wait --timeout 180s
curl -I 'https://cold-start.semitechie.vc/?codex=<commit-sha>'
curl -I https://cold-start.semitechie.vc/api/cards/browserbase
```

Expected: deployment is Ready and live routes return 200.

## Execution Notes

- Do not run all tasks as one giant diff. Commit after each coherent pass.
- Use screenshots as evidence, but keep screenshot probes out of committed tests unless they are stable assertions.
- Every permanent test should protect a user-visible behavior, not a visual implementation detail.
- If an interaction feels wrong but the test passes, trust the interaction. Add a better test.
- If a tasteful animation needs expensive layout work, downgrade the animation before expanding the mechanism.
- If a surface feels visually noisy, remove cues before adding new ones.

## Exit Criteria

- Every interactive side-panel control has default, hover or pointer, focus, active, keyboard, and reduced-motion behavior considered.
- Dormant card drag stays attached to pointer within 3px in sampled states.
- Short drag never activates a card.
- Snap drag files a card cleanly.
- Keyboard activation works for every dormant module.
- Reduced motion disables sweeping/spatial decorative motion while preserving state clarity.
- No temporary test code, console logs, or debug artifacts remain.
- `npm run qa:extension:ui -w @cold-start/extension` passes.
- `npm run qa:extension:smoke -w @cold-start/extension` passes.
- `npm run check` passes.
