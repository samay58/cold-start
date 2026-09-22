# How it wins: layered Jev screen, calibrated shortlist, writer tournament

## Status

September 22, 2026. Phases 0 to 4 are done: the screen is built, tuned on eight fresh judge verdicts, calibrated over 358 corpus cards and wired into production in shadow mode (`HOW_IT_WINS_SCREEN=shadow`). Shadow mode runs the screen after the judge and records what it would have kept on the run trace. It changes no judgment, read, or paid ledger. Samay approved the standard change, the Vercel key, and the rollout on September 22. Phase 5, the scoped judge with the citation check, is built behind `HOW_IT_WINS_SCREEN=scoped` and is off in production. Switching it on waits on his blind sitting. As of the Inngest query at 4:27 PM on September 22, production had run no How it wins read since the shadow deploy, so no shadow trace exists yet.

The goal is a How it wins read that is faster, cheaper, less prone to label habits and better written. Today the Opus judge rules on all 80 strategies in one call. On the eight-card batch of September 22 it took a median of about 196 s and $0.66 per card end to end ($7.11 total), with a single card as high as 344 s. Most of its output is compact rulings on strategies that never reach the read.

## The idea, corrected

Samay's proposal: one round of Jev calls rules out strategies that obviously do not apply, a second finds the ones that obviously do, and a final round with and without Jev settles the contested ones, using narrow plain-English questions because Jev is cheap. Round 1 and the final round work as proposed. Round 2 needs a different job, and two assumptions about bias need correcting.

1. **Round 1 holds.** Jev can rule strategies out cheaply, and the questions come from the approved rubric (`2026-08-21-how-it-wins-strategy-rubric.md`), so the screen applies Cold Start's own tests.
2. **Round 2 changes.** Jev cannot confirm that a strategy is current. It returns a probability with no reason and no evidence ID, and the standard requires a cited, gated positive case. Round 2 instead splits each strategy into four narrow checks and gives the judge an evidence profile. The judge still makes the call.
3. **Asking Jev the same question again does not remove bias.** Repeat calls are highly correlated; TypeSafe's own consistency cookbook reports 90.8% plurality agreement. Independence comes from different wordings of the same test, which Round 2 already uses.
4. **Jev has habits of its own.** In Phase 0, Hybrid reached the shortlist on 98% of 40 companies, and Divergence, Transparency and Low-friction on about 95%. A layered screen alone would swap the judge's habits for Jev's. The fix is calibration: compare each strategy's score for a company against that strategy's scores across the corpus, and rank what is unusually strong for this company first.
5. **The final round holds.** The Opus judge rules only on Round 1's survivors, and Jev then checks that each current claim's cited evidence says what the reason says.

## Results

All numbers come from `eval/how-it-wins-screen/` runs on September 22 with `jev-1.13.0` on frozen corpus cards, holdout excluded. The ground truth is the current production judge (`claude-opus-5`, refinement on), run fresh by `scripts/how-it-wins-batch.ts` on eight non-holdout cards: august, bland, cognition, deepinfra, doppel, hebbia, nekohealth and notion. Across them it marked 8 strategies current, 5 not yet and 54 open questions, 67 live in all.

| Round 1 keep threshold | Current kept | Live kept | Judge scope, mean of 80 |
| --- | --- | --- | --- |
| 0.10 | 8 of 8 | 67 of 67 | 55 |
| 0.15 (chosen) | 8 of 8 | 63 of 67 | 38 |
| 0.20 | 8 of 8 | 59 of 67 | 27 |

| Measure | Result |
| --- | --- |
| Cost, both rounds | about $0.0018 per card at list price; the whole 358-card calibration run cost $0.65 |
| Latency, both rounds | median 0.76 s over 358 cards, 1.4 s over the labeled ten |
| Live strategies dropped at 0.15 | 4 open questions: iteration (doppel), first mover and efficiency (hebbia), affordability (cognition) |
| Calibrated shortlist of 25 | kept 49 of 67 live and 6 of 8 current; it missed low-friction (deepinfra) and specialization (nekohealth) |

Two conclusions follow. Round 1 is safe as the judge's scope: it kept every current strategy and cut the scope roughly in half. The open questions it dropped include first mover, efficiency and iteration, three of the maybes the sitting notes called habits. The calibrated shortlist is not safe as a filter, because it dropped two current strategies, so it serves as a priority hint and a bias monitor. Eight cards is a small sample, and shadow mode exists to grow it.

The first Round 1 wording ("any hint") kept a median of 66 of 80 and filtered almost nothing. The shipped wording asks whether an analyst should examine the strategy, and it includes the rubric's deciding question.

## Design

For one company, after the existing thin-file gate:

| Step | Who | What | Budget |
| --- | --- | --- | --- |
| 1. Scope | Jev, 1 request | 80 Noul questions, one per rubric row, built from its deciding question, positive evidence and look-alikes. Keep p ≥ 0.15. | about 0.5 s |
| 2. Evidence profile | Jev, 1 to 2 parallel requests | Four Nouls per survivor: deciding question, concrete positive evidence, "only look-alikes", affirmative disqualifier. | about 0.6 s |
| 3. Calibrate | Code | Each strategy's support becomes its percentile among 358 corpus cards (`how-it-wins-screen-calibration.ts`). The ranked shortlist is a hint to the judge and a bias monitor. | none |
| 4. Judge | Opus, as today | In shadow mode the judge still rules on all 80. In Phase 5 it rules only on the Round 1 scope, receives the evidence profile as a lead, not a verdict, and must still cite evidence. The critic and adjudication loop is unchanged. | target ≤ 120 s |
| 5. Check citations | Jev, 1 request | Phase 5: for each current ruling, "The cited evidence directly shows the mechanism stated in this reason." Below threshold, the ruling returns to adjudication once. | about 0.4 s |
| 6. Write | Writer model | Renders the frozen verdict, as today. | unchanged |

In Phase 5, every strategy outside the Round 1 scope is stored with disposition `insufficient_evidence`, the reason "Screened out: no specific supporting fact", its Jev probability, the screen version and the model. The judgment standard allows a compact disposition for strategies that fail the evidence gate. Samay approved letting the screen assign it on September 22.

### Why this is more intelligent, beyond cheaper

- Each strategy is judged independently, so order, position in an 80-item list and the most vivid fact cannot tilt it. The standard's own perturbation tests ask for exactly this.
- The look-alike question applies the rubric's false-positive column directly. Today that column lives inside a 16k-token prompt.
- Calibration makes "Specialization" mean "more specialized than most companies we have read", which is the standard's category-baseline test put into numbers.
- The judge spends its output on about 38 strategies instead of 80, so the reasons can go deeper without hitting the timeout.

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

## Opus 5.5 for the judge and writer

Samay asked whether Opus 5.5 is 40% cheaper than Opus 5 and more intelligent, and whether to swap it in. Checked September 22 against Anthropic's model pages and independent sources.

| Claim | Finding | Status |
| --- | --- | --- |
| 40% cheaper | List prices are 20% lower: $4 and $20 per million input and output tokens against $5 and $25, and cache reads are 60% lower. The 40% figure is Anthropic's blend of that cut, a lower default effort (medium against Opus 5's high) and claimed lower verbosity. | Price CONFIRMED; 40% REPORTED by Anthropic only |
| Less verbose | CodeRabbit's launch-day code review test found 49% to 58% more tokens, the opposite of the claim, on a task shaped like judging. | Contradicted by the one independent test |
| More intelligent | Artificial Analysis Intelligence Index: 58 against 51. Its Terminal-Bench run measured 59.6%, below Anthropic's 66.4%. | CONFIRMED independently, smaller than claimed |
| Drop-in swap | Opus 5.5 returns HTTP 400 on a forced `tool_choice`. The judge adapter forces one (`how-it-wins-judge-adapter.ts:305`), as do extraction, synthesis, research sections, person reads, the emphasis read and the expanded description. | Swap breaks the judge as written |

Sources: [Opus 5.5 overview](https://platform.claude.com/docs/en/models/opus-5-5/overview), [what's new](https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5), [launch post](https://www.anthropic.com/claude-opus-5-5), [Artificial Analysis](https://artificialanalysis.ai/models/claude-opus-5-5), [The Decoder](https://the-decoder.com/claude-opus-5-5-matches-fable-5-1-at-40-percent-lower-cost-as-anthropic-promises-to-fix-claudish-writing/).

Decision: do not swap on the claim. Measure it on Cold Start's own work in Phase 7, after the adapter moves from a forced tool choice to `tool_choice: auto` with a strict schema, and after that change is confirmed to leave Opus 5's output unchanged. At list price the saving on a 15k-in, 12k-out judge call is $0.075 (20%) before any verbosity change.

## Phases

| Phase | Work | Status |
| --- | --- | --- |
| 0 | Offline Jev replay | Done |
| 1 | Ground truth from the current judge on 8 non-holdout cards | Done, $7.11, cached in `eval/curation/how-it-wins-batch/_judgments/` |
| 2 | Tune thresholds | Done: Round 1 at 0.15 |
| 3 | Corpus calibration table | Done: 358 cards, $0.65 |
| 4 | Shadow mode in production | Shipped behind `HOW_IT_WINS_SCREEN=shadow`. Each run's trace gains `howItWins.screen`, with the shortlist, the judge's live ids and `missedByRoundOne` |
| 5 | Judge on the Round 1 scope, plus the citation check | Built, off (`HOW_IT_WINS_SCREEN=scoped`). Switch on after Samay's blind sitting of scoped against current reads, with no current strategy in `missedByRoundOne` across at least 30 shadow runs |
| 6 | Writer tournament | Waits on five reads Samay marks sloppy, then his blind verdicts |
| 7 | Opus 5.5 trial | After the forced tool choice is removed: matched-effort A/B of judge and writer on the eight cached cards, measuring agreement, output tokens, cost and latency |

Rollback: unset `HOW_IT_WINS_SCREEN` and redeploy. The judge never depends on the screen in shadow mode.

## Phase 5 as built

- The screen runs first, as the memoized step `hiw-v2-screen`, so a retried run judges the same scope. If Jev fails, the run uses the full 80-strategy judge and the trace says `status: "failed"`.
- The judge's request reuses `missingStrategyIds`, the field that always named what the call judges. The prompt gains `HOW_IT_WINS_SCOPED_JUDGE_ADDENDUM` and the contract drops "exactly 80". The tool schema allows 1 to 80 rows rather than the company's own count, because the tool schema leads Anthropic's cache prefix.
- Code fills every strategy with no row as `insufficient_evidence`, with the reason "Screened out before judging: no specific supporting fact (screen-v1, 0.04)." The judge may add a row outside its scope, and that row wins. A scoped strategy with no row is a contract violation, which earns the existing single re-ask.
- The judge also receives three leads: strategies unusually strong for this company (percentile of at least 0.9, at most 10), look-alike risks (blocked in Round 2) and vague ones (a gap of 0.4 or more between the two wordings). The addendum tells it they are not evidence.
- The critic still sees all 80 rows, so it can name a screened-out strategy as missed, and adjudication can restore it. That is the recall net for Round 1's misses.
- The scope, including each dropped strategy's score, is folded into the prompt hash only when present. Every unscoped hash is byte-identical to before, which a test pins, so no filed verdict was invalidated. Scoped and full verdicts never replay for each other.
- The citation check asks Jev, once per current ruling and in parallel, whether the cited evidence shows the stated mechanism. A score below 0.3 becomes a material critic finding of kind `evidence`, and the existing adjudication settles it once. With refinement off it is only a note. A failed check is a note, never a failed run.
- Offline check on September 22, over the 8 current rulings in the cached verdicts: real citations scored 0.31 to 0.79, so none was flagged. The same rulings against two unrelated evidence items scored 0.03 to 0.25 in 7 of 8 cases and 0.66 in one. Cost $0.0007. The margin between 0.31 and 0.25 is thin and the sample is small, so the threshold is provisional.
- The mode is not part of the evaluator signature, so turning it on does not re-read existing cards. A card gets a scoped read the next time its evidence changes or a read is requested.
- `npm run eval:how-it-wins:batch -- --scoped` produces scoped reads for the blind sitting. Its commands are in `eval/README.md`.

## Kill conditions

- Shadow runs show Round 1 dropping a strategy the judge marks current, at a rate above 1 in 30 runs.
- The scoped judge is not at least 30% faster, or the blind sitting prefers the full judge.
- Jev's service fails more than 1% of screen calls in shadow mode. The fallback is always the full 80-strategy judge.

## Files

- `packages/llm/src/how-it-wins-screen.ts`: questions, the Jev client, the screen and the shortlist. Questions come from the parsed rubric the judge uses.
- `packages/llm/src/how-it-wins-screen-calibration.ts`: generated quantiles. Rebuild with `npm run eval:hiw-screen:calibrate` after any change to the screen version, the Jev model or the rubric.
- `apps/web/src/inngest/how-it-wins-screen-shadow.ts` and the `hiw-v2-screen-shadow` and `hiw-v2-screen` steps in `how-it-wins-v2.ts`: the shadow and scoped runs. Neither throws.
- `packages/llm/src/how-it-wins-judge.ts` (`HowItWinsJudgeScope`, `HowItWinsCitationCheck`), `how-it-wins-judge-adapter.ts` (scoped contract and schema) and `how-it-wins-judge-prompts.ts` (`HOW_IT_WINS_SCOPED_JUDGE_ADDENDUM`): the scoped judge. Tests: `packages/llm/tests/how-it-wins-judge-scope.test.ts`.
- `eval/how-it-wins-screen/`: replay, scoring and calibration scripts, documented in `eval/README.md`.
- Keys: `TYPESAFE_API_KEY` in the root `.env.local` and in Vercel production. It stays server-side.
