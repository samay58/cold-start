# Cold Start: Interface Design System

> Current visual source of truth. Last updated 2026-05-28 for the **Personal Ledger** extension of Signal Ledger. This keeps the 2026-05-27 evidence system and adds a more authored source treatment. The 2026-05-26 Ray Gun/zine pass remains archived at `docs/brand/archive/raygun-era-2026-05-27.md`. The earlier parchment system remains archived at `docs/brand/archive/parchment-era-2026-05.md`. If code disagrees with this file, treat this file as the intended direction and update code deliberately.

Cold Start should feel like the private research instrument an investor keeps open during first-pass diligence. Not a dossier. Not a generic zine. Not a SaaS dashboard. The interface is a personal signal ledger: calm enough to trust, sharp enough to have taste, and specific enough that source quality is visible before the reader asks.

The page should make one promise: every claim has a place, every source has a weight, every missing fact is honestly absent. The design work is to make that promise feel inevitable.

The old directions failed in opposite ways:

- **Parchment dossier:** tasteful but generic. Warm paper, serif type, sand lines, and blue citation marks made the product look like every AI editorial mockup.
- **Ray Gun reset:** energetic but referential. It had posture, but too much of the taste came from borrowed zine language instead of Cold Start's own product logic.
- **Compliance software:** the ever-present risk. If trust becomes badges, filters, gray tables, and disclaimers, the product loses all warmth and judgment.

Signal Ledger is the middle with teeth. Personal Ledger is the next layer: same evidence discipline, more visible authorship. It should look like a tool built by someone who reads investment memos, filing footnotes, and product surfaces with equal seriousness.

The useful lesson from expressive personal sites is not to copy their surfaces. Taste comes from specific choices: an owned mark, chosen color, clear source objects, and layouts that do not feel templated.

## Core Ethos

Cold Start is a decision surface. A reader wants to know whether this company deserves the next ten minutes. The interface should answer that through hierarchy, not volume.

Three jobs:

- Put the company, the key facts, and the next diligence question above everything else.
- Make evidence weight visible through small, repeatable marks rather than decorative chrome.
- Let source handling, rhythm, and marks carry personality without turning the research layer into a toy.

The page has editorial judgment, but it is not magazine cosplay. It has instrumentation, but it is not a terminal. It has motion, but only where state changes.

## Typography

Use three families, each with a narrow job.

| Role | Face | How it is used |
|------|------|----------------|
| Interface | `IBM Plex Sans` 400-700 | Navigation, labels, buttons, tables, metadata, body copy, and most headings. It is clear, slightly engineered, and not precious. |
| Editorial emphasis | `IBM Plex Serif` 400-600 | One-liners, claim text, short rationale blocks, and source titles when the text should read like a note rather than a control. Use sparingly. |
| Evidence | `Berkeley Mono` 400-700 | Numbers, dates, citation markers, source IDs, trace states, confidence codes, and compact ledgers. Tabular figures always on. |

Berkeley Mono is the precision face. Do not turn the whole app into mono. The contrast only works when the mono marks feel earned.

Headings use sentence case, not shouty labels. A section can say `Money`, `People`, `Proof`, `Risk`, or `Sources`. It should not say `THE NUMBERS`, `WHO SAID YES`, or anything that reads like a concept poster. Dense product labels can be small and tracked at `0.04em` to `0.08em`, but avoid wide letter-spaced spectacle.

Type scale:

| Token | Size | Use |
|------|------|-----|
| `display` | `clamp(42px, 7vw, 72px)` | Company name on public card. IBM Plex Sans 650-700, tight but not compressed. |
| `section` | `24px-32px` | Section titles. IBM Plex Sans 620 or IBM Plex Serif 500 when the section is prose-heavy. |
| `claim` | `18px-22px` | Short sourced thesis text. IBM Plex Serif 450-550. |
| `body` | `14px-16px` | Core reading text. IBM Plex Sans 400-500. |
| `ledger` | `11px-13px` | Sources, citations, dates, source weight, trace events. Berkeley Mono. |

Kill on sight: Inter, Geist, Roboto, Space Grotesk, JetBrains Mono, Fraunces, Newsreader, Source Serif 4, decorative compressed display faces, and single-family systems where every element has the same voice.

Prompt wording for typography:

```text
Use IBM Plex Sans for interface structure and most headings, IBM Plex Serif only for short claim text and editorial emphasis, and Berkeley Mono with tabular figures for numbers, dates, citations, source IDs, evidence states, and compact ledgers. Keep labels sentence case. Avoid wide all-caps section styling, zine typography, Fraunces, Space Grotesk, JetBrains Mono, Inter, Geist, Roboto, and generic compressed display fonts.
```

## Color System

The palette is light, mineral, and evidence-coded. It should not collapse into beige editorial warmth or neon technical drama.

| Token | Value | Role |
|-------|-------|------|
| `--color-field` | `#F7F5EE` | App background. Quiet field, warmer than white but not parchment. |
| `--color-plate` | `#FFFDF8` | Primary reading surface and extension modules. |
| `--color-ink` | `#171A1F` | Primary text and strong rules. |
| `--color-muted` | `#68706A` | Secondary prose, stale metadata, unavailable values. |
| `--color-rule` | `#CCC7B8` | Hairlines, table rules, ledger dividers. |
| `--color-rule-strong` | `#9C978A` | Active separators and selected module outlines. |
| `--color-verified` | `#0E6B5B` | Independent or directly corroborated evidence. |
| `--color-reported` | `#315F9D` | Press, database, or secondary reporting evidence. |
| `--color-company` | `#9B6A1E` | Company-sourced claims. Useful, but caveated. |
| `--color-conflict` | `#B63A2A` | Contradiction, stale claim, verifier drop, or material risk. |
| `--color-focus` | `#D7B84A` | Current focus ring, selected citation, active research module. Use as a small metal-like accent, never as a wash. |

Evidence color appears as tiny marks: square dots, short ticks, citation brackets, or source IDs. Do not color whole cards by source class. Do not use large green or amber backgrounds to imply trust. The product should make confidence legible, not gamified.

No gradients. No dark mode. No blue-purple accent system. No hazard yellow. No glass. Shadows are rare and shallow; structure should come from rule weight, alignment, and spacing.

Prompt wording for color:

```text
Use a light mineral palette: field #F7F5EE, plate #FFFDF8, ink #171A1F, muted #68706A, rule #CCC7B8. Encode evidence with small marks only: verified #0E6B5B, reported #315F9D, company #9B6A1E, conflict #B63A2A, focus #D7B84A. No gradients, no dark mode, no hazard yellow, no glass, no large tinted status cards, and no decorative blue-purple SaaS palette.
```

## Shape, Texture, And Elevation

The default shape is a plate, not a floating card. Use 6px radius for primary surfaces and 4px for compact controls. Never exceed 8px unless a native browser control forces it.

Surfaces have 1px rules, not decorative borders. Rules can be stronger where they carry structure. A ledger table can use horizontal rules every row; a prose section may use only one opening rule. Do not wrap every section in a card.

Use background texture only if it survives scrutiny at 1x and disappears at reading distance. The first implementation should ship with no texture. Taste comes from the grid and source marks.

Elevation:

- Public page: no outer shadow. The page is a reading plate sitting on the field.
- Extension modules: one shallow shadow allowed for active dragged or expanded modules, max `0 6px 18px rgb(23 26 31 / 0.08)`.
- Controls: no glow, no glass, no pill chrome.

## Layout Model

### Public Card

The public `/c/{slug}` page is a two-zone ledger.

Top zone: identity and decision facts.

- Company name, domain, generated time, cache state.
- A one-sentence sourced description.
- Four to six key values: founded, HQ, raised, last round, headcount, founders.
- One visible "next question" when synthesis is absent: the best honest open thread based only on public facts.

Bottom zone: evidence-led sections.

- `Money`
- `People`
- `Signals`
- `Comps`
- `Sources`

On desktop, sources sit in a right-hand ledger rail when space allows. On mobile, the source ledger follows the content. The rail is not decoration; it lets a reader scan source quality while reading facts.

The page width should feel deliberate:

- Reading plate max: `1120px`.
- Main claim column: `620px-720px`.
- Source rail: `280px-340px`.
- Gap: `32px-56px`.

### Extension Panel

The Chrome extension is a workbench. It keeps the current company pinned at the top, then shows research modules as inspectable rows. The old pile metaphor is retired.

Module rows have four parts:

- Title: `Why care`, `Who pays`, `Proof`, `Money`, `Comps`, `Risk`, `Next question`.
- State: `ready`, `running`, `saved`, `blocked`, or `not found`.
- Evidence count: cited source count, not fake progress.
- Last event: the latest real generation event.

Activation expands a module in place. Running state stays inside that module. No separate global analysis page once a profile exists.

Motion should feel mechanical:

- Expand/collapse: 180-240ms, transform and opacity.
- Running source events: quiet vertical replacement, not a ticker marquee.
- Drag is optional. If kept, rotation stays under 1deg and exists only to clarify handoff.
- No scattered type, no card collisions, no bounce, no expressive chaos.

## Components

### Reading Plate

Primary public surface. Field background outside, plate background inside, 6px radius, 1px rule. Uses a real grid. The plate should feel substantial without pretending to be paper.

### Header Stack

Company name, domain, and generation metadata. The name is the only display-scale text. The domain and generated state sit in Berkeley Mono so the reader understands they are machine-resolved facts.

### Key Value Strip

A compact row or wrap grid of values. Each value has:

- Small sentence-case label.
- Berkeley Mono value for numbers and dates; IBM Plex Sans value for words.
- Citation marker beside the value when cited.
- Evidence dot before the label.

No icon grid. No decorative stat cards.

### Claim Row

The atomic content unit. A claim row contains a claim, its citation markers, and a source-weight mark. Claim rows can be used for signals, founders, funding details, and synthesis sections.

Rows should be readable as a ledger:

```text
verified  Raised $91M across disclosed rounds. [1][4]
company   Claims enterprise deployment across contact-center workflows. [7]
conflict  Headcount differs between LinkedIn and Apollo by more than 20%. [2][8]
```

The words `verified`, `company`, and `conflict` are implementation states, not necessarily visible labels. The visible surface should use marks and concise text.

### Citation Marker

Inline Berkeley Mono marker: `[1]`. Source class controls marker color. Hover or focus reveals a compact popover with title, publisher, date, and source class. Click scrolls to the ledger row on web. In the extension, click can open the source detail inline.

Markers must stay readable against text. Do not make them superscript if that hurts tap targets.

### Source Ledger

A table, not a drawer by default.

```text
[1] verified  TechCrunch       2026-03-04  cartesia-series-b
[2] reported  LinkedIn         2026-05     linkedin.com/company/cartesia
[3] company   Company site     current     cartesia.ai
```

Use Berkeley Mono for IDs, dates, and domains. Use IBM Plex Sans or Serif for source titles depending on density. The ledger should make "where did this come from?" answerable in one glance.

### Evidence Matrix

Use for sections where multiple facts need comparison. This is the replacement for decorative bars, ASCII visuals, and loose stat cards.

Rows are facts. Columns are value, status, source, and freshness. Keep it dense but breathable. If a value is missing, state `not found` or hide the row depending on whether the absence matters.

### Research Module

Extension-only. A row that expands into a module. States:

- `ready`: can run from available public card context.
- `running`: shows real event stream and source count.
- `saved`: has generated content with citations.
- `blocked`: missing required basics or auth.
- `not found`: ran successfully and found no support.

`not found` is a successful state when true. Do not style it as failure.

### Conflict State

Conflicts get a small oxide mark, the two values, and the two sources. The UI should never smooth conflicts into a fake average.

Example:

```text
Headcount conflict
37 on LinkedIn [2]
52 in Apollo [8]
```

### Loading State

Use real verbs from generation events:

- `Finding company profile`
- `Checking funding sources`
- `Resolving founders`
- `Reading recent signals`
- `Saving public card`
- `Running verifier`

Render as a compact event ledger with the current row highlighted by `--color-focus`. No spinners. No skeleton screen after a saved card exists.

### Empty State

Plain, not cute:

- `No public funding found.`
- `No cited customer proof yet.`
- `No recent signal with a usable source.`
- `Analysis has not run for this card.`

The empty state should tell the truth and stop.

## Source Quality Encoding

Source quality is a first-class design system concept.

| Source class | Color | Mark | Meaning |
|--------------|-------|------|---------|
| Verified | `#0E6B5B` | filled square | Independent or directly corroborated source supports the fact. |
| Reported | `#315F9D` | outlined square | Credible secondary source reports the fact. |
| Company | `#9B6A1E` | half-filled square | Company-originated claim. Useful, but lower weight. |
| Conflict | `#B63A2A` | diagonal slash | Sources disagree or verifier rejected a claim. |
| Unknown | `#68706A` | small ring | No usable source. Usually hidden unless absence matters. |

Do not spell out these classes everywhere. The source ledger explains the marks. The content layer uses the marks with restraint.

## Voice

Use plain investor language.

Good section labels:

- `Why care`
- `Who pays`
- `Proof`
- `Money`
- `People`
- `Comps`
- `Risk`
- `Next question`
- `Sources`

Avoid:

- Zine labels like `Who said yes` or `What breaks it`.
- Corporate categories like `Market Structure & Timing` when a shorter label works.
- Compliance labels like `Disclosure`, `Confidence Report`, or `Evidence Validation Center`.
- Cute loading copy.

Sentences should be declarative. Claims must carry citations. If a statement cannot be cited, it belongs in an open question or does not belong.

## Image Prompt Block

Use this when asking an image model to extend the current app:

```text
Design a UX concept for Cold Start in the Signal Ledger direction. The product is an investor research surface for sourced company context, not a dashboard, zine, or chat UI. Use a light mineral palette: field #F7F5EE, plate #FFFDF8, ink #171A1F, muted #68706A, rule #CCC7B8. Source quality appears through tiny evidence marks only: verified #0E6B5B, reported #315F9D, company #9B6A1E, conflict #B63A2A, focus #D7B84A. Typography uses IBM Plex Sans for interface structure, IBM Plex Serif for short claim text, and Berkeley Mono for numbers, dates, citations, source IDs, evidence states, and compact ledgers. The public page is a two-zone research plate with identity and key values at top, evidence-led sections below, and a source ledger rail on desktop. The extension is a compact workbench with expandable research module rows, real generation events, source counts, and cited outputs. Use 6px radii, 1px rules, dense but breathable grids, source tables, citation markers like [1], and mechanical state motion. No dark mode, no gradients, no glass, no hazard yellow, no zine typography, no ASCII charts, no floating card pile, no decorative icons, no soft SaaS shadows, no Fraunces, no Space Grotesk, no JetBrains Mono, no Inter, no Geist, no Roboto.
```

## Implementation Plan

Build this in five passes. Do not continue implementing the Ray Gun assets unless they are being converted into this system.

1. **Archive and token reset**
   - Keep Ray Gun and parchment docs in `docs/brand/archive`.
   - Replace app tokens with Signal Ledger colors, radius, rules, and font variables.
   - Remove hand-drawn marks, ASCII stat bars, hazard yellow, and zine section names.

2. **Public card plate**
   - Rebuild the `/c/{slug}` shell around the reading plate, key value strip, claim rows, evidence matrix, and source ledger.
   - Make citations resolve cleanly from inline markers to source ledger rows.
   - Keep public synthesis hidden.

3. **Extension workbench**
   - Replace the pile/tray metaphor with expandable research module rows.
   - Move running analysis state into the active module.
   - Preserve the existing backend contract: basics and analysis first, future per-module jobs later.

4. **Evidence state pass**
   - Standardize verified, reported, company, conflict, and unknown marks across `packages/core`, `packages/ui`, web, and extension.
   - Add conflict rendering for facts with materially different source values.

5. **Verification**
   - Screenshot public and extension surfaces at desktop and panel widths.
   - Check text fit, citation tap targets, source ledger readability, and mobile stacking.
   - Run focused UI tests plus the repo gate relevant to touched packages.

## Guardrails

- `SPEC.md` remains the product and technical source of truth.
- `DESIGN.md` is the current visual source of truth.
- `docs/brand/archive/raygun-era-2026-05-27.md` is historical only.
- `docs/brand/archive/parchment-era-2026-05.md` is historical only.
- Do not use archived design files as prompt inputs unless the prompt explicitly asks for a past direction.
- Do not present screenshots or implementation work as complete until the rendered app has been checked in the browser.
