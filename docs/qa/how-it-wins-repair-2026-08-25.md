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
