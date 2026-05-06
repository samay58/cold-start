# Cold Start

AI-native company context card. One click on any company website, get a sourced investor-grade card in under thirty seconds. Public sourced facts at `coldstart.semitechie.vc/c/{slug}`. Bull case, bear case, open questions gated behind the Chrome extension.

The wedge: faster bearings on the company already in the tab. Pitchbook's tile asserts; Cold Start cites.

## Status

Implementation plan generated 2026-05-06 at `docs/superpowers/plans/2026-05-06-cold-start-implementation.md`.

Current implementation includes the npm workspace scaffold, typed card schema, Drizzle schema and repository layer, provider and LLM wrappers, pipeline orchestration, public web card route, extension-gated card API, Chrome side panel shell, privacy page, golden eval seed, robots route, and sitemap.

Execution gates:

- Week 1: backend + claim store
- Week 2: public web card
- Week 3: Chrome extension + launch hardening

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

This project is the synthesized output of three independent AI-generated specs written 2026-05-06:

1. Semitechie Scout (Claude analysis)
2. semitechie.vc Implementation Spec (research-grounded second pass)
3. Project Signal (third independent technical spec)

All three converged on Chrome side panel, sourced facts with citations, public web sources, $0.05 to $1 per card. They diverged on backend stack, search providers, multi-agent orchestration, public URL policy, and X bot inclusion. SPEC.md resolves all five disagreements with rationale.

## Build sequencing

Week 1: backend + claim store. Day 1 spike: confirm stableenrich endpoint coverage via AgentCash. If gaps, fall back to direct vendor for that endpoint only.

Week 2: web app at `/c/{slug}`, OG image generation, and golden eval set of 50 hand-curated companies.

Week 3: Chrome extension (MV3 + Side Panel API + Vite + CRXJS), Chrome Web Store submission, Twitter launch under @semitechievc.

Detailed task breakdown lives at `docs/superpowers/plans/2026-05-06-cold-start-implementation.md`.

## Manual local test

Use this path to try the app like a new local user. Run from the repo root.

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

AgentCash does not use an API key. In local development it uses the wallet created by `agentcash`; in deployed environments set `X402_PRIVATE_KEY`.

Redeem or fund AgentCash if needed:

```bash
npx agentcash@latest balance
npx agentcash@latest redeem AC-XJZZ-2KJR-GSMJ-T24Y
```

### Check the paid data path

```bash
set -a; source .env.local; set +a
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
```

Expected: four JSON lines with `status:"ok"` for Exa search, Exa findSimilar, Firecrawl scrape, and Apollo org enrichment.

### Start local services

Open Docker Desktop first and wait until it says the engine is running. Then verify Docker can answer:

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

Start the web app in terminal 1:

```bash
set -a; source .env.local; set +a
npm run dev -w @cold-start/web
```

The web app also loads the repo-root `.env.local` through `apps/web/next.config.ts`, but restart `next dev` after changing extension auth values. If the extension says `extension auth not configured`, stop this web process and start it again.

Start the Inngest local worker in terminal 2:

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

If that fails with `Inngest CLI binary not found` because npm skipped install scripts, run:

```bash
NPM_CONFIG_CACHE=$(mktemp -d) npx --ignore-scripts=false inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

### Generate and inspect a card

In terminal 3:

```bash
set -a; source .env.local; set +a
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
curl -s http://localhost:3000/api/cards/cartesia | rg '"synthesis"'
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

This path assumes the card already exists from the generation step above. The current extension reads the cached extension card; generation is exercised through `/api/generate`.

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

If the setup screen shows `https://coldstart.semitechie.vc`, the loaded extension is stale or was built with a production `VITE_COLD_START_API_ORIGIN`. Go back to `chrome://extensions`, click Reload on Cold Start, reopen the side panel, and confirm the API origin is `http://localhost:3000`. A local extension build reads the repo-root `.env.local`; the deployed origin is only for a production deployment with matching deployed env vars.

Expected: the side panel opens and renders the extension card with synthesis.

## Next upgrades

These are the concrete follow-on phases after this plumbing merge:

1. **Full brand and UX infusion pass**
   - Build from `DESIGN.md` and `docs/brand/semitechie-vc-design-ethos.md`.
   - Apply the eye/radar aperture system to generation states, source drawers, verifier drops, OG images, and launch material.
   - Screenshot-check extension, mobile web, and desktop web with real cards before calling the visual system launch-ready.

2. **Synthesis quality gate**
   - Keep the current conservative verifier, but make drops visible.
   - Return exactly three bull and three bear lines when supported; otherwise render an explicit "not enough verified evidence" state instead of empty arrays.
   - Persist verifier status and drop reasons so bad synthesis can be debugged without rerunning the whole card.

3. **Side-panel generation flow**
   - If the extension route returns `card not found`, let the side panel start `/api/generate`.
   - Show queued/running/complete/failed states in the panel.
   - Poll until the cached card exists, then render it without requiring a curl command.

4. **Run observability**
   - Add a local/debug generation status view showing provider failures, LLM errors, verifier drops, cost, and timestamps.
   - Make stale `queued` or `running` rows recoverable from the app rather than manual SQL.

5. **Production hardening**
   - Require exact `CHROME_EXTENSION_ID` in production.
   - Use deployed `X402_PRIVATE_KEY` for AgentCash in headless environments.
   - Add Vercel/Neon env validation before deploy.
   - Track current upstream audit residuals: Next pins `postcss@8.4.31`; CRXJS pins `rollup@2.79.2`.

## Brand

@semitechievc on X. Domain target: `coldstart.vc` if available, else `coldstart.semitechie.vc`.

## Cross-references

- Spec source-of-truth: `SPEC.md`
- Design system source-of-truth: `DESIGN.md`
- Phoenix knowledge vault stubs: `~/phoenix/01-active/plans/2026-05-06-cold-start-spec.md` and `~/phoenix/02-personal/knowledge/design-taste/cold-start/design.md` both point here.
