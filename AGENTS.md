# AGENTS.md

This file gives Codex the repo-specific context needed to work safely in Cold Start.

## Project

Cold Start is an AI-native company context card. Public sourced facts live at `/c/{slug}`. Bull, bear, and open-question synthesis is gated behind the Chrome extension.

Treat `SPEC.md` as the product and technical source of truth. Treat `DESIGN.md` as the visual source of truth.

## Workspace Layout

This is an npm workspaces monorepo with `apps/*` and `packages/*`. Cross-package dependencies use `file:` links, so package changes are picked up after one root `npm ci`.

- `apps/web`: Next.js 15 App Router app (Tailwind v4, React 19). Hosts `/c/{slug}`, `/privacy`, `/api/cards/{slug}`, `/api/extension/cards/{slug}`, `/api/extension/bootstrap`, `/api/generate`, and `/api/inngest`.
- `apps/extension`: Chrome MV3 side panel built with Vite, CRXJS 2.7, React 19, and Framer Motion, plus an in-progress Firefox target (source of truth: `docs/superpowers/plans/2026-07-13-firefox-port.md`). `manifest.config.ts` takes a `browser` parameter (Chrome branch keeps exact key order for byte-stable diffs; Firefox branch uses `sidebar_action`, `background.scripts` in source, gecko ID `cold-start@semitechie.vc`); `vite.firefox.config.ts` builds to `dist-firefox` via `build:firefox` and must name `sidepanel.html` as a rollup input; `src/background.ts` feature-detects `"sidePanel" in chrome` and calls `browser.sidebarAction.open()` synchronously first on Firefox (typed by `src/firefox.d.ts`). The first-90-seconds arc (intake, building, profile) is one shell: `src/CompanyArc.tsx` owns the phases, the persistent identity band in `src/CompanyHeader.tsx`, the early read placement, and the sealed Investor Lens row; while building, the assembling card itself is the progress surface: the header whisper in `CompanyArc.tsx` (copy from `whisperCopyFromEvents` in `src/research-progress.ts`) is the status voice, `src/Clippings.tsx` with `src/clipping-model.ts` renders live source clippings (classed with First Payoff's source-class taxonomy; thumbnails from `sources.image_url`, migration 0008, only for news/funding/customer-proof classes), and `src/SealInstrument.tsx` is the wax-seal progress object that inks up on real stage events and sets as the FILED stamp. `src/ResearchTrail.tsx` is only the quiet Details toggle plus the lazy `SourcePassInstrument` tree it opens (auto-open on attention). People on the profile get cited dossier hovercards (`src/CompanyHeader.tsx` with `src/SharedTooltip.tsx`), which carry the extension-tier person read. The active research-layer surface lives in `src/research-layer.ts`, `src/research-layer-motion.ts`, and `src/ResearchLayerPanel.tsx` (research layers plus card tray, composed under the arc); keep research module activation and pinning there rather than a separate analysis gate. First Payoff is the source-backed early read: core logic and schema live in `packages/core/src/first-payoff.ts`, rendered inline by `src/ReadRegion.tsx` (receipt/substantive/withheld while building; substantive only on the profile), with `src/first-payoff-events.ts` deriving it from progress events and `src/company-display.ts` owning the event-driven filing decision; it classifies headline newsworthiness via the shared `headline` util in `packages/core`, so keep that classifier in core. Source-class heuristics (docs/funding/customer-proof) live in `packages/core/src/source-class.ts`, shared by First Payoff and the extension's `research-progress`. The investor lens (`src/investor-lens.ts`) renders as one memo card, the single synthesis surface (Why care, The case, Timing, and Next question, with source postures and "+N more" overflow; `investorReadForCard` feeding `InvestorReadCard` in `ResearchLayerPanel.tsx`); the research-layer deck carries only card-sourced layers. Voiced by the `investor-taste-kernel` system prompt in `packages/llm/src/investor-taste-kernel.ts`. Person reads share that voice: the person-level `read` field on `personSchema` in `packages/core/src/card.ts` is synthesized by `packages/llm/src/person-read.ts` inside the contact-enrichment worker (gated by `PERSON_READS_ENABLED`, default on) and is stripped from the public card like the rest of synthesis.
- `packages/core`: typed `ColdStartCard` schema, trust/source quality helpers, and slug helpers.
- `packages/db`: Drizzle ORM and Postgres repository layer. Local Postgres uses host port `55432`.
- `packages/providers`: AgentCash and StableEnrich wrappers, direct Exa, Firecrawl, SEC EDGAR, and provider budget registry.
- `packages/llm`: Anthropic client, extraction, synthesis, verifier, research-plan, and investor-taste-kernel logic.
- `packages/pipeline`: card generation orchestration, evidence ledger, cost tracking, and conflict resolution.
- `packages/ui`: shared React card primitives and `tokens.css`.
- `eval/golden-companies.seed.json`: starter 50-company eval set. `eval/investor-lens/score.mjs` scores synthesis claims against generic-phrase and quality checks; its tests run under the `node --test eval/**/*.test.mjs` glob in `npm run test`.

Data flow: `/api/generate` queues work through Inngest and streams generation status events back to the caller (the contract version is pinned in `packages/core/api-contract.json`; read that file for the current value rather than trusting any literal here); the extension and web progress feeds render those events. `apps/web/src/inngest/functions.ts` registers the Inngest workers and owns event names, step names, retry boundaries, and trace merging. Source fetching, contact enrichment, async card enrichment, section generation, storage guards, env helpers, and provider trace helpers live in neighboring `apps/web/src/inngest/*` modules. The `basics` path returns a first-usable card fast; remaining block enrichment happens afterward in the async card-enrichment worker. Full card assembly stays in `packages/pipeline/src/generate-card.ts`, which receives injected provider and LLM functions. DB callers import through `packages/db/src/index.ts`, which re-exports the focused repository modules under `packages/db/src/repositories/`. Public card routes strip synthesis. Extension card routes return synthesis only after `apps/web/src/lib/extension-auth.ts` accepts the request.

## Common Commands

Run from the repo root unless noted.

```bash
npm ci                                  # one-time install
npm run dev:full                        # local web app plus Inngest worker
npm run dev                             # web app only
npm run dev:extension                   # Vite dev server for the extension
npm run build                           # build all workspaces
npm run typecheck                       # tsc --noEmit across workspaces
npm run test                            # vitest across workspaces, then `node --test` over eval/*.test.mjs and eval/**/*.test.mjs
npm run lint                            # ESLint flat-config check
npm run check                           # full local/CI gate
npm run knip                            # unused dependency/export check
npm run secrets:check                   # scan tracked surfaces for accidental secrets
npm run audit:deps                      # guarded production dependency audit
npm run db:generate                     # drizzle-kit generate
npm run db:migrate                      # drizzle-kit migrate
npm run db:migrate:production           # scripts/migrate-production.mjs against prod DB
npm run dev:fresh                       # wipe apps/web/.next + .cold-start, then dev:full
npm run trace:generation                # tsx scripts/trace-generation.ts (single-run debug)
npm run qa:generation                   # tsx scripts/qa-generation-suite.ts (multi-company QA)
npm run eval:golden                     # node eval/run-golden.mjs against the seed set
npm run eval:providers:bundles          # tsx eval/provider-matrix/build-bundles.ts (freeze prod evidence fixtures, read-only DB)
npm run eval:providers:matrix           # tsx eval/provider-matrix/run-matrix.ts (replay stages across LLM providers, score + report)
npm run optimize:generation             # tsx scripts/optimize-generation.ts (mine recent runs for tuning levers)
npm run measure:first-usable            # tsx scripts/measure-first-usable.ts (first-usable latency over recent real-traffic basics runs)
npm run measure:contact-yield           # tsx scripts/measure-contact-yield.ts (read-only GitHub contact-email yield over the golden set; set GITHUB_TOKEN or the API caps at 60 req/hr)
npm run repair:sections                 # tsx scripts/repair-research-sections.ts (pass --apply to write fixes)
npm run repair:signal-clusters          # tsx scripts/repair-signal-clusters.ts (re-cluster stored card signals; --apply to write, --slug for one card)
npm run repair:stuck-runs               # tsx scripts/repair-stuck-generation-runs.ts (retire runs stranded in running; --apply to write)
npm run wallet:status                   # tsx scripts/wallet-status.ts (read-only AgentCash balance, spend, burn rate)
npm run verify:cache-ttl                # tsx scripts/verify-cache-ttl.ts (confirm 1h Anthropic cache header)
npm run evo:generation-benchmark        # cost/latency report over recent runs; add --gate to fail on regression
npm run evo:ux-benchmark                # Playwright UX report (load, layout shift, overflow); add --gate to fail on regression
```

Use `set -a; source .env.local; set +a` before commands that hit the database, providers, or LLMs directly. `npm run qa:generation` is the exception; it expects `.env.production.migrate.local` because it reads the production DB and API. `measure:first-usable` self-loads `.env.production.migrate.local` (falling back to `.env.local`) for the same reason; `repair:stuck-runs` also targets the production DB and needs that env sourced first. `wallet:status` and the `evo:*` benchmarks also read a DB, so source env first; the `--gate` variants (`evo:generation-gate`, `evo:ux-gate`) are the CI-style pass/fail wrappers. `npm run check` is the full local gate and already chains lint, typecheck, test, build, a `eval:golden --dry-run --limit 12` pass, knip, secrets:check, and audit:deps. CI (`.github/workflows/check.yml`) runs those same steps individually on Node 24, so a green local `check` should mean green CI.

Single test examples:

```bash
npm test -w @cold-start/pipeline -- generate-card
npm test -w @cold-start/pipeline -- -t "verifier drops"
node --test eval/some-file.test.mjs           # node:test files under eval/ run after vitest in `npm run test`
```

Local Postgres (host port `55432`, not `5432`):

```bash
docker-compose up -d postgres                 # bring up local DB
docker-compose down                           # stop it
```

Provider smoke, paid path:

```bash
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
```

Extension QA (Playwright):

```bash
npm run qa:extension:ui -w @cold-start/extension     # mounts the side panel via vite.sidepanel.config.ts with a Chrome API shim
npm run qa:extension:smoke -w @cold-start/extension  # builds extension, then loads the MV3 bundle in Playwright
npm run audit:css -w @cold-start/extension           # fail on raw color literals and collapsing dark border/outline triplets
npm run build:firefox -w @cold-start/extension       # Firefox MV3 build to dist-firefox; run it with `npx web-ext run --source-dir apps/extension/dist-firefox`
```

Local stack:

```bash
docker-compose up -d postgres
npm run dev:full
```

`dev:full` loads the repo-root `.env.local`, runs pending Drizzle migrations, then starts Next and the Inngest dev worker together.

## Auth And Deployment Notes

- Local extension setup can use API origin `http://localhost:3000` and API token `local-extension-token` only when the extension is explicitly built for local development.
- Current public web origin is `https://cold-start.semitechie.vc`. The extension API fallback and internal deployed origin is `https://cold-start-samay58s-projects.vercel.app`.
- Deployed extension setup uses the token in `.vercel/extension-api-token.production.local`. Its value must match Vercel `EXTENSION_API_TOKEN`.
- `VITE_COLD_START_API_ORIGIN` is a build-time extension variable, not a deployed web-app runtime variable.
- Restart `dev:full` after changing extension auth env vars. A running Next process will not pick them up.
- Production must keep `PUBLIC_GENERATION_ENABLED=false` and use a real `CHROME_EXTENSION_ID` plus a non-wildcard `ALLOWED_EXTENSION_ORIGINS`. `apps/web/src/lib/extension-auth.ts` fails closed on `local-dev`/wildcard sentinels in production; preserve that behavior.
- Read `SECURITY.md` before changing auth, env handling, dependency versions, or anything that could expose tokens.

## Conventions

- `apps/web` launches through `scripts/run-next.mjs`, which loads the repo-root `.env.local`, not `apps/web/.env.local`.
- Public `/api/cards/{slug}` must never return `synthesis`.
- Extension `/api/extension/cards/{slug}` requires `x-cold-start-extension-id` and `authorization: Bearer $EXTENSION_API_TOKEN`, then returns synthesis when present.
- `packages/core/src/card.ts` is load-bearing. Every non-null citation-bearing fact needs citation refs, and every ref must resolve to the top-level `citations[]`.
- Public reads derive from `cards.card_json` at request time (the legacy `public_card_json` compatibility column was dropped in migration 0006).
- Cache reads enforce section TTLs by mode: `basics` needs fresh identity and signals; `analysis` also needs fresh synthesis.
- Signals are one-per-event with corroboration carried in `citationIds`: duplicate coverage of the same announcement is clustered by `clusterSignals` (`packages/core/src/signal-clusters.mjs`, plain dependency-free JS shared verbatim with the eval scorer), applied in `finalizeGeneratedCard` and `cardWithExtractedSections`, capped at 6, ordered date-descending. The UI derives corroboration counts from `citationIds.length`; the provider-matrix report tracks a distinct-event ratio so one-signal-per-article extraction can never pass silently.
- Sentence splitting is centralized in `packages/core/src/sentences.ts` (abbreviation-aware, biased to under-split). Description normalization and the card-quality counters in core, person-read validation in `packages/llm`, and the extension's profile summary formatting (`apps/extension/src/extension-format.ts`) all consume it. Don't reintroduce local `[.!?]` split regexes; they truncate on abbreviations like `Inc.` and `D.C.`, which is the bug this module exists to kill.
- Research-layer displays resolve stored or derived sections first: `displayFromSection` in `apps/extension/src/research-layer.ts` shadows the card-direct branches whenever a section exists, and production cards always carry derived sections (`deriveLegacyResearchSectionsFromCard` runs on every store). A layer-display change must land on both paths or it will pass fixture tests and never render in production (this bit the Comps upgrade on 2026-07-13).
- Verifier drops stay dropped. `synthesis.bullCase` and `synthesis.bearCase` are 0-3 supported claims after verification, not shape-padded lists.
- `synthesis.openQuestions` entries are structured `{question, category}` with a model-assigned category taxonomy; the schema tolerates legacy bare-string entries by normalizing them to `category: null`. Open Questions and The Case (bull/bear) render from `synthesis` only; do not reintroduce per-section question blocks or client-side category classifiers (consolidated in commit `6d09930`).
- Generation has two profile tiers: `basics` (sourced public card, can be cached) and `analysis` (extension-gated, adds synthesis). Generation runs record both `mode` (the tier) and `jobKind` (the exact job: `basics`, `analysis`, or `section:<id>`). Initial extension generation starts as `basics`; analysis and gated section jobs are blocked until the profile passes the quality gates in `analysisBlockedReason` (`packages/core/src/card-quality.ts`), and an analysis request only returns cached when synthesis is already present (see commit `249e606`).
- The extension and API share a contract version pinned in `packages/core/api-contract.json`. Web responses send `x-cold-start-api-contract`; extension requests send `x-cold-start-client-contract`. Bump the version and rebuild the extension whenever route shapes change.
- When adding a card field, update schema, extraction, pipeline assembly, and UI together.
- Extension build output goes to `apps/extension/dist`; load that folder unpacked in Chrome. The Firefox build goes to `apps/extension/dist-firefox` (gitignored and ESLint-ignored like `dist`).
- Extension API routes (`/api/extension/*`, `/api/generate`) answer CORS preflights in `apps/web/src/middleware.ts` (Firefox MV3 preflights extension-page fetches; Chrome bypasses CORS). Reflect only `moz-extension://` and `chrome-extension://` origins and keep exposing `x-cold-start-api-contract`. Auth stays in the routes.
- Firefox identity: `browser_specific_settings.gecko.id` makes `runtime.id` (and the `x-cold-start-extension-id` header) the stable `cold-start@semitechie.vc`; the Firefox `Origin` header is a per-install random UUID (Bugzilla 1405971) and must never be used as identity.
- Extension component CSS routes every color through theme-aware tokens. `npm run audit:css -w @cold-start/extension` is chained into the extension `test` (so it runs in `check` and CI) and fails on raw color literals and on any border/outline triplet whose dark value collapses onto the page ground.
- Every collection surface that can reach zero items must ship with that state explicitly designed and fixture-covered. For an `AnimatePresence` exit, record what happens when the exiting element is the final item; do not assume the collection remains populated.
- If the side panel shows the wrong API origin, rebuild the extension. Use the deployed origin by default; use `VITE_COLD_START_API_ORIGIN=http://localhost:3000 VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN=true` only for local development. Reload `apps/extension/dist` in `chrome://extensions`, then reopen the side panel.
- Current visual guidance lives in `DESIGN.md`: the Catalogue Card. The display face differs by surface: the public web surface uses a grotesk display stack (`GT America` if the licensed webfont is present, else `IBM Plex Sans` 700-780), while the extension keeps `At Umami` as its display face. IBM Plex Sans body, At Textual receipt/evidence accent, one dusty-lilac seal accent (`--color-seal #6E5C9E`), warm parchment surface, classification dots, and filed/vetted stamps. The public card and the extension side panel share this language. Archived Signal Ledger, Paper, parchment, Ray Gun, and older motion directions under `docs/brand/archive/` are historical only.
- ESLint uses flat config at the repo root (`eslint.config.mjs`). New packages inherit root rules unless they add their own config.
- Provider endpoint cost, timeout, and stop conditions are registered in `packages/providers/src/provider-budget.ts`. Wire new stableenrich endpoints there before adding them to the pipeline.
- Generation cost telemetry: `packages/core/src/generation-trace.ts` defines the trace shape, `packages/pipeline/src/cost.ts` tallies per-run Anthropic spend. Use both together when debugging cost regressions. Total run cost is four streams: `costUsdAnthropic` (all LLM spend, any provider), `costUsdAgentcash` (StableEnrich wallet delta), `providers.directExa.estimatedCostUsd` (Direct Exa bills the Exa account at ~$0.007/search), and `providers.websets.estimatedCostUsd` (Websets credits, ~15/email-enriched item; rate tunable via EXA_WEBSETS_CREDIT_USD). The Exa-billed fields are tracked since June 2026; older traces report nothing.
- LLM providers are swappable per pipeline stage. `modelForStage(stage)` in `packages/llm/src/llm-provider.ts` resolves `LLM_<STAGE>_MODEL` → `ANTHROPIC_<STAGE>_MODEL` → `ANTHROPIC_MODEL`. Model strings may carry a provider prefix (`deepseek/deepseek-v4-flash`); unprefixed strings are Anthropic. `createTracedAnthropicMessage` dispatches prefixed models to the OpenAI-compat adapter (`packages/llm/src/openai-compat.ts`, raw fetch, retries, telemetry); the Anthropic path is unchanged. Non-Anthropic pricing lives in `packages/llm/src/pricing.ts`; add a row there for every new eval-matrix model. The `research_section` and `person_read` stages fall back through the synthesis model chain (both piggyback on the synthesis stage's judgment). Read `docs/anthropic-llm-call-map.md` before touching any of this.
- OpenRouter is a provider entry in `providerDefaults` (`packages/llm/src/llm-provider.ts`), addressed with model strings like `openrouter/moonshotai/kimi-k3`. `providerConfigFor` sends `usage: {include: true}` on every OpenRouter call, so responses carry OpenRouter's billed `usage.cost`; `createTracedOpenAiCompatMessage` prefers that reported cost over the `pricing.ts` estimate table whenever it is present, for any provider that starts reporting it. A model's request quirks (rejecting `temperature`/`top_p` outright, needing a `max_tokens` floor above 8192 because reasoning tokens count against the completion budget, or rejecting a named forced `tool_choice` while thinking is enabled, downgraded to `"required"` since every stage call passes exactly one tool) live in `quirksForModel` next to `providerDefaults`; add a row there before wiring a new reasoning-mandatory model, not a special case inside `openAiCompatBodyFromAnthropicParams`. `eval/provider-matrix/run-matrix.ts` covers two judgment stages past extraction and verify: `synthesis` pairs a fresh `synthesizeCard` call with an immediate `verifySynthesis` judge pass over the candidate's own claims (a fixed judge model via `--judge`, default `deepseek/deepseek-v4-flash`, so the judge never varies while candidates are compared), and `research_section` replays `synthesizeResearchSection` for the section ids in `--sections` (default `customer_proof,financing`) using evidence mirrored offline from `apps/web/src/inngest/research-section-generation.ts`'s `evidenceForSection`. Both stages write a blind `side-by-side.md` plus `answer-key.json` under the run directory, read before the model-identified report table. The scorers for both live in `eval/provider-matrix/score.mjs`, tested in `eval/provider-matrix/score.test.mjs`, already covered by the `node --test eval/**/*.test.mjs` glob in `npm run test`; no `package.json` change was needed.
- Stable Anthropic system prompts use 1h ephemeral cache by default via `anthropicSystemCacheControl()`. The `createTracedAnthropicMessage` helper attaches the `anthropic-beta: extended-cache-ttl-2025-04-11` header when TTL is 1h; without it the API silently downgrades to 5m. Override via `ANTHROPIC_CACHE_TTL=5m` to roll back without redeploy. Verify with `npm run verify:cache-ttl` after SDK upgrades.
- `direct-exa` HTTP requests retry transient 429/5xx and network errors twice with backoff. 4xx auth/payment failures do NOT retry. AgentCash-backed stableenrich calls do not retry by design: AgentCash is paid per-call, so a blind retry on opaque CLI errors can multiply cost on transient AND non-transient failures. Failures are recorded as structured `StableenrichProbeFailure` entries in `allSettledLimited` results; the pipeline degrades gracefully on them.
- Generation-run `traceJson` is validated via `generationTraceSchema.safeParse` at read time. Corrupt rows produce `traceJson: null` with a structured warn, never a malformed object downstream.
- Bearer token comparison in `apps/web/src/lib/extension-auth.ts` is timing-safe (`crypto.timingSafeEqual`).

## Data Layer

- Neon is the production Postgres target because it pairs cleanly with Vercel and keeps server operations light.
- Drizzle is the ORM. Schema lives in `packages/db/src/schema.ts`; migrations live in `packages/db/drizzle/`.
- The full card is stored as JSONB in `cards.card_json` for cheap whole-card reads.
- `sources`, `citations`, `claims`, and `generation_runs` are normalized so evals and debugging can query across cards.
- The production Neon HTTP driver supports neither interactive transactions nor `SELECT ... FOR UPDATE`. Multi-statement writes go through `db.batch` when available (see `packages/db/src/repositories/evidence.ts`), and contended updates use optimistic-concurrency guards (see `updateGenerationRunTrace` in `packages/db/src/repositories/generation-runs.ts`). This class of bug has stranded runs in `running` before; `npm run repair:stuck-runs` retires such rows by their event trail.
- When adding a field, decide whether it belongs only in card JSON or also needs normalized rows for cross-card querying.

## Where To Look First

- Card field: `packages/core/src/card.ts`, `packages/llm/src/extraction.ts`, `packages/pipeline/src/generate-card.ts`, `packages/ui/src/CardShell.tsx`.
- Research-layer sections: `packages/core/src/research-sections.ts` for the section schema, `apps/extension/src/research-layer.ts` and `apps/extension/src/ResearchLayerPanel.tsx` for activation and rendering.
- First 90 seconds (intake, building, first payoff, profile handoff): `apps/extension/src/CompanyArc.tsx` for the phase shell and the assembly whisper, `src/CompanyHeader.tsx` for the persistent identity band, its card-fed rows, and the person dossier hovercards, `src/Clippings.tsx` and `src/SealInstrument.tsx` for the building-phase progress objects, `src/ResearchTrail.tsx` for the Details toggle and its `SourcePassInstrument` tree, `src/ReadRegion.tsx` (tested in `apps/extension/tests/read-region.test.tsx`) for the early read, `packages/core/src/first-payoff.ts` (tested in `packages/core/tests/first-payoff.test.ts`) for the read's logic and schema with `src/first-payoff-events.ts` deriving it from progress events, and `packages/core/src/headline.ts` (tested in `packages/core/tests/headline.test.ts`) for the headline/newsworthiness classifier.
- Investor lens: `apps/extension/src/investor-lens.ts` (tested in `apps/extension/tests/investor-lens.test.ts`) for the synthesis display and source posture, `packages/llm/src/investor-taste-kernel.ts` for the system-prompt voice.
- Provider issue: `packages/providers/src/stableenrich.ts`, `packages/providers/src/direct-exa.ts`, `packages/providers/src/provider-budget.ts`, and the provider spike script.
- Pipeline run debugging: `packages/pipeline/src/generate-card.ts`, `packages/pipeline/src/evidence-ledger.ts`, `packages/pipeline/src/cost.ts`, and `apps/web/src/inngest/provider-trace.ts`.
- Auth/gate behavior: `apps/web/src/lib/extension-auth.ts` and the route files under `apps/web/src/app/api/`. Extension CORS preflights: `apps/web/src/middleware.ts`.
- Background work: `apps/web/src/inngest/functions.ts` for worker registration and step boundaries, `apps/web/src/inngest/source-fetching.ts` for Direct Exa, StableEnrich, budgets, and source-gate orchestration, `apps/web/src/inngest/contact-enrichment.ts` for async people/email enrichment and cited person reads, `apps/web/src/inngest/card-enrichment.ts` for the async post-first-usable block-enrichment worker (`block-enrichment-patch.ts` holds the extraction-to-patch mapping shared with `functions.ts` so the two paths cannot drift), `apps/web/src/inngest/research-section-generation.ts` for section jobs, and `apps/web/src/inngest/card-storage.ts` for storage compatibility guards. The two background enrichment functions take optional per-function concurrency caps from `INNGEST_CARD_ENRICHMENT_CONCURRENCY` and `INNGEST_CONTACT_ENRICHMENT_CONCURRENCY` (unset = no cap) so they cannot starve user-facing generation in the shared Inngest account pool.
- Generation QA: `scripts/trace-generation.ts` for one-shot pipeline traces, `scripts/qa-generation-suite.ts` for batch runs over fixture companies. Each self-loads its env file (`trace-generation` reads `.env.local`; `qa-generation-suite` reads `.env.production.migrate.local`, falling back to `.env.local`). Playbook: `docs/qa/generation-trace-and-production-qa.md`.

## Cross-References

- `README.md`: local setup, smoke tests, and deployed extension setup.
- `docs/deployment.md`: Vercel, Neon, Inngest, and extension deployment.
- `docs/qa/extension-closed-loop-testing-playbook.md`: manual extension QA loop.
- `docs/product/`: living tuning playbooks (`cost-quality-optimization-playbook`, `diagnose-iterate-craft-playbook`, `extension-motion-playbook`, `provider-cost-assumptions`). Dated direction reviews and shipped specs live under `docs/archive/`; read the relevant one before reworking a product surface. `docs/README.md` is the map.
- `SPEC.md`: product spec.
- `DESIGN.md`: visual system.
- `INTENT.md`: product intent and non-goals.
- `CLAUDE.md`: Claude Code-facing parallel of this file; keep the two in sync when changing shared guidance.
- `docs/archive/`: shipped plans, specs, release ledgers, and dated reviews (including the original implementation plan, `docs/archive/plans/2026-05-06-cold-start-implementation.md`).
