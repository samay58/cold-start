# Company Fact Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the public website as a focused Company Fact Receipt surface.

**Architecture:** Replace the public homepage shelf with a narrow landing page that shows only curated examples. Simplify the public `CardShell` branch into a receipt: company identity, selected public facts, evidence notes, one source ledger, and a quiet extension CTA. Preserve API contracts and extension synthesis behavior.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, shared `@cold-start/ui` package, `@cold-start/core` trust/source helpers.

## Global Constraints

- Do not change generation, storage, or public API wire shapes.
- Public pages must never render synthesis.
- Public comps and public open questions are gated by default.
- Homepage examples are `browserbase` and `cartesia`, hidden if unavailable.
- Public UI must not expose raw internal labels: `medium`, `empty`, `gap`, `hit`, `stale`, `partial`, `miss`.
- Keep Catalogue Card visual language: light, warm, source-led, no dashboard shelf.

---

## Tasks

### Task 1: Homepage Receipt Landing

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/tests/home-page.test.tsx`

**Deliverable:** Homepage explains Cold Start and links only to curated receipts.

- [ ] Replace public index/search/sort with receipt landing.
- [ ] Hide unavailable curated examples.
- [ ] Update tests to assert no shelf controls or corpus count.

### Task 2: Public Card Receipt UI

**Files:**
- Modify: `packages/ui/src/CardShell.tsx`
- Modify: `packages/ui/src/SourceDrawer.tsx`
- Modify: `packages/ui/src/tokens.css`
- Test: `packages/ui/tests/CardShell.test.tsx`

**Deliverable:** Public cards render as one receipt with one source ledger.

- [ ] Add public evidence-status/fact-row/note helpers.
- [ ] Replace public render path with receipt header, identity, facts, notes, ledger, footer.
- [ ] Keep extension render path unchanged.
- [ ] Update tests for one ledger, hidden unknowns, no synthesis, no raw cache labels.

### Task 3: Source Label Guardrails

**Files:**
- Modify: `packages/core/src/source-quality.ts`
- Test: `packages/core/tests/source-quality.test.ts`

**Deliverable:** Public source labels do not overstate company-authored or press-release evidence.

- [ ] Add tests for company-site/company-domain source classification.
- [ ] Preserve existing press-release and enrichment ordering.

### Task 4: Verification

**Commands:**
- `npm test -w @cold-start/ui -- CardShell`
- `npm test -w @cold-start/core -- source-quality`
- `npm test -w @cold-start/web -- home-page`
- `npm test -w @cold-start/web -- public-card-route`
- `npm test -w @cold-start/web -- public-card-metadata`
- `npm run typecheck`
- `npm run lint`
- `npm run test`

**Deliverable:** Targeted behavior passes, with any broader-suite failures called out if caused by unrelated in-flight work.
