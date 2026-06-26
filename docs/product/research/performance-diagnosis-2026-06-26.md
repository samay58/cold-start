# Cold Start production generation performance diagnosis

Date: 2026-06-26
Scope: production trace diagnosis only. No code changes in this pass.

## Session issues to tackle

These are the main issues coming out of the production trace deep dive.

1. Fix the production run lifecycle bug.
   Recent runs save useful cards, then fail to mark the `generation_runs` row complete or failed. This creates fake multi-hour generation durations, stale active rows, and misleading traces.

2. Reduce first usable profile latency.
   The product has improved since mid-June, but first usable basics is still roughly 60s p50 and 177s p90 in the clean milestone slice. That is not fast enough for a first-run user experience.

3. Rebalance source fanout against source yield.
   Source retrieval is still a critical-path cost. Some provider work produces useful citations and facts, while some broad or legacy endpoints consume time and money without clear applied yield.

4. Make the seed-card path pay off more consistently.
   The seed profile path exists, but many runs cannot store a seed because the early profile misses public quality gates. When that happens, first usable waits for heavier extraction and enrichment.

5. Keep contact enrichment out of the first-use critical path.
   Websets is producing real contact value, but contact readiness has a multi-minute tail. That work should enrich the card progressively, not define when a profile feels ready.

## Core diagnosis

The last several absurdly long production generations were mostly not spending hours creating profiles. The event stream shows cards being saved in roughly one to three minutes. The rows stayed `running` because terminal trace persistence failed before the worker could mark the run complete.

The likely root is an adapter mismatch:

- Production DB creation uses Drizzle's Neon HTTP driver for non-local URLs in `packages/db/src/client.ts`.
- `updateGenerationRunTrace()` uses `db.transaction(...)` and `FOR UPDATE` in `packages/db/src/repositories/generation-runs.ts`.
- Production events repeatedly end with `contacts.failed: No transactions support in neon-http driver`.
- The main generation worker calls `persist-generation-trace-before-complete` before `mark-generation-complete`.
- The failure path also calls `persist-generation-trace-before-fail` before `mark-generation-failed`.

That ordering means a trace write error can prevent both terminal states. The card can exist, but the run row stays active.

## Recent stuck-run evidence

| Domain | Row status | Event evidence | Read |
|---|---:|---|---|
| `builder.io` | running | sources found around 200s, then first payoff ready; no saved card event at query time | Possible real worker stall after first payoff, not just finalization |
| `avec.ai` | running | card saved at 79s, enriched at 108s, then `contacts.failed` | Core generation finished; status stuck after contact trace update |
| `typefully.com` basics | running | card saved at 45s, enriched at 76s | Fast basics profile, stuck terminal lifecycle |
| `typefully.com` analysis | running | analysis card saved at 63s | Analysis output saved, run never completed |
| `zamana.com` | running | sources at 127s, card saved at 144s, enriched at 176s | Real source slowness plus stuck terminal lifecycle |
| `tomo.ai` | running | card saved at 55s | Core generation finished, later status stuck |
| `mux.com` | running | card saved at 56s, enriched at 98s with 22 citations | Good useful work, bad terminal state |
| `mymind.com` | running | card saved at 91s, enriched at 121s | Good useful work, bad terminal state |
| `lineleap.com` | stale-retired failed | card saved at 68s, enriched at 106s | Apparent 488-minute duration is cleanup artifact |
| `youtube.com` | stale-retired failed | basics saved at 126s, analysis saved at 121s | Apparent 25-hour duration is cleanup artifact |

## Broader production latency

Production sample:

- 757 `generation_runs` rows from 2026-05-08 through 2026-06-26.
- 661 complete rows.
- 84 failed rows.
- 12 active rows at query time, all stale by the 15-minute active-run threshold.

Completed profile latency:

| Slice | p50 | p90 | p95 | max |
|---|---:|---:|---:|---:|
| All complete profile runs | 138s | 236s | 270s | 414s |
| Basics complete profile runs | 139s | 247s | 273s | 414s |
| Analysis complete profile runs | 135s | 217s | 235s | 310s |

Clean milestone latency:

| Milestone | p50 | p90 | p95 |
|---|---:|---:|---:|
| `firstUsableCardMs` | 59.7s | 177s | 188s |
| `seedCardMs` | 87.3s | 178s | 197s |
| `contactsReadyMs` | 146s | 217s | 235s |
| `analysisReadyMs` | 102s | 125s | 128s |

Recent-week trend:

- Basics p50 improved to roughly 90s.
- Analysis p50 is roughly 110s.
- `generate-card` improved materially after mid-June, from about 61s p50 to about 25s p50 for basics.
- The system is faster than it was, but still not fast enough.

## Repeatable bottlenecks

| Area | Evidence | Judgment |
|---|---|---|
| `generate-card` | Historic p50 roughly 60s, p90 roughly 106s. Recent basics p50 roughly 25s, analysis p50 roughly 45s. | Still a major critical-path cost, especially for analysis. |
| `fetch-sources` | Overall p90 roughly 53s, recent analysis source fetch around 35s p50. | Source retrieval remains one of the first usable bottlenecks. |
| `fetch-enrichment-sources` plus `enrich-card` | Basics p50 around 20.5s plus 6.6s in recent week. | Mostly affects total basics duration after first useful output. |
| Seed-card quality gates | Only some completed basics rows record seed milestones; many runs skip underfilled seed cards. | The seed path exists, but quality thresholds blunt its payoff. |
| Websets contact enrichment | Contact readiness p90 roughly 216-296s depending slice. | Useful enrichment lane, but too slow for first-use gating. |
| Legacy email fallbacks | Hunter, Apollo people enrich, Minerva, and Clado show poor applied-fact yield. | Candidate for pruning or stricter routing. |

## Service read

Do not start by upgrading Vercel or Inngest. Successful recent runs fit within the current 300s function boundary. The immediate production issue is a Neon HTTP transaction incompatibility and terminal-state ordering problem.

Useful services to consider later:

- A DB connection mode that supports transactions and row locks for trace patching, if we keep the current trace update shape.
- Better provider routing or paid API plans only after endpoint-yield telemetry says a provider is both slow and useful.
- LLM/model upgrades only after separating first usable latency from background enrichment and final analysis latency.

## Code surfaces for issue 1

- `packages/db/src/client.ts`: production DB driver selection.
- `packages/db/src/repositories/generation-runs.ts`: `updateGenerationRunTrace`, `markGenerationRun`, stale retirement.
- `apps/web/src/inngest/functions.ts`: terminal trace persistence before complete/fail marking.
- `apps/web/src/inngest/contact-enrichment.ts`: parent trace patch after contact enrichment.
- `apps/web/src/app/api/generate/route.ts`: active-run lookup and stale retirement.
- `apps/web/src/app/api/extension/bootstrap/route.ts`: bootstrap stale retirement and active run state.
- `apps/extension/src/sidepanel-network.ts`: polling behavior around active basics rows and card-ready events.

## Commands used in diagnosis

```bash
set -a; source .env.production.migrate.local; set +a
npm run trace:generation -- --limit 30 --quality
npm run optimize:generation -- --limit 50 --json
```

Additional read-only production queries inspected:

- recent `generation_runs` rows by `started_at`.
- `research_run_events` for the recent stuck domains.
- cards saved for recent stuck domains.
- completed-run duration and milestone distributions.
- provider and LLM endpoint summaries from trace JSON.

## Next clean-session prompt

Use `docs/product/research/private-prompts/2026-06-26-prod-run-lifecycle-bug-prompt.md` or the DOCX artifact at `docs/product/research/private-prompts/2026-06-26-prod-run-lifecycle-bug-prompt.docx` to tackle issue 1 in a fresh session.
