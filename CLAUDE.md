# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cold Start — AI-native company context card. Public sourced facts at `coldstart.semitechie.vc/c/{slug}`; bull/bear/open-questions synthesis is gated behind a Chrome extension. SPEC.md is source of truth for product, DESIGN.md for visuals.

## Workspace layout

npm workspaces monorepo (`apps/*`, `packages/*`). All cross-package deps are `file:` links, so changes in `packages/*` are picked up immediately by `apps/*` after a single `npm ci` at the root.

- `apps/web` — Next.js 15 app (App Router). Hosts `/c/{slug}` public pages, `/api/cards/{slug}` (public, sourced facts only), `/api/extension/cards/{slug}` (gated, includes `synthesis`), `/api/generate` (queue), `/api/inngest` (worker endpoint).
- `apps/extension` — Chrome MV3 side panel via Vite + CRXJS + React 19. Reads cached extension card or kicks off generation and polls.
- `packages/core` — typed `ColdStartCard` schema (zod), trust/source quality, slug helpers. No runtime deps on infra.
- `packages/db` — Drizzle ORM + Postgres (Neon in prod, local Postgres on host port `55432` in dev). Repository layer for cards.
- `packages/providers` — AgentCash + stableenrich wrappers (Exa, Firecrawl, Apollo). `npm run spike:stableenrich` end-to-end smoke.
- `packages/llm` — Anthropic SDK (Sonnet 4.6). Extraction, synthesis, verifier, research-plan, investor-taste-kernel.
- `packages/pipeline` — orchestration: `resolve-identity` → research plan → providers → extraction → synthesis → verifier. Outputs `ColdStartCard` plus an evidence ledger and cost lines.
- `packages/ui` — shared React tokens + card primitives. CSS lives in `tokens.css`.
- `eval/golden-companies.seed.json` — 50-company eval seed.

The data flow worth holding in your head: `apps/web/api/generate` enqueues via Inngest → `apps/web/inngest/functions.ts` calls `packages/pipeline/generate-card.ts` → providers + LLM packages → DB write via `packages/db`. Public route `/c/{slug}` reads through `apps/web/lib/cards.ts` and strips synthesis; extension route adds synthesis only when extension auth headers pass `apps/web/lib/extension-auth.ts`.

## Common commands

Run from repo root unless noted. `set -a; source .env.local; set +a` before any command that hits the DB or the LLM.

```bash
npm ci                                  # one-time
npm run dev                             # Next dev server (apps/web)
npm run dev:extension                   # Vite dev for the extension
npm run build                           # build all workspaces
npm run typecheck                       # tsc --noEmit across workspaces
npm run test                            # vitest run across workspaces
npm run lint                            # only configured per-workspace; root is a fan-out
npm run db:generate                     # drizzle-kit generate (in packages/db)
npm run db:migrate                      # drizzle-kit migrate
```

Single test (vitest), per workspace:

```bash
npm test -w @cold-start/pipeline -- generate-card
npm test -w @cold-start/pipeline -- -t "verifier drops"
```

Provider smoke (paid path, requires AgentCash wallet funded):

```bash
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
```

Local Postgres + Inngest worker (two extra terminals):

```bash
docker-compose up -d postgres                                # host port 55432
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

End-to-end card generation against local stack (see README "Generate and inspect a card" for the full curl sequence including the `403`/`200` extension-gate checks).

## Conventions you'll trip over

- `apps/web` is launched via `scripts/run-next.mjs`, which loads the **repo-root** `.env.local` (not `apps/web/.env.local`) and writes a dev lock at `apps/web/.cold-start/`. Restart `next dev` after changing extension auth env vars; the running process won't pick them up.
- Postgres is exposed on **`55432`** locally to avoid colliding with a system Postgres on `5432`. `DATABASE_URL` in `.env.local` should match.
- AgentCash uses a wallet, not an API key. Local dev uses the `agentcash` CLI wallet; deployed environments need `X402_PRIVATE_KEY`. `ANTHROPIC_API_KEY` is required for any LLM-touching command.
- Two card surfaces, two API routes, do not merge them. Public `/api/cards/{slug}` MUST NOT return `synthesis`; extension `/api/extension/cards/{slug}` requires `x-cold-start-extension-id` and `authorization: Bearer $EXTENSION_API_TOKEN` and DOES return synthesis. Tests at `apps/web/tests/public-card-metadata.test.ts` enforce this.
- The card schema in `packages/core/src/card.ts` is load-bearing. Every fact is a `ResolvedFact<T>` with `value`, `confidence`, and citation refs; verifier drops set `value: null` rather than removing fields. When adding a field, update extraction (`packages/llm`), pipeline assembly (`packages/pipeline/generate-card.ts`), and the UI (`packages/ui`) together.
- Vitest workspace excludes `apps/web` (it has its own `vitest run`); `npm run test` at root runs both via the workspaces fan-out, while `vitest.workspace.ts` is what the `vitest` CLI uses if invoked directly.
- Extension build output goes to `apps/extension/dist`; load-unpacked from there. If the side panel setup screen shows the production origin, the build has a stale `VITE_COLD_START_API_ORIGIN` — rebuild, then click Reload in `chrome://extensions`.

## Where to look first

- Adding a card field: `packages/core/src/card.ts` → `packages/llm/src/extraction.ts` → `packages/pipeline/src/generate-card.ts` → `packages/ui/src/CardShell.tsx`.
- Provider issue: `packages/providers/src/stableenrich.ts` and the spike script.
- Pipeline run debugging: `packages/pipeline/src/generate-card.ts`, then `evidence-ledger.ts` and `cost.ts`.
- Auth/gate behavior: `apps/web/src/lib/extension-auth.ts` and the two card route files under `apps/web/src/app/api/`.
- Background work: `apps/web/src/inngest/functions.ts`.

## Cross-references

- `SPEC.md` — product spec (visibility tiers, schema, build sequencing). Treat as source of truth.
- `DESIGN.md` — design tokens and visual system.
- `docs/superpowers/plans/2026-05-06-cold-start-implementation.md` — task breakdown.
