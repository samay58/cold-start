# Cold Start: Interface Design System

> Current visual source of truth. Last rewritten 2026-05-26 in service of the **Ray Gun direction** — a deliberate 180 from the earlier parchment dossier. The parchment-era doc is archived at `docs/brand/archive/parchment-era-2026-05.md` and the moodboard / reference inventory lives at `docs/brand/raygun-direction.md`. If the app code disagrees with this file, fix the file before generating more prompts.

Cold Start should read like a zine pulled out of the trade-paper rack at Printed Matter, not another AI dossier. The new system pulls from 90s experimental editorial — Emigré, Ray Gun, Adbusters — translated into a product surface that still has to drive investor screens. **Spirit of Ray Gun, legibility of a well-set broadsheet.** Kinetic where it earns its keep, calm where the data lives.

The two failure modes to avoid:

- **AI-default editorial slop.** Fraunces + warm parchment + sand hairlines + one tasteful accent color. This was the previous system. It read as "every AI startup's interpretation of editorial," not editorial. Retired.
- **Illegible zine homage.** Ray Gun could be unreadable because nobody had to make a decision from it. Cold Start cards drive investment screens. Type-as-image is encouraged at section heads and moments of rhythm, never at the level where a fact lives.

The interface should make the reader feel like they picked up a printed object with a strong art director behind it. Confident, slightly weird, deeply legible at the numbers, expressive at the margins.

## Core Ethos

The card is a printed page, not a chat response. It has a typesetter behind it, not a UI library. It has a point of view about what matters — funding, who said yes, who buys, what breaks it — and it states those points in plain declarative language, not corporate categories.

Three jobs:

- Make the company profile feel handmade and credible enough to read end-to-end.
- Make source quality visible through typography and color discipline, not chrome and badges.
- Leave room for kinetic moments — pile motion, type that scatters on enter, marching cursors — without those moments crowding out the data.

## Typography

The whole system runs on two families. No serif. Sans for everything that breathes; mono for everything that's typed.

| Role | Actual face | How it is used |
|------|-------------|----------------|
| Display | `Space Grotesk Variable` 700–800 | Section heads, headlines, company name, kinetic moments. Tracked tight at large sizes. Letter-spread at section labels (`F U N D I N G`). |
| Body | `Space Grotesk` 400–500 | Prose, fact values, captions. Same family as display for visual cohesion. |
| Mono | `JetBrains Mono` 400/700 | Stats, ASCII bar visualizations, citation markers, source rows, loading captions, marginalia. The load-bearing taste signal. Tabular figures always on. |

Mono is the workhorse, not a flourish. Every number, every citation, every "typed" affordance is mono. Bold mono carries headline stats — `$91M`, `37`, `2023` — because tabular figures in a strong mono out-read sans for any value the reader will compare across cards.

Display weight should feel near-compressed even though Space Grotesk is not a true compressed face. Push it to 800, track it tight, and let scale do the rest. At section labels, do the opposite: letter-space the label wide (`0.18em–0.24em`) and set in small caps or all-caps. The contrast between tight-compressed display and wide-tracked section labels is the system's rhythm.

Kill on sight: Fraunces, Mona Sans, Inter, Geist, Roboto, Source Serif 4, Newsreader, Source Code Pro. Berkeley Mono is excellent but reserved for deliberate single-purpose use; do not default to it.

Prompt wording for typography:

```text
Use Space Grotesk Variable for all display and body text — tight tracking and 700-800 weight at headlines, regular 400-500 for prose. Use JetBrains Mono with tabular figures for every stat, citation marker, source row, ASCII bar visualization, and "typed" caption. Letter-space section labels wide (F U N D I N G) and contrast them against tight-compressed headlines. Do not use Fraunces, Mona Sans, Inter, Roboto, Geist, Newsreader, Source Code Pro, or any serif.
```

## Color System

| Token | Value | Role |
|-------|-------|------|
| `--color-ink` | `#0A0A0A` | Pure near-black. All primary text and most structural lines. |
| `--color-bone` | `#F4F1EA` | Bone-paper background. Cool, photocopier-paper feel, not warm parchment. |
| `--color-bone-deep` | `#ECE6D7` | Slightly darker bone for inset surfaces and the extension shell. |
| `--color-xerox` | `#9A938A` | Xerox grey for secondary metadata, captions, and the rare retained hairline. |
| `--color-hazard` | `#F2E300` | Hazard yellow — the primary signal. Citation marks, active source highlights, the brand mark, anything that says "look here." |
| `--color-riso-red` | `#FF3D2E` | Secondary signal. Warnings, opens, company-sourced caveats, the rare "danger" caption. |
| `--color-paper-shadow` | `rgb(10 10 10 / 0.08)` | Optional, used sparingly behind picked-up cards in motion only. |

Source-class encoding (re-mapped from the parchment era):

- **Independent** → ink black. The default. The fact is solid.
- **Reporting** → xerox grey. Secondary, attributable, less load-bearing.
- **Company** → riso red. Company-sourced; treat as caveat color, not warning.

Hazard yellow is the only saturated color in the system. It carries everything Lens Blue used to and more — active state, citation hit, brand mark, pile-snap highlight. One color doing the job of three is the discipline that makes the system feel art-directed.

No gradients. No glassmorphism. No layered card shadows. No purple. No blue. No teal. No dark mode (deliberate; light-mode counterculture is the move).

Optional: a subtle 5–7% SVG paper-grain overlay on bone surfaces. Ship without it; add only if bone reads too clean against display type. Never as a default.

Prompt wording for color:

```text
Use bone-paper backgrounds (#F4F1EA), pure near-black ink (#0A0A0A), xerox grey for secondary metadata (#9A938A), and hazard yellow (#F2E300) as the only saturated accent — for citation marks, brand mark, active state, and anything the eye should land on. Riso red (#FF3D2E) only for warnings and company-sourced caveats. No gradients, no glass, no soft shadows, no dark mode, no blue, no teal, no purple.
```

## Shape, Texture, And Elevation

Cards are rectangles. `border-radius: 0` is the default. A small radius (2–4px) is acceptable only on interactive controls. Pills and rounded SaaS chrome are forbidden.

Structure comes from typography weight, spacing, and rules — not from cards floating on shadows. Where rules are kept, they are **1px solid ink**, not soft hairlines. Most section breaks come from spacing and type contrast, not borders.

Hand-drawn underline marks (SVG components under `packages/ui/src/marks/`) sit under section labels. Each underline is slightly imperfect, rotated, varied — so no two section heads on the same page look identical. This is the hand-built signal.

Shadows: forbidden by default. The one exception is the extension pile, where a single short hard shadow appears under cards mid-drag — fast, opaque, paper-on-paper, not a soft glow.

## Current Surfaces

The public web app (`/c/{slug}`) is a single column on bone, full-bleed at narrow widths, capped around 720–880px at desktop with generous left/right margin. The card has no outer container border; it's the page. Section labels are letter-spaced and underlined with hand-drawn SVG marks. Stats sit in asymmetric blocks — one stat sized roughly 2× the others, the rest tucked tight. ASCII bar visualizations carry funding raised, headcount, runway-relative-to-round, anything where a relative quantity is more useful than the raw number.

The Chrome extension side panel sits on bone-deep (`#ECE6D7`) with the parchment-era pale blue and the Japanese wave background fully retired. The aperture brand mark renders in hazard yellow. The research-layer pile keeps the Framer Motion gesture model but the easing is stiffer and the rotations more extreme — cards land hard, with overshoot, on a short hard shadow. Pinned section labels animate in with a letter-spacing scatter (collapsed → spread).

The brand wordmark is **Cold Start** set in Space Grotesk display weight, letter-spaced, paired with the aperture mark in hazard yellow.

## Components

### Card Surface

Bone background, ink-black type, no radius, no shadow. The card *is* the page on web; the card sits inside the bone-deep side panel on extension. Page-level rhythm is created by section labels and asymmetric block headers, not by card chrome.

### Section Label

Space Grotesk 600/700, all-caps, letter-spaced `0.18em–0.24em`. Sits left, often at 13–15px. Below it: a hand-drawn SVG underline mark (`UnderlineA`, `UnderlineB`, etc.) sized to roughly the label width plus 10–20%. The underline is the signal that this is a printed page, not a UI.

### Headline / Company Name

Space Grotesk 800, tracked tight (`-0.02em` at display sizes), set at 56–96px depending on viewport. The company name carries the page; everything else is in service.

### Fact Block

Asymmetric. One stat is the "hero" of the block — typically funding raised or headcount — set in bold mono at 32–48px. Two or three smaller stats sit beside or beneath it in 14–18px mono. Labels above stats are tiny letter-spaced sans (`RAISED`, `TEAM`, `FOUNDED`), in xerox grey.

### Stat Bar (ASCII Visualization)

A mono ASCII bar accompanies any stat where a relative quantity helps:

```
RAISED         $91M  ▓▓▓▓▓▓▓▓░░░░░  vs. comp median
TEAM            37   ▓▓▓░░░░░░░░░░  vs. seed+series-A peers
```

Implemented in mono with `▓` and `░` characters, not div widths. Two reasons: it survives a screenshot, and it carries the "typed not designed" signal that anchors the system.

### Citation Marker

Inline mono superscript in hazard yellow: `[1]`, `[2]`. Click target maps to the footnote list at the bottom of the card. No icons, no chips, no drawers on web.

### Source List

Footnote-style block at the bottom of the card. Mono, small, set as:

```
[1]  TechCrunch  ·  2026-03-04  ·  techcrunch.com/cartesia-series-b
[2]  LinkedIn     ·  2026-05      ·  linkedin.com/in/karan-goel
[3]  Company       ·  cartesia.ai/about
```

Source-class color appears as the `[n]` color itself: ink for independent, xerox for reporting, riso red for company. No badges, no tier names spelled out.

### Loading / Empty State

Mono caption with a marching ASCII cursor:

```
TYPESETTING…   ▓▓▓▓▓░░░░░
```

Cycles between `TYPESETTING`, `FILING`, `INDEXING`, `READING`, `WAITING` depending on stage. The cursor advances on a 140ms tick. No spinners. No skeleton blocks.

Empty fields: `NO SIGNAL YET`, `OUTSIDE FILES`, `STILL READING…`. Direct, slightly deadpan.

### Extension Research Layer

The pile keeps its current snap/pin gesture model. What changes:

- Section vocabulary swaps from the McKinsey-style category names. Current set (open to single-pass iteration before lock): `THE PITCH`, `WHO BUYS`, `WHY NOW`, `WHO SAID YES`, `THE NUMBERS`, `THE COMPS`, `WHAT BREAKS IT`, `THE TECH`, `THE OPENS`.
- `PILE_POSES` rotations move from gentle to deliberate — diagonals up to ±8°, not ±2°. The pile looks dropped, not arranged.
- `snapSpring` gets stiffer with overshoot. Cards land hard.
- Pin/unpin gets a brief letter-spacing scatter on the section label as the card enters the layer.
- Background is bone-deep, not the pale blue wave.

### Brand Mark

The aperture mark renders in hazard yellow on bone. Beside it: the wordmark **Cold Start** set in Space Grotesk display weight at 16–20px, letter-spaced `0.06em`, in ink. The pairing is the only place yellow appears at this scale on a quiet card; everywhere else the yellow is small marks.

## Voice

The page sounds like it has an art director and an editor, not a content team.

- Section labels are direct, declarative, slightly weird: `WHO SAID YES`, `WHAT BREAKS IT`, `THE NUMBERS`.
- Citations are typed: `→ TechCrunch · 2026-03-04`, not `via TechCrunch reporting`.
- Empty states have personality without being cute: `NO SIGNAL YET`, `OUTSIDE FILES — RUNNING`. Not `Loading…`, not `No data available`.
- Avoid em-dashes (use periods or arrows), avoid "delve," avoid corporate hedging.
- Avoid Roman numerals as decorative section markers. Numerals appear only where they're data.

## Image Prompt Block

Use this block when asking an image model to extend the current app:

```text
Design a UX concept for the current Cold Start app in the Ray Gun direction. Bone-paper background (#F4F1EA), pure near-black ink (#0A0A0A), xerox-grey secondary metadata (#9A938A), and hazard yellow (#F2E300) as the only saturated accent — used for citation marks, the aperture brand mark, and active state. Riso red (#FF3D2E) only for warnings or company-sourced caveats. Space Grotesk Variable for all display and body type, with 800-weight headlines tracked tight and section labels in all-caps letter-spaced wide. JetBrains Mono with tabular figures for every stat, citation, source row, and ASCII bar visualization. Cards are rectangles with no radius and no shadow. Section heads sit under hand-drawn SVG underline marks. Stats sit in asymmetric blocks — one stat dominant, others tucked tight — and accompany ASCII bar visualizations rendered in mono characters. Citations are inline mono superscripts; the source list is a footnote block at the bottom. No gradients, no glassmorphism, no soft shadows, no dark mode, no purple/blue/teal accents, no pill chrome, no Fraunces, no Mona Sans, no Inter, no Roboto, no Geist. The mood is 90s experimental editorial — Emigré, Ray Gun, Adbusters — translated into a product surface for investor research. Confident, slightly weird, deeply legible at the numbers, expressive at the margins.
```

## Guardrails

- `DESIGN.md` is the current visual source of truth.
- `docs/brand/raygun-direction.md` is the moodboard / reference inventory backing this system.
- `docs/brand/archive/parchment-era-2026-05.md` is the previous shipped system, retired 2026-05-26.
- `SPEC.md` is the product and technical source of truth.
- All other `docs/brand/archive/*` files are pre-parchment historical references only.
- If a design prompt asks for "Cold Start style," default to this file.
- If the app code disagrees with this file, fix the file before generating more prompts.
