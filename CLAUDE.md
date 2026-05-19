# CLAUDE.md

This file gives Claude Code the repo-specific context needed to work safely in Cold Start.

## Project

Cold Start is an AI-native company context card. Public sourced facts live at `/c/{slug}`. Bull, bear, and open-question synthesis is gated behind the Chrome extension.

Treat `SPEC.md` as the product and technical source of truth. Treat `DESIGN.md` as the visual source of truth.

## Workspace Layout

This is an npm workspaces monorepo with `apps/*` and `packages/*`. Cross-package dependencies use `file:` links, so package changes are picked up after one root `npm ci`.

- `apps/web`: Next.js 15 App Router app (Tailwind v4, React 19). Hosts `/c/{slug}`, `/api/cards/{slug}`, `/api/extension/cards/{slug}`, `/api/generate`, and `/api/inngest`.
- `apps/extension`: Chrome MV3 side panel built with Vite, CRXJS, React 19, and Framer Motion. The active research-layer surface lives in `src/research-layer.ts`, `src/research-layer-motion.ts`, and `src/ResearchLayerPanel.tsx`; pin/unpin enrichment cards from there rather than a separate analysis gate.
- `packages/core`: typed `ColdStartCard` schema, trust/source quality helpers, and slug helpers.
- `packages/db`: Drizzle ORM and Postgres repository layer. Local Postgres uses host port `55432`.
- `packages/providers`: AgentCash and stableenrich wrappers, direct Exa, Firecrawl, and PDL fallbacks.
- `packages/llm`: Anthropic client, extraction, synthesis, verifier, research-plan, and investor-taste-kernel logic.
- `packages/pipeline`: card generation orchestration, evidence ledger, cost tracking, and conflict resolution.
- `packages/ui`: shared React card primitives and `tokens.css`.
- `eval/golden-companies.seed.json`: starter 50-company eval set.

Data flow: `/api/generate` queues work through Inngest. `apps/web/src/inngest/functions.ts` calls `packages/pipeline/src/generate-card.ts`. The pipeline calls providers and LLM packages, then writes through `packages/db`. Public card routes strip synthesis. Extension card routes return synthesis only after `apps/web/src/lib/extension-auth.ts` accepts the request.

## Common Commands

Run from the repo root unless noted.

```bash
npm ci                                  # one-time install
npm run dev:full                        # local web app plus Inngest worker
npm run dev                             # web app only
npm run dev:extension                   # Vite dev server for the extension
npm run build                           # build all workspaces
npm run typecheck                       # tsc --noEmit across workspaces
npm run test                            # vitest across workspaces, then `node --test eval/*.test.mjs`
npm run lint                            # per-workspace fan-out (web's lint script is currently a stub)
npm run db:generate                     # drizzle-kit generate
npm run db:migrate                      # drizzle-kit migrate
npm run db:migrate:production           # scripts/migrate-production.mjs against prod DB
npm run dev:fresh                       # wipe apps/web/.next + .cold-start, then dev:full
npm run trace:generation                # tsx scripts/trace-generation.ts (single-run debug)
npm run qa:generation                   # tsx scripts/qa-generation-suite.ts (multi-company QA)
npm run eval:golden                     # node eval/run-golden.mjs against the seed set
```

Use `set -a; source .env.local; set +a` before commands that hit the database, providers, or LLMs directly.

Single test examples:

```bash
npm test -w @cold-start/pipeline -- generate-card
npm test -w @cold-start/pipeline -- -t "verifier drops"
```

Provider smoke, paid path:

```bash
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
```

Extension QA (Playwright):

```bash
npm run qa:extension:ui -w @cold-start/extension     # mounts the side panel via vite.sidepanel.config.ts with a Chrome API shim
npm run qa:extension:smoke -w @cold-start/extension  # builds extension, then loads the MV3 bundle in Playwright
```

Local stack:

```bash
docker-compose up -d postgres
npm run dev:full
```

`dev:full` loads the repo-root `.env.local`, runs pending Drizzle migrations, then starts Next and the Inngest dev worker together.

## Auth And Deployment Notes

- Local extension setup can use API origin `http://localhost:3000` and API token `local-extension-token` only when the extension is explicitly built for local development.
- Current default extension and internal deployed origin is `https://cold-start-samay58s-projects.vercel.app`.
- Deployed extension setup uses the token in `.vercel/extension-api-token.production.local`. Its value must match Vercel `EXTENSION_API_TOKEN`.
- `VITE_COLD_START_API_ORIGIN` is a build-time extension variable, not a deployed web-app runtime variable.
- Restart `dev:full` after changing extension auth env vars. A running Next process will not pick them up.
- Production must keep `PUBLIC_GENERATION_ENABLED=false` and use a real `CHROME_EXTENSION_ID` plus a non-wildcard `ALLOWED_EXTENSION_ORIGINS`. `apps/web/src/lib/extension-auth.ts` fails closed on `local-dev`/wildcard sentinels in production; preserve that behavior.
- Read `SECURITY.md` before changing auth, env handling, dependency versions, or anything that could expose tokens.

## Conventions

- `apps/web` launches through `scripts/run-next.mjs`, which loads the repo-root `.env.local`, not `apps/web/.env.local`.
- Public `/api/cards/{slug}` must never return `synthesis`.
- Extension `/api/extension/cards/{slug}` requires `x-cold-start-extension-id` and `authorization: Bearer $EXTENSION_API_TOKEN`, then returns synthesis when present.
- `packages/core/src/card.ts` is load-bearing. Every fact is a `ResolvedFact<T>` with `value`, `confidence`, and citation refs. Verifier drops set `value: null` rather than removing fields.
- Generation has two modes: `basics` (sourced public card, can be cached) and `analysis` (extension-gated, adds synthesis). The pipeline records mode as `jobKind` in generation traces. `analysis` runs require synthesis to be present (see commit `249e606`).
- The extension and API share a contract version pinned in `packages/core/api-contract.json`. Web responses send `x-cold-start-api-contract`; extension requests send `x-cold-start-client-contract`. Bump the version and rebuild the extension whenever route shapes change.
- When adding a card field, update schema, extraction, pipeline assembly, and UI together.
- Extension build output goes to `apps/extension/dist`; load that folder unpacked in Chrome.
- If the side panel shows the wrong API origin, rebuild the extension. Use the deployed origin by default; use `VITE_COLD_START_API_ORIGIN=http://localhost:3000 VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN=true` only for local development. Reload `apps/extension/dist` in `chrome://extensions`, then reopen the side panel.
- Current visual guidance lives in `DESIGN.md`: Fraunces + Mona Sans, parchment-first surfaces, sand hairlines, and Lens Blue source signal. Archived Paper/brand directions under `docs/brand/archive/` are historical only.

## Data Layer

- Neon is the production Postgres target because it pairs cleanly with Vercel and keeps server operations light.
- Drizzle is the ORM. Schema lives in `packages/db/src/schema.ts`; migrations live in `packages/db/drizzle/`.
- The full card is stored as JSONB in `cards.card_json` and `cards.public_card_json` for cheap whole-card reads.
- `sources`, `citations`, `claims`, and `generation_runs` are normalized so evals and debugging can query across cards.
- When adding a field, decide whether it belongs only in card JSON or also needs normalized rows for cross-card querying.

## Where To Look First

- Card field: `packages/core/src/card.ts`, `packages/llm/src/extraction.ts`, `packages/pipeline/src/generate-card.ts`, `packages/ui/src/CardShell.tsx`.
- Provider issue: `packages/providers/src/stableenrich.ts`, `packages/providers/src/direct-exa.ts`, and the provider spike script.
- Pipeline run debugging: `packages/pipeline/src/generate-card.ts`, `packages/pipeline/src/evidence-ledger.ts`, `packages/pipeline/src/cost.ts`.
- Auth/gate behavior: `apps/web/src/lib/extension-auth.ts` and the route files under `apps/web/src/app/api/`.
- Background work: `apps/web/src/inngest/functions.ts`.
- Generation QA: `scripts/trace-generation.ts` for one-shot pipeline traces, `scripts/qa-generation-suite.ts` for batch runs over fixture companies. Both expect `.env.local` sourced.

## Cross-References

- `README.md`: local setup, smoke tests, and deployed extension setup.
- `docs/deployment.md`: Vercel, Neon, Inngest, and extension deployment.
- `docs/qa/extension-closed-loop-testing-playbook.md`: manual extension QA loop.
- `SPEC.md`: product spec.
- `DESIGN.md`: visual system.
- `docs/superpowers/plans/2026-05-06-cold-start-implementation.md`: original implementation plan.
