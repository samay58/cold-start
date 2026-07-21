# Generation Trace And Production QA

Use these commands when a generated card is slow, incomplete, or inconsistent with the extension.

## Inspect Recent Runs

```bash
set -a; source .env.local; set +a
npm run trace:generation -- --limit 10
npm run trace:generation -- --limit 1 --detail
npm run trace:generation -- --domain legora.com --mode analysis --quality --detail
```

Useful filters:

- `--domain`
- `--mode basics|analysis`
- `--since 4h`
- `--failed`
- `--json`
- `--quality`
- `--detail`

The trace command prints job kind, run status, duration, accepted and rejected sources, applied provider facts, citation count, synthesis verification count, LLM call count, real AgentCash delta, estimated Anthropic cost, provider budget, Inngest IDs, failure reason, and deterministic QA flags when present.

## Read The Trace

Use `--quality` for the compact table and `--detail` when diagnosing a run. `agentcash` is the real wallet delta from `trace.costUsdAgentcash` or `providers.stableenrich.walletDeltaUsd`; `budget` is the expected StableEnrich spend from endpoint metadata. If the wallet snapshot failed, trust the budget only as a ceiling estimate. `anthropic` is `trace.costUsdAnthropic` or the summed LLM estimate.

Milestones live under `trace.milestones`. `firstUsableCardMs` is the sidebar-visible basics point, `contactsReadyMs` is deferred people enrichment, and `analysisReadyMs` is extension-gated synthesis. Inngest replay can run some steps more than once, so the milestone value is anchored to the original event timestamp and should stay monotonic.

StableEnrich endpoint rows show `facts` produced and `applied` facts that survived the pipeline merge. A row with facts and zero applied facts is low-yield. `skippedProbeNames` shows cheap-first Direct Exa coverage, and `budgetCeilingHit` means the per-run AgentCash budget stopped additional paid endpoints.

Analysis runs skip synthesis only when evidence falls below the floor: fewer than `ANALYSIS_SYNTHESIS_MIN_CITATIONS` citations (8 by default) or zero non-enrichment source types. Source-type diversity, cited funding, and a named team member are advisories now, not blockers. In that path, `trace.synthesis.gate` carries the block reasons and advisories plus the citation and source-type counts, `trace.synthesis.gateMessage` is the short summary string, and synthesis/verifier LLM calls are absent. The gated card also stores the block as `synthesisWithheld`, cleared the next time a run produces real synthesis.

## Production QA Suite

```bash
set -a; source .env.production.migrate.local; set +a
npm run qa:generation
```

The QA runner reads production DB traces and API card output for the fixed QA company suite. It prints a compact terminal report only.

Screenshots from manual side-panel inspection should stay outside the repo under:

```text
~/Downloads/cold-start-qa/<timestamp>/
```

## Performance Contract

Current staged-flow targets:

- First usable sidebar card: p50 under 15s, p90 under 30s.
- Contacts ready: p50 under 30s, p90 under 60s.
- Analysis: background work; it must not block sidebar usefulness.

Every generated run should carry these milestones when the lane exists:

- `firstUsableCardMs`
- `contactsReadyMs`
- `analysisReadyMs`

Provider endpoint traces should include `durationMs`, `estimatedCostUsd`, `expectedFacts`, `stopCondition`, and `factsAppliedCount`.
Anthropic traces should include model, stage, duration, token usage, cache read/write tokens, and estimated cost.

Speed wins only count if cited quality and work-email usefulness hold. Public card responses must continue to strip emails and synthesis.

## Local Gate

Before handing off code or docs, run:

```bash
npm run check
```

This is the same gate CI runs: lint with zero warnings, typecheck, tests, build, golden eval dry run, `knip`, secret scan, and guarded dependency audit.

The dependency audit wrapper allows the current upstream transitive findings that require breaking package work. It still fails on new high or critical findings outside that allowlist.
