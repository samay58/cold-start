# September 15 review remediation

Two review passes over the September 14 wave (`d91a8af..5ff3732`) were merged into one ordered list of 21 items and worked by two sessions in one working tree with exclusive file ownership. The list, the per-item done-definitions, and the close state live in `docs/archive/plans/2026-09-15-review-remediation.md`. The work landed on main as nine commits (34f6d4d through 382d7ac), fast-forwarded and pushed on September 15 at 20:12 UTC.

## Verified

- Every terminal path of a How it wins job records `how-it-wins.complete` on its analysis run: the v2 notify step, a job already terminal when its run starts, cron expiry, expiry settled by the status GET, and admission failure with its reason code. One test per path. Without this, every 0.2.8 extension waited on "reading" until its eight-minute window ran out (98be5ad).
- Reservation rates derive from the pricing table the cost telemetry already uses. The hardcoded seven-model table is gone, and a model without a published rate refuses admission with a message naming it.
- A card edit landing mid-read no longer discards a paid read. The completion write retries the version guard up to five times; a real-Postgres test bumps `cards.version` inside the first attempt and asserts success.
- The v1 execution path is deleted. Inngest showed no v1 run since 02:59 UTC on September 15 and none running before the deletion. An event without execution contract version 2 is rejected before any database read.
- The reconcile cron runs every ten minutes in one step. Neon compute had stayed awake since the per-minute cron deployed: 54 percent of the branch's lifetime active seconds fell in the 15.6 hours after that deploy.
- The status route sends `deadlineAt` only to a client that asks for it, and the extension polls to that deadline plus a minute, with an eleven-minute fallback. This ships with the next extension build; 0.2.8 keeps its eight-minute window and now receives the completion event inside it.
- The Column one-off is a generic operator repair, `npm run repair:how-it-wins -- --slug <slug> --run-id <analysis-run-id> --budget-usd <usd> --apply`, with a unit test and no company literal in source.
- A retry job's `canRetry` reads the root row's manual-retry flag and budget, matching the route's 409.
- The parent run trace regains How it wins spend, `judgmentRef`, and `judgeSummary` from the job's attempts, idempotent on replay. `measure:how-it-wins` sums spend from `trace.llm.calls` alone. Adding `judgeSummary.calls` on top double counted the judge, and that double count predates the wave: the v1 path also copied paid judge calls into the ledger, and a cached judgment lists calls the run never paid for (34f6d4d).
- One canonical JSON serializer in core, `canonicalJsonString`. The judge's hash output is byte-identical, so memoized judgments keep their keys. The db repository now sorts keys by code unit instead of locale; checkpoint hashes changed while no job was running.
- `how-it-wins-jobs.ts` went from 1,170 lines to four modules: jobs 489, job-state 425, the internal rows leaf 260 (never re-exported), and `validation.ts` 67 with 28 tests, shared with `alpha.ts`. All 32 previously exported names still resolve from the package index. The module graph is acyclic (d34ef9b).
- The file-size ratchet: `check:file-size` fails `npm run check` and CI on any source file over 1,000 lines outside the allowlist inside the script, and the allowlist only shrinks. Six files remain listed; they and the six between 850 and 1,000 lines are the split targets for the next pass (06f0916).
- Job retention as its own 90-day kind through the guarded batch path (2ea51b8). Extraction fallback through one resolver with the host guard, failure classification by cause, funding provenance from single-round facts, and the `extraction-numbers` module deleted (6b1442e). Card face display decisions in the model layer with two extension fixtures (a24994e).
- The API contract stays `2026-08-19.how-it-wins-v1`. No existing route shape changed and `deadlineAt` is opt-in. The extension compares contracts with strict equality, so a bump would break every 0.2.8 install, and every tester is on 0.2.8.

## Gate

Full `npm run check` on the tree at a24994e plus the documentation edits in the closing commit: exit 0. Every step ran: lint, the file-size ratchet, typecheck, the vitest workspaces (web 633, extension 486, core 432, llm 359, providers 127, pipeline 98, ui 10, db 123 with 48 skipped because the dedicated integration env was not set), the node test files (scripts 104, eval 42), the real-Postgres suites (`test:cards-db` 27, `test:alpha-db` 21), the builds, the Firefox build and web-ext lint, the golden dry run, knip, the secret scan, and the dependency audit, which passed with four findings tied to thirteen known temporary advisories.

## Release boundary

Production served `5ff3732` at `dpl_7YNNdEYEFsGEW4TKeDM7mFj9MpG3` until the merge. It now serves `382d7ac` at `dpl_ANQNhiKoRM8Q2RJtPwTGdbU37qFK`, built from main (the build log clones `Commit: 382d7ac`), Ready at 20:14 UTC, aliased to `cold-start.semitechie.vc`. Migration 0019 is applied and this branch adds no migration. The extension changes (deadline polling) reach testers only with the next build; the server-side completion event reaches the installed 0.2.8 immediately after deploy. Roll back How it wins with `HOW_IT_WINS_ENABLED=false` and a redeploy, as before.

Follow-ups filed in the plan and not done here: the split wave (item 21), SQL function bodies as source files, the two disagreeing compact-currency formatters, withheld sections without a reason, the citation-marker allowlist, the parallel normalizer families, the missing gemini-2.5-flash pricing row, and the funding-evidence display restriction that needs a product call.

## Production after the deploy

- The full `npm run check` ran once more on the exact tree of `382d7ac` before the merge: exit 0.
- The analysis run for `cursor` (`48e9f329`, started 20:10 UTC, two minutes before the deploy) reached its `hiw-v2-notify` step at 20:15:09 UTC, after the new deployment was Ready. The run's trail carries one `how-it-wins.complete` event with `metadata.status: read`, and `trace.howItWins.status` is `read`. The Inngest run is `01M2KB49D9KYJRYRCVHYN8JJKZ`, 222 seconds end to end.
- The `heyclicky` run (`f5dfea75`, 20:01 UTC) closed the same way on the previous deployment, so the success path was never the broken one; the fix is for every other terminal path, which no production run had exercised by the time of this record.
- Pre-fix runs stuck at `deferred`: exactly one across production. `enterpret` (`b6eb4776`, 17:15 UTC) has a succeeded job (`fb8e95a1`, outcome `nothing_stands_out`) and no completion event, so a 0.2.8 panel on that card waited out its eight-minute window. No `deferred` run without a job row exists. Backfilling that one event and trace field is a decision for Samay; `repair:how-it-wins` admits a new paid job and is the wrong tool for it.
