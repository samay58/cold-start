# Cold Start: Style Reference
> Intelligence bloom. Editorial restraint. Investor-grade instrumentation.

**Theme:** deep observatory shell + light memo card

Cold Start's design language is a lens finding structure in a noisy company graph. The brand mark is an eye/radar aperture: watchful, technical, and quiet. The interface should feel like a precise instrument around a readable memo, not like generic AI magic.

The current product should use a deep observatory navy shell (`#06192C`) with wire-blue signal lines, then place the sourced card on a warm memo surface (`#FAFAF7`). Berkeley Mono does the load-bearing work for anything inspected: citations, funding amounts, domains, dates, model status, and API-like labels. Lens Blue (`#1674FF`) is the primary signal color for citations and active states.

This system is purpose-built for two surfaces: a 380px Chrome side panel (dense, scannable, lots of facts in a small column) and a full-width public web URL at `/c/{slug}` (more breathing room, OG-image-shareable, citation affordances). Same tokens, two layouts.

The full Semitechie VC brand spine lives in `docs/brand/semitechie-vc-design-ethos.md`; Cold Start is the first implementation.

## Hybrid lineage

From Cursor: warm memo surfaces, Berkeley Mono as the technical-credibility signal, subtle layered elevation, 4-8px radii, dense spacing scale that fits real data into a side panel, OpenType `tnum` for tabular numerals so funding amounts align.

From 14islands: editorial display typography on company headers, tight negative tracking on display sizes, discipline against chromatic accent abuse (one color, used sparingly), pure light/dark binary for primary type with gray reserved for secondary, generous breathing room between sections.

From the Cold Start icon and cover-page reference: deep navy field, white wire/aperture lines, a bright blue lens core, and graph-like connective structure. These elements belong in the shell, icon, loading states, OG/social images, source drawers, and generation telemetry.

What's neither: a blue observatory signature that neither Cursor nor 14islands uses. Citation markers `[n]`, verifier status, and active synthesis links render in Lens Blue. Warning/mixed-source states stay amber.

## Tokens: Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Observatory Navy | `#06192C` | `--color-observatory-navy` | Primary brand field, extension shell, public page background. |
| Abyss Ink | `#020812` | `--color-abyss-ink` | Deepest background and icon badge edge. |
| Lens Blue | `#1674FF` | `--color-lens-blue` | Primary signal color, active citations, focused interaction. |
| Wire Blue | `#5FB4FF` | `--color-wire-blue` | Network lines, radar grid, fine instrumentation rules. |
| Ice White | `#EEF8FF` | `--color-ice-white` | Icon aperture, inverse text, high-signal labels on dark shell. |
| Canvas Parchment | `#FAFAF7` | `--color-canvas-parchment` | Memo card reading surface. Warmer than 14islands' #F2F2F2, calmer than Cursor's #F7F7F4. |
| Card Cream | `#FFFFFF` | `--color-card-cream` | Card surface. Lifted by 1px against canvas via shadow-subtle. |
| Ink | `#0A0A0A` | `--color-ink` | Primary text, company headers, fact values, dominant borders. True ink, slightly softer than 14islands' #070707. |
| Mid Stone | `#6E6E76` | `--color-mid-stone` | Secondary text, fact labels, signal dates, source attribution. |
| Soft Sand | `#B7B6B0` | `--color-soft-sand` | Tertiary text, "not disclosed" empty states, citation popover footers, dividers. |
| Citation Blue | `#1674FF` | `--color-citation-ultramarine` | Citation markers `[n]`, active links in synthesis section, hover state for any clickable source. |
| Confidence Amber | `#A8741F` | `--color-confidence-amber` | Conflict/mixed-source confidence dot. Used when two authoritative sources disagree on a fact. |
| Confidence Sky | `#1674FF` | `--color-confidence-sky` | Inferred confidence dot (reuses Lens Blue, signals "AI-derived"). |
| Confidence Soft | `#B7B6B0` | `--color-confidence-soft` | Unknown confidence dot. Reuses Soft Sand. |
| Hover Pebble | `#F0EFEA` | `--color-hover-pebble` | Subtle hover background on rows, citation markers. Slightly darker than canvas. |

## Tokens: Typography

### IBM Plex Sans: UI body, fact rows, navigation, signal headlines
Free open font, kill-list-safe substitute for the AI-default Inter/Geist register. Use 400 for body, 500 for emphasis, 600 sparingly for section sub-labels. OpenType `tnum` enabled globally so all numerals align.

- **Family token:** `--font-plex-sans`
- **Weights:** 400, 500, 600
- **OpenType features:** `"tnum"` (tabular nums on by default)
- **Sizes:** 12px, 14px, 16px, 20px

### IBM Plex Serif: Synthesis lede sentence, "Why it might matter" opener
One-line counterpoint serif used only at the top of the gated synthesis section to signal "memo register." Italic 400 for the lede, then back to Plex Sans for the bullets. Sparing.

- **Family token:** `--font-plex-serif`
- **Weights:** 400 italic
- **Sizes:** 18px

### Mona Sans: Display headers (company name, section titles)
Replaces 14islands' AftenScreen at the editorial display role. Heavy weight + tight tracking gives the architectural gravity without a custom-font license. Capped at 48px in side panel, 72px on web.

- **Family token:** `--font-mona-sans`
- **Weights:** 700, 800
- **Sizes:** 28px, 36px, 48px, 72px
- **Letter spacing:** -0.02em at 28-36px, -0.03em at 48px, -0.04em at 72px

### Berkeley Mono: Citations, domains, dates, funding figures, tickers, code
The load-bearing technical signal per Samay's design taste. Anything that wants to be inspected by an investor renders in mono. Citation markers `[n]` are always Berkeley Mono in ultramarine. Funding amounts and dates are always Berkeley Mono with `tnum` for alignment.

- **Family token:** `--font-berkeley-mono`
- **Weights:** 400, 500
- **Sizes:** 11px, 12px, 13px, 14px

### Type Scale

| Role | Size | Family | Weight | Line | Tracking | Token |
|------|------|--------|--------|------|----------|-------|
| caption | 11px | berkeley-mono | 400 | 1.3 | 0 | `--text-caption` |
| micro | 12px | plex-sans | 400 | 1.4 | 0 | `--text-micro` |
| body-sm | 13px | berkeley-mono | 400 | 1.5 | 0 | `--text-body-sm` |
| body | 14px | plex-sans | 400 | 1.5 | 0 | `--text-body` |
| body-lg | 16px | plex-sans | 400 | 1.55 | 0 | `--text-body-lg` |
| serif-lede | 18px | plex-serif | 400 italic | 1.5 | 0 | `--text-serif-lede` |
| label | 14px | plex-sans | 500 | 1.4 | 0.02em | `--text-label` |
| heading-sm | 20px | plex-sans | 600 | 1.3 | -0.01em | `--text-heading-sm` |
| heading | 28px | mona-sans | 700 | 1.15 | -0.02em | `--text-heading` |
| heading-lg | 36px | mona-sans | 800 | 1.1 | -0.02em | `--text-heading-lg` |
| display-sm | 48px | mona-sans | 800 | 1.05 | -0.03em | `--text-display-sm` |
| display | 72px | mona-sans | 800 | 1.0 | -0.04em | `--text-display` |

## Tokens: Spacing & Shapes

**Base unit:** 4px. **Density:** compact-editorial. The scale is dense in the 4-32px range (side panel needs to fit a lot of facts in 380px) and gappy in the 48-96px range (web `/c/{slug}` page needs editorial breathing room between sections).

### Spacing Scale

| Name | Value | Token | Common Use |
|------|-------|-------|-----------|
| 1 | 4px | `--space-1` | Inline gap between citation marker and value |
| 2 | 8px | `--space-2` | Fact row internal padding |
| 3 | 12px | `--space-3` | Card internal vertical rhythm |
| 4 | 16px | `--space-4` | Section internal padding |
| 5 | 20px | `--space-5` | Card padding (side panel) |
| 6 | 24px | `--space-6` | Card padding (web) |
| 8 | 32px | `--space-8` | Between fact groups |
| 12 | 48px | `--space-12` | Between major card sections (side panel) |
| 16 | 64px | `--space-16` | Between major sections (web) |
| 24 | 96px | `--space-24` | Hero section margin (web only) |

### Border Radius

| Element | Value | Token |
|---------|-------|-------|
| chips, inline pills | 2px | `--radius-xs` |
| cards, buttons, default | 4px | `--radius-sm` |
| popovers, drawers | 8px | `--radius-md` |
| OG image hero (web only) | 12px | `--radius-lg` |

### Shadows

Layered, Cursor-inspired. Cards lift just enough to read as elevated against the parchment canvas.

| Name | Value | Token |
|------|-------|-------|
| subtle | `0 0 0 1px rgba(10, 10, 10, 0.06)` | `--shadow-subtle` |
| card | `0 1px 2px rgba(10, 10, 10, 0.04), 0 0 0 1px rgba(10, 10, 10, 0.06)` | `--shadow-card` |
| popover | `0 8px 24px rgba(10, 10, 10, 0.12), 0 0 0 1px rgba(10, 10, 10, 0.08)` | `--shadow-popover` |
| focus-ring | `0 0 0 2px rgba(26, 31, 140, 0.35)` | `--shadow-focus-ring` |

### Layout

- **Side panel width:** 380px fixed (Chrome side panel constraint)
- **Web `/c/{slug}` max-width:** 720px (single column, editorial)
- **Web hero max-width:** 960px
- **Section gap (side panel):** 32px
- **Section gap (web):** 64px
- **Card padding (side panel):** 20px
- **Card padding (web):** 32px

## Components

### Card Section Header
Display-register company name and section titles. Mona Sans 700-800 with tight negative tracking. Use 28px in side panel, 48px on web hero. Always Ink. Never colored.

### Fact Row
Two-column micro-row with label left, value right. Label is Plex Sans 14px Mid Stone weight 500. Value is Plex Sans 14px Ink, OR Berkeley Mono 13px Ink for any number/date/domain. Citation marker `[1]` follows value, separated by a 4px gap, in Berkeley Mono 12px Citation Ultramarine. Hover the citation: popover. Click: opens source URL.

### Citation Marker
The signature element. Berkeley Mono 12px in Citation Ultramarine. Renders as `[n]` where n is the citation index. Hover state: 1px underline + Hover Pebble background. Hover popover (after 300ms): source title (Plex Sans 13px Ink), URL (Berkeley Mono 11px Mid Stone, truncated), fetched-at date (Berkeley Mono 11px Soft Sand), 1-2 line evidence snippet (Plex Sans 13px Ink). Popover uses shadow-popover, 8px radius.

### Confidence Dot
4px solid circle, inline before fact label, separated by 6px. `verified` is invisible (no dot, default state). `mixed` is Confidence Amber. `inferred` is Confidence Sky. `unknown` is Confidence Soft. The dot is the entire badge; no text label except in the source drawer.

### Signal Item
Vertical stack: date (Berkeley Mono 11px Soft Sand) above headline (Plex Sans 14px Ink, weight 500) above source attribution (Plex Sans 12px Mid Stone). 12px gap below each item. No bullets, no rules between items, only spacing.

### Comparable Card
Mini-card. Logo (24px square, no radius for now). Company name (Plex Sans 14px Ink, weight 500). One-liner (Plex Sans 13px Mid Stone, max 1 line, ellipsis). Card width fills column. 12px internal padding. Hover: shadow-card lift.

### Bull/Bear Bullet (Gated Synthesis Only)
Lede sentence in Plex Serif 18px italic Ink (single sentence, no citation, sets register). Bullets follow as Plex Sans 14px Ink, each ending in citation marker `[n]`. Three bullets per side. No icons, no colors, no labels other than the section header (`Bull case` / `Bear case` in heading-sm).

### Funding Round Table
Three columns: Round (Plex Sans 14px Ink), Amount (Berkeley Mono 13px Ink, right-aligned, `tnum` enabled, e.g. `$50.0M`), Date (Berkeley Mono 12px Mid Stone, right-aligned). Lead investors below as a small text run (Plex Sans 12px Mid Stone). Each row has 2px bottom border in Soft Sand 20% opacity.

### Source Drawer
Slide-in panel from right edge (web) or expand-in-place (side panel). Lists every citation with: index `[n]` (Berkeley Mono Ultramarine), source title (Plex Sans 14px Ink), URL (Berkeley Mono 12px Mid Stone), source type chip (caption + Hover Pebble background + 2px radius), fetched-at (Berkeley Mono 11px Soft Sand). Click any row: open URL in new tab.

### Empty / Unknown State
Plex Sans 13px italic Soft Sand. Examples: "not publicly disclosed", "no public funding history found", "founders not surfaced from public sources". Never says "TBD", never says "loading" once render is complete.

### OG Image Hero (Web Only)
Used for X share previews. 1200×630. Card Cream background. Company logo top-left (60px). Company name in display Mona Sans 800 (60-72px depending on length). One-liner in Plex Sans 24px Mid Stone below. Funding chip (`Series B · $50M · Mar 2026`) in Berkeley Mono on Hover Pebble pill. Bottom-left: `coldstart.semitechie.vc` watermark in Berkeley Mono 14px Soft Sand.

## Do's and Don'ts

### Do

- Use the eye/radar aperture as the only primary mark: toolbar icon, favicon, watermark, loading glyph, social avatar.
- Put the instrument mood in the shell, not inside every fact row. The card still needs to read cleanly.
- Render every number, date, domain, ticker, and citation marker in Berkeley Mono. This is the load-bearing technical signal.
- Enable `tnum` (tabular numerals) globally on Plex Sans so dollar amounts and counts align column-wise.
- Use Lens Blue `#1674FF` for citation markers `[n]` and active synthesis links.
- Keep the company name in the card header at display register (Mona Sans 800, tight negative tracking) so it reads as a noun-as-monument.
- Lift cards 1px off the parchment canvas with `shadow-card`. Never use solid borders alone.
- Reserve Plex Serif italic for the synthesis lede sentence. One sentence, then back to Plex Sans.
- Default radius is 4px. Use 2px for chips, 8px for popovers, 12px only on the OG hero image.
- Render confidence as a 4px dot, never as a text label, except inside the source drawer.

### Don't

- Don't turn the product into a dark dashboard. The shell is dark; the reading surface remains memo-like and legible.
- Don't introduce a second accent color. The system has one signal accent (Lens Blue), one warning (Confidence Amber), and neutral memo colors otherwise.
- Don't use Inter, Geist, Roboto, JetBrains Mono, or any other AI-default font. Plex Sans + Plex Serif + Berkeley Mono + Mona Sans only.
- Don't render funding amounts, dates, or counts in proportional fonts. Always Berkeley Mono with `tnum`.
- Don't use solid background colors on bull/bear bullets to indicate sentiment. The text and citation must do the work.
- Don't add decorative glows or blobs. Signal fields must feel like measurement, not background wallpaper.
- Don't use border-radius greater than 12px. Editorial register breaks at pill-rounded.
- Don't use shadows heavier than `shadow-popover`. No drop shadows, no glow effects, no inner shadows.
- Don't use icons inside fact rows. The label-value-citation triplet is the entire vocabulary.
- Don't ship any synthesis sentence that doesn't end in a citation marker. The schema enforces this; the design must reinforce it.

## Imagery

Cold Start has almost no imagery in the data sense. Logos are the primary company-specific visual element. The Cold Start mark is the product-specific visual element.

The mark is a dark observatory badge with a white aperture and blue radar core. It should have no white background and must stay legible at 16px in the Chrome toolbar. Preserve the raw radar iris detail at 32px and above; only the smallest toolbar derivative may simplify for legibility.

The source reference is `docs/brand/source/raw-icon-cold-start_RAW.png`. The shipping master is `apps/extension/public/icons/cold-start-icon-master.png` and mirrored at `apps/web/public/icons/cold-start-icon-master.png`.

Logo treatment: 24px in fact rows, 60px in OG hero, 40px in comparable cards. No drop shadow on logos. No background fill on logo containers. If a logo is unavailable, render a 24px Card Cream square with the company's first letter in Mona Sans 700 Ink.

Sparklines are the only data viz primitive: thin 1px Ink strokes on Hover Pebble background, 60×24px, used for headcount-over-time signals when PDL or stableenrich returns time-series. No fills, no gradients, no markers. Just the line.

## Layout

The product surfaces in two layouts driven by one set of tokens.

The **side panel** layout (380px Chrome side panel) is dense. It sits on the dark observatory shell, with the memo card inset by 12px. Card padding is 18-20px. Section gap is 32px. Sections stack vertically in a single column. Section header at heading-sm (20px). Display register reserved for the company name only. Comparable cards stack vertically, not in a grid. The synthesis section is only visible if the user is authenticated (Chrome extension counts as authentication).

The **web `/c/{slug}`** layout has more breathing room. Max-width 720px centered over the observatory shell. Card padding 32px. Section gap 64px. Hero section above the card uses the display register (72px Mona Sans) for the company name, 24px Plex Sans Mid Stone for the one-liner, and a 12px-radius OG image preview to the right (or below at narrow viewports). Synthesis section is omitted from the public URL. The page footer carries `coldstart.semitechie.vc` watermark and a "Read in extension to see analysis" link to the Chrome Web Store listing.

## Next Design Pass

This icon and token pass sets the brand spine. The next proper UX pass should do the following before launch:

- Redesign generation, queued, running, failed, and cached states as instrument states.
- Make source drawers and verifier drops part of the same observability vocabulary.
- Produce launch OG/social templates from the cover-page direction.
- Run screenshots at extension width, mobile width, and desktop web width and tune spacing after seeing real cards.

Both surfaces share the citation drawer pattern: clicking any `[n]` opens the same drawer with the same source list, in the same order, with the same row treatment.

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-canvas-parchment: #FAFAF7;
  --color-card-cream: #FFFFFF;
  --color-ink: #0A0A0A;
  --color-mid-stone: #6E6E76;
  --color-soft-sand: #B7B6B0;
  --color-citation-ultramarine: #1A1F8C;
  --color-confidence-amber: #A8741F;
  --color-confidence-sky: #1A1F8C;
  --color-confidence-soft: #B7B6B0;
  --color-hover-pebble: #F0EFEA;

  /* Typography */
  --font-plex-sans: 'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-plex-serif: 'IBM Plex Serif', ui-serif, Georgia, serif;
  --font-mona-sans: 'Mona Sans', 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
  --font-berkeley-mono: 'Berkeley Mono', 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  --text-caption: 11px;
  --leading-caption: 1.3;
  --text-micro: 12px;
  --text-body-sm: 13px;
  --text-body: 14px;
  --text-body-lg: 16px;
  --leading-body: 1.5;
  --text-serif-lede: 18px;
  --text-label: 14px;
  --tracking-label: 0.02em;
  --text-heading-sm: 20px;
  --leading-heading-sm: 1.3;
  --tracking-heading-sm: -0.01em;
  --text-heading: 28px;
  --leading-heading: 1.15;
  --tracking-heading: -0.02em;
  --text-heading-lg: 36px;
  --leading-heading-lg: 1.1;
  --tracking-heading-lg: -0.02em;
  --text-display-sm: 48px;
  --leading-display-sm: 1.05;
  --tracking-display-sm: -0.03em;
  --text-display: 72px;
  --leading-display: 1.0;
  --tracking-display: -0.04em;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-24: 96px;

  /* Radii */
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Shadows */
  --shadow-subtle: 0 0 0 1px rgba(10, 10, 10, 0.06);
  --shadow-card: 0 1px 2px rgba(10, 10, 10, 0.04), 0 0 0 1px rgba(10, 10, 10, 0.06);
  --shadow-popover: 0 8px 24px rgba(10, 10, 10, 0.12), 0 0 0 1px rgba(10, 10, 10, 0.08);
  --shadow-focus-ring: 0 0 0 2px rgba(26, 31, 140, 0.35);
}

/* Apply tabular numerals globally */
* {
  font-feature-settings: "tnum" 1;
}
```

### Tailwind v4

```css
@theme {
  --color-canvas-parchment: #FAFAF7;
  --color-card-cream: #FFFFFF;
  --color-ink: #0A0A0A;
  --color-mid-stone: #6E6E76;
  --color-soft-sand: #B7B6B0;
  --color-citation-ultramarine: #1A1F8C;
  --color-confidence-amber: #A8741F;
  --color-hover-pebble: #F0EFEA;

  --font-plex-sans: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
  --font-plex-serif: 'IBM Plex Serif', ui-serif, Georgia, serif;
  --font-mona-sans: 'Mona Sans', 'IBM Plex Sans', sans-serif;
  --font-berkeley-mono: 'Berkeley Mono', 'IBM Plex Mono', ui-monospace, monospace;

  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  --spacing-12: 48px;
  --spacing-16: 64px;

  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

## Similar Brands

- **Linear**. Shares the discipline of one accent color and editorial type pairing. Linear leans more saturated; Cold Start stays parchment.
- **Stripe Press**. The editorial gravity Cold Start aspires to in its synthesis register. Plex Serif italic is the direct nod.
- **Pitchbook**. The thing Cold Start replaces. Their tile is a competent dashboard. Cold Start's card is an editorial spread.
- **Cursor**. The lineage parent for the warm parchment, Berkeley Mono accents, and subtle layered shadows.
- **14islands**. The lineage parent for editorial display typography at scale and disciplined ink-on-light contrast.

## Cross-Reference

- Product spec: [[01-active/plans/2026-05-06-cold-start-spec.md]]
- Cursor design taste: [[02-personal/knowledge/design-taste/cursor/design.md]]
- Playdate design taste: [[02-personal/knowledge/design-taste/playdate/]]
- Samay's design taste README: [[02-personal/knowledge/design-taste/README.md]]
