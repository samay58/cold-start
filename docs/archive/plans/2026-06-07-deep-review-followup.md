# Deep Review Follow-Up Task

**Goal:** Continue the broader Cold Start adversarial review later, after the current generation reliability batch is landed on `main`.

**Why this exists:** The June 7 pass found and tightened concrete reliability issues around generation modes, section run identity, extension polling, queued-run failure handling, and trace filtering. The next pass should keep digging without mixing speculative optimization work into the current stabilization shipment.

## Done Definition

- Re-read `SPEC.md`, `DESIGN.md`, `README.md`, `SECURITY.md`, and the current generation route, worker, repository, and extension side panel code.
- Review public/private data boundaries end to end for profile cards, research sections, extension bootstrap, and generation status events.
- Exercise at least one fresh local generation path and one cached-card path against real code, not just synthetic fixtures.
- Produce a short findings list ordered by severity with file references, test evidence, and a clear call on whether each issue should block a release.

## Starting Points

- `apps/web/src/app/api/generate/route.ts`
- `apps/web/src/app/api/extension/bootstrap/route.ts`
- `apps/web/src/inngest/functions.ts`
- `apps/extension/src/sidepanel.tsx`
- `apps/extension/src/sidepanel-network.ts`
- `packages/db/src/repository.ts`
- `packages/core/src/card.ts`
- `packages/core/src/research-sections.ts`

## Review Checklist

- Confirm profile runs and section runs cannot mask, overwrite, or incorrectly resume each other.
- Confirm public endpoints never return synthesis or gated research content.
- Confirm stale, empty, failed, and running research sections render with accurate state in the extension.
- Confirm queued, active, failed, and complete generation runs retire or surface consistently across API, worker, and UI.
- Confirm provider, LLM, and trace data keep enough evidence for post-run debugging without exposing secrets or private synthesis.
- Confirm optimization plan docs remain separate from release-critical reliability work unless explicitly promoted.
