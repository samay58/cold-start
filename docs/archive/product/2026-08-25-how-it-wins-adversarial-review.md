# How it wins: adversarial review (2026-08-25)

## What was reviewed

The span is `6c9ac21..253a9f0` on `main`: the full build-out of How it wins from 2026-08-17 to 2026-08-24. 58 commits, about 23,000 lines added and 580 removed (`git diff --shortstat`). This review produced nine commits on top of `253a9f0`, on `review/how-it-wins-tighten`, net minus 5,133 lines (2,360 added, 7,493 removed across 64 files).

## How

Six reviewers worked the span by seam: the judge, the writer, the Inngest steps, the extension crown, the eval scripts, and the docs. One further pass tried to refute each finding by running the code, not rereading it. The orchestrator independently checked the production database, the deployed API, and the installed Anthropic SDK source, rather than trusting any reviewer's quote of them.

## What was wrong

Production How it wins had never produced a read. The judge's Anthropic call asked for 50,000 output tokens through a non-streaming `messages.create`. `@anthropic-ai/sdk`'s `calculateNonstreamingTimeout` throws `Streaming is required` above roughly 21,333 tokens, confirmed in `node_modules/@anthropic-ai/sdk/client.js`, so every run threw before any network call and degraded to `nothing_stands_out` with no judgment and no call trace. Both analysis runs since the flag went on, laundryheap and elicit on 2026-08-25, failed this way in under 30 ms. The bug survived because the offline benchmark adapter streamed its Anthropic call and the production adapter did not, and no test exercised the production adapter's Anthropic path: every suite naming `judgeHowItWinsForAnalysis` mocks it, so the fallback was proven and the success path never was.

Beyond the outage, several paths threw away a valid judgment instead of degrading it: an adjudication failure, a same-provider misconfiguration caught only after both calls were already paid for, and semantic validation that ran outside the retry loop so a transport hiccup got a second chance and a broken validation rule did not. A frozen-writer citation list written as `[e1, e2]` was read as one unknown id and dropped a note's whole evidence list. The llm test fixture for the writer suite carried a real company's founders, investors, and customers by name across sixteen citations. `npm run knip` failed on two unused files, one unused re-export, and one duplicate export.

## What was removed

- `821237f`: the topology benchmark harness (four scripts) and the real-company prompt-test artifacts it fed, 16 files, 3,813 lines removed, 71 added. The topology decision closed 2026-08-24 as monolith; its results stay in the spec, the sitting notes, and `eval/curation/ledger/how-it-wins-topology-benchmark-manifest.json`.
- `fb950801`: the bet-map, group-scout, four-bundle, and adjudication stages, and the recursive schema-guided transport normalizer, 8 files, 1,349 lines removed, 288 added. The judge stage enum is now `z.enum(["global_judge", "critic"])`.
- `9feae84`: the four-pass writer and `packages/llm/src/how-it-wins-prompts.ts`, 22 files, 1,263 lines removed, 311 added. `synthesizeHowItWins` now requires `{ client, model, card, telemetry, judgment }`; no caller can omit the judgment.
- `4f95771`: dead crown props, a color map duplicated from the dot encoding, and a live-region sweep that could queue eighty announcements on one pointer pass, 10 files, 184 lines removed, 222 added.

## What was fixed

`964839a` closed five ways a good verdict used to die: the same-provider check now runs at `createHowItWinsJudge` construction; semantic validation moved inside the one-retry loop; a compact evidence-failed row no longer fails its own strict schema; a misspelled sibling name now throws instead of dropping silently; and the `[e1, e2]` citation format parses again. `fb950801` and `964839a` together collapsed two adapters into one, `createHowItWinsJudgeModelAdapter`, whose Anthropic branch now calls `client.messages.stream(...).finalMessage()`; `packages/llm/tests/how-it-wins-judge.test.ts` pins that streaming call at a 50,000-token budget and separately proves the non-streaming path would refuse it, so the bug cannot come back silently. `ae3ea86` split the judge and writer into two memoized Inngest steps, `how-it-wins` and `how-it-wins-write`, so a writer retry replays the stored judgment instead of paying for a second one, and fixed a DeepSeek off-peak pricing bug that priced every weekend hour as peak. `4742fa2` replaced the privacy-carrying fixture with an invented company, Keelson Labs, on `example.com` domains, same shape and citation count. `9c8a9af` gave the corpus script a required `--cap` and a nonzero exit code on a failed frequency gate. `knip` is clean, `ajv` is uninstalled, and lint, typecheck, and the full test suite are green.

## What was left for the repair session, and why

Decisions D2 through D12 in the repair prompt were left untouched by design: pinning the judge model, shrinking the 32,000-token output contract, moving the judge off the analysis critical path, caching judgments, fixing the collapse and the writing bar, and every release action are product and cost calls that need Samay's review or paid experimentation, not a documentation pass.

One gap this review found was not in the original brief. The critic call was not degraded on failure: `judge()` in `packages/llm/src/how-it-wins-judge.ts` let a critic failure after a successful global judgment propagate out unguarded, discarding a verdict that already cost real money. The critic-guard commit on this branch catches that one call, keeps the verdict, and records the failed critic call in `calls`; the repair prompt now marks D6 done. Production still has `HOW_IT_WINS_ENABLED=true` and still fails closed on every run until this branch deploys.

## How it was verified

Every fact above was checked against the code on this branch, not against commit messages: `packages/llm/src/how-it-wins-judge-adapter.ts` for the streaming call, `packages/core/src/how-it-wins-judgment.ts` for the two-stage enum, `packages/llm/src/how-it-wins.ts` for the required `judgment` argument, `apps/web/src/inngest/how-it-wins.ts` and `functions.ts` for the two step ids, and `packages/llm/tests/how-it-wins-judge.test.ts` for the streaming test. `npm run knip` was run directly and returned no output. `git diff --shortstat` against `main` produced the line counts above.

## Addendum: the repair packets (2026-08-25)

D2 through D9 of the repair prompt landed after this review, each its own commit on `review/how-it-wins-tighten`. `e7323ef` compacted the judge's output to a failed-gate row of four fields, capping the disposition reason at 160 characters. `fba33d6` dropped the surviving-strategy floor from two to one and stopped discarding a note whose citation marker did not parse. `f72073b` moved the judge, the writer, and their own verify pass onto a new Inngest function, `how-it-wins-read`, dispatched by the analysis run only after it stores the card; the analysis run itself now makes no How it wins call at all. `9b6a6bb` gave the crown a quiet reading state and its own wait logic, polling the run's event trail rather than the card. `3a5fb6d` rewrote the writer prompt against the phrasings this sitting's notes named as banned. `b2b09b5` moved the running and in-question caps out of the schema into a display budget in the extension, seating a filed pair's legs first. `97a1f04` replaced the evidence-packet-hash reuse lookup, which the four volatile fields on every packet would have kept from ever matching, with a reuse key that strips them. `dbb5c77` removed the inline verify path the Inngest move left dead. `LLM_HOW_IT_WINS_MODEL=claude-opus-5` was set on Vercel Production directly, no commit.

What remains: Samay's blind read of the writer's output against the compacted judge, a holdout judge read on the ten untouched cards, the merge to main, the production deploy, and, once one real run confirms the read, turning `HOW_IT_WINS_ENABLED` back on. In-question marks on the crown read as a distinct shape now, not the distinct color Samay asked for; that stays open for his call rather than a decision made here.

## The port, 2026-08-26

Two sessions repaired How it wins in parallel from the same brief on 2026-08-25: this review branch, and a separate session working directly on `main`. Its branch became `main` and is deployed. This branch, pushed as `review/how-it-wins-tighten`, was never merged and is retired as a merge candidate.

Ported onto `main` as eight commits: `47f31d9` refactor(how-it-wins): frozen writer only, drop dead verify and trace; `ff3fcfa` chore(eval): retire the How it wins topology benchmark; `06194d7` refactor(how-it-wins): one judge path, monolith only; `def7ee4` fix(eval): cap and gate the How it wins corpus and batch reads; `273095d` chore(eval): share the How it wins helpers, read on the real path; `f7c4f9d` refactor(extension): tighten the How it wins crown and clipping receipts; `30c604e` fix(llm): sibling typos throw, DeepSeek by weekday, opus-5 quirk row; `c0c487b` fix(llm): keep How it wins reads that a citation slip used to kill.

Kept from `main` on purpose: the `how_it_wins_judgments` cache table; the critic-and-adjudication patch over the global judgment, never a re-emit; `HOW_IT_WINS_REFINEMENT`; the transport normalizer that reads a judgment out of XML `<parameter>` blocks; `main`'s reading state, `how-it-wins-reading.ts`; its display caps, six running and twelve in question; and the tautological hash inputs that guard the judgment cache key.

Ported from this branch: production bugs in the frozen writer (a `[e1, e2]` citation list that dropped a whole note, an unmarked note that cost the read) and in DeepSeek's off-peak pricing, which priced weekend UTC hours as peak; a sibling-name typo that used to fail silently and now throws; the `opus-5` quirk row; the crown's tightening pass; eval consolidation behind a shared `how-it-wins-eval-shared.ts`, a required `--cap`, and gate exit codes; 5,299 deleted lines across the three dead-code-removal commits above; and the Irregular-to-Keelson fixture swap.

The lesson absent from `main`'s own records: every suite that names `judgeHowItWinsForAnalysis` mocks it, so only the fallback was ever proven, never the real adapter. When two adapters exist for one call, the production one has to carry its own test, not borrow the mock's.

Spend: about $21 from the other session, about $17 from this one. Of this session's $17, the eight judge verdicts on the retired contract are sunk; six writer A/B cards survive under `eval/curation-writer-sitting/` (production build, then `EVAL_RIG_ENABLED=true EVAL_RIG_DATA_DIR=$PWD/eval/curation-writer-sitting npm run start -w @cold-start/web`, open `/eval/how-it-wins`). The Anthropic balance reached zero on 2026-08-26 before the last six cards could run.
