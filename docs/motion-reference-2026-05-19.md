# Cold Start motion reference

Date: 2026-05-19

Source studies:

- `/Users/samaydhawan/Downloads/checkbox`
- `/Users/samaydhawan/Downloads/rubber-banding`
- `/Users/samaydhawan/Downloads/interpolation`
- `/Users/samaydhawan/Downloads/responsive-gestures`
- `/Users/samaydhawan/Downloads/staggering-text`
- `/Users/samaydhawan/Downloads/dock`

These are taste references, not components to copy. Cold Start still uses the parchment dossier system in `DESIGN.md`.

## Principles

### State changes should have a physical contract

The checkbox works because checking is not only color. The path draws, the fill waits, and the label reacts after the mark commits. Use this pattern when a Cold Start control changes state: one primary state change, one delayed confirmation, no scattered ornament.

Cold Start use:

- Active enrichment rows can move from dormant to active with one shared-layout transition.
- Running stage labels can show a small secondary line only while active.
- Source chips should not animate unless the source state actually changed.

### Gestures should decide with projected intent, not raw distance alone

The responsive gesture example uses projected velocity. A quick but short drag can still snap because the user clearly meant it. This is better than a brittle pixel threshold.

Cold Start use:

- Dormant card snapping should combine offset and projected velocity.
- A slow drag near the threshold should still be reversible.
- A fast upward flick past preview distance should snap decisively.

### Out-of-bounds motion should dampen, not clamp

Rubber banding feels good because the object continues to move past the boundary with resistance. Hard clamps feel broken.

Cold Start use:

- Card drag constraints should feel resistant near the tray boundary.
- Drop target preview should intensify before activation instead of snapping from invisible to final.

### One motion value can drive secondary perception

The interpolation example maps the sheet position into backdrop opacity and blur. That makes the whole surface respond coherently.

Cold Start use:

- The generation rail can drive fill, cursor, and active-stage emphasis from one progress value.
- Inline loading should connect shimmer, progress, and active copy, not run unrelated loops.

### Stagger only when sequence carries meaning

The staggering-text example avoids interruption stutter by letting an animation finish before flipping direction. Stagger is useful when text is being replaced or revealed; it is distracting when used for every label.

Cold Start use:

- Use stagger for rare text replacement moments, such as a finished generation replacing the running state.
- Do not stagger dense card facts or source rows.

### Compress the whole object, not disconnected children

The dock example feels coherent because drag, clip path, and return spring treat the dock as one object. The icons are not each doing separate little tricks.

Cold Start use:

- The dormant card pile should settle as a stack.
- The active enrichment card should open as one document object, with internals following after.

## Motion Tokens

- Fast feedback: 110-150ms.
- Small state change: 180-260ms with `cubic-bezier(0.16, 1, 0.3, 1)`.
- Gesture snap: spring around `stiffness 540-760`, `damping 38-44`, `mass 0.54-0.64`.
- Running progress: continuous scan or shimmer, but only one active movement per component.
- Reduced motion: remove scanning, breathing, and stagger. Keep state visible.

## Current application

- `apps/extension/src/motion-primitives.ts` owns the shared mechanics: projected intent, damped boundaries, commit/snap springs, stage delays, and timing tokens.
- `apps/extension/src/SourcePassInstrument.tsx` is the progress reference implementation. One spring-backed progress value drives fill scale, cursor position, scan origin, stage emphasis, and active-stage text replacement.
- `apps/extension/src/research-layer-motion.ts` uses projected velocity for card snap intent.
- `apps/extension/src/ResearchLayerPanel.tsx` uses shared layout IDs to connect dormant cards to active enrichment rows. Drag offset also drives tray compression, drop-zone intensity, and snap readiness.
- `apps/extension/src/styles.css` keeps the motion visible in the Cold Start system: parchment surfaces, Lens Blue signal, no bounce, no decorative dark/glass treatment.
