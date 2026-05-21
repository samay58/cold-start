# Cold Start

Cold Start turns the company site already open in your browser into a sourced company card.

The public page shows facts only: what the company does, who runs it, funding, signals, comparables, and sources. The Chrome extension adds the private investor read after the basics hold: why the company might matter, which claims have support, and what questions are worth asking on a first call.

If Cold Start cannot support a claim, it lowers confidence, leaves the field blank, or says the fact was not found. The product should feel fast, inspectable, and trustworthy.

## Shape

- `apps/web`: Next.js app, public card routes, extension API, generation API, and Inngest handler.
- `apps/extension`: Chrome MV3 side panel.
- `packages/core`: card schema, trust rules, source quality, and public redaction.
- `packages/db`: Drizzle schema and repository layer.
- `packages/providers`: Direct Exa, StableEnrich, AgentCash, and source adapters.
- `packages/llm`: extraction, synthesis, verifier, and research-plan logic.
- `packages/pipeline`: card generation orchestration.
- `packages/ui`: shared card UI and source components.

Read `SPEC.md` for product truth, `DESIGN.md` for visual truth, `INTENT.md` for behavior intent, and `SECURITY.md` before touching auth or secrets.

## Local Setup

Run from the repo root.

```bash
npm ci
cp .env.example .env.local
```

Set at least:

```bash
ANTHROPIC_API_KEY=...
NEXT_PUBLIC_WEB_ORIGIN=http://localhost:3000
VITE_COLD_START_API_ORIGIN=http://localhost:3000
CHROME_EXTENSION_ID=local-dev
ALLOWED_EXTENSION_ORIGINS=chrome-extension://*,http://localhost:5173
EXTENSION_API_TOKEN=local-extension-token
```

AgentCash uses a local wallet in development and `X402_PRIVATE_KEY` in deployed environments.

```bash
npx agentcash@latest balance
npx agentcash@latest redeem <YOUR-CODE>
```

## Run Locally

Start Postgres:

```bash
docker info >/dev/null
docker-compose up -d postgres
```

Start the app and worker:

```bash
npm run dev:full
```

`dev:full` loads `.env.local`, applies Drizzle migrations, then runs Next and the Inngest worker together. Restart it after changing extension auth env vars.

Useful alternates:

```bash
npm run dev
npm run dev:inngest
npm run db:migrate
```

## Generate A Card

```bash
curl -i -X POST http://localhost:3000/api/generate \
  -H 'content-type: application/json' \
  -d '{"domain":"cartesia.ai","confirmStart":true}'
```

Expected: `202` with `queued` or `running`, or `200` with `cached`.

After the worker finishes:

```bash
open http://localhost:3000/c/cartesia
curl -s http://localhost:3000/api/cards/cartesia | jq '.domain, (.citations | length)'
curl -s http://localhost:3000/api/cards/cartesia | grep '"synthesis"'
```

The public API should return the domain and citations. The synthesis grep should return no output.

Check the extension gate:

```bash
curl -i http://localhost:3000/api/extension/cards/cartesia
curl -s http://localhost:3000/api/extension/cards/cartesia \
  -H 'x-cold-start-extension-id: local-dev' \
  -H 'authorization: Bearer local-extension-token' | jq '.domain, has("synthesis")'
```

Expected: unauthenticated access is `403`; authenticated local access returns the card and can include synthesis.

## Load The Extension

Build the extension:

```bash
npm run build -w @cold-start/extension
```

Load `apps/extension/dist` in `chrome://extensions`.

For local API testing, build with explicit local origin:

```bash
VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN=true \
VITE_COLD_START_API_ORIGIN=http://localhost:3000 \
npm run build -w @cold-start/extension
```

If the side panel reports an API contract mismatch, deploy or restart the API, rebuild the extension, reload it in Chrome, and reopen the side panel.

## Checks

```bash
npm run typecheck
npm run test
npx --yes knip --reporter compact
npm run qa:extension:ui -w @cold-start/extension
npm run qa:extension:smoke -w @cold-start/extension
```

Provider smoke:

```bash
set -a; source .env.local; set +a
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
```

Generation trace and production QA commands live in `docs/qa/generation-trace-and-production-qa.md`.

Anthropic cost controls:

- `ANTHROPIC_MODEL` is the default model for every LLM stage.
- `ANTHROPIC_EXTRACT_MODEL`, `ANTHROPIC_BLOCK_MODEL`, `ANTHROPIC_SYNTHESIS_MODEL`, `ANTHROPIC_VERIFIER_MODEL`, and `ANTHROPIC_RESEARCH_PLAN_MODEL` override individual stages when set.
- Generation traces record LLM call count, token usage, cache reads/writes, model, latency, and estimated USD per call.

## Deployment And Security

The internal deployment runbook is `docs/deployment.md`.

Current internal origin:

```text
https://cold-start-samay58s-projects.vercel.app
```

The future custom domain target is `coldstart.semitechie.vc`.

Never paste production tokens into docs, commits, screenshots, issues, or PRs. The local token `local-extension-token` is only for local development.

Stop local services:

```bash
docker-compose down
```
