# Cold Start Eval Harness

This folder holds the starter 50-company golden set and prompt regression config.

Manual score each generated card on:

- Identity correct
- Funding correct or hidden when not cited
- Leadership correct or hidden when not cited
- No fabricated citation URLs
- Public route omits synthesis
- Extension route includes synthesis only when valid extension auth is present

## Runner

Dry-run the first slice without provider or model calls:

```bash
npm run eval:golden -- --dry-run --limit 10
```

Run the live harness only after the local or deployed stack is ready and the extension token is available:

```bash
COLD_START_API_ORIGIN=http://localhost:3000 \
COLD_START_EXTENSION_TOKEN=local-extension-token \
COLD_START_EXTENSION_ID=local-dev \
npm run eval:golden -- --limit 10
```

The live harness writes JSON and Markdown summaries under `eval/runs/`. Treat the mechanical score as a triage table, then manually review factual correctness for identity, funding, and leadership.

The live harness uses the same API contract file as the extension. If it reports `api deployment out of date`, deploy the web app before scoring the run.

## How it wins screen (Jev)

`eval/how-it-wins-screen/` replays the production screen (`packages/llm/src/how-it-wins-screen.ts`) over frozen corpus cards, scores it against the judge's cached verdicts, and rebuilds its calibration table. Spec: `docs/superpowers/specs/2026-09-22-how-it-wins-layered-screen.md`. It needs `TYPESAFE_API_KEY` in the root `.env.local`, skips the holdout, and stops at `--cap-usd` (at most 5).

```bash
npm run eval:hiw-screen -- --labeled --bias 40 --seed hiw-screen-bias-1 --cap-usd 1
npm run eval:hiw-screen:score -- --run eval/runs/how-it-wins-screen/{timestamp}
# After a screen version, Jev model, or rubric change: rerun the whole corpus, then rebuild.
npm run eval:hiw-screen -- --bias 400 --seed hiw-screen-calibration-2 --cap-usd 1.5
npm run eval:hiw-screen:calibrate -- --run eval/runs/how-it-wins-screen/{timestamp}
```

Scoring reads verdicts cached by `scripts/how-it-wins-batch.ts` in `eval/curation/how-it-wins-batch/_judgments/`. Results land in `eval/runs/how-it-wins-screen/{timestamp}/`.

To produce scoped reads for the blind review, run the batch with `--scoped`. It screens each card, judges only Round 1's survivors with the citation check, and caches each verdict under the screen's identity (its version, Jev model and thresholds) beside the full ones, so a rerun over unchanged evidence replays the scoped verdict. A failed screen fails the card; it never falls back to a full verdict.

```bash
npm run eval:how-it-wins:batch -- --slugs august,bland,cognition,deepinfra,doppel,hebbia,nekohealth,notion --scoped --budget-usd 8
```
