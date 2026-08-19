# Investor Lens: How it wins (the notched edge)

Designed 2026-08-18 and 2026-08-19 in session with Samay. Source framework: the 80 strategies in 13 groups from stephango.com/moats (never attributed inside the product). Mock: `docs/product/design/2026-08-18-moat-read-direction/` (`gen.py` builds `d1.html`; the middle panel is live). Prompt experiment: `prompt-test/` in the same folder.

## What this is

One new read in the Lens. It answers one question about a company: how does it win? It uses the 80 strategies as a vocabulary, never as a checklist. From the evidence it names the two to four strategies the company is actually running today, the one pair among them that is unusual for its category and why that pair is hard to copy, up to two it could take next, and what would make the read wrong. If nothing stands out, it says so.

The read is model-only. Cold Start determines it from the card's evidence. There is no user annotation.

## Decisions

Decided with Samay, in order:

- 2026-08-18. Fold Why now into Why care. The seven-field timing row goes away as a Lens row; at most one timing sentence (adoption trigger plus timing risk) becomes the second beat of Why care, dropped when no cited trigger exists. Evidence over 152 prod cards with synthesis: 43% have no timing container; the 87 that do fill 3.4 of 7 fields and average about 128 words; `timingRisk`, the field that is actually "why now", fills 23 of 87 times; several fields restate Why care or the bear case.
- 2026-08-18. Remove and tighten as we go. Every Lens change removes or shrinks something before it adds. Measured in the mock: today's plate 575px, the proposal 580px with the edge, its label, and the sentence, and Why now removed. Held there.
- 2026-08-18. Not a seventh text row. The read gets a non-text form (the notched edge, below).
- 2026-08-19. The notched edge stays. Motion is a first-class part of the design, specified below.
- 2026-08-19. Strategy names are never the copy at rest. At rest the reader sees a label, the edge, and one plain sentence. Names appear only in the readout while moving along the edge and inside the notes.
- 2026-08-19. Samay's analytical-writing standard governs all copy for this read (verbatim in `prompt-test/writing-standard.md`, hostile editor in `prompt-test/hostile-editor.md`). No artificial length caps. The edit pass removes repetition and states certainty once; notes run as long as the reasoning needs and no longer.
- 2026-08-19. The sentence at rest synthesizes the stark evidence with the mechanism. Example of the register, hand-written: "OpenAI and Anthropic cite its benchmarks by name in their model safety documents; dropping it later would show." A bare fact line ("OpenAI and Anthropic name Irregular's test benchmarks in their own model safety documents") is not enough; a mechanism-only line with no evidence is not allowed.
- 2026-08-19. Micro-copy is names, not labels. Readout: the strategy name alone (ink for one of the company's, grey for the rest), "Standardization, not yet" for a hollow mark, "Hybrid + Chokepoint" on the bracket. Note kicker: the name and one plain sentence of meaning; "Standardization, not yet." for hollow. Rebuttal line: "Wrong if". Count: "3 of 80 strategies". Empty: "Nothing stands out yet. It competes the way most LLM tooling companies do." Banned: "cut", "open to it", "could be next", "the pair", "one of its N", "not this one", and any suffix that explains what the mark already shows.
- 2026-08-19. No seal on this object. The edge, marks, bracket, readout, and notes use ink only. The seal has area where it works (stamps, call number, open-row indicator); on a 1px hairline and a 4px mark against parchment it reads as a thin grey-blue that does not belong to the plate. The pinned state shows through weight, not color: the mark deepens 2px and its walls thicken to 1.5px.
- 2026-08-19. Fold What must be true and What could break into one row. Samay's call. Inside the row the two sides are labelled "Bull" and "Bear", led by the existing marks (filled ink square for bull, conflict-class slashed square for bear). Row label: "The case" (my pick: it holds both sides, matches the row family, and DESIGN.md already uses the name); Samay floated "Thesis" as an alternative and can override. Evidence for the fold: each row is empty on 22 to 24% of cards, both on 12%, and their content reappears in the questions' tests line. The packet becomes: The case, Why care, What to learn next, Pay attention to, plus How it wins on the edge. Order to be settled in the plan (Why care stays first).

## Where the framework fits, and where it would rot

The list is 80 labels. The taste kernel already says labels matter less than what matters for this company. A checklist that ticks Usership, Completeness, Low-friction on every SaaS card is slop. The useful part is the thesis: winners optimize a narrow set of vectors, often an unusual combination. The read answers "how does this thing win" in the writing standard's voice, using the 80 as vocabulary.

## The read's shape

Schema field `synthesis.howItWins` (code name), a discriminated union on `status`:

- `read`: `{ sentence, running: [{strategy, meaning, note, citationIds}], pair: {strategies: [a, b], note, wrongIf, citationIds}, next: [{strategy, note, citationIds}], wrongIf }`
  - `running`: two to four strategies the company is running today, each pinned to citations. Strategy ids come from a fixed enum of the 80 in `packages/core` (so cards are comparable and the eval scorer can measure how often each strategy fires across the corpus; a strategy firing on most cards is a measurable slop signal).
  - `pair`: the unusual pair and why it holds together and is hard to copy. Load-bearing. If no pair is unusual, `pair` is null and the sentence says so.
  - `next`: zero to two strategies it could take, each with the condition that would have to hold. Inference, kept apart so the verifier can hold `running` and `pair` to citations.
  - `wrongIf`: the rebuttal.
- `nothing_stands_out`: material exists but no honest pattern survives. Model-decided; also the fallback when the verifier kills the read. Carries its own plain sentence naming the category ("It competes the way most LLM tooling companies do").
- `thin_file`: decided in code before any model call, same gate as the emphasis read. Costs nothing.

Verifier: `running` and `pair` claims verify like any other synthesis claim; drops stay dropped. If the pair loses a leg, the pair dies and the read keeps its running strategies. If fewer than two running strategies survive, the read degrades to `nothing_stands_out`.

## The prompt

Four passes, all under the writing standard, mirroring what the 2026-08-19 experiment did (`prompt-test/run.ts`, `fit.ts`):

1. Reasoning (synthesis model chain, thinking allowed): develop the analysis fully, prose, no JSON. Names actors, mechanisms, evidence, assumptions, uncertainty. This pass sees the card plus the 80 strategies with their one-line meanings.
2. Edit (same model, fresh call): rewrite into clear prose that fills the slots, preserving every causal link, qualification, distinction, and citation. States certainty once per note, at the end, in ordinary words. Meaning lines are complete sentences, not fragments.
3. Hostile editor (a different model; DeepSeek v4-pro in the experiment): flags generic sentences, metaphors, unshown causal chains, inference stated as fact, template contrasts, undefined jargon, repetition; rewrites the full draft; adds no facts.
4. Fit: cut words, never the actor, the mechanism, or the evidence. No word caps. Removes repeated certainty statements, repeated ideas, and padding.

Rules stated in every pass: cite with the card's ids; say what is inferred; if a sentence could describe ten companies, it fails; if the sentence at rest cannot be written plainly, emit `nothing_stands_out` instead of a clever line.

Experiment findings that shaped this (Irregular's card, 2026-08-19): the standard picked Hybrid, Chokepoint, Prestige, next Standardization and Monopoly, each with an explicit mechanism, and refused Neutrality because nothing in the card supports it (the hand-written copy had asserted it). Its full output was 551 words; the fitting pass reached 262 with the mechanism intact. Two tics to guard: the certainty template repeated at the end of every note, and fragments in the meaning lines. Sonnet 5 thinks by default (about 11k thinking tokens on pass 1) so `max_tokens` must be at least 16k or the text comes back empty. Cost: about 50k input and 20k output tokens per read across four calls, against zero today.

## Form

The edge-notched card. Card catalogues sorted cards by notches cut along the edge; the Lens plate gets that edge. Reading order top to bottom:

1. Label row, inside the plate's top: "How it wins" (body face, 12px, 640) on the left; the readout on the right (receipt face, 10.5px): at rest "3 of 80 strategies", while moving the strategy name under the pointer.
2. The edge: the plate's top rule, redrawn as an SVG so it can be cut. Marks for the running strategies are cuts through the rule (the field shows through, ink walls and floor, 4px wide, 8px deep). A hollow mark (dashed walls, no floor) for each `next` strategy. One bracket under the two marks of the pair. The scale of 80 (one 1px hairline per strategy, 13 groups with a 5px gap between groups) is invisible at rest.
3. One sentence, body face 12px, weight 480, as many lines as it needs. It is the read.

Notes open below the sentence in the SharedTooltip memo variant, never over it. A note leads with the strategy name and its one-sentence meaning, then the cited note, then "Wrong if" for the pair.

Empty states: `nothing_stands_out` shows an uncut edge, count "0 of 80 strategies", and its plain sentence. `thin_file` shows the same uncut edge with "Not enough filed." as the sentence.

## Motion

Values follow DESIGN.md's doctrine (stiff, well-damped springs at zeta 0.85 to 1.0; expand/collapse 150 to 240ms; reduced motion is a reduction, never a freeze; the seal appears only after intent). Every number below is a starting value to be tuned in the prototype, not a spec to defend.

- Arrival, once per Lens arrival, after the Why care row settles: the marks cut in one at a time, left to right, 40ms apart, each a 220ms ease-out drop from depth 0 to 8px; the bracket draws last (stroke-dashoffset, 180ms). It never replays on scroll or re-render; it replays only when the read changes (a re-file). Under reduced motion the marks and bracket fade in together over 160ms.
- Approach: when the pointer enters the crown (label row, edge, sentence), the scale of 80 fades from 0 to 0.55 opacity over 140ms without moving. On leave it fades out over 200ms after an 80ms delay, so a pass across the plate does not flicker it.
- Scrub: pointer x drives a cursor that follows on a critically damped spring (starting values stiffness 420, damping 38). Each hairline's height is base times (1 + 1.6 e^(-d^2 / 2 sigma^2)) with sigma 11px, so the tick under the cursor grows and its neighbours ease with it, the click-wheel feel. The tick nearest the cursor is drawn in ink; the rest in the rule colour. Marks widen from 4 to 6px under the cursor.
- Readout: the name swaps instantly when the nearest tick changes, no crossfade. Eighty changes per traverse must feel mechanical and exact, like a scrubber's number, so the magnification is soft and the readout is hard.
- On a mark: when the nearest note target (a mark, a hollow mark, or the span between the pair's two marks) is within 6px, the target takes ink and its note opens below the sentence: opacity 0 to 1 over 120ms with a 4px rise on the same spring. Moving to a neighbouring target while a note is open swaps the note's content in place with a 90ms crossfade, no re-entry travel. Leaving all targets closes the note with a 100ms fade unless it is pinned.
- Pin: a click while on a target pins it. Scrubbing stops following the pointer; the mark deepens 2px and its walls thicken (ink only, no seal); a "pinned" receipt appears in the note's corner. A second click or Escape releases with a 120ms fade.
- Keyboard: the crown is focusable. Left and Right move between note targets in x order and pin as they go; Enter toggles the pin; Escape releases. Screen readers get the crown as a group named "How it wins, 3 of 80 strategies", each target as a button named by its strategy with the note as its description.
- Touch and no-hover: a tap on the edge snaps to the nearest target and pins; a second tap on the same target releases; tapping the sentence pins the bracket. No magnification without hover; the scale shows while pinned.
- Reduced motion: no magnification, no spring travel; the nearest tick and the readout still update; notes fade over 100ms; arrival fades.
- Performance and stability: one SVG, about 85 rects redrawn per frame only while the cursor moves; the animation frame loop stops when the cursor is within 0.05px of rest and the scale has reached its target. The crown has a fixed height, the note is absolutely positioned, the sentence never moves, and the plate never changes height on hover. Nothing animates at rest.

## Where it runs

A memoized step in the analysis run next to `emphasis-read`, after `synthesize-card` and before `verify-synthesis`; its claims append to the existing verify call. Progress events are additive (`how-it-wins.started`, `how-it-wins.complete`); step ids freeze once shipped. The API contract version bumps and the extension rebuilds. The field lives inside `synthesis`, which public routes already strip, so no new gate work. Feature flag `HOW_IT_WINS_ENABLED`, default on, in the `EMPHASIS_READ_ENABLED` pattern. The four passes run only for this read; composing the standard into the rest of synthesis is a separate decision after twenty blind-read cards.

## Ergonomics

The whole crown is one target. Nothing depends on hitting a 4px mark. The sentence alone carries the read for a reader who never hovers. Notes never cover the sentence. The plate never shifts.

## Tests

- `packages/core`: schema round trip for all three statuses; the 80-strategy enum; degrade rules (pair loses a leg, fewer than two running survive).
- `packages/llm`: the four-pass driver against a frozen Irregular fixture; empty-text guard for thinking models; certainty-once and no-fragment checks on meaning lines.
- `apps/web/tests`: step bodies, verify offset, thin-file gate skips both the fetch and the model calls.
- `apps/extension/tests`: the crown renders all three statuses; readout text per target kind; note opens below the sentence; keyboard order; reduced-motion path; the plate height does not change on hover.
- Eval: the lens scorer counts strategy frequency across the corpus and fails a gate when one strategy exceeds a threshold share of reads; generic-phrase checks extend to the sentence and notes.

## Not in v1, named so nothing is silently dropped

- The exposure read (which Offense strategy an incumbent would run against them). Bear-case cousin; would duplicate What could break.
- Extending the writing standard to the other Lens rows. After twenty blind-read cards.
- The signature-only fallback (sentence plus names, no edge). Kept as the fallback if the live prototype's motion does not land.

## Shipped 2026-08-19 (deviations and tuned values)

- The case label shipped as "The case". Samay can still override to "Thesis".
- The sentence at rest is unverified prose. The running and pair notes underneath it are the verified claims.
- `nothing_stands_out`'s sentence is optional. It is absent when the verifier degraded a read in code rather than the model choosing the status; the crown then shows "Nothing stands out yet."
- The alpha analytics schema keeps the old category ids, `must-be-true`, `could-break`, and `why-now`, as legacy values. Nothing writes them anymore.
- The note is a crown-owned popover styled as the `SharedTooltip` memo variant, not the shared tooltip state machine. The crown's spring cursor, retargeting, and pin are its own interaction and needed their own controller.
- The writer defaults to the synthesis model chain. `claude-sonnet-5` is set through `LLM_HOW_IT_WINS_MODEL` for the blind read and is one of the two arms it compares, against `claude-sonnet-4-6`.
- No call in the four-pass driver sends `temperature`. Sonnet 5 rejects it.
- The empty-text retry ladder: 16000 tokens, then 21000 under the SDK's non-streaming ceiling, then thinking disabled. Sonnet 5 thinks by default and an under-sized budget comes back empty.
- The `how-it-wins` step runs concurrently with the emphasis-read pair. Measured latency on Irregular's card: the Sonnet 5 writer took 207 seconds and $0.39 per read; the Sonnet 4.6 writer took 110 seconds and $0.15.
- The twenty-card blind read runs two arms per card through `/eval/how-it-wins`.
- Production keeps `HOW_IT_WINS_ENABLED=false` until the blind read clears.
- Motion tuned 2026-08-19: the starting values held after frame capture at 16ms and 25ms steps. Spring 420/38, zeta 0.93, crosses the whole edge in about 75ms. Sigma 11, magnification 1.6. Scale 0.55. Note 120/90/100ms. Arrival 300ms delay, 40ms stagger, 220ms drop, bracket 180ms.
- Plate heights at the gallery fixture: 575px before the change, 490px after the fold, 542px with the crown added. Ceiling 580px.
