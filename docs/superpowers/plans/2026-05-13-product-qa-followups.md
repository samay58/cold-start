# Product QA Follow-Ups

Status: filed from the May 13 closed-loop QA pass.

## Context

The new Playwright extension QA loop is working. It replaced slow Computer Use with:

- `npm run qa:extension:ui -w @cold-start/extension`
- `npm run qa:extension:smoke -w @cold-start/extension`

The loop caught a real extension bug: the dormant card pile looked offset, but the hitboxes were flattened/overlapping, so drag could activate the wrong card or feel broken. That bug was fixed in `apps/extension/src/ResearchLayerPanel.tsx` by moving pile offsets into real absolute layout and making snap activation robust against Framer's final drag offset behavior.

## Critical

### Extension Reload After Card Drag Fix

The drag/hitbox fix is implemented locally and validated by Playwright, but the browser will not see it until the unpacked extension is reloaded from the rebuilt `apps/extension/dist`.

Validation already run:

```bash
npm run qa:extension:ui -w @cold-start/extension
npm run qa:extension:smoke -w @cold-start/extension
```

### Backend Trace Completeness

Completed production runs still have missing trace fields. Good current run: `browserbase.com` has source-gate, extraction, citations, and synthesis trace. Bad current runs include `attio.com`, `skyfire.xyz`, and `varickagents.com`, where completed runs are missing extraction or synthesis trace.

Evidence commands:

```bash
set -a; source .env.production.migrate.local; set +a
npm run trace:generation -- --since 24h --quality --limit 20
npm run trace:generation -- --domain attio.com --mode analysis --quality --detail --limit 1
```

Done definition:

- Every completed basics run has provider, source-gate, extraction, citation, cost, step, and failure fields when applicable.
- Every completed analysis run has synthesis trace fields.
- `qa:generation` no longer flags `missing_extraction_trace` or `missing_synthesis_trace` for fresh runs.

### StableEnrich Provider Reliability

Recent traces repeatedly flag `stableenrich_all_failed`. Direct Exa is carrying the system, which is not acceptable as the only reliable path.

Evidence:

- `browserbase.com`: StableEnrich source count 0, failure count 7.
- `attio.com`: StableEnrich source count 0, failure count 7.
- Several fixed-suite companies show the same provider failure flag.

Done definition:

- Provider traces show why StableEnrich failed, not just that it failed.
- StableEnrich failures degrade cleanly without misleading source quality.
- The QA suite distinguishes expected no-data cases from provider/runtime failure.

## High

### Generation Latency And Staged UX

Generation still takes too long for first-run UX. Recent production timings:

- Browserbase basics: 1m 07s.
- Browserbase analysis: 2m 02s.
- Attio basics: 1m 04s.
- Attio analysis: 1m 59s.

The product should move toward staged generation or true per-card backend jobs. The user should get useful identity/profile context first, then deeper enrichment should happen when cards are activated.

Done definition:

- Basics returns a useful first shell substantially faster.
- Card activation maps to the specific enrichment being requested.
- Long-running analysis continues in background and resumes correctly.

### Production QA Env Consistency

`qa:generation` loads production DB env automatically, but `trace:generation` initially tried local Postgres and failed with `ECONNREFUSED 127.0.0.1:55432`.

Done definition:

- Shared env loader for QA scripts.
- Explicit `--env production` or equivalent.
- Commands fail with actionable messages when the target DB is not configured.

### Real Side Panel Smoke

The built-extension smoke proves the MV3 bundle boots and renders, but it intentionally avoids toolbar/side-panel gesture automation. Add one optional slower smoke that opens the actual side panel from the browser shell only after the fast loop is stable.

Done definition:

- Fast UI harness remains the default.
- Optional smoke opens the real side panel and captures one screenshot.
- It is clearly labeled as slower and not part of the default inner loop.

## Medium

### Dependency Security Hygiene

`npm audit --omit=dev --audit-level=high` is red. It reports production-impacting advisories through Next, Vercel transitive packages, OpenTelemetry, CRXJS/Rollup, and Undici.

Done definition:

- Upgrade Next and other safe non-breaking dependencies first.
- Separate dev-tooling vulnerabilities from production runtime exposure.
- Avoid `npm audit fix --force` unless reviewed, because it proposes breaking Vercel and CRXJS changes.

### Lint Gate Is Not Real

`npm run lint` passes, but the web lint script only echoes `lint configured in web implementation task`.

Done definition:

- Either wire a real lint command or remove lint from the quality-gate language.
- Extension/web lint expectations are explicit in docs.

### QA Coverage Expansion

Current Playwright UI harness covers:

- cached card render
- missing-card gate
- drag/snap activation
- keyboard activation and analysis start

Next coverage should add:

- running basics progress shimmer
- analysis resume after reload
- failed analysis empty state
- no-source partial card
- reduced motion
- linked source chip limits and `+N`
- screenshot capture into `~/Downloads/cold-start-qa/<timestamp>/`

Done definition:

- The harness captures the UX bug classes that have actually appeared during manual testing.
- No Computer Use needed for routine regression checks.
