# Cold Start: Current Interface Design System
> Current visual source of truth for the shipped app UI. Last verified 2026-05-11 against `packages/ui/src/tokens.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/extension/src/styles.css`, and `packages/ui/src/CardShell.tsx`.

Cold Start currently reads as an editorial company dossier with instrument-grade source encoding. The app is light-first: warm parchment surfaces, black ink, sand hairlines, and a small amount of Lens Blue for active source signal. The mood is not a generic SaaS dashboard and not the older Paper-era dark observatory mockup. Dark navy is still part of the brand token set and can appear in iconography or future framing, but the implemented web and extension surfaces are built around the parchment card system.

Do not use archived Paper directions, old cover mockups, IBM Plex, Berkeley Mono, or Newsreader as current app guidance. The implemented type system is Fraunces, Mona Sans, and a sparse system mono fallback.

## Core Ethos

The interface should feel like a sourced investment note that happens to be alive. It should be more document than dashboard, more research instrument than chatbot. Density is allowed when it helps an investor scan a company quickly, but the page should still have editorial restraint: real hierarchy, clear source marks, and no decorative AI gloss.

The visual language has three jobs:

- Make the company profile feel credible enough to inspect.
- Make source quality visible without turning the card into compliance software.
- Leave room for richer AI-native interactions, like enrichment cards, without losing the dossier feel.

## Typography

| Role | Actual face | How it is used |
|------|-------------|----------------|
| Editorial serif | `Fraunces` | Section headings, fact values, source copy, signal/comparable titles, and high-emphasis card text. It gives the card its dossier quality. |
| Operational sans | `Mona Sans` | App chrome, labels, controls, badges, tables, stats, and homepage/product copy. It keeps the product crisp and functional. |
| Sparse mono | `ui-monospace`, `"SF Mono"`, `Menlo`, `monospace` | Tiny stage markers, app marks, and occasional machine-state text. It is not the main data face. |

Fraunces should be used with confidence. In the app it is not a decorative flourish; it is the warmth and authority of the document. Section headings sit around 24-34px with optical sizing and 600-700 weight. Fact values and source titles often sit around 16-18px. Use slight negative tracking at display sizes, not aggressive editorial compression.

Mona Sans carries the product mechanics. Labels are small, uppercase, and tracked enough to feel measured. Buttons, tabs, stats, and metadata should look precise but not terminal-like. Heavy numeric or metric moments can use Mona Sans in the 700-820 range.

The mono fallback should be rare. If an image prompt starts rendering everything like a terminal or research HUD, it is drifting away from the actual app.

Prompt wording for typography:

```text
Use the current Cold Start app typography: Fraunces as the editorial serif for dossier headings and fact values, Mona Sans for all operational UI, labels, controls, stats, and tables, with tiny system-mono accents only for occasional machine-state marks. Do not use IBM Plex, Berkeley Mono, Newsreader, Inter, Roboto, Geist, or JetBrains Mono.
```

## Color System

| Token | Value | Role |
|-------|-------|------|
| `--color-observatory-navy` | `#06192c` | Brand depth, icon lineage, optional frame/background accent. Not the default page surface. |
| `--color-abyss-ink` | `#020812` | Deepest ink/navy, used sparingly for high-contrast brand depth. |
| `--color-parchment` | `#fafaf7` | Primary app background and paper field. |
| `--color-parchment-warm` | `#fcfaf5` | Warm card surface. |
| `--color-ink` | `#0e0e0e` | Primary text. |
| `--color-muted-ink` | `#5f625c` | Secondary prose and muted body. |
| `--color-mid-stone` | `#6e6e76` | Labels, secondary metadata, subtle stats. |
| `--color-soft-sand` | `#d8d5ca` | Borders, separators, quiet structure. |
| `--color-hairline` | `#e6dfc9` | Fine card rules and table borders. |
| `--color-hover-pebble` | `#f0efea` | Subtle hover and inset surfaces. |
| `--color-lens-blue` | `#1674ff` | Primary active signal: citations, selected controls, source emphasis. |
| `--color-wire-blue` | `#5fb4ff` | Secondary blue signal, used with restraint. |
| `--color-signal-amber` | `#a8741f` | Warning, mixed-source, or company-sourced caution. |

The current app uses source class color as a small evidence cue: independent sources use Lens Blue, reporting or secondary wires use Wire Blue, and company-provided signals use Signal Amber. These should be tiny marks, not large color blocks.

Prompt wording for color:

```text
Use warm off-white parchment surfaces (#FAFAF7 and #FCFAF5), black ink (#0E0E0E), muted stone metadata (#5F625C and #6E6E76), sand hairlines (#E6DFC9), and a precise Lens Blue accent (#1674FF) for citations and active source states. Keep color quiet and editorial. Avoid purple gradients, neon glows, generic dark dashboards, and decorative blobs.
```

## Shape, Texture, And Elevation

The implemented system is clean but not sterile. Cards use warm paper surfaces, 12px document radii, soft sand borders, and layered shadows that lift the card without making it float like a marketing tile. Buttons and compact controls are tighter, often around 8-10px. The visual texture should come from typography, rules, source marks, and real data structure, not from background effects.

Use 1px hairlines. Use subtle grid texture only when it supports the product frame. Do not over-round cards, do not use pill-heavy SaaS chrome, and do not turn the product into glassmorphism.

## Current Surfaces

The public web app is a light parchment page with a faint Lens Blue grid and a centered dossier card. The card is structured around profile facts, stats, section heads, Roman-style section markers, source rows, funding ladders, and source drawers. It should feel shareable and readable.

The Chrome extension side panel is also parchment-led. It is compact, utility-forward, and uses stacked cards, a small app header, a sticky analysis action, loading instrumentation, and the same source/state vocabulary. It is not currently a full dark navy side panel.

The product mark still carries the observatory/radar idea, but the live app has evolved away from the older "deep observatory shell around memo card" as the default screen composition.

## Components

### Dossier Card

Warm parchment card, black ink, sand hairlines, 12px radius, layered paper shadow. The card should feel like a high-quality investment memo, not a chat response. Use Fraunces for the most editorial content and Mona Sans for labels and controls.

### Section Head

Fraunces, 24-34px, 600-700 weight, calm negative tracking. Section heads should look like printed document hierarchy, not dashboard widgets.

### Fact Row

Small Mona Sans label, often uppercase or compact. Value can use Fraunces when it should feel read as a claim, or Mona Sans when it functions as operational metadata. Citation/source affordances use Lens Blue.

### Source Row

Source rows are evidence objects. Use tiny color-class marks, clear source titles, domain/date metadata, and restrained blue interaction states. The source drawer should feel like the ledger behind the memo.

### Stats And Funding

Use Mona Sans with heavier weight for numbers and compact labels. Keep tables and ladders quiet: hairlines, sand borders, and enough spacing to make the values inspectable.

### Extension Analysis Gate

The side panel should make basics and analysis feel like staged enrichment, not one undifferentiated loading state. Buttons should be precise and compact. Loading can use instrument-like motion, but should stay in the parchment/Fraunces/Mona system.

## Enrichment Card Direction

For the proposed enrichment UX, each inactive category should feel like a physical evidence slip or research card that belongs to this dossier system. The cards can fall, collide, stack, and be dragged, but they should not become toy-like. The best direction is "luxury research instrument with physics" rather than "playful kanban."

Use:

- Parchment cards with sand hairlines and small Lens Blue active marks.
- Fraunces for category titles like `Serves`, `Core Idea`, `Mechanism`, `Customers`, `Signals`, and `Open Questions`.
- Mona Sans for small labels, drag affordances, progress labels, and state text.
- Slight rotations, depth, and imperfect stacks to make the pile feel physical.
- Snapping or pinning motion that feels crisp, measured, and consequential.

Avoid:

- Dark terminal cards unless a dark frame is explicitly requested.
- Big glows, glass panels, floating AI orbs, purple gradients, or synthetic SaaS dashboard cards.
- Overly cute physics. The motion can be delightful, but the product still serves investors inspecting company truth.

## Image Prompt Block

Use this block when asking an image model to extend the current app:

```text
Design a UX concept for the current Cold Start app. Preserve the actual implemented design system: an editorial company dossier on warm parchment surfaces (#FAFAF7, #FCFAF5), black ink (#0E0E0E), muted stone metadata (#5F625C, #6E6E76), sand hairlines (#E6DFC9), and precise Lens Blue (#1674FF) for citations, active states, and source signals. Use Fraunces as the editorial serif for section headings, category titles, fact values, and source copy. Use Mona Sans for operational UI, labels, buttons, stats, tables, and controls. Use tiny system-mono accents only for occasional machine-state marks.

The design should feel like a high-taste AI-native investment research dossier, not a generic SaaS dashboard. Think Rauno Freiberg-level interaction craft: clear hierarchy, tasteful restraint, tactile motion, measured physics, and details that feel engineered rather than decorated. Avoid AI slop: no purple gradients, no generic glowing cards, no glassmorphism, no over-rounded pill UI, no fake terminal aesthetic, no IBM Plex, no Berkeley Mono, no Newsreader, no Inter, no Roboto, no Geist.

For inactive enrichment categories, show a refined pile of physical research cards at the bottom of the Chrome side panel. Each card corresponds to a category such as Serves, Core Idea, Mechanism, Customers, Signals, Open Questions. The user can drag a card upward and snap or pin it into the sidebar to activate that enrichment. On activation, the card should transition into a calculated field using quiet instrument-like motion, source-aware progress, and the same parchment/Fraunces/Mona visual system.
```

## Guardrails

- `DESIGN.md` is the current visual source of truth.
- `SPEC.md` is the product and technical source of truth.
- Archived brand or Paper direction files are historical references only.
- If a design prompt asks for "Cold Start style," default to this file, not older mockups.
- If screenshots disagree with this file, inspect the app code and update this file before generating more prompts.
