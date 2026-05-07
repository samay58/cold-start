# Cold Start

Company context card for investor-grade browsing. One click on any company website, get a cached sourced card quickly or start a fresh background generation when no card exists yet. Public sourced facts live at `coldstart.semitechie.vc/c/{slug}`. Bull case, bear case, and open questions are gated behind the Chrome extension.

The wedge: faster bearings on the company already in the tab. Pitchbook's tile asserts; Cold Start cites.

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
├── DESIGN.md           ← style reference and design tokens
├── apps/               ← Next.js web app and Chrome extension
├── packages/           ← core, db, providers, llm, pipeline, and ui packages
└── eval/               ← golden company seed and eval config
```

## Decisions locked in spec

| Question | Answer |
|----------|--------|
| Name | Cold Start |
| URL policy | Public sourced facts at `/c/{slug}`, gated synthesis behind Chrome extension or auth |
| Data plumbing | AgentCash + stableenrich primary, direct-vendor fallback per endpoint if a gap surfaces on day-1 spike |
| Build pace | 3-week MVP, no Arc Boost POC, no weekend hack |
| Backend | Next.js 15 on Vercel + Inngest + Neon Postgres |
| LLM | Claude Sonnet 4.6, single agent with parallel tool calls, no orchestrator-worker in v0 |
| Bull/bear scope | In v0 but only on extension surface; web public URL omits synthesis entirely |
| X bot | Deferred to v1.1; manual @semitechievc posting in v0 |
| Brand | Personal under @semitechievc, no separate product handle until product proves out |

## What this product is not

- Not a Pitchbook clone (theirs is a database lookup; this is a context layer).
- Not a chatbot. The card is the unit; the chat is incidental.
- Not a contact-scraping or outbound tool.
- Not a "should I invest" recommendation engine.
- Not a CRM or watchlist in v0.

## Provenance

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
set -a; source .env.local; set +a
npm run db:migrate
```

Two terminals while testing locally:

```text
Terminal 1: npm run dev:full     # web app + Inngest worker
Terminal 2: curl checks
```

Each terminal needs env vars loaded first:

```bash
set -a; source .env.local; set +a
```

Start everything in terminal 1:

```bash
npm run dev:full
```

This runs `next dev` and the Inngest dev worker side by side with prefixed output (`web` cyan, `inngest` magenta). One Ctrl-C stops both. The web app loads the repo-root `.env.local` through `apps/web/next.config.ts`. Restart `dev:full` after changing extension auth values. If the extension says `extension auth not configured`, restart this process.

If you want them separate, the underlying scripts are still there: `npm run dev` (web only) and `npm run dev:inngest` (worker only). The Inngest script uses the `NPM_CONFIG_CACHE=$(mktemp -d) npx --ignore-scripts=false` invocation to dodge a known monorepo install-scripts skip; without that, `inngest-cli` fails with `Inngest CLI binary not found`.

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

The side panel reads the cached extension card when one exists. If no card exists, it starts `/api/generate`, shows staged progress, polls until the card is available, then renders the extension card.

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

Expected: the side panel opens. For a cached company, it renders the extension card with synthesis. For a fresh company, it shows Resolve, Plan, Retrieve, and Synthesize while the worker runs. When the worker completes, the panel renders the full card with bull/bear synthesis.

### Stop local services

Stop the web app and Inngest worker with `Ctrl-C` in their terminals. Stop Postgres with:

```bash
docker-compose down
```

## Next upgrades

Next after this merge:

1. **Brand and UX pass**
   - Build from `DESIGN.md` and `docs/brand/semitechie-vc-design-ethos.md`.
   - Apply the eye/radar aperture system to generation states, source drawers, verifier drops (claims the verifier rejected), OG images, and launch material.
   - Screenshot-check extension, mobile web, and desktop web with real cards before calling the visual system launch-ready.

2. **Synthesis quality gate**
   - Keep the current conservative verifier, but make rejected claims visible.
   - Return exactly three bull and three bear lines when supported; otherwise render an explicit "not enough verified evidence" state instead of empty arrays.
   - Persist verifier status and drop reasons so bad synthesis can be debugged without rerunning the whole card.

3. **Run observability**
   - Add a local/debug generation status view showing provider failures, LLM errors, verifier drops, cost, and timestamps.
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
