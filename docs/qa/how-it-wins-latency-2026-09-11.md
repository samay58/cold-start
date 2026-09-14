# How it wins latency and cost, 2026-09-11

First look at real production How it wins runs, taken the day the Inngest MCP server was wired in. Two reads landed that day, for shipveho and craftcloud3d. Both finished with status `read`. Nothing failed.

## The shape of one run

The read runs in its own Inngest function, `how-it-wins-read`, after the analysis run has already stored the Lens. So the tester sees the Lens first, and the crown sits in its reading state for the whole time below. The crown polls for up to eight minutes.

Shipveho, Inngest run `01M28SSQH0P0YVT92QC161FQJE`, 247 s end to end:

| Step | Wall time |
|---|---|
| how-it-wins-load | 0.02 s |
| how-it-wins-judge | 189 s |
| how-it-wins-write | 52 s |
| executor overhead | 4.7 s |
| how-it-wins-verify | 4.0 s |
| how-it-wins-store | 0.06 s |

The Inngest trace lists the write span twice. The run total only has room for one 52 s write, so that is one step reported twice, not a second writer pass.

## Inside the judge step

The judge step is three model calls in sequence. `trace_json.howItWins.judgeSummary.calls` on the parent analysis run records each one.

| Call | Model | Shipveho | Craftcloud3d |
|---|---|---|---|
| global_judge | claude-opus-5 | 137 s, 14.2k in, 12.4k out, $0.40 | 133 s, 16.2k in, 12.5k out, $0.79 |
| critic | deepseek-v4-pro | 32 s, 14.8k in, 1.9k out, $0.01 | 35 s, 15.8k in, 1.9k out, $0.01 |
| adjudication | claude-opus-5 | 21 s, 26.6k in, 1.6k out, $0.19 | 33 s, 29.0k in, 3.1k out, $0.59 |
| judge-side total | | 189 s, $0.61 | 201 s, $1.40 |

Neither judgment was a cache hit (`judgmentRef.cached` false on both). Losses were zero on both: judge current equals verified running (1 on shipveho, 2 on craftcloud3d), no writer citation drops, no verifier drops, floor did not fire.

## What the time is

The global judge writes about 12.4k output tokens. At the roughly 90 tokens a second Opus 5 produced here, that is about 135 s before anything else happens. The run is bound by model output, not by queues, the database, or the network.

Refinement (critic plus adjudication) is 21 to 25 percent of wall time and $0.21 to $0.61 of the judge-side cost. `HOW_IT_WINS_REFINEMENT=off` removes it on the next deployment. CLAUDE.md's "about $0.30 and 60s" estimate holds for shipveho and undershoots craftcloud3d.

## Levers, in order of size

1. Shrink the global judge's output. The all-80 verdict emits 12k tokens per run. A tighter audit format is the only lever that touches the two-minute block.
2. A faster judge model. Same tokens, less wall time; quality unmeasured.
3. Refinement off. Saves 50 to 70 s and $0.20 to $0.60 a run, at the cost of the critic's label repairs (the 2026-08-26 audit found the critic worth keeping).
4. Writer output. 52 s is fixed per run and not yet examined.

## How to reproduce

Inngest side, through the `inngest-cloud` MCP server: `list_runs` (24 h window on the current plan; older runs are gone from Inngest), `get_run` with `includeOutput`, `get_run_trace` for the step tree.

Database side, against production (`set -a; source .env.production.migrate.local; set +a`), read-only:

```sql
with runs as (
  select r.slug, r.started_at, r.trace_json->'howItWins' as hw
  from generation_runs r
  where r.trace_json ? 'howItWins' and r.started_at > now() - interval '1 day'
  order by r.started_at desc limit 10)
select slug, hw->>'status' as status, hw->'judgmentRef'->>'cached' as cached,
  c->>'stage' as stage, c->>'model' as model,
  round((c->>'latencyMs')::numeric/1000, 1) as sec,
  c->>'inputTokens' as in_tok, c->>'outputTokens' as out_tok,
  coalesce(c->>'actualCostUsd', c->>'estimatedCostUsd') as cost
from runs, jsonb_array_elements(hw->'judgeSummary'->'calls') c
order by started_at desc, stage;
```

`npm run measure:how-it-wins` gives the aggregate view over more runs.

## Open

- Writer step: what the 52 s is made of (one call or several, token count).
- Whether the judge's 12k-token audit can be cut without losing the strategy verdicts the writer needs.
- A larger sample. Two runs is a shape, not a baseline.
