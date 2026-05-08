# Cold Start

Cold Start helps you understand a company from its website without opening ten tabs.

Open a company domain and it builds a card with the basics: what the company does, who runs it, who has backed it, what has happened recently, which companies look nearby, and the links behind every important claim.

The public card is intentionally careful. It only shows facts that can be tied to sources. If Cold Start cannot back something up, it should not make it sound certain. It leaves the field empty, lowers confidence, or says the information was not found.

The Chrome extension adds the private investor read: why the company might matter, the best case, the skeptical case, and the questions worth asking on a first call. That sharper read stays out of the public page.

Cold Start is not a chatbot, a lead list, a CRM, or an investment score. The card is the product: a shareable page that lets someone get oriented quickly, inspect the sources, and decide what to ask next.

## Status

Implementation plan generated 2026-05-06 at `docs/superpowers/plans/2026-05-06-cold-start-implementation.md`.

Current implementation includes:

- npm workspace scaffold, typed card schema, Drizzle schema, and repository layer
- provider and LLM wrappers, research planner, evidence ledger, and pipeline orchestration
- public web card route, extension-gated card API, and side-panel generation and polling
- privacy page, golden eval seed, robots route, and sitemap

## Repository layout

```
cold-start/
├── README.md           ← this file
├── SPEC.md             ← product + technical spec (source of truth)
├── DESIGN.md           ← implemented style reference
├── docs/               ← brand docs, archived directions, and plans
├── apps/               ← Next.js web app and Chrome extension
├── packages/           ← core, db, providers, llm, pipeline, and ui packages
└── eval/               ← golden company seed and eval config
```

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

- Cold Start is not avoiding the company-intel category. It is trying to make the old version of that category feel slow, opaque, and incomplete.
- It is a card product, not a chatbot. The reusable artifact is the unit.
- It is not a contact-scraping or outbound tool.
- It is not a "should I invest" recommendation engine.
- It is not a CRM or watchlist in v0.

## Spec Origins

This project merges three independent AI-generated specs written 2026-05-06:

1. Semitechie Scout (Claude analysis)
2. semitechie.vc Implementation Spec (research-grounded second pass)
3. Project Signal (third independent technical spec)

The specs agreed on Chrome side panel, sourced facts, citations, public web, and $0.05 to $1 per card. They disagreed on backend stack, search providers, multi-agent orchestration, public URL policy, and X bot inclusion. SPEC.md resolves those disagreements with rationale.

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
VITE_COLD_START_API_ORIGIN=http://localhost:3000
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

Expected: four JSON lines with `status: "ok"` for Exa search, Exa findSimilar, Firecrawl scrape, and Apollo org enrichment.

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

In terminal 3:

```bash
curl -i -X POST http://localhost:3000/api/generate \
  -H 'content-type: application/json' \
  -d '{"domain":"cartesia.ai"}'
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

### Try the Chrome side panel

The side panel reads the cached extension card when one exists. If no card exists, it asks before starting `/api/generate` in `basics` mode, shows staged progress, polls until the sourced basics card is available, then renders the card. The deeper `analysis` mode runs only after the user clicks Analyze.

```bash
npm run build -w @cold-start/extension
```

In Chrome:

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select `apps/extension/dist`.
5. Open `https://cartesia.ai`.
6. Click the Cold Start extension icon.
7. If setup appears, use API origin `http://localhost:3000` and API token `local-extension-token`.

If the setup screen shows `https://coldstart.semitechie.vc`, the loaded extension was not rebuilt after changing `VITE_COLD_START_API_ORIGIN` or was built with a production value. Go back to `chrome://extensions`, click Reload on Cold Start, reopen the side panel, and confirm the API origin is `http://localhost:3000`.

Expected: the side panel opens. For a cached company with synthesis, it renders the full extension card. For a fresh company, it shows a Generate profile gate first, then renders identity, domain, team, funding, signals, and sources after generation finishes. If synthesis is missing, the Analyze button starts the gated analysis run.

### Stop local services

Stop the web app and Inngest worker with `Ctrl-C` in their terminals. Stop Postgres with:

```bash
docker-compose down
```

## Next upgrades

Next after this merge:

1. **Brand and UX pass**
   - Build from `DESIGN.md` and `docs/brand/semitechie-vc-design-ethos.md`.
   - Apply the eye/radar aperture system to generation states, source drawers, unsupported claims, OG images, and launch material.
   - Screenshot-check extension, mobile web, and desktop web with real cards before calling the visual system launch-ready.

2. **Synthesis quality gate**
   - Keep the current conservative verifier, but make rejected claims visible.
   - Return enough supported lines when evidence survives; otherwise render an explicit "not enough verified evidence" state instead of empty arrays.
   - Persist synthesis review status and drop reasons so bad synthesis can be debugged without rerunning the whole card.

3. **Run observability**
   - Add a local/debug generation status view showing provider failures, LLM errors, unsupported claims, cost, and timestamps.
   - Make stale `queued` or `running` rows recoverable from the app rather than manual SQL.
   - Show the actual run duration in the extension once a fresh generation completes.

4. **Production hardening**
   - Require exact `CHROME_EXTENSION_ID` in production.
   - Use deployed `X402_PRIVATE_KEY` for AgentCash in headless environments.
   - Add Vercel/Neon env validation before deploy.
   - Track upstream `npm audit` warnings from pinned transitive dependencies: Next pins `postcss@8.4.31`; CRXJS pins `rollup@2.79.2`.

## Brand

@semitechievc on X. Domain target: `coldstart.semitechie.vc`.

## Cross-references

- Spec source-of-truth: `SPEC.md`
- Design system source-of-truth: `DESIGN.md`
- Phoenix knowledge vault stubs: `~/phoenix/01-active/plans/2026-05-06-cold-start-spec.md` and `~/phoenix/02-personal/knowledge/design-taste/cold-start/design.md` both point here.
