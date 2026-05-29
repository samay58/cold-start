# AGENTS.md

This file gives Codex the repo-specific context needed to work safely in Cold Start.

## Project

Cold Start is an AI-native company context card. Public sourced facts live at `/c/{slug}`. Bull, bear, and open-question synthesis is gated behind the Chrome extension.

Treat `SPEC.md` as the product and technical source of truth. Treat `DESIGN.md` as the visual source of truth.

## Workspace Layout

This is an npm workspaces monorepo with `apps/*` and `packages/*`. Cross-package dependencies use `file:` links, so package changes are picked up after one root `npm ci`.

- `apps/web`: Next.js 15 App Router app (Tailwind v4, React 19). Hosts `/c/{slug}`, `/api/cards/{slug}`, `/api/extension/cards/{slug}`, `/api/generate`, and `/api/inngest`.
- `apps/extension`: Chrome MV3 side panel built with Vite, CRXJS, React 19, and Framer Motion. The active research-layer surface lives in `src/research-layer.ts`, `src/research-layer-motion.ts`, and `src/ResearchLayerPanel.tsx`.
- `packages/core`: typed `ColdStartCard` schema, trust/source quality helpers, and slug helpers.
- `packages/db`: Drizzle ORM and Postgres repository layer. Local Postgres uses host port `55432`.
- `packages/providers`: AgentCash and StableEnrich wrappers, direct Exa, Firecrawl, SEC EDGAR, and provider budget registry.
- `packages/llm`: Anthropic client, extraction, synthesis, verifier, research-plan, and investor-taste-kernel logic.
- `packages/pipeline`: card generation orchestration, evidence ledger, cost tracking, and conflict resolution.
- `packages/ui`: shared React card primitives and `tokens.css`.
- `eval/golden-companies.seed.json`: starter 50-company eval set.
- `experiments/`: exploratory work outside the npm workspace graph. Treat `experiments/activegraph-coldstart` as scratch unless it is promoted into a deterministic eval.

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
npm run test                            # vitest across workspaces, then node:test evals
npm run lint                            # ESLint flat-config check
npm run check                           # full local/CI gate
npm run knip                            # unused dependency/export check
npm run secrets:check                   # scan tracked surfaces for accidental secrets
npm run audit:deps                      # guarded production dependency audit
npm run db:generate                     # drizzle-kit generate
npm run db:migrate                      # drizzle-kit migrate
npm run trace:generation                # inspect recent generation traces
npm run qa:generation                   # production generation QA suite
npm run eval:golden                     # golden-company eval harness
```

Use `set -a; source .env.local; set +a` before commands that hit the database, providers, or LLMs directly.

Single test examples:

```bash
npm test -w @cold-start/pipeline -- generate-card
npm test -w @cold-start/pipeline -- -t "verifier drops"
```

Extension QA:

```bash
npm run qa:extension:ui -w @cold-start/extension
npm run qa:extension:smoke -w @cold-start/extension
```

Provider smoke, paid path:

```bash
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
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
- Production must keep `PUBLIC_GENERATION_ENABLED=false` and use a real `CHROME_EXTENSION_ID` plus a non-wildcard `ALLOWED_EXTENSION_ORIGINS`. `apps/web/src/lib/extension-auth.ts` fails closed on `local-dev`/wildcard sentinels in production; preserve that behavior. Bearer comparison is timing-safe.
- Read `SECURITY.md` before changing auth, env handling, dependency versions, or anything that could expose tokens.

## Conventions

- `apps/web` launches through `scripts/run-next.mjs`, which loads the repo-root `.env.local`, not `apps/web/.env.local`.
- Public `/api/cards/{slug}` must never return `synthesis`.
- Extension `/api/extension/cards/{slug}` requires `x-cold-start-extension-id` and `authorization: Bearer $EXTENSION_API_TOKEN`, then returns synthesis when present.
- `packages/core/src/card.ts` is load-bearing. Every non-null citation-bearing fact needs citation refs, and every ref must resolve to the top-level `citations[]`.
- Public reads derive from `cards.card_json` at request time. `cards.public_card_json` is a temporary compatibility cache, not authority.
- Cache reads enforce section TTLs by mode: `basics` needs fresh identity and signals; `analysis` also needs fresh synthesis.
- Verifier drops stay dropped. `synthesis.bullCase` and `synthesis.bearCase` are 0-3 supported claims after verification, not shape-padded lists.
- Generation has two modes: `basics` (sourced public card, can be cached) and `analysis` (extension-gated, adds synthesis). Generation runs carry mode and job kind in traces.
- The extension and API share a contract version pinned in `packages/core/api-contract.json`. Bump the version and rebuild the extension whenever route shapes change.
- When adding a card field, update schema, extraction, pipeline assembly, and UI together.
- Extension build output goes to `apps/extension/dist`; load that folder unpacked in Chrome.
- If the side panel shows the wrong API origin, rebuild the extension. Use the deployed origin by default; use `VITE_COLD_START_API_ORIGIN=http://localhost:3000 VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN=true` only for local development. Reload `apps/extension/dist` in `chrome://extensions`, then reopen the side panel.
- Current visual guidance lives in `DESIGN.md`: the Catalogue Card. At Umami display, IBM Plex Sans body, At Textual receipt/evidence accent, one dusty-lilac seal accent (`--color-seal #6E5C9E`), warm parchment surface, classification dots, and filed/vetted stamps. The public card and the extension side panel share this language. Archived Signal Ledger, Paper, parchment, Ray Gun, and older motion directions under `docs/brand/archive/` are historical only.
- Provider endpoint cost, timeout, expected facts, and stop conditions live in `packages/providers/src/provider-budget.ts`. Register new StableEnrich endpoints there before adding them to the pipeline.
- Stable Anthropic system prompts use 1h ephemeral cache by default via `anthropicSystemCacheControl()`. The traced helper attaches the `extended-cache-ttl-2025-04-11` beta header when TTL is 1h; without it the API silently downgrades to 5m. Override via `ANTHROPIC_CACHE_TTL=5m`. Verify with `npm run verify:cache-ttl` after SDK upgrades.
- `direct-exa` HTTP requests retry transient 429/5xx and network errors twice with backoff. 4xx auth/payment failures do NOT retry. AgentCash-backed StableEnrich calls do not retry by design: AgentCash is paid per-call, so blind retry on opaque CLI errors can multiply cost on both transient and non-transient failures.
- Generation-run `traceJson` is validated via `generationTraceSchema.safeParse` at read time. Corrupt rows produce `traceJson: null` with a structured warn, never a malformed object downstream.

## Where To Look First

- Card field: `packages/core/src/card.ts`, `packages/llm/src/extraction.ts`, `packages/pipeline/src/generate-card.ts`, `packages/ui/src/CardShell.tsx`.
- Provider issue: `packages/providers/src/stableenrich.ts`, `packages/providers/src/direct-exa.ts`, `packages/providers/src/provider-budget.ts`, and the provider spike script.
- Pipeline run debugging: `packages/pipeline/src/generate-card.ts`, `packages/pipeline/src/evidence-ledger.ts`, `packages/pipeline/src/cost.ts`.
- Auth/gate behavior: `apps/web/src/lib/extension-auth.ts` and the route files under `apps/web/src/app/api/`.
- Background work: `apps/web/src/inngest/functions.ts`.
- Generation QA: `scripts/trace-generation.ts`, `scripts/qa-generation-suite.ts`, and `docs/qa/generation-trace-and-production-qa.md`.

## Cross-References

- `README.md`: local setup, smoke tests, and deployed extension setup.
- `docs/deployment.md`: Vercel, Neon, Inngest, and extension deployment.
- `SPEC.md`: product spec.
- `DESIGN.md`: visual system.
- `docs/superpowers/plans/2026-05-06-cold-start-implementation.md`: original implementation plan.
