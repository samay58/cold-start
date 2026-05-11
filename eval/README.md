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
