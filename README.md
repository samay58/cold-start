# Cold Start

Cold Start is a company profile that starts from the site already in your browser.

Company research still begins with a messy tab pile. The homepage tells its own story. Databases give you fields, but not always the evidence behind them. Search gives you links, then leaves you to assemble the read yourself.

Cold Start turns that first read into a card. It pulls the basics, cites the sources, and gives the user something they can inspect or forward. If the product cannot back a claim, it lowers confidence, leaves the field blank, or says the fact was not found.

The public page stays on sourced facts. The Chrome extension adds the private investor read after the basics hold: why the company might matter, which claims have support, and what questions are worth asking on a first call.

The product takes inspiration from analyst tear sheets, Raycast-speed command surfaces, and Rauno Freiberg's interaction work: quick feedback, crisp motion, and small details that explain state instead of decorating it. The point is not to copy those surfaces. The point is to make company research feel fast, alive, and trustworthy.

## Who it is for

Cold Start is for investors, builder-investors, and deal people who land on a company site and need bearings fast. It should answer the first questions before a call: what the company does, who runs it, who backed it, what changed recently, what nearby companies matter, and which sources support the read.

It is also built for sharing. A public card can live at `/c/{slug}`. The sharper synthesis stays gated behind the extension.

## How it works

1. The extension reads the active company domain.
2. The user chooses whether to generate a profile.
3. The backend resolves the domain, fetches public sources, extracts structured facts, and stores a public card.
4. The public card renders identity, funding, team, signals, comparables, and sources.
5. The extension can run a deeper analysis pass that adds investor synthesis without leaking it to the public route.

## Status

Cold Start has a local development path and an internal Vercel deployment path. The first implementation plan lives at `docs/superpowers/plans/2026-05-06-cold-start-implementation.md`; the deployment runbook lives at `docs/deployment.md`.

Current implementation includes:

- npm workspace scaffold, typed card schema, Drizzle schema, and repository layer
- provider and LLM wrappers, research planner, evidence ledger, and pipeline orchestration
- public web card route, extension-gated card API, and side-panel generation and polling
- polished Chrome side-panel shell with the Cold Start aperture mark, pale blue chrome field, parchment dossier cards, and a single progress surface
- generation traces for recent runs, including provider counts, source-gate decisions, extraction counts, synthesis counts, Inngest IDs, and failure stage
- local `dev:full` runner for the web app plus Inngest worker
- internal Vercel setup docs, privacy page, golden eval seed, robots route, and sitemap

## Repository layout

- `README.md`: local setup and project overview
- `SPEC.md`: product and technical source of truth
- `DESIGN.md`: implemented visual reference
- `SECURITY.md`: secret handling and security checklist
- `docs/`: deployment notes, brand docs, archived directions, and plans
- `apps/`: Next.js web app and Chrome extension
- `packages/`: core, db, providers, llm, pipeline, and ui packages
- `eval/`: golden company seed and eval config

## Decisions locked in spec

| Question | Answer |
|----------|--------|
| Name | Cold Start |
| URL policy | Public sourced facts at `/c/{slug}`, gated synthesis behind Chrome extension or auth |
| Data plumbing | Direct Exa fast fundamentals first, StableEnrich and AgentCash as fallback and enrichment |
| Build pace | 3-week MVP, no Arc Boost POC, no weekend hack |
| Backend | Next.js 15 on Vercel + Inngest + Neon Postgres |
| LLM | Claude Sonnet 4.6, single agent with parallel tool calls, no orchestrator-worker in v0 |
| Investor synthesis | In v0 but only on extension surface; web public URL omits synthesis entirely |
| Generation modes | `basics` starts after the side-panel gate and can cache a partial public card; `analysis` is explicit, gated, and adds synthesis |
| X bot | Deferred to v1.1; manual @semitechievc posting in v0 |
| Brand | Personal under @semitechievc, no separate product handle until product proves out |

## Boundaries

Cold Start competes with company-intel products, but not by becoming another private-company database.

- The card is the unit. Chat can come later.
- It does not scrape contacts or send outbound messages.
- It does not tell the user whether to invest.
- It does not try to become a CRM or watchlist in v0.

## Spec Origins

This project merges three independent research and spec passes written 2026-05-06:

1. Semitechie Scout (Claude analysis)
2. semitechie.vc Implementation Spec (research-grounded second pass)
3. Project Signal (third independent technical spec)

The specs agreed on Chrome side panel, sourced facts, citations, public web, and $0.05 to $1 per card. They disagreed on backend stack, search providers, multi-agent orchestration, public URL policy, and X bot inclusion. `SPEC.md` resolves those disagreements with rationale.

Detailed implementation tasks live at `docs/superpowers/plans/2026-05-06-cold-start-implementation.md`.

## Manual local test

Follow these steps to try the app like a new local user. Run from the repo root.

### One-time setup

```bash
npm ci
cp .env.example .env.local
```

Edit `.env.local` and set at least:

```bash
ANTHROPIC_API_KEY=...
NEXT_PUBLIC_WEB_ORIGIN=http://localhost:3000
VITE_COLD_START_API_ORIGIN=http://localhost:3000
CHROME_EXTENSION_ID=local-dev
ALLOWED_EXTENSION_ORIGINS=chrome-extension://*,http://localhost:5173
EXTENSION_API_TOKEN=local-extension-token
```

AgentCash does not use an API key. In local development it uses the wallet that `npx agentcash@latest` creates on first run; in deployed environments set `X402_PRIVATE_KEY`.

Redeem or fund AgentCash if needed:

```bash
npx agentcash@latest balance
npx agentcash@latest redeem <YOUR-CODE>
```

### Verify paid data providers

```bash
set -a; source .env.local; set +a
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
```

Expected: endpoint JSON lines with `status: "ok"` for Exa search, Exa findSimilar, Firecrawl scrape, and Apollo org enrichment, followed by a structured-output line with `factCount > 0`. The balance lines should show paid calls actually settling; if the delta is zero while endpoints claim success, debug AgentCash before trusting provider coverage.

### Start local services

Open Docker Desktop first and wait until it says the engine is running. Then verify the Docker daemon is reachable:

```bash
docker info >/dev/null
```

If that command fails with `Cannot connect to the Docker daemon`, Docker Desktop is not running yet.

The local database is exposed on host port `55432` to avoid colliding with a machine-level Postgres on `5432`.

```bash
docker-compose up -d postgres
```

Two terminals while testing locally:

```text
Terminal 1: npm run dev:full     # web app + Inngest worker
Terminal 2: curl checks
```

Start everything in terminal 1:

```bash
npm run dev:full
```

This loads the repo-root `.env.local`, applies pending Drizzle migrations, then runs `next dev` and the Inngest dev worker side by side with prefixed output (`web` cyan, `inngest` magenta). One Ctrl-C stops both. Restart `dev:full` after changing extension auth values. If the extension says `extension auth not configured`, restart this process.

If you want them separate, the underlying scripts are still there: `npm run dev` (web only), `npm run dev:inngest` (worker only), and `npm run db:migrate` for schema changes. Run `set -a; source .env.local; set +a` before `npm run db:migrate` when invoking it directly. The Inngest script rebuilds `inngest-cli` once if the local binary is missing because install scripts were skipped.

### Generate and inspect a card

In the curl terminal:

```bash
curl -i -X POST http://localhost:3000/api/generate \
  -H 'content-type: application/json' \
  -d '{"domain":"cartesia.ai","confirmStart":true}'
```

Expected: `202` with `queued` or `running`, or `200` with `cached`.

After the Inngest worker finishes, open:

```text
http://localhost:3000/c/cartesia
```

Check the public API:

```bash
curl -s http://localhost:3000/api/cards/cartesia | jq '.domain, (.citations | length)'
```

Expected: `"cartesia.ai"` and a citation count.

Check that the public card does not expose extension-only synthesis:

```bash
curl -s http://localhost:3000/api/cards/cartesia | grep '"synthesis"'
```

Expected: no output.

Check the extension gate:

```bash
curl -i http://localhost:3000/api/extension/cards/cartesia
```

Expected: `403`.

Check extension-authorized access:

```bash
curl -s http://localhost:3000/api/extension/cards/cartesia \
  -H 'x-cold-start-extension-id: local-dev' \
  -H 'authorization: Bearer local-extension-token' | jq '.domain, has("synthesis")'
```

Expected: `"cartesia.ai"` and `true`.

### Try the local Chrome side panel

The side panel reads the cached extension card when one exists. If no card exists, it asks before starting `/api/generate` in `basics` mode, shows staged progress, polls until the sourced basics card is available, then renders the card. Additional research is activated from the research-layer card pile rather than a separate global analysis gate.

```bash
npm run build -w @cold-start/extension
```

Load the built `apps/extension/dist` folder, not the Vite dev server output. The CRX dev server is useful while actively editing, but it can inject localhost-only development imports into the built service worker. If Chrome reports `Service worker registration failed. Status code: 3`, or the errors page mentions `localhost:5173`, rebuild with the command above and reload the unpacked extension.

In Chrome:

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select `apps/extension/dist`.
5. Open `https://cartesia.ai`.
6. Click the Cold Start extension icon.
7. If setup appears for local testing, use API origin `http://localhost:3000` and API token `local-extension-token`.

If the setup screen shows a deployed URL while you are intentionally testing against localhost, the loaded extension was not rebuilt for local testing. Rebuild with `VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN=true VITE_COLD_START_API_ORIGIN=http://localhost:3000`, click Reload in `chrome://extensions`, reopen the side panel, and confirm the API origin is local.

If the side panel says the API deployment is out of date, the extension bundle and API deployment do not share the same contract. Deploy the web app, rebuild the extension, reload it in `chrome://extensions`, then retry.

Extension builds default to the deployed API origin. For local extension testing, build with `VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN=true VITE_COLD_START_API_ORIGIN=http://localhost:3000`; that explicit local opt-in preserves localhost settings.

Expected: the side panel opens. For a cached company with synthesis, it renders the full extension card. For a fresh company, it shows a Generate profile gate first, then renders identity, domain, team, funding, signals, and sources after generation finishes. The research layer then exposes dormant enrichment cards that can be pinned into the active stack.

Fast extension checks:

```bash
npm run qa:extension:ui -w @cold-start/extension
npm run qa:extension:smoke -w @cold-start/extension
```

The UI harness uses `apps/extension/vite.sidepanel.config.ts`, a plain Vite config that mounts the real side-panel React app with a Chrome API shim. Keep it separate from the CRX dev server so QA never mutates the built MV3 service worker.

### Inspect generation traces

Recent generation runs can be summarized from the database without opening Inngest or Vercel first:

```bash
set -a; source .env.local; set +a
npm run trace:generation -- --limit 10
npm run trace:generation -- --limit 1 --detail
npm run trace:generation -- --domain legora.com --mode analysis --quality --detail
```

Useful filters: `--domain`, `--mode basics|analysis`, `--since 4h`, `--failed`, `--json`, `--quality`, and `--detail`. This prints the job kind, run status, duration, accepted vs. rejected sources, citation count, synthesis verification count, Inngest IDs, failure reason, and deterministic QA flags when present. It is the first place to look when a company like Legora fails source extraction, a run spends too long in a provider or LLM step, or a completed run is missing extraction/synthesis trace.

For a fixed production sanity pass across the current QA company suite:

```bash
set -a; source .env.production.migrate.local; set +a
npm run qa:generation
```

The QA runner reads production DB traces and API card output for `cartesia.ai`, `elevenlabs.io`, `legora.com`, `attio.com`, `skyfire.xyz`, `minimax.io`, and `varickagents.com`. It prints a compact terminal report only. Screenshots from manual or Computer Use side-panel inspection should stay outside the repo under `~/Downloads/cold-start-qa/<timestamp>/`.

`signals` remains a substrate for generation, not a cosmetic card. The basics/analysis fetch path always asks for recent signal-style sources because launches, customers, partnerships, hiring, and funding context inform later enrichment cards. True backend jobs per enrichment card are still a roadmap item; today the trace model already stores a `jobKind` so that split can be made without hiding work behind the old global Analyze mental model.

### Stop local services

Stop the web app and Inngest worker with `Ctrl-C` in their terminals. Stop Postgres with:

```bash
docker-compose down
```

## Deployment

The internal deployment runbook lives at `docs/deployment.md`.

For the current internal deployment:

- API origin: `https://cold-start-samay58s-projects.vercel.app`
- API token: value in `.vercel/extension-api-token.production.local`
- Vercel env var that must match that token: `EXTENSION_API_TOKEN`

Do not paste `local-extension-token` into the deployed extension setup. That token is only for local development.

The extension and API share a contract version from `packages/core/api-contract.json`. Web responses carry `x-cold-start-api-contract`; extension requests carry `x-cold-start-client-contract`. Rebuild the extension after route-contract changes.

## Security

Read `SECURITY.md` before pushing or changing deployment auth.

Current repo checks:

- `.env.local`, `.vercel/`, and `.neon/` are ignored.
- The extension ID is not a secret. `EXTENSION_API_TOKEN` is.
- Public `/api/cards/{slug}` must not expose `synthesis`; only the extension route may return it.
- `npm audit` currently reports upstream dependency advisories that require deliberate dependency-upgrade work, not blind `npm audit fix --force`.

## Next upgrades

Next after this docs pass:

1. **Visual regression coverage.** Extend the Playwright side-panel harness with approved screenshots for setup, generate gate, progress, cached profile, and active research layer. Keep the checks tied to real app states, not mock-only artwork.

2. **Synthesis quality gate.** Keep the current conservative verifier, but make rejected claims visible. Return enough supported lines when evidence survives. If evidence is thin, render an explicit "not enough verified evidence" state instead of empty arrays.

3. **Run observability.** Add a local/debug generation status view with provider failures, LLM errors, unsupported claims, cost, and timestamps. Make stale `queued` or `running` rows recoverable from the app rather than manual SQL.

4. **Production hardening.** Keep `CHROME_EXTENSION_ID`, `ALLOWED_EXTENSION_ORIGINS`, and `EXTENSION_API_TOKEN` in sync across the loaded extension and Vercel. Use deployed `X402_PRIVATE_KEY` for AgentCash in headless environments. Add Vercel/Neon env validation before deploy. Track the dependency audit items in `SECURITY.md`.

## Brand

@semitechievc on X. Current internal deployed origin is `https://cold-start-samay58s-projects.vercel.app`. Future custom domain target is `coldstart.semitechie.vc` after DNS is wired.

## Cross-references

- Spec source-of-truth: `SPEC.md`
- Design system source-of-truth: `DESIGN.md`
- Security checklist: `SECURITY.md`
- Phoenix knowledge vault stubs: `~/phoenix/01-active/plans/2026-05-06-cold-start-spec.md` and `~/phoenix/02-personal/knowledge/design-taste/cold-start/design.md` both point here.
