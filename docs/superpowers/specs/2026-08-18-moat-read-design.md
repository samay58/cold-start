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
- The twenty-card blind read runs two arms per card through `/eval/how-it-wins`. Run the sitting on a production build (`npm run build -w @cold-start/web`, then `EVAL_RIG_ENABLED=true EVAL_RIG_DATA_DIR=$PWD/eval/curation npm run start -w @cold-start/web`): `next dev` writes React's I/O debug info into the page, which includes every frozen file's raw text, writers and answer key included. Nothing shows on screen, but the key is one View Source away.
- Production keeps `HOW_IT_WINS_ENABLED=false` until the blind read clears.
- Motion tuned 2026-08-19: the starting values held after frame capture at 16ms and 25ms steps. Spring 420/38, zeta 0.93, crosses the whole edge in about 75ms. Sigma 11, magnification 1.6. Scale 0.55. Note 120/90/100ms. Arrival 300ms delay, 40ms stagger, 220ms drop, bracket 180ms.
- Plate heights at the gallery fixture: 575px before the change, 490px after the fold, 542px with the crown added. Ceiling 580px.

## Next steps (recorded 2026-08-19, revised 2026-08-21 after the judgment standard)

The first sitting raised a design question, and the queue now answers it. In the four-pass driver the writer is also the judge: pass 1 reasons and writes in one breath, so the choice of model moves the judgment, not only the prose. On Suki the two arms read the same evidence and the same citation ids and named Alliance against Symbiosis, Usership against Reliability. The verifier checks that each note is grounded in its cited evidence. It cannot say which label is right or which read is better. A smarter writer raises the floor (Sonnet 5 passes the repetition gate, Sonnet 4.6 does not) and leaves three things untouched: overlap inside the 80-name vocabulary, one draw at default sampling, and the absence of a written judgment standard. The fix is structural. The ten-card read is closed. The prompt and UI repair, judgment standard, judge build, and historical 30-arm base benchmark are complete. The current sitting gives all three topologies the same code-owned bookkeeping boundary before judgment quality is compared.

### This sitting (closed 2026-08-21)

1. Blind-read ten of the twenty cards at `/eval/how-it-wins` on the production-build rig, then stop. Done. Ledger has exactly ten `how-it-wins` events (suki, nekohealth, deepinfra, cognition, notion, doppel, profluent, bland, hebbia, august). Picks 8-1-1 for Sonnet 4.6 over Sonnet 5 over neither. Ratings: 4.6 is 4 Ship, 5 Weak, 1 Slop; 5 is 0 Ship, 6 Weak, 4 Slop. Two cards refused a single-model winner (Profluent both Weak; Bland neither). Notes enriched in `eval/curation/notes/sitting-2-how-it-wins.md`. The other ten stay unread as the holdout. Do not reopen the how-it-wins route until the revised pipeline exists; it would serve the holdout next.
2. Writer pick is a prose decision, not a judgment decision, and it is made by tournament on fresh cards (step 8), not by extending this sitting. Champion writer, pending tournament, is Sonnet 4.6. It is not the judge.

### Prompt and UI repair (completed 2026-08-21)

- The prompt now makes `wrong_if` a condition about the world, puts certainty in the verb, never names the input, and bans the four sitting phrases. The hostile editor checks them. Company and mechanism come before named customers.
- Core's canonical meaning sentence now renders for current strategies, the pair, and not yet. The leaked "Running" heading is now "What currently wins."
- The former [judgment-standard draft](./2026-08-21-how-it-wins-judgment-standard-draft.md) now points to the authoritative standard. The [ChatGPT framework-mapping prompt](./2026-08-21-how-it-wins-framework-mapping-chatgpt-prompt.md) remains a source record. No judge split, parity record, tournament, model run, or holdout read started.
- Both ChatGPT responses remain raw source records. Samay's five decisions now live in the authoritative [judgment standard](./2026-08-21-how-it-wins-judgment-standard.md). Its [80-strategy rubric](./2026-08-21-how-it-wins-strategy-rubric.md) matches core's canonical labels and meanings and corrects the source conflicts in Union, Unpredictability, Obscurity, and Craftsmanship. The unusual pair is secondary and optional. Samay's no-cap decision stands: all 80 are evaluated and every strategy that earns inclusion survives. Reader disclosure remains separate. The [judge architecture draft](./2026-08-21-how-it-wins-judge-architecture-draft.md) records the original 13-group hypothesis and the measured update that supersedes it.

### After the sitting: split judgment from writing

3. Judge pass, complete. One deep judge module returns a structured verdict and no prose: the material bet or bets, a disposition for all 80 strategies, the uncapped ranked current set with evidence ids, the pair and the mechanism a competitor cannot copy, not-yet candidates with their missing conditions, and what is inferred rather than observed. Deterministic orchestration covers the 13 group scouts, bounded fanout, one retry, global fallback, different-provider criticism, and targeted adjudication. The writer receives the frozen verdict and canonical meanings; validation rejects added, removed, swapped, or reordered labels. The full audit stays in the private generation-run trace.
4. Judgment standard, complete. The authoritative standard preserves Samay's eight spoken rules and five decisions, keeps the current strategy judgment uncapped, makes the unusual pair secondary, and freezes judgment before prose. The compact rubric covers all 80 exact strategies and separates Steph's meanings from Cold Start's operational tests.
5. Cost-aware judgment, revised after measurement. The 30-arm base run produced seven valid monolith verdicts, but it did not compare judgment fairly. All twenty grouped arms failed at cross-call bookkeeping. The repaired contract now lets every topology return meaning and evidence while code assigns durable identifiers and resolves references. All three shapes remain candidates pending the repaired pilot. The critic remains optional until it proves that it changes material decisions correctly.

### Topology benchmark checkpoint, base complete 2026-08-23

The repaired two-card pilot completed all six arms under the approved $23.50 cumulative cap. Two verdicts were valid: one monolith and one four-bundle result, on different cards. No topology produced valid verdicts on both cards. All six arms reached pre-critic output. Two critics ran, found no issues, and triggered no adjudication. Pilot spend was $6.346450, bringing cumulative benchmark spend to $18.198908. The run took 1,810,008 ms.

The no-provider contract repair passed its tests, but the fresh six-arm pilot did not clear the stop rule. All six arms failed closed. The four multi-stage arms stopped after their bet mapper returned `materialBets` as a JSON string instead of an array. Both monolith judgments reached full structured output but cited evidence IDs outside the frozen registry. No verdict validated, so no critic or adjudication ran. The pilot cost $2.162965 and took 893,847 ms, bringing cumulative benchmark spend to $20.361873.

The final bounded no-provider repair is complete. The bet mapper now accepts one valid JSON string layer around the complete `materialBets` array. Prose, partial JSON, objects, and repeated string layers still fail closed. Provider calls now use short deterministic evidence handles that code maps back exactly to the frozen registry; unknown handles still fail. The focused 54 tests, affected typechecks, lint, manifest checks, and the 30-arm dry run pass. The dry run made 250 fake calls and zero provider calls. The transport hash changed, six future pilot IDs are fresh, and spend remains $20.361873. The full ten-card benchmark did not start, and no topology was chosen. The next action is a separately approved two-card pilot under a proposed $31.21 absolute cumulative cap. The parity record, writer tournament, and unread holdout remain queued.

The fresh pilot then cleared its stop rule. Monolith produced valid all-80 verdicts on both cards. Four bundles and 13 groups each failed bet mapping on one card because the result was not a valid array. On the other card, both reached global judgment and then failed closed because evidence handles were reused as claim or bet IDs. The two critics changed no judgment and triggered no adjudication. All six arms, 28 attempts, traces, costs, and source parity reconcile. The pilot cost $3.782958 and took 819,856 ms, bringing cumulative spend to $24.144831. The full ten-card benchmark has not started. Its proposed $140 absolute cap covers a $28.328235 base projection, $76.486235 for every frozen repeat and order perturbation, and $11.040699 for bounded retries and adjudication. The runner still needs deterministic support for the frozen adaptive repeats, aggregate comparison, and blind packet before any full-batch provider call.

The zero-provider harness is complete. The runner keeps the 30 base arms separate from adaptive repeats, classifies only the frozen material differences, selects seeded agreement controls, schedules nine order-only perturbations, reconciles aggregate cost and latency, and writes a private seeded blind packet. The focused benchmark, core, and LLM tests, workspace typechecks, lint, privacy checks, and the 30-arm dry run pass. The dry run made 250 fake calls and zero provider calls. Spend remains $24.144831. The next action is approval of a $52 absolute cap for the base comparison only. Six pilot arms will be reused and 24 arms will run. Repeats require a separate later approval.

The 30-arm base comparison completed under the approved $52 cumulative cap. Seven verdicts validated, all from monolith. Four bundles and 13 groups produced no valid verdicts. The 23 failures remained closed. Base arm cost was $18.119690, including the six reused pilot arms. New spend was $14.336732, bringing cumulative spend to $38.481563. Wall time was 4,625,458 ms. All 115 traces, arm costs, saved attempts, and frozen hashes reconcile. Seven cards materially diverged on valid versus failed-closed outcome. No card supplied three valid agreeing topologies, so the frozen agreement-control set is empty and the two-control shortage is recorded. The harness calculated 42 divergence-repeat arms and nine order-only perturbation arms under a proposed $102 absolute cumulative cap. Production remains disabled and the unread holdout remains unread.

The repeat plan is now paused and its $102 cap is not being requested. Thirteen of the twenty grouped arms failed at the first bet-map handoff because text arrived where the next stage required a list. The remaining seven reached final assembly and then used temporary evidence handles as claim or bet identifiers. These are interface failures, not evidence that the grouped shapes made worse strategic judgments. Repeating them would not answer the quality question.

Samay superseded the monolith-only direction. The shared no-provider repair is complete. Monolith, four bundles, and 13 groups now return the same semantic judgment shape. Models choose bets, mechanisms, dispositions, evidence, distinctions, and ordering. Code assigns durable identifiers and resolves local references. The focused core, judge, and benchmark tests pass, as do all workspace typechecks, lint, and a 30-arm dry run with 250 fake calls and zero provider calls. A new experiment identity preserves the completed base run as history. All three topologies remain candidates. The next action is one separately approved two-card pilot. Production remains disabled and the unread holdout remains unread.

The next pilot returned no valid verdicts. Four arms failed at mechanical boundaries and two failed at the provider connection. One 13-group arm completed all 80 decisions but was rejected because one row included an extra `reason: null` field. Three grouped arms returned the bet list in an unaccepted container, and the old harness had not saved the rejected provider envelope. The pilot cost $1.583194, bringing cumulative spend to $40.064757. The flexible transport repair now accepts bounded unambiguous bet-list wrappers, removes only unknown null fields, and stores every raw tool result privately before normalization. Required judgment fields, evidence references, and all-80 validation remain strict. Ten core tests, 26 judge tests, 33 benchmark tests, all workspace typechecks, lint, and the 30-arm dry run pass. The dry run made 250 fake calls and zero provider calls. The next action is a separately approved two-card pilot under the new transport identity. Production remains disabled and the unread holdout remains unread.

That pilot exposed the remaining interface defects precisely. Three grouped arms returned a valid bet array after the literal provider tag `<parameter name="materialBets">`. One grouped arm reached global judgment, but the provider had been asked to serialize the whole verdict inside a second giant JSON string and returned invalid JSON. The two monolith arms failed at the provider connection. The six arms cost $1.444679, bringing cumulative spend to $41.509436. The repaired provider contract now returns verdict fields directly and accepts the exact observed parameter tag only when the remaining field value parses in its required shape. Evidence handles are resolved after parsing. No semantic field is guessed or filled. The next action is a separately approved two-card pilot under the new transport identity.

The next pilot produced three valid all-80 verdicts. Monolith completed both cards. Thirteen groups completed one. The three remaining grouped arms stopped at bet mapping. Raw capture proved that all three contained one leading newline, then the exact supported parameter tag, then a valid bet array. The pilot cost $3.767140, bringing cumulative spend to $45.276576. Three critics ran, changed no judgment, and triggered no adjudication. The field-by-field cleanup is now one recursive schema-guided normalizer for mechanical array and object wrappers at any depth. It never rewrites semantic strings or supplies missing judgment content. The saved failures replay successfully. Samay approved a $53 absolute cumulative cap for rerunning only those three affected arms under the new transport identity. A private blind pilot review is ready before any full benchmark.

The three affected arms were rerun under that cap. The prior leading-whitespace parameter wrapper no longer blocks valid content, and one four-bundle arm produced a valid all-80 verdict. One 13-group result ended before its bet array closed, so accepting it would require guessing. The other four-bundle judgment completed but referred to a nonexistent second local bet, which core correctly rejected. The rerun cost $1.889333 and took 501,788 ms, bringing cumulative spend to $47.165909. One critic cost $0.013076, raised ten nonmaterial notes, changed no judgment, and triggered no adjudication. Across the six latest pilot outcomes, four verdicts are valid and two failed closed. The private blind review is refreshed. The full benchmark has not started; the next action is Samay's judgment review.

The pilot review is complete. Samay selected Cognition Arm B, while noting that parts of A were useful and that the quality ceiling remains an open question. For Bland, he kept Arm A's two separate company bets and Arm B's current strategy set of Reliability and Specialization. The all-80 audit left Completeness and Security as open questions, not current strategies. Structured output that arrives incomplete or cites a local bet code does not own receives one correction attempt with the exact validation error. A second invalid answer still fails closed. No additional pilot is planned before the decision on the full comparison.

The repaired five-company decision screen is complete. Its shared provider schemas validate under Draft 2020-12, and the earlier schema rejection did not recur. Across the reviewed pilot and the new screen, seven answers passed the full 80-strategy contract and eight failed closed. The new screen cost $9.592233, bringing cumulative benchmark spend to $58.114951. The private blind review preserves every valid answer, all 80 rows, and each failure class. It now waits for Samay's judgment. No additional paid batch is approved; production remains disabled and the unread holdout remains unread.
6. Vocabulary. Every strategy is evaluated. The judge names each mechanism in plain words first and maps it to the nearest of the 80 names second; sibling names (Alliance and Symbiosis, Usership and Reliability) need a stated reason to differ, checked against the group rules. The frequency gate extends to each scout and judge label distribution against the corpus base rate, so habit shows up as a number.
7. Parity record. Before any tournament, arm files record prompt hashes and per-pass attempts, thinking state, models, evidence hashes, and verifier behavior so a hidden process difference cannot decide the result.
8. Writer tournament beyond the two Sonnets. Challengers: DeepSeek v4-pro, an OpenAI model through OpenRouter (`openrouter/openai/<model>`, cost reported by OpenRouter, no pricing row needed), and on a few cards only the highest-powered models, Claude Fable 5 (`claude-fable-5`, Anthropic direct) and OpenAI GPT-5.6 Sol (`openrouter/openai/gpt-5.6-sol`, $2.50 per million input and $15 per million output, released 2026-07-09; a `-pro` variant exists at a higher rate). Design, so nothing is spoiled:
   - Fresh cards. Each pairing runs on slugs Samay has never seen in any rig, drawn from the corpus with `--slugs`, same stratification as the first twenty. Never the first ten (his eye is trained on them) and never the holdout (reserved for the revised pipeline).
   - Champion against challenger, two arms per card, the rig unchanged. The champion is whichever Sonnet wins the first ten. Five cards per challenger; three for Fable and the 5.6 model. About twenty-three reads, on the order of $15 plus the frontier models' own rates.
   - Only the writer varies. Same prompts, same DeepSeek v4-pro editor, same verifier, for every arm. When DeepSeek is the writer it is also the editor; record that confound in the arm file rather than switching editors mid-tournament.
   - Process parity, checked 2026-08-20 across all 40 arms: same four passes, same prompts, same DeepSeek v4-pro editor (zero skips for either writer), same verifier, same evidence, seeded A/B assignment. One asymmetry to close before the tournament: Sonnet 5 thinks by default, so its output tokens run about three times Sonnet 4.6's (median 23.9k against 7.7k per read) inside the same 16k-per-pass cap, and the empty-text ladder that can switch thinking off is not recorded per arm. The arm file gains a per-pass record (attempt count, thinking disabled or not) so a budget squeeze can never hide inside a verdict.
   - The arm file records the prompt version (a hash of the four prompt constants) so a later prompt edit can never be compared against an earlier arm by accident. Small code change in `scripts/how-it-wins-corpus.ts`.
   - Answer keys stay out of terminals and out of chat. Production build only. Arm assignment is already seeded per slug.
   - The tournament measures prose under today's single-model driver. Once the judge split lands, the judge gets its own blind read on verdicts alone (step 9), and the writer tournament is re-run only if the split changes what the writer is asked to do.
9. Judge blind read. Two judge arms on the unread holdout, verdicts only, no prose to seduce the reader. Pick the judge on judgment alone, through the revised pipeline.

### Release

10. Upload `dist/chrome-web-store/cold-start-chrome-0.2.6-5365a94fa958.zip` to the Chrome Web Store. Installed 0.2.5 shows "api deployment out of date" until it is accepted. Advance `release-version.json` only on acceptance.
11. The flip decision rests on this sitting. Closed 2026-08-21: HOLD. The winning arm (Sonnet 4.6) is 4 Ship against 5 Weak. Mostly Weak, so `HOW_IT_WINS_ENABLED` stays false. Do not set `LLM_HOW_IT_WINS_MODEL` in production. The judge build and historical 30-arm topology base benchmark are complete. The repaired pilot has four valid verdicts and two failed-closed results. Its judgment review is complete. The repaired nine-arm screen has three valid verdicts and six failed-closed results. The combined five-company blind review now waits for Samay's judgment. The parity record, writer tournament, and unread holdout remain separate and later. No more cards in this sitting.
12. Rollback at any point: `HOW_IT_WINS_ENABLED=false`. One minute, no deploy.
13. Open label decision: "The case" (shipped) or "Thesis" for the Bull/Bear row.
