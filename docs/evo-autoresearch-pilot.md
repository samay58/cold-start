# Evo Autoresearch Pilot

## Phase 1: Generation Speed And Cost

Use Evo for one narrow loop first: make generation faster and cheaper without weakening card quality.

The benchmark is `npm run evo:generation-benchmark`. It scores recent generation traces and cached cards for the golden-company slice. Higher is better. The score rewards lower `firstUsableCardMs`, lower contact readiness latency, lower run cost, less no-fact provider time, complete public-card basics, and citation depth. It penalizes missing core fields, provider failures, and slow provider endpoints that return no facts.

Default gate:

```bash
npm run evo:generation-gate -- --env-file /Users/samaydhawan/Projects/active/cold-start/.env.production.migrate.local --limit 12 --min-score 25
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

The second lane should optimize perceived app responsiveness across the public card and Chrome extension: sidebar boot time, public card render time, interaction delay, loading-state clarity, route/API cache behavior, bundle weight, and UI test stability. This lane needs its own benchmark and gates, likely centered on extension Playwright traces, public-card render timings, bundle/build checks, and no visual/design regressions.

Do not combine Phase 1 and Phase 2 in one Evo run. They optimize different user moments and need different gates.
