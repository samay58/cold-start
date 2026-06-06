# Cold Start

Cold Start turns the company site already open in your browser into a sourced company profile.

A generic screen can say Turbopuffer is a serverless vector database. Cold Start is for the sharper read: who buys it, what workload they have, why the old approach hurts, what changed recently, and which sources support the claim.

The public profile lives at `/c/{slug}` and shows sourced facts only. The Chrome extension adds the private investor read: why the company might matter, which claims have support, and what questions belong in the first call.

The rule is simple. If Cold Start cannot support a claim, it lowers confidence, leaves the field blank, or says the fact was not found. A thin honest profile is better than a confident-looking one full of guesses.

## Shape

Cold Start has two surfaces:

- Public profiles at `/c/{slug}`.
- A Chrome side panel for generating and reading the profile while you are on the company site.

The public profile is the artifact. The extension is the workbench.

The monorepo is split by responsibility:

- `apps/web`: Next.js app, public profile routes, extension API, generation API, and Inngest handler.
- `apps/extension`: Chrome MV3 side panel.
- `packages/core`: profile schema, trust rules, source quality, slug helpers, and public redaction.
- `packages/db`: Drizzle schema and Postgres repository layer.
- `packages/providers`: Direct Exa, StableEnrich, AgentCash, SEC EDGAR, and source adapters.
- `packages/llm`: Anthropic client, extraction, synthesis, verifier, research-plan, and investor taste logic.
- `packages/pipeline`: profile generation orchestration, evidence ledger, cost tracking, and conflict resolution.
- `packages/ui`: shared profile UI and source components.

Read `SPEC.md` for product truth, `DESIGN.md` for visual truth, `INTENT.md` for behavior intent, and `SECURITY.md` before changing auth, env handling, dependencies, or anything that could expose tokens.

## Local Setup

Run from the repo root.

```bash
npm ci
```

Create local env only if it does not already exist:

```bash
[ -f .env.local ] || cp .env.example .env.local
```

If `.env.local` exists, do not overwrite it. Compare it to `.env.example` and fill only the missing values.

Minimum local values:

```bash
ANTHROPIC_API_KEY=...
NEXT_PUBLIC_WEB_ORIGIN=http://localhost:3000
VITE_COLD_START_API_ORIGIN=http://localhost:3000
CHROME_EXTENSION_ID=local-dev
ALLOWED_EXTENSION_ORIGINS=chrome-extension://*,http://localhost:5173
EXTENSION_API_TOKEN=local-extension-token
```

Provider keys are only needed for live generation. UI work, typechecks, and most tests can run without them.

AgentCash uses local wallet state in development and `X402_PRIVATE_KEY` in deployed environments.

```bash
npx agentcash@latest balance
npx agentcash@latest redeem <YOUR-CODE>
```

Generation behavior is controlled by startup env vars. Restart the app and Inngest worker after changing them.

```bash
CONTACT_ENRICHMENT_ENABLED=true
CONTACT_ENRICHMENT_TIER=named-only
CHEAP_FIRST_EXA_ENABLED=true
PER_RUN_AGENTCASH_BUDGET_USD=0.30
ANALYSIS_SYNTHESIS_MIN_CITATIONS=8
EXTRACTION_EVIDENCE_BUDGET_CHARS=24000
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

`dev:full` loads the repo-root `.env.local`, applies Drizzle migrations, starts Next, and starts the Inngest worker. Restart it after changing env vars.

Useful alternates:

```bash
npm run dev
npm run dev:inngest
npm run db:migrate
```

## Generate A Profile

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

Expected: unauthenticated access is `403`; authenticated local access returns the full profile and can include synthesis.

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

Run the full local gate before handing off work:

```bash
npm run check
```

`check` runs lint with zero warnings, typecheck, tests, build, golden eval dry run, `knip`, secret scan, and the guarded dependency audit.

Use the extension UI checks when changing the side panel, research layer, module rows, or motion:

```bash
npm run qa:extension:ui -w @cold-start/extension
npm run qa:extension:smoke -w @cold-start/extension
```

Provider smoke:

```bash
set -a; source .env.local; set +a
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
```

Generation trace and production QA commands live in `docs/qa/generation-trace-and-production-qa.md`.

## Cost And Model Controls

- `ANTHROPIC_MODEL` is the default model for every LLM stage.
- `ANTHROPIC_EXTRACT_MODEL`, `ANTHROPIC_BLOCK_MODEL`, `ANTHROPIC_SYNTHESIS_MODEL`, `ANTHROPIC_VERIFIER_MODEL`, and `ANTHROPIC_RESEARCH_PLAN_MODEL` override individual stages when set.
- `EXTRACTION_EVIDENCE_BUDGET_CHARS` caps variable source text sent to extraction and research-section prompts.
- `ANALYSIS_SYNTHESIS_MIN_CITATIONS` gates analysis synthesis when the public evidence is too thin.
- Generation traces record LLM call count, token usage, cache reads and writes, model, latency, and estimated USD per call.
- Provider endpoint budgets, timeouts, expected facts, and stop conditions live in `packages/providers/src/provider-budget.ts`.
- Real AgentCash spend is recorded from wallet snapshots as `trace.costUsdAgentcash` and `trace.providers.stableenrich.walletDeltaUsd` when wallet reads succeed.

## Trust Contract

These rules matter more than making the profile look complete.

- Public API responses derive the public card from `cards.card_json` at read time. `cards.public_card_json` remains a compatibility cache, not the source of truth.
- Cache reads honor section TTLs: identity 7d, signals 6h, synthesis 24h. `basics` needs fresh identity and signals; `analysis` also needs fresh synthesis.
- Non-null `ResolvedFact.value` requires citation refs, and every ref must resolve to `citations[]`.
- Public `/api/cards/{slug}` never includes `synthesis`.
- Extension routes require extension auth before returning gated synthesis.
- The verifier is strict. Unsupported or contradicted synthesis claims are dropped.

## Deployment And Security

The internal deployment runbook is `docs/deployment.md`.

Current web origin:

```text
https://cold-start.semitechie.vc
```

Current extension API fallback:

```text
https://cold-start-samay58s-projects.vercel.app
```

Never paste production tokens into docs, commits, screenshots, issues, or PRs. The local token `local-extension-token` is only for local development.

Stop local services:

```bash
docker-compose down
```
