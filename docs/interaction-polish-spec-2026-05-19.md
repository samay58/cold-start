# Cold Start interaction polish spec

Date: 2026-05-19

## Target

The extension should feel like a live research instrument, not a static checklist. Two surfaces carry the most risk:

- Generation progress while a card is being built.
- Dormant enrichment cards when the user drags or snaps one into the research layer.

## Problems to fix

The generation page currently shows a determinate line and stage list, but the line only changes when state changes. Between backend polls, the page reads as frozen. The cursor also sits on the rail as a separate dot, so progress looks pasted on rather than physically moving through the line.

The enrichment pile uses tactile card styling, but activation has to preserve continuity. A dragged card should feel pinned into the active research stack. When a dormant card leaves the pile, the remaining cards should settle instead of jumping.

## Direction

Use restrained motion in the current parchment, Fraunces, Mona Sans, and Lens Blue system.

- Progress rail: determinate fill uses transform-based scale, not width. Cursor travel eases from the same progress variable as the fill. A soft scan passes across the rail so the page stays alive while polling is quiet.
- Current stage: only the active row gets motion. Completed and future rows stay calm.
- Snap motion: dormant cards use transform-based pile poses. Activation uses Framer Motion shared layout IDs to connect the physical card to the active enrichment article.
- Loading inside snapped cards: use a compact moving progress line plus blue shimmer text, not a static skeleton block.

## Reference mapping

- Checkbox: state commitment is sequenced. Apply to active enrichment states by letting the primary card move first, then the running copy and source chips follow.
- Rubber banding: boundaries should resist before they stop. Apply to pile drag constraints and drop-target preview.
- Interpolation: one motion value should drive multiple related perceptions. Apply to progress fill, cursor, scan, and active-stage emphasis.
- Responsive gestures: snap decisions should use projected intent, not raw distance alone. Apply to dormant card activation.
- Staggering text: sequence only when it prevents stutter or clarifies replacement. Do not stagger dense dossier facts.
- Dock: compress and move the whole object rather than animating disconnected children. Apply to card pile settling and active-card expansion.

## Non-goals

- No fake backend stages.
- No new provider or generation contract.
- No dark-mode or glowing dashboard treatment.
- No bounce or elastic motion.
- No broad redesign of the extension shell.

## Acceptance checks

- Dragging a dormant card upward shows a visible snap target, releases into the active research layer, and leaves the pile settling smoothly.
- A shallow upward drag previews intent without committing; a committed drag changes the drop copy to `Release to pin`.
- Running basics progress shows visible motion for at least three seconds even if the backend stage is unchanged.
- The active source-pass stage is represented twice with purpose: once as the editorial current stage, once in the compact step list.
- Reduced motion disables scanning and pulsing while preserving clear state.
- Existing side panel tests still pass.
- A Playwright screenshot of the running progress page shows a clean rail, cursor, active row, and no overlapping text.

## Implementation notes

- `SourcePassInstrument` is the canonical progress component for the extension.
- `motion-primitives.ts` is the shared home for gesture math and springs.
- `ResearchLayerPanel` owns the card-pile physical response because the drag source, drop preview, and active-card transition need to coordinate as one surface.
