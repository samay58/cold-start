# Evo Autoresearch Pilot

## Phase 1: Generation Speed And Cost

Use Evo for one narrow loop first: make generation faster and cheaper without weakening card quality.

The benchmark is `npm run evo:generation-benchmark`. It scores recent generation traces and cached cards for the golden-company slice, then weights no-fact provider calls through the current repo's provider budget registry so code changes to timeout and paid endpoint policy can move the score. Higher is better. The score rewards lower `firstUsableCardMs`, lower contact readiness latency, lower run cost, less no-fact provider time, tighter no-fact timeout and cost budgets, complete public-card basics, and citation depth. The no-fact budget terms use a reciprocal curve so incremental timeout/cost reductions show up before the system reaches an ideal target. It penalizes missing core fields, provider failures, and slow provider endpoints that return no facts.

Default gate:

```bash
npm run evo:generation-gate -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.production.migrate.local --limit 12 --min-score 25
```

Evo's stored benchmark and gates must run against the candidate worktree, not the parent checkout:

```bash
evo config set benchmark 'npm --prefix {worktree} run evo:generation-benchmark -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.production.migrate.local --limit 12 --json'
evo config set gate 'npm --prefix {worktree} run evo:generation-gate -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.production.migrate.local --limit 12 --min-score 25'
evo gate add root --name generation_score_floor --command 'npm --prefix {worktree} run evo:generation-gate -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.production.migrate.local --limit 12 --min-score 25'
evo gate add root --name golden_dry_run --command 'npm --prefix {worktree} run eval:golden -- --dry-run --limit 12'
```

Baseline Evo setup should use local worktrees only and should not pay for fresh provider or LLM calls. Paid live evals require explicit approval.

Required gates for promoted winners:

```bash
npm run eval:golden -- --dry-run --limit 12
npm test -w @cold-start/core -- generation-quality
npm test -w @cold-start/providers -- provider-budget
npm test -w @cold-start/pipeline -- cost
npm test -w @cold-start/web -- generate-route extension-bootstrap-route
```

Acceptance:

- First usable p90 improves or stays flat while average cost drops.
- No public synthesis leak.
- No increase in missing identity, funding, team, or citation basics.
- Median citations stay at or above baseline.
- Provider failures do not increase.
- Winning diffs are human-reviewed before merging.

## Phase 2: UX Speed And Snappiness

Only start this after Phase 1 works well enough to trust: repeated Evo rounds produce useful generation speed/cost improvements without degrading coverage, citations, provider reliability, or synthesis safety.

The second lane optimizes perceived app responsiveness across the public card and Chrome extension: sidebar boot time, public card render time, interaction delay, loading-state clarity, route/API cache behavior, bundle weight, and UI test stability.

The benchmark is `npm run evo:ux-benchmark`. It starts local Next and extension side-panel servers, measures home, public-card, and extension render readiness with Playwright, captures console and runtime errors, checks visible layout overflow, and includes extension bundle gzip size. Higher is better. The score rewards faster visible render, faster document readiness, smaller extension JS, and no runtime/layout failures. It penalizes console errors, page errors, visible app errors, layout overflow, and layout shift.

Default gate:

```bash
npm run evo:ux-gate -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.local --min-score 60
```

Evo's stored UX benchmark and gates must run against the candidate worktree:

```bash
evo config set benchmark 'npm --prefix {worktree} run evo:ux-benchmark -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.local --json'
evo config set gate 'npm --prefix {worktree} run evo:ux-gate -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.local --min-score 60'
evo gate add root --name ux_score_floor --command 'npm --prefix {worktree} run evo:ux-gate -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.local --min-score 60'
evo gate add root --name extension_ui --command 'npm --prefix {worktree} run qa:extension:ui -w @cold-start/extension'
```

Required gates for promoted UX winners:

```bash
npm run evo:ux-gate -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.local --min-score 60
npm run qa:extension:ui -w @cold-start/extension
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
```

Acceptance:

- Home, public-card, and extension visible render times improve or stay flat.
- Extension JS gzip size does not grow unless a measured latency win justifies it.
- No console errors, page errors, or visible app errors.
- No new visible overflow on desktop web or side-panel viewport.
- Existing extension UI tests keep passing.

Do not combine Phase 1 and Phase 2 in one Evo run. They optimize different user moments and need different gates.
