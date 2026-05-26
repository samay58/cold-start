# ActiveGraph Cold Start Pilot

This is a removable shadow harness. It reads existing Cold Start card or eval JSON artifacts, builds an ActiveGraph object/relation view, runs deterministic trust checks, and writes audit or diff reports under `eval/activegraph-runs/`.

It does not import TypeScript app code, change generation, write to the database, call providers, or require credentials.

## Setup

Run from the repo root.

```bash
python3 -m venv experiments/activegraph-coldstart/.venv
source experiments/activegraph-coldstart/.venv/bin/activate
python -m pip install 'activegraph==1.0.5.post2' pytest
activegraph quickstart
```

## Commands

```bash
python -m pytest experiments/activegraph-coldstart/tests

python experiments/activegraph-coldstart/coldstart_graph.py audit \
  --fixture experiments/activegraph-coldstart/fixtures/cartesia-card.json \
  --out eval/activegraph-runs

python experiments/activegraph-coldstart/coldstart_graph.py diff \
  --left experiments/activegraph-coldstart/fixtures/cartesia-card.json \
  --right experiments/activegraph-coldstart/fixtures/cartesia-card-v2.json \
  --out eval/activegraph-runs
```

## What It Models

- `company`
- `run`
- `fact`
- `citation`
- `synthesis_line`
- `question`
- `score`

Relations:

- `run_evaluates_company`
- `fact_cites_citation`
- `synthesis_cites_citation`
- `score_flags_fact`
- `score_flags_synthesis`
- `citation_belongs_to_company`

## Phase-One Bar

Continue only if the report and graph-level diff make Cold Start trust failures easier to diagnose than the current eval Markdown alone. Rollback is deleting `experiments/activegraph-coldstart/` and generated files in `eval/activegraph-runs/`.
