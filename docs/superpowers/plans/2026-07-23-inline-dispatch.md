# Kill the Queued hang: run user-facing generation in-process

Execution prompt for a fresh session. Scope-fenced; stop at the done definition.

## Why

On 2026-07-23 an Inngest Cloud incident held two organic basics runs in Queued for 290s and 188s before their functions were even created. The events were accepted instantly; the delay was entirely inside Inngest's dispatcher, before any request reached Vercel. Baseline dispatch is already mean 13.6s, p50 7.5s, outliers to 73s, and there is no app-side serve option that improves it (verified 2026-07-22). Evidence: `docs/qa/analysis-run-observations.md`, attack item 2 and the 2026-07-23 run-log entry.

The product's first paint must not depend on a third-party queue. The fix: the two user-facing run kinds (`basics`, `analysis`) execute in-process in the `/api/generate` invocation via `waitUntil`. Inngest stays for section jobs, contact enrichment, and card enrichment, where durability beats latency.

## Read first

- `CLAUDE.md` sections: Background work, Conventions, Data Layer.
- `apps/web/src/app/api/generate/route.ts` (run-row creation, conflict handling, the `inngest.send` tail).
- `apps/web/src/inngest/functions.ts` plus `generation-helpers.ts` (the generate-card function; note every `step.run` boundary).
- `docs/qa/analysis-run-observations.md` (attack list; item 5 explains the transient-vs-semantic failure split already shipped).

## Design decisions (already made, do not relitigate)

1. **One shared runner, two step adapters.** Extract the generate-card body so it runs against an injected step executor: the Inngest adapter wraps `step.run` (unchanged behavior, frozen step ids), the inline adapter executes directly with bounded in-process retry for transient failures (reuse `isTransientLlmError`; 2 attempts, then fail). No copy-pasted second pipeline. `generation-helpers.ts` is the existing seam; extend it.
2. **Route flow change is minimal.** Create the run row exactly as today, then `waitUntil(runner)` instead of `inngest.send` for basics and analysis. The 202 response, run rows, and progress events stay byte-identical so the extension and web feeds need zero changes.
3. **Rollback is an env flip.** `GENERATION_DISPATCH=inline|inngest`, default `inline`. The Inngest function stays registered; `inngest` restores today's behavior without a deploy revert.
4. **Failure marks the run failed.** A hard failure in the inline runner must land the row in `failed` with an error (existing failure helpers), never strand it in `running`. The panel's retry state is the recovery path; a 60-90s job re-click is acceptable.
5. **No step memoization inline.** A verify failure inside an inline analysis run retries in-process; if it still fails, the run fails and a re-click re-pays synthesis. Accept and note the cost delta in the observations log. Do not build a memoization layer.
6. **Route declares `maxDuration = 300`.** Basics is ~45-90s, analysis ~85s; both fit with margin. Fluid compute bills active CPU, and these runs are I/O-dominated, so cost is near-neutral.
7. **Dedup is already solved.** The unique index on active (slug, mode) guards double-queue; the inline runner claims the row the route just created.

## Phases

- **Phase 1: basics inline.** The runner extraction plus the route change, behind the env flag. This is the bulk of the work.
- **Phase 2: analysis inline.** Same runner, analysis branch (synthesis and verify included). Only start if Phase 1 is green through `npm run check` and a local trace.
- **Phase 3: stale-running watchdog.** `/api/generate` treats an active `running` row with no run events for over 5 minutes as dead (reuse the event-trail classification from `scripts/repair-stuck-generation-runs.ts`) and lets a new request proceed. Small; protects against an instance dying mid-inline-run.

## Scope fences (do NOT)

- Do not remove Inngest, migrate to another queue, or touch the enrichment workers or section-job path.
- Do not change any UI component; the event contract makes this invisible to the panel.
- Do not refactor beyond the runner extraction. No riders.
- Frozen surfaces stay frozen: Inngest event names, step ids, the API contract version (no route shape changes here).
- If Phase 1 is not green after roughly half a working session, stop, commit what is safe, and write a handoff. Do not push through with hacks.

## Done definition

1. Local: `npm run trace:generation` clean; a `dev:full` run shows the first progress event within ~2s of the 202.
2. `npm run check` green.
3. Deployed: one organic basics run and one analysis run in production with `generation.started` within 2s of the request row's `started_at` (query `generation_runs` and `research_run_events`).
4. Record the ship in `docs/qa/analysis-run-observations.md` (resolves attack item 2 for user-facing runs) and update the CLAUDE.md/AGENTS.md data-flow paragraph in both files.

Stop there. No extra polish, no follow-on items beyond filing them as one-line notes in the observations log.
