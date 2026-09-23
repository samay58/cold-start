Status: shipped 2026-09-15 (a88d114).

# Review remediation, September 15 2026

Branch `review/2026-09-15-tighten`, cut from main at `5ff3732`. Nothing committed yet. Two review passes over the September 14 wave (`d91a8af..5ff3732`) were merged into one list. Every item below was verified against the code before it was listed.

## State on disk at handoff

- Done and tested, uncommitted: retention kind for How it wins jobs, README env rows, card face model layer, two extension fixtures (packet B). Provider fallback consolidation, failure classification via `cause`, funding provenance, `extraction-numbers` deleted, stage policy table (packet C).
- Done and tested, uncommitted: packet A on the How it wins runtime (items 3, 4, 5, 7 cadence, 18). It reported 44 How it wins tests, the web (617), db (95), pipeline (98), `test:cards-db` (25), and scripts (91) suites green, plus typecheck, lint, and knip. Packet A also deleted the Column function and `scripts/retry-how-it-wins.ts`; item 8 restores that path in generic form. Nothing is running at handoff. Still start by running `git status --short` and `git diff --stat`.
- Full `npm run check` was green on `5ff3732` before any edit.

## Claims

A session claims a role by appending one line here before editing: `role N, session started <time>`. If role 1 is already claimed, take role 2. Never edit a file the other role owns.

role 1, session started 15:07
role 2, session started 15:08
role 2 note for role 1, 15:40: items 14a, 17, 19 are committed (34f6d4d). Role 2 starts item 16 only once `git status` shows `packages/db/src/repositories/how-it-wins-jobs.ts` and its integration test committed, so please commit 4, 9, and 14b as soon as they are marked done; a split over your uncommitted edits would fold them into a role 2 commit.

Role 1 notes for role 2 (15:20): item 8 rebuilds the script as `scripts/repair-how-it-wins.ts` behind `npm run repair:how-it-wins -- --slug <slug> --run-id <analysis run uuid> --budget-usd <usd>` (read-only report; add `--apply` to admit and dispatch), so item 19's docs/deployment.md line should read that way. The packet B and C files (README, retention route and script, card face model, extension fixture, llm extraction and provider files, core failure-code and funding-preservation, package.json, packages/core/tests/exact-integer.test.ts) belong to neither role's list; whoever runs the final gate commits them so the branch is whole.

Role 1 done (16:2x): items 1, 2, 6, 7, 8, 9, 11, 14b, 15 committed as `98be5ad` on this branch, role 1 paths only. Items 4, 9, and 14b are done, so item 16 is unblocked. The packet B and C files listed above plus this plan and `packages/core/tests/exact-integer.test.ts` are still uncommitted for the gate commit. Verified before the commit: typecheck, lint, knip, web How it wins suites (79), scripts tests (104), extension tests (486), `test:cards-db` (27).

## Roles and file ownership

Role 1, runtime. Owns `apps/web/src/inngest/how-it-wins*.ts`, `worker-env.ts`, the How it wins parts of `functions.ts`, `apps/web/src/app/api/inngest/route.ts`, `apps/web/src/app/api/extension/cards/[slug]/how-it-wins/route.ts`, `packages/db/src/repositories/how-it-wins-jobs.ts` and its integration test, `packages/core/src/how-it-wins-job.ts`, `apps/web/tests/how-it-wins*`, `apps/extension/src/research/how-it-wins-reading.ts` and its tests, `scripts/retry-how-it-wins.ts`, the `repair:how-it-wins` line in `package.json`, and the How it wins paragraphs of CLAUDE.md and AGENTS.md.

Role 2, structure and gate. Owns `packages/core/src/canonical-json.ts` (new) and its test, `packages/llm/src/how-it-wins-judge.ts` (hasher import only), `packages/llm/src/index.ts`, `packages/db/src/validation.ts` (new), `packages/db/src/repositories/alpha.ts` (helper imports only), the four test files that repeat the extraction prefix literal, and the repository split (item 16) only after role 1 marks items 4, 9, and 14b done here. Role 2 also owns `scripts/check-file-size.ts` and its test, the `check:file-size` lines in `package.json` and `.github/workflows/check.yml` (item 20). Role 2 runs the final `npm run check` and writes the QA record.

## Ordered items

Source: "A" is the session that ran the four-agent review on September 15. "B" is the second review pass. "Both" means both found it.

| # | Item | Source | Role | Done-definition | Status |
|---|---|---|---|---|---|
| 1 | `how-it-wins.complete` on every path: admission failure in `functions.ts`, v2 rejection when the job row exists, cancelled before the card loads, expiry by cron and by the status GET. Resolve domain before the try block so notify never needs the card. Reconcile records the event and the trace patch per expired job. | B | 1 | One test per path records the event with status and reason and moves `trace.howItWins.status` off `deferred`. Extension 0.2.8 (every tester today) hangs on "reading" without this. | done; admission failure also persists the trace (step persist-how-it-wins-admission-failure) |
| 2 | Admission failure names its reason. The catch in `functions.ts` records reasonCode and message on the trace step and the event. Delete the hardcoded RATES table; derive reservations from `packages/llm/src/pricing.ts`. Missing `HOW_IT_WINS_JOB_BUDGET_USD` gets the same explicit reason. | Both | 1 | A test proves every model in the current table reserves the same or more from `pricing.ts`, never less. If `pricing.ts` lacks a needed rate, stop and report. | done; note: any model with a published rate now admits (haiku, kimi), unknown models still refuse with a message |
| 3 | Parent trace regains How it wins spend, `judgmentRef`, `judgeSummary`, derived from the job row's attempts. Idempotent via one memoized step and label dedupe. | A | 1 | v2 tests: cost rows after success, failed call rows retained, no duplicates on replay. `measure:how-it-wins` fields populated. | done |
| 4 | Concurrent card write no longer discards a paid read. Bounded CAS retry in `completeHowItWinsJobWithCard`; final `card_changed` maps to retry-eligible `internal_storage`. | A | 1 | Real-Postgres test bumps `cards.version` inside the first `verifyAndMutate` and asserts `succeeded`. | done |
| 5 | Delete the v1 execution path. Keep event `card/how-it-wins.requested`, function id `how-it-wins-read`, v2 step ids, `howItWinsEvaluatorFor`, `howItWinsJudgeInputs`, `howItWinsJudgeSummary`. Non-v2 events return rejected with no DB write. | Both | 1 | Inngest verified on September 15: no v1 run since 02:59 UTC, none running. Legacy tests ported or deleted; routing test added. | done |
| 6 | Poll window from the job deadline. Summary carries `deadlineAt` (additive field). Extension polls to deadline plus 60 s, fallback 11 min when absent. | B | 1 | Extension test for both cases. Note the change ships only with the next extension build. | done; ships with the next extension build, 0.2.8 keeps its 8 min window |
| 7 | Reconcile cron every 10 minutes, three unconditional steps collapsed into one `step.run`. The per-minute tick kept Neon compute awake since deploy: 54 percent of the branch's lifetime active seconds accrued in the 15.6 hours after the deploy. | Both | 1 | Config plus test plus a two-line comment. | done |
| 8 | Column one-off becomes `requestOperatorHowItWinsRepair(db, principal, { slug, sourceAnalysisRunId, capMicrodollars })` with the same preconditions; `repair:how-it-wins --slug --run-id --budget-usd --apply`; the hardcoded run id in v2 notify is gone. | Both, B's shape | 1 | No company literal in src. Script unit test. Packet A deleted the function and script; rebuild both in generic form. | done; scripts/repair-how-it-wins.ts, `repair:how-it-wins -- --slug --run-id --budget-usd [--apply]`, deferred runs allowed as well as failed |
| 9 | `canRetry` for a retry job reads `manual_retry_used` and budget from the root row. | B | 1 | Integration test: failed retry row with exhausted root answers `canRetry: false`, matching the route's 409. | done |
| 10 | Job retention as its own fixed 90-day kind through the guarded batch path, in the cron route and `alpha:prune`. | Both | done | Tests in db, route, and script. | done |
| 11 | CLAUDE.md synced to AGENTS.md for the job system: `how_it_wins_jobs`, migration 0019, v2 handler, reconcile, both env vars, the status route, the generic repair command. Remove the v1 step names at CLAUDE.md line 146, the crown paragraph at 203, and `buildHowItWinsRequestedEvent` at 208. | Both | 1 | Same commit as the architecture change. Contract is NOT bumped: no existing shape changed, and `extension-config.ts:171` compares contracts with strict equality, so a bump breaks every 0.2.8 install. | done; CLAUDE.md and AGENTS.md in the runtime commit |
| 12 | One fallback resolver and host guard (`extract_full` in `LlmFallbackStage`, `off` sentinel, `assertDistinctProviderHost`); failure classification via `cause`; funding provenance (single-round citations only, status from the supplying fact, never `unknown` with a value); `extraction-numbers` deleted; extract-only request policy in `stageRequestPolicies`. | A, plus B's 13 | done | Core 426, llm 359, pipeline 98 tests green. | done |
| 13 | Card face: `hasPeopleContent` via `peopleRows`; financing full-text decision in `model.ts`; extension fixtures for superseded and first-time failure. | A | done | Tests green. | done |
| 14 | One canonical JSON hasher in core with plain sort. 14a: core helper plus llm judge import (role 2). 14b: db repository imports it (role 1). Checkpoint hashes change; safe because no job is running at deploy. | B | 2 then 1 | Mixed-case key test. Both packages import the same function. | 14a done, committed (role 2): core exports `canonicalJsonString` from `packages/core/src/canonical-json.ts`, pure, no node crypto, because core ships in the extension bundle. Each package keeps its one-line sha256 wrapper. 14b was: replace `stableJson` in the db repository with `canonicalJsonString` and keep `hashJson`.; 14b done |
| 15 | v2 handler split into `resolveJudgment`, `runWriter`, `runVerifier` taking `{db, job, config, execution}`; reason-to-status map replaces the ternary chains. | B | 1 | Handler under 80 lines. Existing v2 and execution tests pass unchanged. | done; handler 61 lines, stages resolveJudgment, runWriter, runVerifier |
| 16 | Split `how-it-wins-jobs.ts` (1195 lines) into jobs (admission, dispatch, lease, lifecycle, row mapping) and job-state (call accounting, checkpoints, recovery payloads). Lift the assertion helpers into `packages/db/src/validation.ts`; `alpha.ts` uses them too. | B | 2, last | Pure move. `test:alpha-db` and `test:cards-db` green. Starts only after role 1 marks 4, 9, 14b done. | done, committed d34ef9b: jobs 489 lines, job-state 425, rows 260 (internal), validation 67 with 28 tests; alpha.ts uses the shared helpers; export parity 32 of 32 |
| 17 | Narrow `export * from "./how-it-wins-output-diagnostics"` in `packages/llm/src/index.ts` to the types the judge's signatures need. Replace the prefix literal in the four app test files with `EXTRACTION_UNAVAILABLE_PREFIX`. | B, plus A | 2 | knip clean. | done, committed |
| 18 | Budget merged into execution, reconcile into function; `howItWinsRetryEnabled()` and `howItWinsJobBudgetMicrodollars()` in `worker-env.ts`; dead exports `renewHowItWinsJobLease` and `advanceHowItWinsJobStage` removed; one `validationIssues` helper. | A | 1 | Five How it wins modules. typecheck and knip green. | done |
| 19 | `scripts/measure-how-it-wins.ts` adds `judgeSummary.calls` to `trace.llm.calls[stage=how_it_wins]`, so item 3 re-exposes a judge double count in `howItWinsCostUsd`. Count one source. Also `docs/deployment.md` line 30 still documents `repair:how-it-wins` in its old form. | A | 2 | Script test with a trace carrying both; the docs line matches the generic command from item 8. | done, committed; ledger-only cost, since the v1 path also copied paid judge calls into the ledger and a cached judgment lists calls the run never paid for |

## Code hygiene (added September 15 at Samay's direction)

Samay's words: optimal hygiene means no sloppy bloated code files; everything tight and split optimally, because that is what lets the next model or person reason about the code. Size is the symptom, cohesion is the rule: a module changes for one reason.

Baseline measured September 15 over `apps/*/src`, `packages/*/src`, and `scripts`, tests excluded: 309 source files, 37 at 500 lines or more, 14 at 800 or more, 7 at 1,000 or more. The seven: `apps/extension/src/sidepanel.tsx` 1981, `apps/web/src/inngest/functions.ts` 1590, `packages/pipeline/src/generate-card.ts` 1262, `scripts/alpha-status.ts` 1244, `packages/db/src/repositories/how-it-wins-jobs.ts` 1170 (item 16), `apps/extension/src/research/ResearchLayerPanel.tsx` 1091, `packages/providers/src/stableenrich/people.ts` 1057. Next six: `packages/llm/src/extraction.ts` 997, `packages/db/src/repositories/alpha.ts` 964, `packages/llm/src/how-it-wins-judge.ts` 953, `apps/web/src/app/api/generate/route.ts` 936, `packages/llm/src/how-it-wins-judge-adapter.ts` 907, `apps/web/src/inngest/contact-enrichment.ts` 888. Largest tests: `packages/pipeline/tests/generate-card.test.ts` 2379, `packages/db/tests/repository.test.ts` 2321, `apps/web/tests/generate-route.test.ts` 2188, `packages/llm/tests/how-it-wins-judge.test.ts` 2071.

| # | Item | Source | Role | Done-definition | Status |
|---|---|---|---|---|---|
| 20 | File-size ratchet. `scripts/check-file-size.ts` fails when a non-test source file under `apps/*/src`, `packages/*/src`, or `scripts/` exceeds 1,000 lines unless it is on the allowlist inside the script. The allowlist starts with the seven files above and may only shrink; an entry whose file drops under the limit fails the check until it is removed. Wired into `npm run check` and the CI workflow as `check:file-size`. | Samay | 2 | Script unit test. `npm run check:file-size` green on the current tree. CLAUDE.md and AGENTS.md convention line lands after role 1's docs commit, to avoid two sessions editing one file. | done, committed 06f0916; convention bullet in CLAUDE.md and AGENTS.md lands with the QA record commit |
| 21 | Split wave, next pass, one Sonnet packet per file with exclusive ownership. Targets: the seven files over 1,000 lines (item 16 covers one) and the six between 850 and 1,000. Pure moves only: tests unchanged or moved with their code, barrels keep callers unchanged, each resulting module under 600 lines, and the seam named from a read of the file, not from its name. Starts after this pass merges, because items 1, 2, 8, and 15 are editing `functions.ts` and the How it wins modules now. | Samay | next pass | Per file: under the target, `npm run check` green, no behavior change, allowlist entry removed. | queued |

## Constraints

- Inngest event names and step ids are frozen.
- The Neon HTTP driver has no interactive transactions and no `SELECT ... FOR UPDATE` outside Postgres functions. Use `db.batch`, the existing SQL functions, or the `cards.version` CAS.
- Migration 0019 is applied in production and is immutable. Vercel deploys do not run Neon migrations.
- No em-dashes anywhere, commit messages included. Commit only paths your role owns. Never `git checkout`, `stash`, or `reset` to clean the tree; the other role's edits live there.
- Verify with Inngest before any deletion that depends on drain.

## Bar for done

`npm run check` green at the repo root. CLAUDE.md and AGENTS.md updated in the same commit as any architecture change. Contract version unchanged unless an existing route shape changes. Branch stays unpushed; merge and deploy are Samay's call.

## Follow-ups filed, not this pass

- SQL function bodies as `packages/db/sql/functions/*.sql` source of truth (B's item 15).
- `formatCompactCurrency` in `funding-evidence.ts` versus `formatCompactUsd` in `money-format.ts`: they disagree between one and ten million.
- Withheld research sections record no reason.
- `citationMarkerTextKeys` allowlist may miss marker-bearing fields.
- Full and block extraction keep parallel normalizer families.
- No `pricing.ts` row for `openrouter/google/gemini-2.5-flash`; OpenRouter reports cost, so the gap is convention only.
- `fundingEvidenceFromCitations` restriction also suppresses funding display in the extension header and financing layer; product call.

## Structural follow-ups from the closing review (Opus, September 15, no slop found)

Polish, not bugs; each is one small commit for the next pass. `generation-trace.ts:285` types `reasonCode` as `HowItWinsJobReasonCode` instead of string. `how-it-wins-execution.ts:43-68` stops filing an unpriced model, a non-integer token cap, and a non-finite deadline under `authentication_configuration`; give them a configuration code. `howItWinsCallReservation` says in its name that it returns microdollars and states the USD-per-million equals microdollars-per-token identity once. `alpha-retention.ts:122-134` stops hand-copying the prune predicate; export one `countPrunableHowItWinsJobs`. `llm-provider.ts:301-307` drops the two non-null assertions by inlining the ternary; `stageRequestPolicies` is keyed by `LlmCallStage`. `validation.ts` splits its SQL coercions into `sql-values.ts`. The status GET caps its settlement drain well under 20 jobs or hands it to the cron. `extension-config.ts:504` passes `deadline` into the request builder instead of stripping the query it just added. `alpha-prune.ts:47-70` returns to two typed shapes. Reader traps to state in a comment: `funding-preservation.ts:40-47` status from saved sources while confidence still includes the incoming fact; `SectionRows.tsx:90` dropped the composite React key on financing extras; `failure-code.ts` uses `includes` for the code and `startsWith` for the message on purpose; `extraction-recovery.ts:53-58` classifies a same-host misconfiguration from the provider error because `cause` wins.

## Evidence recorded on September 15

- Inngest `how-it-wins-read` runs since 2026-09-14 19:00 UTC: seven, all completed, none running; every run after 02:59 UTC used the v2 path.
- Neon project `red-darkness-56278017`, Launch plan: `compute_last_active_at` matches the last reconcile tick; lifetime active 103,824 s, of which 56,160 s fell in the 15.6 hours after the reconcile cron deployed.
- Production deployment `dpl_7YNNdEYEFsGEW4TKeDM7mFj9MpG3` serves `5ff3732`. Migration 0019 is applied (20 rows in `drizzle.__drizzle_migrations`).

## Close, September 15

Eight commits on `review/2026-09-15-tighten`, unpushed: 34f6d4d canonical serializer and ledger-only spend, 06f0916 file-size ratchet, 98be5ad every How it wins trail closed and pricing-derived reservations (role 1, items 1, 2, 4 through 9, 11, 14b, 15, 18), d34ef9b jobs repository split, 6b1442e extraction fallback and failure cause and funding provenance, 2ea51b8 job retention kind, a24994e card face model layer, and the closing commit with the docs convention line, this plan, and the QA record `docs/qa/review-remediation-2026-09-15.md`. Full `npm run check` exit 0 on the tree at a24994e plus the doc edits. Items 1 through 20 done. Item 21, the split wave over the six allowlisted files and the six between 850 and 1,000 lines, starts after this branch merges. Merge and deploy are Samay's call.

Merged and deployed the same afternoon: main 5ff3732..382d7ac, Vercel dpl_ANQNhiKoRM8Q2RJtPwTGdbU37qFK, Inngest synced with the ten-minute reconcile. The closing Opus bug review confirmed two items fixed in the follow-up commit on main: a reconcile tick that threw mid-sweep left rows expired but unannounced (the sweep now re-announces every job that turned terminal in the last thirty minutes, and the recorder returns early once the event exists), and a flag-off cancellation reported as failed instead of skipped. Filed, not fixed: a narrow duplicate `how-it-wins.complete` when the sweep expires a lease while its run is still alive (the panel's stage map is idempotent), and claude-sonnet-5 reserving 6/15 instead of 4/10 per million from the pricing table (over-reserves, direction safe).

Next steps: extension 0.2.9 with deadline polling needs the Chrome Web Store upload (installed 0.2.8 already receives the completion event); item 21 split wave; the ten structural polish items above.

