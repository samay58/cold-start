# Ray Gun Direction — Reference Inventory

> Moodboard and source material behind the 2026-05-26 visual reset. Backs the current `DESIGN.md`. Living document; update as the direction earns specifics.

## The pivot

Cold Start ran for one cycle on the **parchment-era** stack: Fraunces serif, Mona Sans, warm parchment surfaces, sand hairlines, Lens Blue accent, Roman-numeral section markers. It read as the default AI-editorial aesthetic — the Anthropic / Claude / Codex visual stack by another name. Tasteful but indistinguishable. The product's pitch is counterculture taste applied to investor research; the wrapper was undercutting the substance.

The reset goes a full 180. New reference: **Emigré, Ray Gun, Adbusters** — 90s experimental editorial. Anti-grid, expressive typography as image, hand-built, opinionated. The translation rule keeps the system shippable: spirit of Ray Gun, legibility of a well-set broadsheet. Type-as-image at section heads and moments of rhythm. Calm and scannable at the level where a fact lives.

## Reference set

The system pulls from a tight reference inventory. Each reference contributes a specific gesture, not a whole aesthetic.

**Emigré (Rudy VanderLans, Zuzana Licko)**
- Type as the primary structural element, not chrome.
- Asymmetric blocks. Deliberate weight imbalance.
- Custom display weights paired with mono text.
- What Cold Start takes: section-label letterspacing, mono as the load-bearing text face.

**Ray Gun (David Carson, ~1992–2000)**
- Headlines that break the grid in service of rhythm.
- Captions that feel typed by hand, not typeset.
- Marginalia: small notes set in margins, deliberately imperfect placement.
- Hand-drawn marks (underlines, arrows, redactions).
- What Cold Start takes: hand-drawn underline SVG marks under section labels, marginalia for source citations on dense pages.

**Adbusters**
- Hazard color as protest signal. One saturated color carrying the entire system.
- Anti-corporate voice. Direct, slightly deadpan. "WHO SAID YES" vs. "Investor Profile."
- ASCII-style data visualizations rendered as type, not chart libraries.
- What Cold Start takes: hazard yellow as the only accent, ASCII bar visualizations for stats, declarative section vocabulary.

**Adjacent (not primary) references**
- **Toiletpaper** — confidence to be slightly weird without explanation.
- **Apartamento** — text-first layouts with photo as occasional punctuation, never wallpaper.
- **032c** — restraint at the margins, kinetic energy at the headline.
- **Cabinet** — footnote-as-feature; sources are part of the page, not hidden in a drawer.

## What survives from the parchment era

- The schema (`packages/core/src/card.ts`) — unchanged.
- The auth gate and public/extension surface split — unchanged.
- The Framer Motion pile UX in the extension — unchanged in structure; re-tuned in easing and pose.
- The source-class encoding concept (independent / reporting / company) — kept; re-mapped to ink / xerox / riso red.
- `chrome.storage.local` persistence of pinned research layers — unchanged.

## What dies

- Fraunces and Mona Sans.
- Warm parchment (`#FAFAF7`, `#FCFAF5`) as page surface.
- Sand hairlines (`#E6DFC9`) as the dominant structural device.
- Lens Blue (`#1674FF`) as the active-state accent.
- The pale blue extension shell (`#EEF8FB`) and the Japanese wave background.
- Roman numerals as decorative section markers (`i`, `ii`, `iii`, `iv` …).
- 12px card radii.
- Layered card shadows.
- "Why It Matters", "Buyer & Use Case", "Market Structure & Timing" as category names.
- The source drawer affordance on web.

## Type specimens

Final type pair, free and ship-today:

- **Space Grotesk Variable** (Florian Karsten Type Foundry, free via Google Fonts) — display and body. Weights 300–800. Tracked tight at headlines, letter-spaced wide at section labels.
- **JetBrains Mono Variable** (JetBrains, free via Google Fonts) — every number, citation, source row, caption, marching cursor. Tabular figures always on.

Upgrade path (license cost ~$300–800 per family):

- Display: PP Neue Machina (Pangram Pangram) or GT America Compressed (Grilli Type) or Söhne Breit (Klim).
- Mono: PP Neue Montreal Mono (Pangram Pangram) or Söhne Mono (Klim).

The free pair ships the direction at 90%. Licensed pair is the upgrade once the direction has earned the budget.

## Color samples

- `#0A0A0A` Ink — pure near-black.
- `#F4F1EA` Bone — cool photocopier paper.
- `#ECE6D7` Bone-deep — inset / extension shell.
- `#9A938A` Xerox — secondary metadata.
- `#F2E300` Hazard yellow — the only saturated accent.
- `#FF3D2E` Riso red — warnings and company-sourced caveats only.

Hazard yellow does the job that three colors did in the parchment era. One color carrying everything is the discipline.

## Voice specimens

Section labels (current set, open to iteration before lock):

```
THE PITCH        →  why it matters
WHO BUYS         →  buyer and use case
WHY NOW          →  market structure and timing
WHO SAID YES     →  investors
THE NUMBERS      →  funding, headcount, stats
THE COMPS        →  comparables
THE TECH         →  product and technology
WHAT BREAKS IT   →  risks and diligence
THE OPENS        →  open questions
```

Citation footers (typed-feeling, mono):

```
→ TechCrunch · 2026-03-04
→ LinkedIn · 2026-05
→ Company · cartesia.ai/about
```

Loading captions:

```
TYPESETTING…   ▓▓▓▓▓░░░░░
FILING…         ▓▓▓▓▓▓▓░░░
INDEXING…       ▓▓▓░░░░░░░
READING…        ▓░░░░░░░░░
```

Empty states: `NO SIGNAL YET`, `OUTSIDE FILES`, `STILL READING…`.

## Risk register

- **Illegible homage.** Ray Gun illegibility doesn't work for fact retrieval. Mitigation: kinetic moments only at section heads; data layer stays calm and high-contrast.
- **Too-cute deadpan.** Section vocabulary can read as ironic if pushed. Mitigation: single review pass on the vocabulary before commit 4 ships.
- **Hazard yellow accessibility.** Yellow on bone has lower contrast than ink on bone; needs to be used at small marks only (citation `[1]`, brand mark, single accents), never as text color on long copy.
- **Free-font ceiling.** Space Grotesk + JetBrains Mono ship the direction at 90%. The licensed upgrade exists if the system needs to feel more singular later.

## Lineage

```
Paper-era observatory direction      →  retired before parchment ever shipped
Parchment-era dossier                →  shipped through May 2026, retired 2026-05-26
Ray Gun direction                    →  current (this document)
```

Files:

- `DESIGN.md` — current visual source of truth.
- `docs/brand/raygun-direction.md` — this file.
- `docs/brand/archive/parchment-era-2026-05.md` — previous shipped system.
- `docs/brand/archive/*` — pre-parchment Paper-era exploration. Historical only.
