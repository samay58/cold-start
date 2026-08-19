# Corpus Eval and Taste Rig

Written 2026-08-11 from a design session with Samay. This is the human-in-the-loop eval program over the full profile corpus, and the compare-and-pick instrument it runs on. The goal: find the best profiles Cold Start has ever produced, extract why they are the best, and tune prompts, routing, and models until the live pipeline produces that quality on demand. This program is the quality gate in front of the library flip (`docs/product/strategy/resonance-audience-and-10x.md`, section 4.1). Mass-filing thousands of cards before knowing what our best card looks like would waste the unit-cost advantage.

## What exists today

- 359 cards in production; 144 carry a filed Investor Lens read. Corpus measured 2026-08-11.
- Era spread: 133 cards created 2026-05, 120 in 2026-06, 72 in 2026-07, 34 in 2026-08. About 70% of the corpus predates the late-July pipeline (floor-plus-advisory gate, synthesis/verify step split, structured open questions, expanded descriptions, lens overhaul).
- The blind-read workstream (`docs/product/capture-notes/2026-07-20-blind-read-feedback.md`, paused at 4 of 33 groups) already produced 14 conceptual gaps and one positive template (falsifiable thesis, named failure modes, one test per failure mode, a named person to ask). That material is the seed rubric here. Blind reads compared models on identical evidence; this program hunts what "great" looks like across companies. They are complements.

## Decisions locked in the session

- Judged object: the full read (public card plus Investor Lens), with verdicts captured per layer (facts layer vs read layer). Only lens-bearing cards qualify for top-tier candidacy; exceptional card-only profiles get rescued into the pool by pre-read flag.
- Selection: hybrid funnel. Mechanical signals plus AI pre-reads build the pool; Samay's picks do the ranking. A blind control lane measures triage contamination.
- Cadence: rolling sittings of 45 to 60 minutes. A deep-read sitting covers 8 to 10 full profiles; a quick-pick sitting covers about 10 groups of condensed views. No dates attached; the ledger keeps state between sittings.
- Regen lane: yes, small. About 10 to 12 companies re-run on the current pipeline, compared stored-vs-fresh as blind same-company pairs.
- Interface: a ridiculously simple local web rig. Midjourney-style groups, one tap to pick, chips for reasons, a dictation-friendly note box. Two-stage flow: quick-pick rounds over the pool, then full-profile deep singles on the finalists.
- Competitive landscape is a first-class judgment dimension on every deep read, including a "who's missing" capture. The comps engine itself (landscape synthesis, cross-card evidence) is a separate design pass that this program feeds. The Mintlify comps section is the anchor exemplar of good-list-still-not-landscape: typed overlap relationships per competitor, sourced, but no structure above the list.

## Phases

### Phase 0: corpus table and pool (no Samay time)

A snapshot script reads production read-only (same freeze pattern as `eval:providers:bundles`) and writes frozen JSON under `eval/curation/corpus/`. One row per lens-bearing card:

- slug, name, created/updated timestamps
- era bucket: may-pre-gate, june, july-overhaul, august-current
- model routing per stage where traces carry it
- claims survived and dropped by the verifier, citation count, source-quality mix, sections present
- evidence-richness score (source count weighted by quality tier)
- the condensed quick-pick view: thesis line, why-care, comps, next question, stat strip. Deterministic extraction from stored `card_json`. No LLM in this path.

Pre-read ranking notes run on down-laddered subagents (Sonnet-class, explicit model and effort per Fable economics). Fable does the final ranking and stratification. Output: a pool of about 75 cards, era-mixed and richness-stratified, with about 10 low-ranked control cards inserted unmarked. If control cards start winning rounds, the triage is filtering wrong and the pool widens.

### Phase 1: quick-pick rounds (about two sittings)

The pool flows through the rig in groups of 4, matched on evidence richness, era-mixed, blind to era and routing. Fixed question on every screen: "which one makes you smartest about its company?" Pick the winner, tap chips, optionally dictate a line, next group. A one-tap runner-up flag pulls a strong loser into a second-chance round instead of eliminating it. About 19 rounds. Output: the finalist set, about 15 to 20 cards, plus a chip histogram over the whole pool.

### Phase 2: deep singles (about two sittings)

Each finalist gets a full dossier, one per screen: card face, complete lens read, comps section. Capture: S/A/B tier, a two-tap layer verdict (facts / read / both), chips including inverse flags, the who's-missing comps capture, and dictated sentences. The dictated sentences are the highest-value artifact in the program; a line like "lengthy and kinda hard to read" tunes more than a ranking does.

### Phase 3: regen lane

About 10 to 12 companies re-run on the current pipeline: mostly finalists plus 2 or 3 known-mediocre for contrast. Runs happen on a pinned deploy after the reliability preconditions (funded wallets, green alpha:status). Stored-vs-fresh pairs go through the rig as blind same-company A/Bs. This measures whether the live pipeline can reproduce the historical best, which decides whether tuning is recovery or advancement. Cost about $5 to $8.

### Phase 4: pattern extraction (no Samay time)

Inputs: the ledger, the S-tier cards, the chip histograms, the blind-read gap list. Deliverables:

- a quality anatomy per dimension, the successor to the winning-output anatomy
- a failure kill list with Samay's flagged phrases verbatim
- a ranked slate of candidate changes: prompt edits, taste-kernel amendments, routing and model flips, retrieval fixes. Every candidate tagged with its exemplar evidence and whether the era that produced that evidence still exists in the live pipeline.

### Phase 5: tuning and encoding

Every change validates through the rig before shipping: same company, old recipe vs new, blind pick. Winners deploy. Then the taste gets institutionalized:

- curated exemplars become the new golden set for regression
- flagged phrases and template-question detectors land in `eval/investor-lens/score.mjs`
- the anatomy lands in `packages/llm/src/investor-taste-kernel.ts` and the synthesis prompts
- the comps overhaul gets its own brainstorm, seeded by the eval findings, including cross-card synthesis against the filed library

## The rig

### Location and gating

A dev-only route group in `apps/web` at `/eval`. Returns 404 unless `EVAL_RIG_ENABLED` is set, and the gate has a real test: the rig renders synthesis in a browser, and public-web-never-shows-synthesis is a product security invariant. The rig never touches production at runtime; it is a local app over the frozen snapshot. No production credentials near a browser.

### Rendering

The public layer reuses `CardFace` and the card-face model. The lens layer gets a minimal read-only renderer inside the eval route. Product code does not move for an internal tool; if the web app ever renders synthesis for real, that is the moment to lift the extension's display model into a shared package, not before.

### Data flow

Snapshot script writes `eval/curation/corpus/`. A deterministic seeded session plan (`session-plan.json`) fixes group composition so sittings resume mid-stream and are reproducible. The rig serves the next group; picks POST to an append-only JSONL ledger under `eval/curation/ledger/`. A standings page computes wins, runner-up flags, and chip histograms. A changed mind is a new ledger event, never an edit.

Ledger event shapes (illustrative):

```json
{"kind":"quick-pick","sitting":1,"group":["a","b","c","d"],"winner":"b","runnerUp":"d","chips":["better-comps"],"note":"","knowsSpace":false,"ts":"..."}
{"kind":"deep-single","slug":"a","tier":"S","layers":"read","chips":["sharper-thesis"],"missingComps":["x"],"note":"...","knowsSpace":true,"ts":"..."}
{"kind":"pair","slug":"a","arms":{"A":"stored","B":"regen"},"winner":"B","chips":[],"note":"","ts":"..."}
```

### Capture vocabulary

Positive chips: sharper thesis, better comps, more honest, deeper evidence, tighter, better voice. Inverse flags (deep singles): slop, generic, padded, template question. Context chip: "I know this space", so pattern mining can weight domain-familiar judgments differently. Chips map onto the dimension taxonomy: explanation quality, nuance and honesty, evidence depth, opportunity framing, category population, competitive landscape, voice and register.

### How it wins reads

`/eval/how-it-wins` is a second lane over the same corpus and the same ledger. `npm run eval:how-it-wins` writes two "How it wins" reads per card into `eval/curation/how-it-wins/` (gitignored, like the corpus, because these files hold synthesis): one per writer model, same editor and same verifier, with the A and B slots assigned by a seeded per-card coin flip. The route shows the next card no one has judged yet, side by side and unlabelled. The reader picks A, B, or neither, rates each read ship, weak, or slop, and can leave a note. That verdict posts as a `how-it-wins` ledger event, `{"kind":"how-it-wins","slug":"a","pick":"A","ratings":{"A":"ship","B":"weak"},"note":"","ts":"..."}`, and only then does the page say which model wrote which arm. When every card is judged the route shows picks and ratings per model. This lane decides the production writer model; it does not rank cards.

### Blindness

Company identity shows; era, routing, cost, and generation date stay hidden until the pick is logged, then a reveal panel shows everything. Same reveal-on-request discipline as the blind reads.

## Risks

- Triage ceiling: the pool inherits Fable's taste. Control lane measures it; widen the pool if controls win.
- Small n: about a hundred picks is taste capture, not statistics. No tuning conclusion ships on rankings alone; blind same-company pairs are the gate.
- Cross-company confound: richness matching and the fixed question mitigate; deep singles judging each card on its own terms is the counterweight.
- Era transfer: patterns mined from dead recipes may not transfer. Every candidate change carries its era tag; the regen lane exposes the gap early.
- Momentum: the blind-read workstream paused at 4 of 33. The rig's whole design (one tap, resumable plan, ledger state) exists to make sittings cheap enough to finish.

## Testing

Proportionate to an internal tool. Three real tests: the production 404 gate (security invariant), session-plan determinism, ledger append behavior. The snapshot script performs only SELECT queries and contains no write statements; that constraint is enforced in review, matching the other read-only production scripts.

## Non-goals

- No product surface changes ship from this program directly; changes ship through Phase 5 validation.
- No comps engine design here; that is a separate brainstorm this program seeds.
- No library flip work; this program is its quality gate, not its implementation.
- No statistical claims from pick counts.

## Costs and time

Samay: four to five sittings of 45 to 60 minutes across phases 1 to 3, then shorter validation reads in phase 5. Dollars: regen lane $5 to $8; tuning pairs similar per iteration; pre-reads down-laddered and cheap. Build: the snapshot script, the rig route, and the ledger are the only code.
