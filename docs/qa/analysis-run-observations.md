# Analysis Run Observations

A dated log of notable production and shadow analysis runs, and the attack list they feed. One entry per observation, newest first within each section. Add entries whenever run monitoring surfaces something worth acting on; move an item to Resolved when it ships. The two-week latency measurement (started 2026-07-22, review around 2026-08-05, bar p50 60s / p90 90s via `npm run measure:analysis-latency`) reads this file.

## Attack list

Ordered by expected impact.

1. **Queue hold before sources land.** The uniqlo run sat 32s between `generation.started` and `source.found` while the wait surface showed Queue. Part is dispatch (below), part is plan plus early fetch running before the first source event. Two angles: emit an earlier Gather-worthy event (`plan.ready` currently maps to no stage; mapping it to Gather splits the hold), and shrink the real pre-source work. UI mapping change is cheap; measure first whether the hold is common (query `research_run_events` gaps).
2. **Inngest dispatch latency.** Baseline: mean 13.6s, p50 7.5s, outliers 47s and 73s (timescaledb). No app-side lever exists (Inngest v4 serve options expose none; verified 2026-07-22). Attack path: Inngest account-tier conversation, or an edge trigger. Out of code's reach today; keep measuring.
3. **skip-fresh promotion.** Lever shipped off; evidence now complete at 15 prod-parity pairs. Combined: claims 31 to 31 net zero (4 drops, 6 ties, 5 increases; every drop traced to synthesis non-determinism, not a mechanism), citations down 5.2% (mechanically expected; zero gate impact), AgentCash 100% eliminated with no exceptions, wall down 10.1s median (15.3%) in 10 of 12 comparable pairs. Decision is Samay's; the flip is a quiet-window operation (adds a conditional step to in-flight runs), and the env var is the instant rollback. If promoted, the two-week measurement watches citation counts.
4. **Verifier truncation exposure (latent).** `verifySynthesis` returns plain JSON text against a hardcoded `max_tokens: 2000` (`packages/llm/src/verifier.ts:116`). Sonnet-routed verify truncates on claim-rich companies (6 shadow-run failures under the local misrouted rig); prod DeepSeek verify has never truncated. Pre-existing, unchanged by the step split. Attack options, Samay sign-off required since verifier parameters sit inside the untouchable line: raise the cap, or move verify to forced tool choice like every other stage.
5. **All-claims-dropped runs present as failures.** When verification kills every claim, the run throws "No synthesis claims survived verification" and lands `status: failed` (surfaced twice in shadows: cartesia, linear). An honest all-dropped verdict arguably deserves the withheld-style honest surface, not failure copy. Product decision; adjacent to issue #10.
6. **Targeted-mode dedup optimism.** The unpromoted `targeted` refresh mode ignores the Direct Exa coverage dedup, so its projected savings are slightly high. Only matters if `targeted` or the skip-fresh stale fallback ever promotes.

## Run log

- **2026-07-22, uniqlo (prod, first organic run on the split backend).** Basics 87s, analysis 83s wall. All new events fired in production for the first time: `synthesis.started` at +37s, `verify.started` "Verifying 10 claims against sources" at +74s, `verify.complete` "6 claims survived" at +80s. Queue hold of 32s before `source.found` (attack list item 1). This run doubled as the Task 5.6 live deployed trace.
- **2026-07-22, shadow batch 2 (local, paired, post-merge, prod-parity throughout).** 10 more pairs, $6.03. Claims 17 to 15 with real per-pair variance (drops in 4: anthropic, palantir, snowflake, shopify; verified substantive, traced to synthesis non-determinism); citations down 8.1% in-batch; AgentCash $1.44 to $0; wall 66.4s to 56.3s over 12 comparable pairs. Caught and fixed its own methodology bug mid-batch (`claimCountAfterVerify` counts more than bull+bear leaves; not comparable to the batch 1 metric; Phase A re-run with card snapshotting). The rippling schema-null synthesis bug failed twice and the slug was replaced; elevenlabs hit the same bug once and passed on retry, tying it to synthesis content rather than phase or routing (candidate for the attack list if it recurs). Three anomalous provider-latency runs (to 570s) excluded from wall averages only.
- **2026-07-22, shadow batch 1 (local, paired).** 42 runs, $8.78; 5 clean prod-parity pairs after the rig's verifier routing was corrected mid-batch; claims 14 to 16 under skip-fresh, zero drops, AgentCash $1.29 to $0. Full tables in `.superpowers/sdd/task-5.3-shadow-report.md` (session scratch; digests here and in the plan are the durable record). One transient Zod null-field synthesis draft error (retool), resolved on retry.
- **2026-07-21, baseline lock (prod, 45 runs).** Wall p50 1m43s, p90 2m21s; dispatch right-skewed; 11 of 45 gate-withheld. The pre-split reference population for the measurement tail.

## Resolved

- Silent synthesis withholds (11 of 51 runs): fixed by Phase 1's floor-plus-advisory gate and visible withheld state, deployed 2026-07-21.
- Per-tick full-card polling waste: event-gated since Phase 4 (`de8d048`).
- The 50s event dead zone during synthesis and verify: real events since the Phase 4 step split.
