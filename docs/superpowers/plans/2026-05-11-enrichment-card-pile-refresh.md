# Enrichment Card Pile Refresh

Status: implemented pending live Chrome visual pass on `codex/enrichment-card-pile-refresh`.

## Goal

Replace the extension success surface with a high-taste research layer where useful enrichment cards can be pinned from a tactile pile, populated from real card data, and advanced through the existing investor-lens job without carrying old sticky-CTA UI paths forward.

## Source Of Truth

- `DESIGN.md` is the visual source of truth.
- `SPEC.md` is the product and technical source of truth.
- The five mockups in `~/Downloads/cold-start-refresh-mockup-*.png` are visual evidence, not specs.
- The live Chrome side panel is the constraint. Design for the actual narrow extension surface, not the wider image canvas.

## Decisions

- Basics generation remains a full-panel state because no company context exists yet.
- Existing-profile enrichment lives inside the research layer.
- The first slice is extension-only. It uses the current card schema, existing extension API, and existing generation status contract.
- The first slice includes seven useful cards only: Core Idea, Customers, Serves, Signals, Competition, Mechanism, and Open Questions.
- Analysis-backed cards start or resume the real investor-lens job. Card-backed rows render from existing card data or show honest empty states.
- Drag is premium, not mandatory. Click, Enter, and Space must activate the same path.
- The snap target appears only during drag or pile focus. It is not permanent decoration.
- Framer Motion is used in the extension for drag, snap, active-card layout, chevron rotation, and accordion expansion. It replaces the earlier hand-rolled pointer path rather than sitting beside it.

## Stale-Code Contract

The refresh is a rewrite of the extension success surface, not an overlay. Keep these gates clean:

```bash
rg "Analyze" apps/extension/src apps/extension/tests
rg "cs-extension-analyze|has-analysis-action|cs-extension-analysis-notice" apps/extension/src apps/extension/tests
rg "CardShell" apps/extension/src/sidepanel.tsx
rg "Market Context|Business Model|Cold Start Brief" apps/extension/src apps/extension/tests
```

Expected result: all commands return no matches.

## Implementation Map

- `apps/extension/src/research-layer.ts` owns allowed cards, availability, display state, and source counts.
- `apps/extension/src/ResearchLayerPanel.tsx` owns the company context, active rows, pile, click activation, keyboard activation, drag activation, inline running state, and no-source regenerate state.
- `apps/extension/src/sidepanel.tsx` owns network requests, settings, basics generation, analysis start, analysis resume, and polling.
- `apps/extension/src/styles.css` owns the parchment shell, company context, research layer, tray, card pile, focus states, and motion.
- `apps/extension/tests/research-layer.test.ts` verifies the model stays honest.
- `apps/extension/tests/sidepanel.test.tsx` verifies the extension behavior and legacy-removal contract.

## Completed In This Slice

- [x] Added the research-layer model.
- [x] Added model tests for card order, future-card exclusion, analysis-backed states, card-derived display, and source-count honesty.
- [x] Replaced the old extension success path with `ResearchLayerPanel`.
- [x] Moved existing-profile investor-lens start and resume into the success state.
- [x] Kept basics generation as the only full-panel generation flow.
- [x] Added click activation for dormant cards.
- [x] Added keyboard activation for dormant cards.
- [x] Replaced the hand-rolled pointer drag path with Framer Motion drag and snap choreography.
- [x] Added inline running state for analysis-backed cards.
- [x] Added no-source regenerate state inside the research layer.
- [x] Removed stale sticky analysis CSS selectors.
- [x] Updated `DESIGN.md` so the extension guidance matches the refreshed surface.
- [x] Refined the basics-generation progress screen away from the legacy orbit/stage-card feel toward text-first shimmer.
- [x] Changed active enrichment bodies from raw paragraphs into compact evidence rows and item lists.
- [x] Fixed the Customers card to use supported buyer/user context instead of incorrectly falling back to headcount.
- [x] Reworked the card pile spacing so dormant cards remain readable while preserving the physical stack.
- [x] Added compact linked source chips and stripped inline citation markers from enrichment prose.

## Verified

```bash
npm run typecheck -w @cold-start/extension
npm test -w @cold-start/extension
npm run build -w @cold-start/extension
npm run lint
rg "Analyze" apps/extension/src apps/extension/tests
rg "cs-extension-analyze|has-analysis-action|cs-extension-analysis-notice" apps/extension/src apps/extension/tests
rg "Market Context|Business Model|Cold Start Brief" apps/extension/src apps/extension/tests
```

Note: `npm run lint -w @cold-start/extension` is not available because the extension workspace has no lint script. The root lint fan-out completed.

## Next Checks

- Run the stale-code contract commands after any further edits.
- Load the built extension in Chrome and test no token, cached card, no-source partial card, running basics job, running investor-lens job, failed investor-lens job, close/reopen resume, click activation, keyboard activation, Framer drag activation, and reduced motion.
- Capture screenshots from the real extension before merging.
- If the visual pass feels cramped, adjust spacing and pile depth before adding any new state or component.
- Product follow-up: basics generation is still too slow for first-run UX. The durable fix is staged generation: return identity/profile shell first, then populate richer research only when cards are activated. Do not mask this solely with better loading UI.
- Data follow-up: named customers require a real schema/pipeline field. The current card supports buyer/user context through `identity.description.serves`, but not named customer extraction.
