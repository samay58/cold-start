# How it wins: layered Jev screen, calibrated shortlist, writer tournament

## Status

Draft for Samay, September 22, 2026. Phase 0 (offline replay) ran. No production code, judge prompt, schema, env var or stored card changed.

The goal is a How it wins read that is faster, cheaper, less prone to label habits and better written. Today the Opus judge rules on all 80 strategies in one call: median 197 s and $1.01 per card on the new rubric, with a 12.4k-token output (`docs/qa/how-it-wins-repair-2026-08-25.md`, `docs/qa/how-it-wins-latency-2026-09-11.md`). Most of that output is compact rulings on strategies that never reach the read.

## The idea, corrected

Samay's proposal: one round of Jev calls rules out strategies that obviously do not apply, a second finds the ones that obviously do, and a final round with and without Jev settles the contested ones, using narrow plain-English questions because Jev is cheap. Round 1 and the final round work as proposed. Round 2 needs a different job, and two assumptions about bias need correcting.

1. **Round 1 holds.** Jev can rule strategies out cheaply, and the questions come from the approved rubric (`2026-08-21-how-it-wins-strategy-rubric.md`), so the screen applies Cold Start's own tests.
2. **Round 2 changes.** Jev cannot confirm that a strategy is current. It returns a probability with no reason and no evidence ID, and the standard requires a cited, gated positive case. Round 2 instead splits each strategy into four narrow checks and gives the judge an evidence profile. The judge still makes the call.
3. **Asking Jev the same question again does not remove bias.** Repeat calls are highly correlated; TypeSafe's own consistency cookbook reports 90.8% plurality agreement. Independence comes from different wordings of the same test, which Round 2 already uses.
4. **Jev has habits of its own.** In Phase 0, Hybrid reached the shortlist on 98% of 40 companies, and Divergence, Transparency and Low-friction on about 95%. A layered screen alone would swap the judge's habits for Jev's. The fix is calibration: compare each strategy's score for a company against that strategy's scores across the 373-card corpus, and shortlist what is unusually strong for this company.
5. **The final round holds.** The Opus judge rules only on the shortlist, and Jev then checks that each current claim's cited evidence says what the reason says.

## Phase 0 results

Run with `eval/how-it-wins-screen/run.ts`, `jev-1.13.0`, frozen corpus cards, holdout excluded. Output is in `eval/runs/how-it-wins-screen/` (gitignored).

| Measure | Result |
| --- | --- |
| Cost | $0.0017 per company for both rounds, at list price (40 companies: $0.067) |
| Latency | Both rounds, wall clock: median 0.88 s, p95 1.66 s |
| Round 1, "candidate" wording, keep at p ≥ 0.2 | Median 28 of 80 kept |
| Round 2 | Median 24.5 contested, 0.5 strong per company |
| Label recall, round 1 | 56 of 83 labels from the older sitting reads kept at p ≥ 0.2; 77 of 83 at p ≥ 0.1 |

The recall number needs care. The 83 labels are the older writers' picks from sittings 1 and 2, made before the judge-writer split, and the sitting notes name some of them as habits. The labels Round 1 drops most are the habits named in the notes: Usership, Aggregation and Symbiosis 6 times each, Prestige 4 times ("Prestige from Sonnet 5 is a habit"), Alliance 3 times and First mover twice ("the same four maybes"). That suggests the screen resists the old habits. It is not proof. The ground truth needed is the current judge's full 80-strategy verdicts (Phase 1).

The first wording ("any hint") kept a median 66 of 80 and filtered almost nothing. The "candidate" wording asks whether an analyst should examine the strategy and includes the rubric's deciding question.

## Design

For one company, after the existing thin-file gate:

| Step | Who | What | Budget |
| --- | --- | --- | --- |
| 1. Screen out | Jev, 1 request | 80 Noul questions built from each rubric row's deciding question, positive evidence and look-alikes. Keep p ≥ threshold. | about 0.5 s, $0.0007 |
| 2. Evidence profile | Jev, 1 to 2 parallel requests | Four Nouls per survivor: deciding question, concrete positive evidence, "only look-alikes", affirmative disqualifier. | about 0.6 s, $0.001 |
| 3. Calibrate | Code | Convert each strategy's support to its percentile among corpus companies. Shortlist: percentile ≥ p80 or raw support ≥ 0.75, then drop anything blocked by the look-alike or disqualifier checks, capped at 20. | none |
| 4. Judge | Opus, as today | Full rulings only for the shortlist. It receives the evidence profile as a lead, not a verdict, and must still cite evidence. The critic and adjudication loop is unchanged. | target ≤ 90 s |
| 5. Check citations | Jev, 1 request | For each current ruling: "The cited evidence directly shows the mechanism stated in this reason." Below threshold, the ruling returns to adjudication once. | about 0.4 s |
| 6. Write | Writer model | Renders the frozen verdict, as today. | unchanged |

Every strategy the screen drops is stored with disposition `insufficient_evidence`, the reason "Screened out: no specific supporting fact", its Jev probabilities, the rubric hash and the model version. The judgment standard allows a compact disposition for strategies that fail the evidence gate. Letting the screen assign it is a change to the standard and needs Samay's approval.

### Why this is more intelligent, beyond cheaper

- Each strategy is judged independently, so order, position in an 80-item list and the most vivid fact cannot tilt it. The standard's own perturbation tests ask for exactly this.
- The look-alike question applies the rubric's false-positive column directly. Today that column lives inside a 16k-token prompt.
- Calibration makes "Specialization" mean "more specialized than most companies we have read", which is the standard's category-baseline test put into numbers.
- The judge spends its output on the 15 to 20 strategies that matter, so the reasons can go deeper without hitting the timeout.

### Bias controls

1. Corpus calibration (step 3), refreshed when the rubric hash or the Jev version changes.
2. Two wordings per test. A gap of 0.4 or more between the deciding and positive checks marks the strategy as vague for this company and sends it to the judge as contested.
3. The existing `strategyFrequencyGate` (`eval/investor-lens/score.mjs`, max share 0.5, 10-read floor) runs on shortlists as well as final reads, so drift shows before release.
4. A monthly selection-rate report per strategy across new cards. Any strategy current on more than 40% of cards is reviewed against its rubric row.

## Writing quality

The model has only been compared once. In the sitting-2 blind review, run with the older four-pass writer, Sonnet 4.6 scored 4 Ship, 5 Weak and 1 Slop, and Sonnet 5 scored 0 Ship, 6 Weak and 4 Slop. The notes traced Sonnet 5's losses to the prompt: its sentence slot rewarded "stark evidence and mechanism, taken in at a glance", and Sonnet 5 obeyed it harder. The frozen writer that replaced that path (`HOW_IT_WINS_FROZEN_WRITER_PROMPT` in `packages/llm/src/how-it-wins-judge-prompts.ts`) has already removed that slot and banned the manufactured phrases. The frozen writer has never been blind-compared across models. The hostile editor is skipped on this path (`editorSkipped: true` in `packages/llm/src/how-it-wins.ts`). The planned tournament of DeepSeek v4-pro, GPT-5.6 Sol and Fable 5 against the champion never ran.

The current prompt fixes every note's length and order: 40 to 80 words, mechanism first, then proof, then limit. That template is a likely source of prose that reads as filled in. It is a hypothesis to test, not a finding.

Plan:

1. Collect five current reads Samay calls sloppy and name the failure in each. That gives the tournament a target rather than a general taste test.
2. Run the tournament on the existing blind rig (`/eval/how-it-wins`) over frozen verdicts, 10 non-holdout cards. Arms: the current writer, Sonnet 4.6, DeepSeek v4-pro, GPT-5.6 Sol and Fable 5 on the current prompt, plus the best model on a looser prompt that keeps the bans and drops the fixed note order.
3. Run `slopcheck` on every arm first as a floor. Then pick by Samay's Ship/Weak/Slop verdicts, then by cost and latency.

## Phases

| Phase | Work | Done when | Needs |
| --- | --- | --- | --- |
| 0 | Offline Jev replay | Done. Numbers above. | Nothing |
| 1 | Ground truth: current judge's all-80 verdicts on 10 non-holdout cards | Verdicts cached in `eval/curation/how-it-wins-batch/_judgments/` | Samay's approval for about $8 to $10 of Anthropic spend via `scripts/how-it-wins-batch.ts`, or a read-only export of `how_it_wins_judgments` |
| 2 | Tune thresholds against Phase 1 | Round 1 keeps every current and not-yet strategy; shortlist ≤ 20 | Phase 1 |
| 3 | Corpus calibration table | Percentiles for 80 strategies over 373 cards, keyed by rubric hash and Jev version | About $0.65 of Jev |
| 4 | Shadow mode in production | The screen runs beside the judge behind `HOW_IT_WINS_SCREEN=shadow`, logs the shortlist and changes nothing shown | Code in `packages/llm/src/how-it-wins-screen.ts`, called from `judgeHowItWinsForAnalysis`; `TYPESAFE_API_KEY` in Vercel |
| 5 | Switch the judge to the shortlist | Blind sitting: screened reads at least match current reads; frequency gate passes; median judge time ≤ 90 s | Samay's sitting and approval of the standard change |
| 6 | Writer tournament | Winner chosen from Samay's verdicts | Samay's sitting |

## Kill conditions

- Round 1 drops any strategy the current judge marks current or not yet, at every threshold that still removes half.
- After calibration, any strategy still reaches the shortlist on more than 60% of companies.
- The shortlisted judge is not at least 40% faster, or the blind sitting prefers the full judge.
- Jev's service fails more than 1% of screen calls in shadow mode. The fallback is always the full 80-strategy judge.

## Files

- `eval/how-it-wins-screen/questions.ts`: builds all questions from the rubric and fails if a rubric meaning drifts from core.
- `eval/how-it-wins-screen/run.ts`: the Phase 0 replay, with a hard spend cap of at most $5 and the holdout excluded.
- Key: `TYPESAFE_API_KEY` in the root `.env.local` (gitignored). It must stay server-side.
