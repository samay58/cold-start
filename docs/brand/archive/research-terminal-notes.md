# Research Terminal - Aesthetic Notes (archived)

Captured before the Research Terminal direction was archived from the Paper file `cold start`. The point of this note is to preserve the things Samay specifically loved - font choices and the way color "popped" inside an otherwise muted CRT field - so they can be folded into Quiet Luxury variants later.

## What it is

A CRT-style terminal reading of a company card. Pure-dark ground, monospace everywhere, color used only as a functional encoding of source quality and synthesis sentiment. Reads like an analyst console, not a marketing page.

## Type stack

One face does almost all the work, and that's the unifying move.

- **Berkeley Mono** - display, labels, numerics, chips, footers, log scroll. Single source of typographic truth. Tracking is loose on small all-caps (`letterSpacing: 0.08–0.1em`, sizes 9–12px) and tight at display (no extra tracking, 20–30px).
- **IBM Plex Sans** - only used for body prose inside the synthesis cards (12.5px, 150% leading). It is the breathing room: Berkeley Mono carries the structure, Plex Sans carries the argument.

That contrast - mono frame, humanist body - is the typographic trick. The mono unifies; the sans gives the reader a place to land for the actual sentences.

## Palette (precise hex)

Ground, structure, ink:

- `#0E0F14` - primary terminal ground (slightly cool, near-black)
- `#0A0B10` - chrome / chip / panel ground (one tick darker, used for header bar, footer, synthesis card insets)
- `#13141A` - identity-bar ground (one tick lighter than primary, holds the headline)
- `#1F2230` - hairline border throughout
- `#D4D8E0` - primary text (warm-cool off-white)
- `#5C6478` - secondary / metadata text

The pops (used as functional encoding, never decoration):

- `#7AE7B6` - **phosphor mint**. Live status, support chip, independent-technical source class, confirmation. The signature accent.
- `#FF7AA8` - **hot pink**. Skepticism chip, press-release source class, attention without alarm.
- `#F2B559` - **amber**. Single-source / company-self-reported / in-progress states. Caution.
- `#7BA7FF` - **hyperlink blue**. Independent reporting class, secondary signal. (Solid square = round with sources, `#7BA7FF40` fill + outline = round with no sources.)
- `#E36A6A` - **oxblood red**. Dropped claims and errors. Used sparingly - drop rows fade to 0.5 opacity.

## How the "pop" actually lands

This is the part worth keeping. Three rules:

1. **Color encodes class, not mood.** Every chromatic mark answers a question - is this source independent or self-reported, is this thesis confirmed or dropped, is this round verified or amber. Nothing is colored "for energy."
2. **Tiny carriers, not flooded fills.** Color appears in 6×10px source-class rectangles, 6×6px telemetry dots, synthesis chip backgrounds (12px tall), leading glyph indices (`▸01`, `▾01`, `[0.41]`), and bar-chart fills. Never as a section background, never as a gradient. The dark ground is what makes 9px of mint feel loud.
3. **Inverse contrast on the chips.** The support chip is `#7AE7B6` ground with `#0A0B10` ink at 9px / 0.1em tracking. The chip is the only place where the dark color and the bright color swap roles, and that swap is what makes the chip read as "live."

## The graphics

Worth carrying forward in spirit:

- **Stacked vertical bar histogram** on the Generating screen, segments colored by source class (mint / blue / amber / pink / red-drop). Shows the run materializing in real time.
- **Per-source quality bars** in the Source Drawer - each row's confidence rendered as a small horizontal fill in its class color, never as a number alone.
- **Outlined chips** for `CONCEPT · NEURAL SEARCH API` etc. - 1px border in the accent color, transparent fill, mono label inside. Reads as a tag, not a button.
- **Leading numerical indices** (`▸01`, `▾01`, `[0.41]`, `A1`, `B1`, `C1`, `*1`) in the accent color, mono, fixed-width. They function as both ordering and visual rhythm.
- **CRT log tail** - `[0.41] resolved exa.ai → slug "exa"` - timestamps in muted gray, status verbs in white. Single column, never wraps awkwardly.

## What translates to Quiet Luxury (and what doesn't)

Translates cleanly:

- The single-mono unifier idea (Quiet Luxury could let one face do all the structural work).
- Color as functional encoding only, in micro doses (chips, dots, bar fills).
- Inverse-contrast chips for live/status moments.
- Leading mono indices on list items.

Does not translate:

- The dark ground itself (Quiet Luxury is light).
- Five accents - too noisy in a luxury register. Pick one or two from the set: mint feels best at low chroma against pure white; hyperlink blue is the safest second.
- The CRT log tail - wrong cultural register for luxury.

## Files in Paper before archive

- `D2 · Research Terminal · Web Card` (HQ-0)
- `D2 · Research Terminal · Side Panel` (E1-0)
- `D2 · Research Terminal · Generating` (LD-0)
- `D2 · Research Terminal · Source Drawer` (OO-0)
