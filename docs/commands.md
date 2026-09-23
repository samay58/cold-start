# Commands

Every npm script in the repo, moved here from `AGENTS.md` so the agent guide stays short. Run from the repo root unless noted.

```bash
npm ci                                  # one-time install
npm run dev:full                        # local web app plus Inngest worker
npm run dev                             # web app only
npm run dev:extension                   # Vite dev server for the extension
npm run dev:inngest                     # Inngest dev worker only (scripts/dev-inngest.sh rebuilds the inngest-cli binary once if ~/.npmrc ignore-scripts skipped its postinstall)
npm run build                           # build all workspaces
npm run typecheck                       # tsc --noEmit across workspaces
npm run test                            # vitest across workspaces, then `node --test` over eval/*.test.mjs and eval/**/*.test.mjs, then `tsx --test` over scripts/*.test.ts
npm run lint                            # ESLint flat-config check
npm run check                           # full local/CI gate
npm run check:file-size                 # tsx scripts/check-file-size.ts (fails on a source file over 1,000 lines outside the shrinking allowlist inside the script)
npm run knip                            # unused dependency/export check
npm run secrets:check                   # scan tracked surfaces for accidental secrets
npm run audit:deps                      # guarded production dependency audit
npm run db:generate                     # drizzle-kit generate
npm run db:migrate                      # drizzle-kit migrate
npm run db:migrate:production           # scripts/migrate-production.mjs against prod DB
npm run dev:fresh                       # wipe apps/web/.next + .cold-start, then dev:full
npm run trace:generation                # tsx scripts/trace-generation.ts (single-run debug)
npm run qa:generation                   # tsx scripts/qa-generation-suite.ts (multi-company QA)
npm run qa:model-inputs -- --slug <slug> # tsx scripts/dump-model-inputs.ts (exact request each model stage would send; no model call; --card and --sources read files instead of the database)
npm run qa:rebuild-snippets -- --slugs a,b # tsx scripts/rebuild-card-snippets.ts (rebuild stored cards' snippets from stored sources; no database write; --refetch --budget-usd N pays for page text)
npm run seed:web-gallery                # tsx scripts/seed-web-gallery.ts (writes the three gallery fixture cards to local Postgres)
npm run qa:web:gallery                  # Playwright capture of landing, /catalog, and /c/{slug} at desktop and mobile widths, into ~/Downloads/cold-start-qa/{timestamp}/web/
npm run export:recorded-build           # tsx scripts/export-recorded-build.ts (freeze one hand-reviewed prod card and its trace into the landing page's recorded-build-data.ts; --slug required, read-only)
npm run eval:golden                     # node eval/run-golden.mjs against the seed set
npm run eval:providers:bundles          # tsx eval/provider-matrix/build-bundles.ts (freeze prod evidence fixtures, read-only DB)
npm run eval:providers:matrix           # tsx eval/provider-matrix/run-matrix.ts (replay stages across LLM providers, score + report)
npm run eval:snapshot                   # tsx scripts/eval-corpus-snapshot.ts (read-only production freeze into eval/curation/corpus/ for the taste rig)
npm run eval:session-plan               # tsx scripts/eval-session-plan.ts (pool.json -> seeded session-plan.json for rig sittings; --seed required)
npm run eval:how-it-wins                # tsx scripts/how-it-wins-corpus.ts (two-arm blind How it wins reads from frozen corpus evidence into eval/curation/how-it-wins/, read via the /eval/how-it-wins rig route; --cap <usd> is required, there is no default; --prompt-arms with --previous-prompt <file, or a git-ref:path> holds the writer model fixed and puts two writer prompts against each other over one frozen verdict, instead of two writer models against each other)
npm run eval:how-it-wins:batch          # tsx scripts/how-it-wins-batch.ts (production-path How it wins corpus runner with a disk judgment cache, a hard --budget-usd spend cap, and the strategy-frequency gate; excludes the ten holdout slugs; --cards-dir with --slugs reads cards from a folder instead of the corpus)
npm run review:how-it-wins-known        # tsx scripts/how-it-wins-known-company-review.ts (the 2026-08-24 known-company replay page)
npm run optimize:generation             # tsx scripts/optimize-generation.ts (mine recent runs for tuning levers)
npm run measure:first-usable            # tsx scripts/measure-first-usable.ts (first-usable latency over recent real-traffic basics runs)
npm run measure:analysis-latency        # tsx scripts/measure-analysis-latency.ts (analysis-run latency baseline over recent real-traffic analysis runs, excluding repair-artifact rows)
npm run measure:how-it-wins             # tsx scripts/measure-how-it-wins.ts (read-only production report: status distribution, fail-closed runs separated from honest nothing_stands_out, judge-current to filed-running drop, latency, cost, trace_json size)
npm run measure:contact-yield           # tsx scripts/measure-contact-yield.ts (read-only GitHub contact-email yield over the golden set; set GITHUB_TOKEN or the API caps at 60 req/hr)
npm run study:synthesis-gate            # tsx scripts/study-synthesis-gate.ts (read-only prod delta table: old four-condition gate vs floor-plus-advisory, per analysis-run card)
npm run repair:card-domains             # tsx scripts/repair-card-domains.ts (realign cards.domain with card_json; skips unique-domain collisions; --apply to write, --slug for one card)
npm run repair:sections                 # tsx scripts/repair-research-sections.ts (pass --apply to write fixes)
npm run repair:signal-clusters          # tsx scripts/repair-signal-clusters.ts (re-cluster stored card signals; --apply to write, --slug for one card)
npm run repair:stuck-runs               # tsx scripts/repair-stuck-generation-runs.ts (retire runs stranded in running; --apply to write)
npm run repair:how-it-wins              # tsx scripts/repair-how-it-wins.ts (read-only JSON report; needs --slug <slug> --run-id <analysis run uuid> --budget-usd <usd>; add --apply with NODE_ENV=production to admit and dispatch the repair job)
npm run wallet:status                   # tsx scripts/wallet-status.ts (read-only AgentCash balance, spend, burn rate)
npm run alpha:invite                    # tsx scripts/alpha-invite.ts (mint a personalized invitation card via OpenRouter, approve it, create the invite; prints the /i/ link and word code; --skip-card for the legacy flow)
npm run alpha:reissue-link              # tsx scripts/alpha-reissue-link.ts (audit invites still on legacy name-slug previews; --invite <uuid> --confirm <uuid> --apply rotates that invite's code and adds a hashed presentation capability, installation credentials stay active)
npm run alpha:revoke                    # tsx scripts/alpha-revoke.ts (terminal --invite revoke, or repair-only --installation <id> --repair)
npm run alpha:delete-tester             # tsx scripts/alpha-delete-tester.ts (hard-delete one tester's data; --confirm must match --invite)
npm run alpha:prune                     # tsx scripts/alpha-prune.ts (delete raw alpha events older than 30d by default, the privacy-page retention commitment; also handled access requests past 30d and How it wins judgments past 90d, fixed windows)
npm run alpha:status                    # tsx scripts/alpha-status.ts (funnel, allowance, reliability, and spend report; add --gate to fail on regressions)
npm run alpha:test                      # tsx --test scripts/alpha-operator.test.ts (operator-script unit tests, no database)
npm run access:requests                 # tsx scripts/access-requests.ts (list open landing-page access requests newest-first; --handled <id> to mark one handled)
npm run verify:cache-ttl                # tsx scripts/verify-cache-ttl.ts (confirm 1h Anthropic cache header)
npm run evo:generation-benchmark        # cost/latency report over recent runs; add --gate to fail on regression
npm run evo:ux-benchmark                # Playwright UX report (load, layout shift, overflow); add --gate to fail on regression
```

Use `set -a; source .env.local; set +a` before commands that hit the database, providers, or LLMs directly. `npm run qa:generation` is the exception; it expects `.env.production.migrate.local` because it reads the production DB and API. `measure:first-usable` self-loads `.env.production.migrate.local` (falling back to `.env.local`) for the same reason; `measure:analysis-latency` does too; `measure:how-it-wins` does too; `study:synthesis-gate` self-loads the same env pair; `repair:stuck-runs` and `repair:card-domains` also target the production DB and need that env sourced first. `eval:how-it-wins:batch` needs `.env.local` sourced; it runs the production judge-write-verify path against frozen local corpus evidence, not the production DB. `scripts/how-it-wins-corpus.ts`, `scripts/how-it-wins-batch.ts`, and `scripts/how-it-wins-known-company-review.ts` share their helpers, verification, and the judge's on-disk cache (`eval/curation/how-it-wins-batch/_judgments`, gitignored) through `scripts/how-it-wins-eval-shared.ts`, so a verdict paid for by one script is free to the other two. `eval:how-it-wins` and `eval:how-it-wins:batch` both set exit code 1 when the strategy-frequency gate fails or the run throws, and 0 otherwise. The six production `alpha:*` operator scripts (`alpha:invite`, `alpha:reissue-link`, `alpha:revoke`, `alpha:delete-tester`, `alpha:prune`, `alpha:status`) self-load the same env pair through `loadProductionEnv` in `scripts/alpha-common.ts`; `alpha:test` runs pure unit tests and touches no database. `access:requests` self-loads the same production env pair through the same helper. `eval:snapshot` self-loads it too and performs only SELECT queries. `qa:model-inputs` self-loads it too, reads one card and its stored sources, and writes each stage's request to the gitignored `.cold-start/model-inputs/<slug>/`. `qa:rebuild-snippets` self-loads it too, reads cards and stored sources only, and writes rebuilt cards, sources and cached raw Exa responses under the gitignored folders of `eval/curation/remediation-2026-09/`; its `--refetch` spends AgentCash money under the `--budget-usd` cap. The `/eval` taste rig is local-only: every surface 404s unless `EVAL_RIG_ENABLED=true`, it reads frozen data from `EVAL_RIG_DATA_DIR`, blind sittings (`/eval/how-it-wins`) run on a production build (`npm run build -w @cold-start/web` then `npm run start -w @cold-start/web` with those two variables) because `next dev` serializes every `readFile` result, answer key included, into the page's debug payload, `eval/curation/corpus/` stays gitignored because it holds synthesis, and `eval/curation/ledger/` is committed as the durable judgment record. Neither variable is ever set on Vercel. `seed:web-gallery` needs `.env.local` sourced (it writes to local Postgres); `qa:web:gallery` then drives Playwright against `apps/web/playwright.config.ts`'s `webServer`, which reuses an already-running `npm run dev` or starts one itself; on a fresh machine run `npm run install:browser -w @cold-start/web` once first (Playwright Chromium). `wallet:status` and the `evo:*` benchmarks also read a DB, so source env first; the `--gate` variants (`evo:generation-gate`, `evo:ux-gate`) are the CI-style pass/fail wrappers. `npm run check` is the full local gate and already chains lint, the file-size ratchet (`check:file-size`), typecheck, test, the real-Postgres `test:alpha-db` and `test:cards-db` suites (local Postgres must be up), build, the Firefox build plus `web-ext lint`, a `eval:golden --dry-run --limit 12` pass, knip, secrets:check, and audit:deps. CI (`.github/workflows/check.yml`) runs the same steps individually on Node 24, including both real-Postgres suites. Its UX benchmark test needs Playwright Chromium, so CI downloads only the browser binary in a five-minute step instead of running the unbounded Linux dependency installer. CI cancels superseded runs and caps each job at 20 minutes. The separate `firefox-reproducibility` job double-builds the Firefox zip and diffs the hashes.

## Single test examples

```bash
npm test -w @cold-start/pipeline -- generate-card
npm test -w @cold-start/pipeline -- -t "verifier-dropped"
node --test eval/some-file.test.mjs           # node:test files under eval/ run after vitest in `npm run test`
```

## Local Postgres (host port `55432`, not `5432`)

```bash
npm run db:local         # bring up native PostgreSQL 17
npm run db:local:stop    # stop it
npm run db:local:status  # is it running
```

## Provider smoke, paid path

```bash
npm run spike:stableenrich -w @cold-start/providers -- cartesia.ai
```

## Extension QA (Playwright)

```bash
npm run qa:extension:ui -w @cold-start/extension     # mounts the side panel via vite.sidepanel.config.ts with a Chrome API shim
npm run qa:extension:smoke -w @cold-start/extension  # builds extension, then loads the MV3 bundle in Playwright
npm run qa:extension:gallery -w @cold-start/extension      # lens-state screenshot gallery (tests/e2e/lens-gallery.spec.ts)
npm run qa:extension:store-assets -w @cold-start/extension # render Chrome Web Store listing screenshots into docs/product/chrome-web-store-alpha/assets
npm run audit:css -w @cold-start/extension           # fail on raw color literals and collapsing dark border/outline triplets
npm run alpha:package                   # deterministic Chrome Web Store alpha zip (manifest + permission inspection; release record in docs/product/chrome-web-store-alpha/)
npm run build:firefox -w @cold-start/extension       # Firefox MV3 build to dist-firefox; run it with `npx web-ext run --source-dir apps/extension/dist-firefox`
npm run package:firefox                 # deterministic Firefox release zip (pinned env, manifest inspection); --verify double-builds
npm run sign:firefox                    # AMO unlisted signing; needs WEB_EXT_API_KEY/WEB_EXT_API_SECRET; attaches the reviewer source zip
npm run release:firefox -- <signed.xpi> # publish a signed XPI to apps/web/public/firefox and stamp updates.json
```

## Local stack

```bash
npm run db:local
npm run dev:full
```

`dev:full` loads the repo-root `.env.local`, runs pending Drizzle migrations, then starts Next and the Inngest dev worker together.

