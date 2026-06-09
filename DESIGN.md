# Cold Start: Interface Design System

> Current visual source of truth. Last updated 2026-05-29 for the Catalogue Card direction, shared by the public `/c/{slug}` card and the Chrome side panel. The Signal Ledger system that preceded it is archived at `docs/brand/archive/signal-ledger-era-2026-05.md`; the 2026-05-26 Ray Gun pass at `docs/brand/archive/raygun-era-2026-05-27.md`; the earlier parchment system at `docs/brand/archive/parchment-era-2026-05.md`. If code disagrees with this file, treat this file as the intended direction and update code deliberately.

Cold Start should feel like a sourced investing index kept by someone with taste. It is not a SaaS dashboard, not a dossier, not a magazine costume, and not a chat product. Each company renders as a kept catalogue card: warm parchment, sharp rules, legible facts, a single dusty-lilac seal used as a verb, and enough authorship that the page feels filed rather than generated.

The page should make one promise: every claim has a place, every source has a weight, and every missing fact is honestly absent. The design work is to make that promise feel natural.

The direction inherits the Signal Ledger's evidence discipline and adds the authorship the earlier passes lacked. The history is instructive:

- **Parchment dossier:** tasteful but generic. Warm paper, serif type, sand lines, and blue citation marks made the product look like every AI editorial mockup.
- **Ray Gun reset:** energetic but referential. Too much of the taste came from borrowed editorial language instead of Cold Start's own product logic.
- **Signal Ledger:** disciplined but flat. Plex Sans everywhere, blue-and-gold accents, and clean rules read as competent default rather than authored.
- **Compliance software:** the ever-present risk. If trust becomes badges, filters, gray tables, and disclaimers, the product loses all warmth and judgment.

The Catalogue Card keeps the evidence discipline and earns its character from specific choices: a sharp grotesk display voice on the public web surface, At Umami inside the extension workbench, one chosen seal color, classification marks, filed and vetted stamps, and a parchment surface that survives scrutiny. Taste comes from those choices, not from chrome.

## Core Ethos

Cold Start is a decision surface. A reader wants to know whether this company deserves the next ten minutes. The interface should answer that through hierarchy, not volume.

Three jobs:

- Put the company, the key facts, and the next diligence question above everything else.
- Make evidence weight visible through small, repeatable marks rather than decorative chrome.
- Let source handling, rhythm, and marks carry personality without turning the research layer into a toy.

The page has editorial judgment, but it is not magazine cosplay. It has instrumentation, but it is not a terminal. It has motion, but only where state changes.

## Typography

Use three active roles, each with a narrow job. The public web surface uses a GT America-ready grotesk display stack. The extension keeps At Umami as its display face. At Textual remains the shared evidence face.

| Role | Face | How it is used |
|------|------|----------------|
| Display | Public web: `GT America` if the licensed webfont is present, otherwise `IBM Plex Sans` 700-780. Extension: `At Umami` 600-800. | Company name, hero headings, and section labels. Public web should feel like crisp editorial-tech grotesk, not a rounded poster. Extension can keep the warmer catalogue-card voice. |
| Body | `IBM Plex Sans` 400-760 | Navigation, labels, buttons, tables, metadata, body copy, values, claims. Clear, slightly engineered, not precious. Tabular figures on for numbers. |
| Receipt / evidence | `At Textual` 400-600 | Call numbers, source marks, run-step indices, and the small index-card numerics. A licensed monospaced face: the receipt nod, never a generic code font. |

At Textual is the precision face. Do not turn the surface into monospace. The contrast only works when the receipt marks feel earned. `Berkeley Mono` / `IBM Plex Mono` remain defined as `--font-mono` for dense numeric ledgers, but At Textual carries the index-card character.

Headings use sentence case, not shouty labels. A section can say `Money`, `People`, `Proof`, `Risk`, or `Sources`. It should not say `THE NUMBERS`, `WHO SAID YES`, or anything that reads like a concept poster. Section labels render in the active display face in the seal color; dense field labels stay small body at `0.04em` to `0.14em`.

Type scale:

| Token | Size | Use |
|------|------|-----|
| `display` | `clamp(50px, 6.4vw, 82px)` web, `clamp(28px, 6vw, 34px)` panel | Company name. Public web uses the grotesk display stack at 700-780 with tight tracking; panel uses At Umami 770-800. |
| `section` | `13px-17px` | Section labels. Active display face in the seal color, sentence case. |
| `claim` | `15px-18px` | Short sourced thesis text. IBM Plex Sans 400-500. |
| `body` | `12px-16px` | Core reading text. IBM Plex Sans 400-500. |
| `receipt` | `9px-13px` | Call numbers, source marks, step indices, dates. At Textual, tabular. |

Kill on sight: Inter, Geist, Roboto, Space Grotesk, JetBrains Mono, Fraunces, Mona Sans, Newsreader, Source Serif 4, decorative compressed display faces, and single-family systems where every element has the same voice.

Prompt wording for typography:

```text
Use the public web grotesk display stack for the website company name, hero headings, and section labels. If a licensed GT America webfont is added, it should own `--font-gt-america-next`; until then IBM Plex Sans carries that role. Keep At Umami for the extension workbench display voice, IBM Plex Sans for interface structure, body, and values with tabular figures, and At Textual only for call numbers, source marks, step indices, and small index-card numerics. Keep labels sentence case. Avoid wide all-caps section styling, zine typography, generic code mono as a voice, Fraunces, Space Grotesk, JetBrains Mono, Inter, Geist, Roboto, and generic compressed display fonts.
```

## Color System

The palette is warm parchment with one chosen accent, evidence-coded. It should not collapse into beige editorial warmth or neon technical drama.

| Token | Value | Role |
|-------|-------|------|
| `--color-seal` | `#6E5C9E` | The single accent. A dusty lilac used as a verb: top edge, call number, filed and vetted stamps, section labels, active state, links. |
| `--cat-paper` | `#F4EDDC` | Card surface on the public card. Warm parchment, carrying the texture. |
| `--cat-ground` | `#E4DCC8` | Manila ground the card sits on. |
| `--cat-ink` | `#20201E` | Primary text on parchment. |
| `--cat-muted` | `#786F62` | Secondary prose on parchment. |
| `--cat-rule` / `--cat-rule-strong` | `#D8CEB6` / `#C3B79A` | Parchment hairlines and structural separators. |
| `--color-field` | `#F7F5EE` | Quiet field for the panel ground and lighter surfaces. |
| `--color-plate` | `#FFFDF8` | Clean reading surface for panel cards and forms. |
| `--color-ink` / `--color-muted` | `#171A1F` / `#68706A` | Primary and secondary text on plate. |
| `--color-rule` / `--color-rule-strong` | `#CCC7B8` / `#9C978A` | Plate hairlines and active separators. |
| `--color-verified` | `#0E6B5B` | Independent or directly corroborated evidence. |
| `--color-reported` | `#315F9D` | Press, database, or secondary reporting evidence. |
| `--color-company` | `#9B6A1E` | Company-sourced claims. Useful, but caveated. |
| `--color-conflict` | `#B63A2A` | Contradiction, stale claim, verifier drop, or material risk. |
| `--color-focus` | `#D7B84A` | Brand-aperture fill only. A small metal accent, never a wash or an interaction color. |

Evidence color appears as tiny marks: square dots, short ticks, citation brackets, or source IDs. Do not color whole cards by source class. Do not use large green or amber backgrounds to imply trust. The product should make confidence legible, not gamified.

The seal is the only decorative color, and it earns that by being a single, restrained accent used as a verb, not a SaaS blue-purple system: no gradient accent fields, no tinted buttons, no glow. No dark mode. No hazard yellow. No glass. Shadows are rare and shallow; structure comes from rule weight, alignment, parchment texture, and spacing.

Prompt wording for color:

```text
Warm parchment surface (paper #F4EDDC on ground #E4DCC8) with mineral plate surfaces (field #F7F5EE, plate #FFFDF8, ink #171A1F, muted #68706A, rule #CCC7B8). One accent only: a dusty-lilac seal #6E5C9E used as a verb for the top edge, call number, filed and vetted stamps, section labels, and active state. Encode evidence with small marks only: verified #0E6B5B, reported #315F9D, company #9B6A1E, conflict #B63A2A. No gradient accent fields, no dark mode, no hazard yellow, no glass, no large tinted status cards, and no SaaS blue-purple palette.
```

## Shape, Texture, And Elevation

The default shape is a catalogue card, not a floating SaaS card. Use 6px radius for primary surfaces and 4px for compact controls. Never exceed 8px unless a native browser control forces it.

Surfaces have 1px rules, not decorative borders. Rules can be stronger where they carry structure. A ledger table can use horizontal rules every row; a prose section may use only one opening rule. Do not wrap every section in a card.

The public card ships a real parchment texture via `@paper-design/shaders-react`, scoped to the card surface as a near-static WebGL island (`apps/web/src/app/CardTexture.tsx`). It must survive scrutiny at 1x and disappear at reading distance. It degrades to the flat `--cat-paper` fill under SSR, no-WebGL, and `prefers-reduced-motion`, with no layout shift. The side panel's resting surfaces use the flat parchment fill. The one exception is the generation moment: while a profile is being built, the progress panel may load a single retuned mesh field in the parchment-and-seal palette, drifting slowly and grounded, never a SaaS gradient wash. Under reduced motion it renders as a calm still field, not a frozen one.

The catalogue motifs carry the authorship:

- **Top edge:** a thin seal hairline along the card head.
- **Call number:** a short `CS · SLUG` mark in At Textual, seal colored, with a source count beneath.
- **Filed stamp:** a seal-outlined `FILED <date>` lockup beside the company name.
- **Classification dots:** small verified / reported / company squares lead facts and claims. Never tint whole cards.
- **Vetted stamp:** a rotated seal stamp tied to real corroboration counts in the footer.
- **Stacked-card depth:** the card sits on a faint offset shadow, a card pulled from an index. This is the one allowed elevation on the public card.

Elevation otherwise:

- Public page: no outer shadow beyond the stacked-card depth. The card sits on the manila ground.
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

The Chrome extension is a compact workbench. It keeps the current company pinned at the top, shows active research as inspectable modules, and keeps dormant modules in a controlled pile of catalogue cards waiting to be filed. The pile metaphor is active product language: tactile, precise, and readable rather than chaotic.

Module rows have four parts:

- Title: `Why care`, `Who pays`, `Proof`, `Money`, `Comps`, `Risk`, `Next question`.
- State: `ready`, `running`, `saved`, `blocked`, or `not found`.
- Evidence count: cited source count, not fake progress.
- Last event: the latest real generation event.

Activation expands a module in place. Running state stays inside that module. No separate global analysis page once a profile exists.

Motion should feel snappy, elegant, and characterful, built on grounded physics rather than mechanical easings:

- Committed state changes ride stiff, well-damped springs tuned just under critical damping (zeta roughly 0.85-1.0): they settle fast and keep a breath of follow-through. No cartoon bounce, but not sterile either.
- Drag uses real physics language: velocity projection to read intent, square-root rubber-band give at the edges, and a spring settle on release.
- Expand/collapse: 150-240ms, transform and opacity.
- Running source events: quiet vertical replacement, not a ticker marquee.
- Panel-level state handoffs (generation finishing, the card arriving) crossfade; the most important state change in the product never hard-cuts.
- Drag rotation stays under 1.5deg and exists only to clarify handoff. No scattered type, no card collisions, no expressive chaos.
- `prefers-reduced-motion` is a tasteful reduction, never a freeze: spatial travel and rotation go away, but short opacity fades and in-place breathing stay, so running states remain legibly alive.

## Components

### Reading Plate

Primary public surface. Field background outside, plate background inside, 6px radius, 1px rule. Uses a real grid. The plate should feel substantial without pretending to be paper.

### Header Stack

Company name, domain, and generation metadata. The name is the only display-scale text. On public web it uses the grotesk display stack; in the extension it uses At Umami. A filed stamp and a seal call number sit alongside; the call number and generated state use At Textual so the reader understands they are machine-resolved facts.

### Key Value Strip

A compact row or wrap grid of values. Each value has:

- Small sentence-case label.
- Tabular IBM Plex Sans value for numbers and dates; IBM Plex Sans value for words. Each fact is led by a classification dot.
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

Inline marker `[1]` in IBM Plex Sans with an ink hairline and source-class color, no wash; it fills with the seal on hover or focus. Hover or focus reveals a compact popover with title, publisher, date, and source class. Click scrolls to the ledger row on web. In the extension, click can open the source detail inline.

Markers must stay readable against text. Do not make them superscript if that hurts tap targets.

### Source Ledger

A table, not a drawer by default.

```text
[1] verified  TechCrunch       2026-03-04  cartesia-series-b
[2] reported  LinkedIn         2026-05     linkedin.com/company/cartesia
[3] company   Company site     current     cartesia.ai
```

Use At Textual for source marks and dates and IBM Plex Sans for source titles. The ledger reads as the card's tracings and should make "where did this come from?" answerable in one glance.

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
Design a UX concept for Cold Start as a kept catalogue card. The product is an investor research surface for sourced company context, not a dashboard, zine, or chat UI. Surface is warm parchment (paper #F4EDDC on manila ground #E4DCC8) with mineral plate surfaces (field #F7F5EE, plate #FFFDF8, ink #171A1F, muted #68706A, rule #CCC7B8). One accent only: a dusty-lilac seal #6E5C9E used as a verb for the top edge, call number, filed and vetted stamps, and section labels. Source quality appears through tiny evidence marks only: verified #0E6B5B, reported #315F9D, company #9B6A1E, conflict #B63A2A. Typography uses a GT America-ready grotesk display stack for the public web company name and section labels, At Umami for extension display moments, IBM Plex Sans for interface structure, body, and values with tabular figures, and At Textual only for call numbers, source marks, and step indices. The public card is a two-zone record with a filed stamp, display company name, and key values at top, evidence-led ruled sections below, a source ledger as tracings, and a rotated vetted stamp in the footer, sitting on a faint stacked-card shadow over the manila ground. The extension is a compact workbench with expandable research module rows, real generation events, source counts, and cited outputs in the same language. Use 6px radii, 1px rules, dense but breathable grids, classification dots, citation markers like [1], and mechanical state motion. No dark mode, no gradient accent fields, no glass, no hazard yellow, no SaaS blue-purple palette, no zine typography, no ASCII charts, no decorative icons, no soft SaaS shadows, no Fraunces, no Mona Sans, no Space Grotesk, no JetBrains Mono, no Inter, no Geist, no Roboto.
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
   - Keep active research as expandable module rows and dormant research as a controlled filing-card pile.
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
