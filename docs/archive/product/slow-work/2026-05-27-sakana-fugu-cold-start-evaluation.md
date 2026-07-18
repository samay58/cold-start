# Sakana Fugu Evaluation for Cold Start

Date: 2026-05-27

## Working read

Cold Start is not a blank playground. It already has a trust contract: sourced facts, citation discipline, public/private separation, a golden eval harness, and trace tooling around cost and latency. That means the first Fugu tests should not be “swap it into prod and see what happens.” The right question is narrower: where could a coordination-heavy model create measurable lift without weakening trust boundaries?

Fugu’s official pitch is strongest on complex, multi-step, coding and reasoning tasks, with OpenAI-compatible integration and two modes: `fugu-mini` for shorter bursts and `fugu-ultra` for deeper orchestration. If that is real, the best Cold Start tests are the ones where:

- the task is multi-stage
- the output quality is measurable
- there is already a baseline
- the run can stay off the critical production path at first

Most important framing: this is a **workflow-fit evaluation**, not a prestige test. Benchmark strength is a reason to test Fugu, not a reason to trust it in a citation-sensitive product.

Also: the Trinity and Conductor papers are research lineage, not a production spec. Do not assume the exact worker pool, routing policy, cost structure, or latency behavior from the papers alone.

## Approach options

| Approach | Shape | Upside | Risk | Verdict |
|---|---|---|---|---|
| Direct prod swap | Put Fugu inside the live generation path | Fastest answer | Highest trust and cost risk | No |
| Shadow eval lane | Run Fugu beside the current system on the same inputs | Clean measurement | More setup discipline | **Recommended** |
| Component canary | Swap one bounded subtask behind a flag after shadow evidence | Real integration signal | Premature if shadow results are muddy | Second phase |

Recommendation: start with shadow eval, then promote only one bounded component if the evidence is strong.

## Highest-leverage first tests

### Research-plan generation from existing source sets

Why this fits: turning a source bundle into a good research plan is a decomposition problem, not a raw fact problem.

Best placement: shadow lane

Model:
- `fugu-mini` for simple company cases
- `fugu-ultra` for messy or conflicting cases

Value proof:
- better plan structure
- fewer wasted provider calls in later human-guided runs
- more useful source ordering

Risk:
- impressive plans that do not change downstream quality

### Analysis synthesis from accepted evidence only

Why this fits: if Fugu is good at planner / worker / verifier style orchestration, it may be especially useful once the evidence set is already curated.

Best placement: shadow lane, then maybe component canary

Value proof:
- stronger supported bull / bear / open-question synthesis
- fewer unsupported claims
- lower human rewrite burden

Risk:
- elegant prose that quietly outruns the evidence

### Trace-driven failure diagnosis

Why this fits: `trace:generation` output is a long-context, multi-signal debugging surface. Fugu may be good at synthesizing bottlenecks, failure modes, and next steps.

Best placement: offline operator workflow

Value proof:
- faster root-cause diagnosis
- better prioritization of cost / latency fixes
- higher agreement with human postmortem reads

Risk:
- plausible but wrong diagnosis

### Contradiction adjudicator

Why this fits: one of the most plausible Fugu strengths is coordinating multiple reasoning passes across conflicting evidence. Cold Start regularly runs into exactly that problem.

Best placement: shadow eval only

Value proof:
- catches known conflicts
- chooses abstention correctly when evidence is unresolved
- explains why one source wins or why uncertainty should remain

Risk:
- false certainty
- stale-source favoritism

### Eval-run triage and manual-review acceleration

Why this fits: the eval harness already produces artifacts that still need human judgment. Fugu could help compress review time without owning the verdict.

Best placement: shadow reviewer assistant

Value proof:
- shorter time to manual scoring
- better detection of likely weak runs
- more consistent notes

Risk:
- reviewer laziness induced by polished summaries

### Evidence prioritization under long context

Why this fits: 1M context only matters if the model can separate high-trust evidence from noisy bulk. Cold Start has exactly that problem.

Best placement: shadow analysis helper

Value proof:
- fewer irrelevant snippets in prompts
- better citation density per token
- improved extraction or synthesis stability

Risk:
- over-pruning minority but critical evidence

### Source-pack compressor

Why this fits: this is one of the clearest ways to test whether orchestration creates cost and latency wins instead of only better prose.

Best placement: shadow component

Value proof:
- lower prompt payload size
- same or better downstream eval quality
- same or better citation coverage

Risk:
- drops decisive but rare evidence

### One-company premium deep-dive canary

Why this fits: a single-company, extension-only “deep pass” is the safest place to see whether Fugu’s deeper orchestration yields a noticeably better operator-grade read.

Best placement: manual, offline, one-company experiment

Value proof:
- clearly better questions
- better conflict handling
- more useful investor/operator synthesis

Risk:
- high cost and latency without enough lift

## What not to test first

- replacing the verifier
- changing the public/private boundary
- autonomous contact enrichment
- letting Fugu write straight into production data paths
- any experiment where the only metric is “felt smarter”

## Experiment sequence through June 7

### Phase 1. Shadow reading, no product-path changes

Run 3 to 5 companies through a shadow workflow:

1. current baseline artifact
2. Fugu mini pass
3. Fugu ultra pass on the same evidence

Judge:
- factual support
- synthesis usefulness
- time to first usable analysis
- edit burden

Use a mix of:
- one clean company
- one messy company
- one high-cost / high-latency company from current traces

Critical fairness rule: freeze retrieval and reuse the **same** source bundle across baseline, `fugu-mini`, and `fugu-ultra`. Otherwise the test becomes about retrieval variance instead of Fugu’s reasoning and orchestration.

### Phase 2. Promote one bounded operator workflow

If Phase 1 is real, promote only one of:

- trace diagnosis helper
- research-plan helper
- synthesis-from-accepted-evidence helper
- citation or contradiction verifier

Still no live generation-path swap.

### Phase 3. One behind-flag component canary

Only if the shadow evidence is strong, test one bounded component behind an env flag. The best candidate is synthesis from accepted evidence, because it is measurable and easier to fence than raw extraction.

## Measurement framework

| Dimension | How to measure |
|---|---|
| Identity / funding / leadership correctness | existing golden eval manual review |
| Citation integrity | no fabricated URLs, claims backed by accepted sources |
| Synthesis quality | human judgment on support, usefulness, and compression |
| Latency | time to first usable public profile; time to usable extension analysis |
| Cost | token spend plus any provider-side deltas if the workflow expands |
| Reliability | run failure rate, timeout rate, incoherence rate |
| Edit burden | how much human cleanup before the result is trusted |
| Keep signal | would we intentionally keep Fugu for this subtask? |

Practical keep bar: keep a Cold Start lane only if it improves grounded quality or reduces cost / latency at the same quality, with no regression in citation discipline.

## Concrete run design

For each experiment row, log:

- company
- task lane
- baseline artifact path
- `fugu-mini` output path
- `fugu-ultra` output path
- winner
- why
- one thing Fugu did better
- one thing it did worse

The most important anti-theater rule: do not let benchmark prestige replace paired comparison on real Cold Start artifacts.

Recommended first trio:

1. full-card shadow writer on frozen golden bundles
2. citation and trust-boundary verifier
3. source-pack compressor

That set gives one end-to-end read, one trust read, and one cost/latency read.

## Feedback packet for Sakana

Cold Start can give Sakana unusually valuable beta feedback because it has a real trust-sensitive evaluation environment. Report:

- where orchestration improved decomposition
- where it produced better or worse synthesis from the same evidence
- latency felt versus value gained
- context stability on large evidence packs
- API or tooling friction during integration
- whether `mini` and `ultra` felt meaningfully distinct in practice

Also ask Sakana directly:

- pricing after beta
- prompt / data retention policy
- whether requests are routed through third-party worker models
- whether max-cost or max-recursion controls exist
- whether orchestration traces or request-level routing summaries can be exposed

---
## Sources

- https://sakana.ai/fugu-beta/
- https://sakana.ai/trinity/
- https://sakana.ai/learning-to-orchestrate/
- /Users/samaydhawan/Projects/active/cold-start/eval/README.md
- /Users/samaydhawan/Projects/active/cold-start/scripts/trace-generation.ts
- /Users/samaydhawan/Projects/active/cold-start/docs/superpowers/plans/2026-05-27-cold-start-cost-latency-execution.md
- https://agents.siddhantkhare.com/32-backpressure/
- https://ai.jokokko.com/
- https://samanvya.dev/blog/function-calling-production

---
*Captured: 2026-05-27 | Engines: Exa neural search + web research + local repo context*
