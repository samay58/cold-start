# Research panel polish: one plate

Date: 2026-07-15
Status: approved direction, ready for implementation planning
Owner: Samay
Relates to: `DESIGN.md`, `docs/product/2026-07-13-extension-experience-feedback-fixes.md`, `docs/product/investor-lens-direction-review-2026-06-23.md`, `docs/product/extension-dark-mode-spec-2026-06-24.md`

## Why this pass exists

Three screenshots from 2026-07-15 drove this spec: the Money layer card, the Investor Lens memo, and the research stack tray showing stale overlapping card ghosts after every card was filed. The first two read as unpolished; the third is a bug. None of the fixes require new taste. They enforce rules DESIGN.md already states:

- "Do not wrap every section in a card." The Money card nests four levels of bordered boxes: the card itself, a hero stat box, one bordered box per investor name, and bordered source chips.
- "At Textual is the precision face. Do not turn the surface into monospace." The typewriter face currently carries field labels, category tags, overflow buttons, chips, and stat labels across both surfaces (`--font-text`, and `--font-mono` aliases to it).
- "Controls: no glow, no glass, no pill chrome." Investor names render as bordered pills (`.cs-money-pill`).

The 2026-07-13 fix pass got the money copy right (compact currency, human dates, no repeated figures) and introduced the bordered pill treatment this spec removes. Copy stays. Chrome goes.

Scope decision (Samay, 2026-07-15): the whole research panel, systematically. All six layer cards, the memo, the tray, and the shared components they use. Fixing only the screenshotted cards would leave the panel half-renovated.

## The direction: one plate

Each research card is the only container. Everything inside it sits directly on the card plate. Hierarchy comes from type scale, spacing, and hairline rules; never from nested borders, background tints, or boxed groups. The memo's existing "ledger device" (a fixed label column beside content) becomes the shared row grammar for structured content panel-wide.

Type roles follow DESIGN.md exactly. `--font-body` (IBM Plex Sans) carries labels, values, claims, and names, with `font-variant-numeric: tabular-nums` on figures. `--font-text` (At Textual) survives only where the receipt character is earned: source marks (dot plus domain), the Filed date, and small numeric receipts. `--font-display` (At Umami) stays on card titles and section labels, unchanged.

## Money card

Current markup: `MoneyLayerItems` in `apps/extension/src/ResearchLayerPanel.tsx`; styles under `.cs-layer-money-*` in `apps/extension/src/styles.css`. The display model in `research-layer.ts` is untouched; this is a presentation change only.

The hero stat loses its box. `.cs-layer-money-hero` drops border, background, and radius. What remains, stacked directly on the plate: a small label ("Total raised", `--font-body` 600, ~10.5px, 0.06em tracking, muted), the figure (`--font-body` 700, ~20px, tabular numerals, ink), and the round note beneath it ("Seed, Feb 2021", ~12px, muted). The seal color does not appear here; the label is quiet, the figure is the loud thing.

Investor pills become one line of text. `.cs-money-pills` / `.cs-money-pill` are deleted. Investors render as a ledger row: label column "Investors", content column the names joined with a middle dot separator ("CRV · Greenoaks Capital · Susa Ventures · BoxGroup"), `--font-body` 500, ~12px, muted ink, wrapping naturally. Names are not interactive today and do not become interactive here.

The round-history list loses its box. The `ol` inside `.cs-layer-money-ledger` drops border, background, and radius; rows keep the label column and separate with hairlines only.

## Signals card

Same box removal: `.cs-layer-signal-ledger` drops its border, background, and radius; rows sit on the plate separated by hairlines. The classification dot, date, source, and corroboration metadata line already read well and keep their structure.

## Source marks, one treatment everywhere

The memo footer already has the right pattern: a classification dot plus a bare domain in the receipt face, no border, no background. `SourceChips` (`.cs-source-chip`) adopts it on all six layer cards: dot colored by source class (`data-class`, same classes the memo footer uses), domain in `--font-text` ~10px, links underline on hover in the seal color. The bordered chip and its 999px-radius sibling (`.cs-layer-items span`) are deleted. Overflow ("+N") adopts the pressable chip treatment that shipped for the header people row (`.cs-people-more`), which is the one overflow affordance the panel keeps.

## The memo (Investor Lens)

Current markup: `InvestorReadCard` in `ResearchLayerPanel.tsx`; styles under `.cs-investor-read*` and `.cs-lens-*`.

Field labels move to the body face. The `h4` labels (If true, It breaks if, Timing, Next question) and the inline emphasis labels (the timing field lead-in, "Changes the read if") set `font-family: var(--font-body)` explicitly, ~11px, 620 weight, 0.04em tracking, sentence case, ink at reduced opacity. The category tag after the next question (`.cs-lens-question-category`) does the same at ~10px. `.cs-lens-timing-more` drops the dotted underline and typewriter face for the `.cs-people-more` chip treatment.

Row rhythm becomes uniform. The ledger column narrows from 80px to 76px; every section row gets the same vertical padding (10px top and bottom); the three hairline weights collapse to one token-driven weight. Baseline alignment between label and first content line is verified visually in both themes, not assumed.

Empty states compress. When both tension sides are empty, the two apology rows collapse into a single ledger row, label "The case", content "No bull or break claim survived verification." When one side is empty, the empty side's copy shortens to "None survived verification." Timing and Next question keep their existing single-line absent states. This follows DESIGN.md's empty-state rule: tell the truth and stop.

The lede stays the biggest text on the card and gets one refinement: weight 480 and line-height 1.55, so a ten-line paragraph reads as set text rather than bolded UI copy.

The footer stays as designed (it is the pattern the rest of the panel is adopting). The caveat line ("No independent source in this read.") keeps its color and drops to ~10.5px.

## The tray at zero, and the ghost bug

The tray (`.cs-card-tray` section in `ResearchLayerPanel.tsx`) currently renders unconditionally: at 0 waiting it shows a "Research stack / 0 waiting" header over an empty bordered pile, and the 2026-07-15 screenshot shows semi-transparent card frames stranded over the header. Two changes:

The design change: when `dormantLayers.length === 0`, the whole tray section unmounts, exiting through AnimatePresence with a short opacity-and-rise exit. No header, no empty box, no "0 waiting" copy. Absence is the design. When a card returns to the tray (future unpin work, if any), the tray remounts the same way.

The bug fix: diagnose before fixing, per systematic-debugging. Reproduce by filing all six cards in `qa:extension:ui`. Current hypotheses, to be confirmed against the running panel and framer-motion behavior, in likelihood order: exiting `DormantPileCard` frames paint outside the collapsing pile (the pile has no overflow clip, frames stack with negative margins and `will-change: transform`); exits interrupted by re-renders strand mid-animation at partial opacity (the transition object identity changes between renders when the reduced-motion flag resolves); the reduced-motion exit path animates opacity only, leaving stacked transforms visible while opacity hangs. The fix lands at the confirmed mechanism, not as cosmetic overflow-hiding, though an overflow clip on the pile may be correct on top of it. The stranded state is reproduced first, fixed second, and pinned by a regression fixture that files all six cards and asserts the tray section is absent and zero `.cs-dormant-card-frame` nodes remain mounted.

## Dark theme

Every changed rule routes color through the theme tokens in `apps/extension/src/theme.tokens.css`. `npm run audit:css -w @cold-start/extension` stays green. The dark-mode states matrix from the 2026-06-24 spec gets re-screenshotted for the changed states: Money card, memo, tray present, tray absent.

## Guardrails: how this class of error stops recurring

The ghost tray shipped because nothing in the gate ever renders the panel's terminal states. Three durable changes:

- Convention, added to `CLAUDE.md` and `AGENTS.md`: every collection surface (a list, pile, tray, or chip row that can reach zero items) ships with its zero state explicitly designed and covered by a fixture. "It never gets there" is not a state design.
- Fixtures, added to `qa:extension:ui`: all-cards-filed (tray absent, no orphaned frames), a layer card with zero sources, and the memo with both tension sides empty. These run in both motion modes, since the reviewer's machine runs Reduce Motion and the office default does not.
- Review habit: any change touching an AnimatePresence exit path names, in the PR or ledger, what happens when the exiting element is the last one. That question would have caught this at review time.

## Testing

`npm run qa:extension:ui -w @cold-start/extension` with the new fixtures; `npm run audit:css -w @cold-start/extension`; existing investor-lens and read-region unit tests unchanged (display models are untouched); full `npm run check` before handoff. Visual verification in both themes and both motion modes against a real card with the Office Hours shape (single round, four investors, two sources) and a multi-round card.

## Non-goals

No copy or content changes to synthesis output. No changes to the display models in `research-layer.ts` or `investor-lens.ts`. No motion redesign of the drag-to-file physics. No public web card changes. The stale-synthesis refresh signal stays an open product call (2026-07-13 follow-up list). No unpin affordance for filed cards.

## Done definition

Inside any research card, the only bordered container is the card itself; the Money and Signals inner boxes, investor pills, and bordered source chips are gone. At Textual appears only on source marks, the Filed date, and numeric receipts. The tray is absent at 0 waiting, and the ghost-frame regression fixture fails on the old code and passes on the new. `audit:css`, `qa:extension:ui` (including the three new fixtures), and `check` are green. Screenshots of the four changed states in both themes are attached to the PR or ledger.
