# How it wins judge architecture draft

## Fair-repair update, 2026-08-23

Samay rejected the premature move to a monolith-only design. The base run did not compare strategic judgment fairly because all twenty grouped arms failed at bookkeeping boundaries.

The repaired contract is shared by monolith, four bundles, and 13 groups. Models return meaning, evidence handles, local bet references, and strategy judgments. Code assigns every durable bet, claim, question, disagreement, and critic identifier. Later stages receive a code-assembled semantic record and never preserve arbitrary identifiers created by an earlier model. Unknown evidence and incomplete judgments still fail closed.

The no-provider repair passes the focused core, judge, and benchmark tests, all workspace typechecks, lint, and a 30-arm dry run with 250 fake calls and zero provider calls. The completed base run remains historical evidence. Its repeat plan is canceled. All three topologies remain candidates until a new two-card pilot proves the shared boundary under live provider output.

## Measured base history, 2026-08-23

The original 13-group recommendation below is superseded by the measured base benchmark.

The benchmark ran ten closed evidence packets through three shapes. Monolith returned seven valid all-80 verdicts. Four bundles and 13 groups returned none. Cumulative benchmark spend is $38.481563.

The grouped shapes did not lose on strategic judgment. They failed before a usable verdict existed. Thirteen of the twenty grouped arms stopped after the bet mapper returned text where the next stage required a readable list. The other seven reached the global judge, then used temporary evidence handles as claim or bet identifiers that code did not recognize. Core correctly refused to guess.

Do not run the scheduled 42 divergence repeats or nine order perturbations against these grouped contracts. More draws would measure the same broken handoffs, not judgment quality.

The direction at this checkpoint was one strong judge call behind the existing deep-judge interface. Samay later superseded that direction with the fair shared repair above.

Truth gates stay strict. Unknown evidence still fails. All 80 strategies still receive one disposition. The current set remains uncapped. Sibling, historical, not-yet, pair, and writer-freeze rules do not change. Mechanical serialization may be normalized only when meaning is unambiguous.

This checkpoint led to the fair shared repair above. It is retained as history, not as the current next action.

## Original position before measurement

Do not run one independent model call for each of the 80 strategies.

That shape repeats the full evidence packet 80 times and lets each strategy argue for itself without comparing siblings, centrality, materiality, or duplication. It is likely to create the exact label sprawl the judgment standard is meant to prevent.

The original recommendation was to use cheap parallel calls at the 13 canonical group level, then let one strong global judge compare the complete audit. That recommendation is retained below as the tested hypothesis.

This was an architecture recommendation, not a measured production choice. The broken base handoffs did not settle it.

## One deep judge module

The pipeline should call one judge interface and receive one structured verdict. The internal call topology stays hidden.

The interface accepts:

- one frozen evidence packet and its hash
- the canonical 80 strategies and prompt hash
- model routing for bet mapping, group scouting, global judgment, and criticism
- the existing telemetry sink

It returns:

- the material company bet or bets with evidence IDs
- a disposition for all 80 strategies
- the uncapped, ranked current strategy set
- zero or one unusual pair
- not-yet candidates, open questions, and a plain-world wrong condition
- disagreements, overrides, and the full per-call cost and retry trace

Callers do not know how many internal model calls were needed. Tests exercise the same interface with fake adapters.

## Recommended internal flow

### Strong bet mapper

One strong judgment call identifies the material strategic bet or bets before labels are evaluated. It must cite the evidence for each bet and state why any split is material.

This is not cheap-model work. The closed sitting showed that missing the actual company bet is the central failure.

### Thirteen cheap group scouts in parallel

Run one focused call for each canonical group. Each call sees the same frozen evidence and bet map, but only its group's strategy definitions.

Every scout returns a disposition for every strategy in its group:

- supported
- rejected
- open question

Each disposition includes evidence IDs, the mechanism in plain English, the nearest sibling, the deciding distinction, and any disqualifier. It uses categorical checks, not scores or percentages.

Each scout also receives the approved cross-group sibling definitions relevant to its strategies. Group fanout must not hide distinctions such as Usership versus Reliability. A scout may flag that the proposed bet map is incomplete when evidence for its mechanisms does not fit any mapped bet.

Thirteen calls are the accuracy-first reference shape. A later benchmark may combine groups into four bundles if the cheaper shape preserves recall and sibling judgment.

### Strong global judge

One strong call receives the full evidence packet, bet map, canonical vocabulary, and compact 80-strategy audit.

It compares strategies against one another and selects every strategy that clears the approved evidence, materiality, independence, and explanatory-value tests. There is no numerical cap. It may overturn a scout only with a cited reason.

It may also revise the bet map when a scout identifies a material mechanism the first call missed. The first bet map is a hypothesis for organizing the audit, not an irreversible frame.

It also resolves sibling labels, orders the current strategies, and proposes a pair only when the reference class, excluded alternative, interaction, and copying difficulty are supported.

### Cheap adversarial critic

One cheap model from a different provider attacks the verdict for:

- a missed strategy
- a missed or artificial company bet
- an unsupported or peripheral selection
- duplicated mechanisms
- unresolved sibling labels
- invented category norms
- a weak pair
- stale historical evidence
- unsupported not-yet claims

If it finds no material issue, accept the verdict. If it finds a material conflict, run one targeted strong adjudication call over the disputed items only.

This adaptive escalation replaces three expensive judge draws on every production read. Three-draw consensus can remain an offline evaluation instrument if it proves useful.

### Frozen writer

The writer receives the approved structured verdict and may not add, drop, or swap strategies. The reader interface may disclose a smaller primary set, but the stored judgment remains uncapped.

## Why not 80 dedicated calls

If the frozen evidence packet contains `E` input tokens:

- 80 strategy calls repeat roughly `80E` input tokens
- 13 group calls repeat roughly `13E`
- four bundled calls repeat roughly `4E`
- one monolithic call reads roughly `E`

Output volume is still required for all 80 dispositions, but repeated evidence and request overhead grow with the call count.

The current driver caches stable system prompts. It does not cache the per-card evidence JSON in the user message. A parallel judge implementation must either add a reusable per-card cache breakpoint where the provider supports it or price the repeated evidence at full input cost. Cache savings must come from telemetry, not assumption.

## Cost and latency controls

- Keep the existing thin-file gate before every judge call.
- Bound the group fanout at 13 and run it concurrently.
- Require compact structured output from scouts. No prose.
- Record model, provider, input tokens, output tokens, cache creation, cache reads, actual or estimated cost, latency, retries, and thinking state for every call.
- Record the evidence-packet hash and prompt hash once per verdict.
- Use the cheap critic before paying for a second strong judgment.
- Never treat a missing scout response as rejection of its group. Retry once, then let the strong judge evaluate that group directly or fail the verdict closed.
- Never treat the first bet map as ground truth. Record scout challenges and any global-judge revision.
- Set the production budget only after a measured benchmark. Do not choose a scout model from price alone.

The current four-pass writer remains the measured cost center: roughly 110 to 207 seconds and $0.15 to $0.39 per read in the closed sitting. Once judgment is frozen, benchmark whether one write, one hostile edit, and one verifier can replace the existing reason, edit, hostile-editor, and fit chain. That may save more than optimizing the cheap scouts.

## Original benchmark plan

Use only already-seen or fresh non-holdout cards. Do not touch the sealed holdout.

Compare:

1. one monolithic strong judge
2. four cheap strategy bundles plus one strong global judge
3. thirteen cheap group scouts plus one strong global judge
4. each shape with the adaptive critic and targeted escalation

Measure:

- whether the actual company bet is centred
- all-80 audit completeness
- false positives and missed strategies
- sibling-label accuracy
- unsupported pair rate
- agreement with Samay's approved standard
- total cost, strong-model cost, wall time, cache hit rate, retries, and output size

Choose the cheapest topology that preserves the judgment bar. No model run starts until the standard is complete and Samay authorizes the benchmark. This plan was executed through the 30-arm base comparison; the measured update at the top now controls the next action.

## Original implementation order after the standard

1. Define the uncapped verdict and all-80 audit schemas as pure core types.
2. Build the judge as one deep module with internal model adapters and deterministic tests.
3. Add per-call tracing and budget reporting before any paid benchmark.
4. Benchmark the four call shapes on allowed cards.
5. Choose models and topology from measured quality per dollar.
6. Freeze the verdict for the writer and test the cheaper writer chain.
7. Only then run the judge blind read on the sealed holdout and decide whether to enable the feature.
