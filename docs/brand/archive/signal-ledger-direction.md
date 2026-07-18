# Signal Ledger Direction

> Supporting note for the 2026-05-27 Cold Start design reset. The live rules are in `DESIGN.md`; this file preserves the reasoning and build plan.

## Position

Cold Start should own the space between investment memo, evidence ledger, and live research workbench. The design should not depend on a borrowed cultural reference. It should be recognizable because the product logic is visible: claims, sources, confidence, conflicts, and next questions.

Signal Ledger is a full break from the Ray Gun pass:

| Ray Gun pass | Signal Ledger |
|--------------|---------------|
| Zine reference | Proprietary research instrument |
| Expressive type | Calibrated type roles |
| Hazard yellow | Mineral evidence palette |
| Hand-drawn marks | Source-quality marks |
| ASCII bars | Evidence matrices |
| Floating pile | Expandable research modules |
| Section spectacle | Sentence-case investor language |

## Taste Standard

The interface should feel like someone with taste made a tool for deciding whether to keep reading. Taste shows up through proportion, restraint, source handling, and the refusal to invent decoration when the data already has structure.

Good taste here means:

- The source ledger is visible enough to matter.
- The company name and key facts arrive before the interface announces itself.
- Evidence states are small but consistent.
- Motion clarifies state. It never performs personality.
- Empty and missing states are honest.

Bad taste here means:

- The UI asks the reader to admire a moodboard.
- Source confidence becomes colorful badges.
- Every section becomes a card.
- Progress copy sounds like an AI pretending to work.
- The extension feels like a toy instead of a workbench.

## Build Order

1. Reset tokens and fonts.
2. Build the public reading plate.
3. Build source ledger and citation linking.
4. Convert extension research layer into workbench modules.
5. Standardize evidence state marks.
6. Browser-check desktop, mobile, and extension panel.

## Open Implementation Questions

- Whether Berkeley Mono is available to ship now or needs a licensed-font fallback.
- Whether source ledger should sit right rail by default on desktop or become a sticky bottom panel for medium widths.
- Whether the first extension pass keeps click-only module activation or preserves drag as a secondary gesture.
- Whether conflict rendering should be added to the schema now or first inferred from existing trace/source metadata.

These are implementation questions, not design direction blockers. The active direction is settled in `DESIGN.md`.
