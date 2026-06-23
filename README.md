# Cold Start

Here is the thing about researching a private company. You open the website. You search the name. You check funding, look for the founders, skim a press release from two years ago, and read a news blurb that does not say much. Twenty minutes later, you have eleven browser tabs and a rough sense that the company exists.

The raw facts are often public. They are just scattered, and the judgment you need lives in the gaps between them: why this company might matter, whether the traction is real, what proof exists, and what question you should ask first.

Cold Start is built for that problem. Open the company's website, run the Chrome extension, and the side panel builds the first read a strong private investor would want.

It also saves a sourced public page at `/c/{slug}`. That page is the fact base. The extension is the product.

## Why We Built It

Cold Start is for the first serious read. It should answer:

- What does this company do, in plain English?
- Who runs it?
- Who buys it?
- Why might this be interesting to an investor?
- What product, funding, customer, team, and traction evidence is actually public?
- What changed recently?
- Which sources support each material claim?
- What is the right next diligence question?

The product bias is simple: facts first, citations always, judgment only after the evidence holds. A thin honest read is better than a confident-looking one full of guesses.

## What It Does

The Chrome extension is the main experience. It gives you a side-panel briefing while you are on the company site.

The extension can show:

- a plain-English company description
- buyer and use-case analysis
- product and technology notes
- customer proof and traction signals
- funding, investors, and team
- competitive context
- why the company might matter
- bull and bear claims that survived verification
- open questions for a first call or diligence screen

Cold Start also creates a public web card at `/c/{slug}` and a public API response at `/api/cards/{slug}`. That public card contains sourced facts only:

- identity, domain, logo, headquarters, founded year, and description
- funding history, last round, investors, and disclosed totals
- founders, executives, and headcount when supported
- recent signals such as launches, hiring, funding, filings, GitHub, or news
- comparables and source list
- citation metadata, source quality, confidence, and timestamps

The extension can read the full card after auth and add the private investor synthesis. The public page stays factual and source-backed.

## What It Is And Is Not

Cold Start is for the moment before a call, memo, partner conversation, or first-pass screen. It is not trying to replace diligence. It is trying to make the first 10 minutes sharper.

It is not a CRM, outbound tool, chatbot, scoring engine, or investment recommendation system. It is a research companion for getting quickly from "I am on this company's website" to "I understand the business well enough to ask a good next question."

## How It Works

At a high level:

```text
domain or active browser tab
  -> canonical domain and slug
  -> /api/generate queues a run
  -> Inngest worker fetches source evidence
  -> Direct Exa handles fast fundamentals when configured
  -> StableEnrich and AgentCash handle paid fallback and enrichment
  -> LLM extraction writes typed public card fields
  -> trust pass validates citation refs and drops unsupported facts
  -> card is stored in cards.card_json
  -> public route strips synthesis at read time
  -> extension route returns the full card after auth
  -> section jobs can fill individual research cards
```

Generation uses `mode` for the profile tier:

- `basics`: creates the public card. It can be useful even when synthesis is absent.
- `analysis`: upgrades an existing card with gated synthesis when enough public evidence exists.

The normal extension flow starts with `basics`. Later investor-lens work uses `analysis`. Section jobs use the same generation endpoint with a `sectionId`; their `jobKind` records the exact section, while `mode` still tracks whether the section is public/basic or gated/analysis.

The database stores one full card in `cards.card_json`. Public reads strip gated fields at read time, so the public page never exposes private synthesis.

## Project Map

This is an npm workspaces monorepo.

- `apps/web`: Next.js App Router app, public card pages, APIs, extension auth, generation queueing, and Inngest serving.
- `apps/extension`: Chrome MV3 side panel for active-tab capture, profile generation, card reading, settings, polling, and research-layer UI.
- `packages/core`: card schema, citation rules, trust helpers, public redaction, slug helpers, research-section taxonomy, and API contract.
- `packages/db`: Drizzle schema, repository reads and writes, card cache TTLs, generation runs, evidence rows, sources, citations, claims, and research sections.
- `packages/providers`: Direct Exa, StableEnrich, AgentCash, Websets, SEC EDGAR helpers, provider budgets, and source adapters.
- `packages/llm`: Anthropic client, OpenAI-compatible provider routing, extraction, synthesis, verifier, research-plan, and research-section prompts.
- `packages/pipeline`: card-generation orchestration, evidence ledger, extraction assembly, provider fact merging, synthesis gating, cost tracking, and conflict resolution.
- `packages/ui`: shared card UI primitives and formatting helpers.
- `eval/`: golden-set and provider-matrix evaluation scripts.

Read `SPEC.md` for product truth, `INTENT.md` for behavior intent, `DESIGN.md` for visual truth, and `SECURITY.md` before changing auth, env handling, dependencies, or anything that could expose tokens.

## Setup

Run from the repo root.

```bash
npm ci
```

Create local env only if it does not already exist.

```bash
[ -f .env.local ] || cp .env.example .env.local
```

If `.env.local` already exists, do not overwrite it. Compare against `.env.example` and fill only the missing values.

Minimum local values:

```bash
DATABASE_URL=postgres://coldstart:local@127.0.0.1:55432/coldstart
ANTHROPIC_API_KEY=...
NEXT_PUBLIC_WEB_ORIGIN=http://localhost:3000
VITE_COLD_START_API_ORIGIN=http://localhost:3000
CHROME_EXTENSION_ID=local-dev
ALLOWED_EXTENSION_ORIGINS=chrome-extension://*,http://localhost:5173
EXTENSION_API_TOKEN=local-extension-token
INNGEST_EVENT_KEY=local-event-key
INNGEST_SIGNING_KEY=local-signing-key
```

UI work, typechecks, and most tests do not need live provider credentials. Live generation does.

## API Keys And Credentials

These keys exist for different parts of the system. Keep real values in local ignored env files or deployment secrets.

| Credential                                                                 | Purpose                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                             | Postgres storage for cards, runs, sources, citations, claims, traces, and research sections. Local development uses Docker Postgres on port `55432`; production uses Neon.                                                                |
| `ANTHROPIC_API_KEY`                                                        | Required for Anthropic extraction, synthesis, verification, research planning, and research-section writing.                                                                                                                              |
| `ANTHROPIC_MODEL` and `ANTHROPIC_*_MODEL`                                  | Default and per-stage Anthropic model routing. Stage-specific values fall back to `ANTHROPIC_MODEL`.                                                                                                                                      |
| `LLM_*_MODEL`, `DEEPSEEK_API_KEY`, `FIREWORKS_API_KEY`, `TOGETHER_API_KEY` | Optional OpenAI-compatible provider routing for individual LLM stages. Use provider-prefixed model names such as `deepseek/deepseek-v4-flash`.                                                                                            |
| `DIRECT_EXA_API_KEY`                                                       | Fast fundamentals lane for company profile, people, funding, recent news, and contact-source search. Exa bills this account directly, so spend is estimated in traces rather than read from AgentCash.                                    |
| `X402_PRIVATE_KEY`                                                         | Deployed AgentCash wallet identity for paid StableEnrich calls. Local development can use the AgentCash wallet file instead.                                                                                                              |
| `STABLEENRICH_BASE_URL` and `STABLEENRICH_*_URL`                           | StableEnrich route configuration for Exa search, findSimilar, Firecrawl scrape, Apollo org and people enrichment, Hunter, Clado, and Minerva endpoints. Endpoint vars are overrides; the base URL defaults to `https://stableenrich.dev`. |
| `EXA_WEBSETS_API_KEY`                                                      | Optional durable contact-enrichment path through Exa Websets. Used only when `EXA_WEBSETS_CONTACTS_ENABLED=true`.                                                                                                                         |
| `EXTENSION_API_TOKEN`                                                      | Bearer token for the gated extension API. The bearer token is the extension secret. The local value `local-extension-token` is only a development sentinel.                                                                               |
| `CHROME_EXTENSION_ID` and `ALLOWED_EXTENSION_ORIGINS`                      | Extension identity allowlist. Production must use a real extension ID and a non-wildcard Chrome extension origin.                                                                                                                         |
| `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`                              | Hosted Inngest credentials for deployed background generation. Local development uses the dev server path.                                                                                                                                |

AgentCash does not use a normal API key here. Local runs use the wallet state managed by the AgentCash CLI; deployed runs use `X402_PRIVATE_KEY`.

Useful AgentCash checks:

```bash
npx agentcash@latest balance
npx agentcash@latest redeem <YOUR-CODE>
```

Common generation controls:

```bash
FAST_BASICS_ENABLED=true
CONTACT_ENRICHMENT_ENABLED=true
CONTACT_ENRICHMENT_TIER=named-only
CHEAP_FIRST_EXA_ENABLED=true
PER_RUN_AGENTCASH_BUDGET_USD=0.30
ANALYSIS_SYNTHESIS_MIN_CITATIONS=8
EXTRACTION_EVIDENCE_BUDGET_CHARS=24000
```

Restart `dev:full` after changing startup env vars.

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

`dev:full` loads the repo-root `.env.local`, runs pending Drizzle migrations, starts Next, and starts the Inngest worker.

Useful alternates:

```bash
npm run dev
npm run dev:inngest
npm run dev:extension
npm run db:migrate
```

## Generate A Card

Queue a basics run:

```bash
curl -i -X POST http://localhost:3000/api/generate \
  -H 'content-type: application/json' \
  -d '{"domain":"cartesia.ai","confirmStart":true}'
```

Expected response: `202` with `queued` or `running`, or `200` with `cached`.

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

Expected: unauthenticated access is blocked; authenticated local access returns the full cached card.

Queue a specific research section:

```bash
curl -i -X POST http://localhost:3000/api/generate \
  -H 'content-type: application/json' \
  -H 'x-cold-start-extension-id: local-dev' \
  -H 'authorization: Bearer local-extension-token' \
  -d '{"domain":"cartesia.ai","confirmStart":true,"sectionId":"market"}'
```

Valid section IDs live in `packages/core/src/research-sections.ts`.

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

If the side panel reports an API contract mismatch, restart or deploy the API, rebuild the extension, reload `apps/extension/dist`, and reopen the side panel. The contract version lives in `packages/core/api-contract.json`.

## Quality Gates

Run the full local gate before handing off implementation work:

```bash
npm run check
```

`check` runs lint with zero warnings, typecheck, tests, build, golden eval dry run, `knip`, secret scan, and guarded dependency audit.

Use extension QA when changing the side panel, research layer, module rows, auth, polling, or motion:

```bash
npm run qa:extension:ui -w @cold-start/extension
npm run qa:extension:smoke -w @cold-start/extension
```

Provider smoke:

```bash
set -a; source .env.local; set +a
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
```

Useful generation and eval commands:

```bash
npm run trace:generation
npm run qa:generation
npm run eval:golden
npm run eval:providers:matrix
npm run wallet:status
npm run verify:cache-ttl
```

The generation trace and production QA playbook is `docs/qa/generation-trace-and-production-qa.md`.

## Trust Contract

These rules are more important than making a card look complete.

- Public `/api/cards/{slug}` and `/c/{slug}` must never expose `synthesis`.
- Extension `/api/extension/cards/{slug}` requires extension identity and bearer-token auth before returning the full card.
- Public reads derive from `cards.card_json` and strip gated fields at read time.
- Non-null citation-bearing facts require citation refs, and every ref must resolve to the top-level `citations[]`.
- The trust pass nulls unsupported facts and drops invalid signals.
- Verifier drops stay dropped. Bull and bear sections are not padded back to a fixed count.
- Missing facts should render as absent or not publicly disclosed, not as guessed filler.
- Production must keep `PUBLIC_GENERATION_ENABLED=false` unless public generation is being intentionally opened.

## Deployment And Security

The internal deployment runbook is `docs/deployment.md`. Security rules live in `SECURITY.md`.

Current public web origin:

```text
https://cold-start.semitechie.vc
```

Current extension API fallback:

```text
https://cold-start-samay58s-projects.vercel.app
```

Production extension auth should look like this:

```text
PUBLIC_GENERATION_ENABLED=false
CHROME_EXTENSION_ID=<loaded-extension-id>
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<loaded-extension-id>
EXTENSION_API_TOKEN=<long-random-token>
```

Never paste production tokens into docs, commits, screenshots, issues, PRs, or chat. If a real token is exposed, rotate it in the upstream service and update Vercel.

Stop local services:

```bash
docker-compose down
```
