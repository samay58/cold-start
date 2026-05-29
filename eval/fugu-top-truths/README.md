# Fugu Top-5 Truths Eval

This is an offline shadow eval for the single Cold Start question that best tests Fugu's orchestration claim: can it sort, rank, exclude, and resolve conflict better than a normal model on the same frozen evidence?

It does not write to production, mutate cards, or hit provider retrieval. The source bundle is fixed before model calls.

> **Fugu access ends June 7, 2026.** Both `fugu-mini` and `fugu-ultra` (Sakana beta API) become unavailable after that date, and the beta quota is free and expiring (~11% used as of 2026-05-29). Run the full mini/ultra/baseline comparison at volume and capture artifacts before the cutoff. Plan: `docs/product/slow-work/2026-05-29-fugu-the-read-card-wedge.md`.

## Run

Dry run:

```bash
npm run eval:fugu:top-truths -- --dry-run --fixture browserbase
```

Live run:

```bash
npm run eval:fugu:top-truths -- --fixture browserbase --models baseline,fugu-mini,fugu-ultra
```

Required env:

- `SAKANA_API_KEY`: calls `https://api.sakana.ai/v1/responses` for `fugu-mini` and `fugu-ultra`.
- `ANTHROPIC_API_KEY`: calls the baseline Anthropic model.
- `ANTHROPIC_MODEL`: optional baseline model override.

## Measurement

Each run writes `summary.json`, `summary.md`, raw provider JSON, and raw text output under `eval/fugu-top-truths/runs/`.

Tracked per model:

- source bundle hash
- prompt hash
- response id
- latency
- input, output, and total tokens when the provider returns them
- parse status
- exact score and rubric issues

Cost is logged as unknown unless provider pricing is known. The harness records token usage but does not infer beta pricing.

## Scoring

The score is 15 points:

- ranking discipline
- support quality
- exclusion discipline
- conflict handling
- filler control

The point is not prose quality. The point is whether the model made the right ranked calls under noisy, uneven evidence.
