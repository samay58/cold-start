# How it wins repair, 2026-08-25

Branch `how-it-wins-repair` in the worktree `~/Projects/active/cold-start-hiw`. Not pushed (the auto-mode classifier refused every `git push`). Deployed to Vercel production from that tree with `HOW_IT_WINS_ENABLED=false`.

## What works now

The production judge path makes real streaming calls and produces reads. Four corpus cards ran end to end through the exact code production runs (judge, critic, patch adjudication, frozen writer, verifier): Cognition read with 2 running and 9 in question, August read with 1 running, 2 not yet, 7 in question, DatologyAI read with 3 running and 7 in question, Friend read with 2 running and 5 in question. Zero writer citation drops, zero verifier drops on those four. The prose on Cognition and August clears the memo bar.

No production run can be pointed at yet: migration 0018 is not on Neon (classifier refused the guarded flow twice) and the flag is off.

## Latency and cost, measured

Before (2026-08-23 benchmark, the only successful judge calls that existed): judge median 316 s, 31,902 output tokens, $1.07 per call; production itself failed in 18 ms every time.

After, on the same judge model (claude-opus-5):
- Judge: 12,516 output tokens, 133 s cold ($0.81 with the 1h cache write); 11,912 tokens, 127 s warm ($0.39).
- Critic (deepseek-v4-pro): 19 to 22 s, $0.02 to $0.03.
- Adjudication as a patch: 3.8k to 4.2k output tokens, 41 to 45 s, $0.64 cold, $0.26 warm (was 16.6k tokens, 144 s, $0.81, and rejected).
- Frozen writer (claude-opus-5): 4.5k tokens, 55 s, $0.23.
- One read end to end: $1.73 and 276 s cold, $1.01 and 299 s warm (Cognition, August). DatologyAI $0.92 / 187 s, Friend $0.54 / 178 s.
- All of it now runs in a background Inngest function after the analysis run returns; analysis latency is back to its pre-8/19 shape.

## The collapse

Measured on the four 8/24 replays: Cognition 5 judged current, 4 after the running cap, 2 after the verifier; August 4, 4, 4 with in-question 9 capped to 8; Hebbia and Bland 1 current each, turned into nothing at all by the under-two rule; zero writer citation drops anywhere. Changes: running floor 1 (was 2), running cap 6 (was 4), in-question cap 12 (was 8), the verifier degrades only at zero survivors, the crown never renders empty while in-question rows exist.

New today: the critic-and-adjudication loop lands (it never did before) and trims current labels: Cognition 4 to 2, August 4 to 1, with cited reasons. `HOW_IT_WINS_REFINEMENT=off` turns it off for a blind A/B.

Specialization sits on 3 of 4 filed reads. The frequency gate needs 10 reads and the batch stopped at 4.

## Spend

$10.50 of the $40 cap: three Cognition attempts ($4.47, two of them diagnostic failures now fixed in code), Cognition plus August ($2.74), the fifteen-card batch ($3.29 for four cards before the Anthropic key ran out of credit: `400 Your credit balance is too low`). Eleven cards were skipped by the empty balance.

## What is left, one command each

1. `set -a; source .env.production.migrate.local; set +a; COLD_START_PRODUCTION_MIGRATION=1 npm run db:migrate:production` (adds `how_it_wins_judgments`; additive).
2. Add Anthropic credit. If production shares the key in `.env.local`, every Anthropic call in production is failing right now.
3. `cd ~/Projects/active/cold-start-hiw && git push -u origin how-it-wins-repair && git push origin how-it-wins-repair:main` (fast-forward; main has not moved).
4. `printf 'true' | npx vercel env add HOW_IT_WINS_ENABLED production --force` then `npx vercel --prod --yes` (env changes only apply to new deployments).
5. Run one analysis in the panel and `npm run measure:how-it-wins` to see the run.
6. Upload `dist/chrome-web-store/cold-start-chrome-0.2.8-c06d39fd65cf.zip` (SHA `31b6696f…`); 0.2.7 is superseded.
7. `npm run eval:how-it-wins:batch -- --limit 15 --seed 825 --budget-usd 18 --parallel 2` for the frequency gate; the four judged cards are cached and free.
8. The holdout ten are untouched; `/eval/how-it-wins` on a production build is one command away as before.

## Least sure

1. Whether the refinement loop's trimming is the read you want. It is defensible on the reasons, and the switch exists.
2. Whether Vercel synced the new Inngest function on this deploy; the Inngest dashboard is the only place that shows it, and I could not reach it.

## Completion pass, 2026-08-26

Handoff items 1, 3, and 4 above landed on the night of 2026-08-25: migration 0018 is applied on Neon, `origin/main` is at `ddfa1d9`, and production runs with `HOW_IT_WINS_ENABLED=true`, judge and writer on `claude-opus-5`. This pass proved the flag, finished the frequency measurement, audited the judge against its own verdicts, and fixed what the audit and the first live run turned up.

### The production run

Run `725a7e20-23e3-4f81-bc6e-d41dac336826`, agentmail.to, started from a session with the operator token and the store extension id (the same request the panel sends). Analysis: 79 s, $0.13, `how-it-wins.started` at 03:36:52Z. Background read: judgment row at 03:38:58Z, `how-it-wins.complete` with `status: read` at 03:39:55Z, 3 minutes 3 seconds after dispatch. Judge 11,382 output tokens, 122.7 s, $0.456; critic 44 tokens, 1.7 s, $0.033 (an empty findings list, seen on 3 of 15 cards); writer and verifier about $0.27. Crown: 2 running (specialization, low friction), 1 not yet (omnipresence), 9 in question. The Inngest function is synced; the judgment row is the proof.

The run's `cost_usd` read $0.40 against a $0.49 judge: judge calls lived only in the judgment's own call list and `cost_usd` derives from `trace.llm`. Fixed in `698a392`: a paid judgment's calls join the parent run's LLM ledger; a cached one adds nothing.

### Measure script

Before the run: 23 analysis runs over 14 days, `enabled_false` 12, `absent` 9, `fail_closed` 2 (elicit and laundryheap, the two pre-repair rows whose trace said `nothing_stands_out` while the step said `failed`). After: one `read`. The cost section showed the ledger gap as a 190% share, which is how it was caught.

### The audit

Nine judged companies, 97 open-question rows, every current label's own mechanism text, read against the rubric rows. Four findings.

Specialization was current on 8 of 9, and the judge's mechanism text read "one narrow job", "one device", "one product", which the rubric already listed as the false positive. The critic cut the specific, measured labels (Cognition's Windsurf acquisition, $73M ARR on under $20M lifetime burn) for lacking a comparative baseline and kept the generic one, because a state makes no falsifiable claim. 71 of 97 open-question rows were "could be" speculation with no counterevidence, shown in the crown as the same four maybes (alliance, first mover, efficiency, divergence) on 5 to 6 of 9 cards. Every current row's dimensions read central, material, independent, necessary; they gated nothing. Fixed in `33601a0`: the specialization row demands a fit broader rivals demonstrably lack; first mover, alliance, efficiency, and divergence gain the false positives the judge kept tripping; the standard names the obtainable fact for an open question, makes category baseline a current gate with a named reference class, and says outright that small, early, focused, and lean are the default state of a startup; the critic attacks generic labels first; the eval gate also runs over in-question labels; a `nothing_stands_out` verdict drops the writer's stray extras instead of losing the paid read (Boom Supersonic, $1.32); a test pins the frozen spec text to the markdown, since no regen script exists.

### The batch, before and after

Old rubric (`2026-08-25-2257`, stopped at 10 records, $9.18) against new rubric (`2026-08-25-2329`, 10 cards, $11.22, seed 825, cap reached with tryprofound and minimax skipped), same companies:

| slug | old running | new running | in question old to new |
| --- | --- | --- | --- |
| huckberry | hybrid, curation, charm, specialization | hybrid, divergence | 5 to 9 |
| datologyai | curation, specialization | efficiency | 7 to 6 |
| sparxell | specialization, divergence | nothing | 4 to 6 |
| friend | specialization | nothing | 6 to 5 |
| deepinfra | specialization, efficiency | specialization | 7 to 9 |
| tavily | specialization, low friction | specialization | 9 to 6 |
| butter | composability, specialization | composability | 7 to 4 |
| attio | nothing | nothing | 6 to 6 |
| humandelta | specialization | nothing | 6 to 0 |
| boomsupersonic | failed (writer) | specialization | 5 |

Specialization running: 8 of 9 to 3 of 9, and where it survives the judge now cites an outcome (DeepInfra's owned fleet at five trillion tokens a week, Tavily's 100 enterprise accounts and 17x ARR). Nothing stands out: 1 to 4. Open-question counts did not fall. Gate: running passes (6 reads, under the 10-read floor; specialization 0.50); in question fails, alliance 0.60 over 10 judged cards, then divergence and first mover at 0.50. New-rubric costs: median $1.01 a card, max $1.72; judge latency median 197 s, inflated by four cards that paid a failed first judge call (`materialBets` written as a bare object, a JSON string, or XML `<parameter>` blocks; two of ten the night before hit the same). Fixed in `aa589f0`: those shapes read instead of re-asking; the transport hash does not move.

Two things the new rubric did that want a human read. The critic's "no comparative baseline" is now the dominant cutter and it took Huckberry's curation and charm and DatologyAI's curation along with the generic labels; four of ten companies now file nothing stands out. And a nothing-stands-out card with six could-be questions under it is thin, which makes the open-question fix the next lever.

### Next lever: the in-question list

The judgment's top-level open questions are specific ("What does Sparxell charge per kilogram relative to synthetic and other bio-based pigments?", with why it matters and what evidence answers it, three to four per card). The strategy rows marked `open_question` are the filler, and the crown renders those rows, not the questions. Only 101 of 135 such rows across 21 verdicts are named by a real question's `affectedStrategyIds`. Two options, both Samay's call: in code, demote any `open_question` row no top-level question names to `insufficient_evidence` (a 25% cut, deterministic, no prompt change); or render the top-level questions themselves as the crown's in-question section, three to four lines, each tagged with the strategies it would move. The second is the honest product and it changes `HowItWinsEdge` and the writer payload.

### Refinement A/B, prepared, not run

Arm A is `2026-08-25-2329`. Arm B is the same twelve cards, same seed, critic and adjudication skipped; the cache key includes the setting, so B judges fresh, about $0.40 to $1.00 a card.

```bash
cd ~/Projects/active/cold-start-hiw && set -a; source .env.local; set +a
npm run eval:how-it-wins:batch -- --limit 12 --seed 825 --budget-usd 11 --parallel 2 --no-refinement
```

Each run writes its own stamped directory with one `{slug}.json` record per card (`filed` holds the read, `judgeCurrent` the labels kept, `refinement` what the critic changed). To sit on them blind: an adapter walks the slugs present in both directories, writes one arm file per slug in the shape `/eval/how-it-wins` already reads (`name`, `domain`, `arms.A` and `arms.B` each `{read}` or `{failure}`), assigns which arm lands on A by seed the way `armAssignment` in `scripts/how-it-wins-corpus.ts` does, and writes the A-to-refinement map into the answer key the page never serializes. Point `EVAL_RIG_DATA_DIR` at that directory and build for production. The holdout ten stay out.

### Retention and loose ends

`how_it_wins_judgments` prunes at 90 days by `created_at` in the retention cron and `alpha:prune`, with its own 10,000-row cap (`7978fdc`). The missing doc rows, the env docs, and the call map's deferred-read and 1h-cache notes landed in `7e90fdd`, `80cc211`, `254a3d9`. `judgeSummary.refinement.repairs` was already typed.

### The review branch

The main checkout is on `review/how-it-wins-tighten`, eleven commits that fork from `253a9f0` (the same base as this repair) and are not on main, plus an uncommitted diff adding a second judgment-reuse path over `generation_runs.trace_json`. Samay's 8/25 decision was that the repair session should start from that branch; it started from main instead, which is how the collision happened. That branch deletes `scripts/measure-how-it-wins.ts`, the topology benchmark, and about 18,000 lines. It does not merge onto the repair head. Which line survives is Samay's call; the cheapest reconciliation if the shipped line stays is to cherry-pick that branch's pure deletions and its fixture swap onto main and drop its trace_json reuse path.

### Spend

$9.18 old-rubric batch, $11.22 new-rubric batch, about $0.75 in production: $21.15 of the $25 cap.
