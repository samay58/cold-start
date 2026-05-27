# Cold Start Deployment

This is the internal deployment path for testing Cold Start without keeping the local stack open.

Current internal API origin:

```text
https://cold-start-samay58s-projects.vercel.app
```

The future custom domain target remains `https://coldstart.semitechie.vc`. Use the Vercel project URL above until DNS is wired and `NEXT_PUBLIC_WEB_ORIGIN` is changed deliberately.

## Recommended Shape

Use one Vercel project for `apps/web`, one Neon Postgres database, and the hosted Inngest service. Keep the Chrome extension loaded unpacked from `apps/extension/dist` until the product is ready for store packaging.

Generation is private by default. Public pages at `/c/{slug}` can be shared, but production `/api/generate` should only accept extension-authenticated requests unless `PUBLIC_GENERATION_ENABLED=true` is deliberately set.

## Vercel Project

Before creating or updating production deployments, verify CLI parity:

```bash
npx vercel --version
```

If the CLI is older than `54.5.0`, upgrade once before production deploy:

```bash
npm i -g vercel@latest
```

Use the repo-local Vercel CLI, not an arbitrary global install. This repo pins `vercel` in the root `package.json`, so prefer:

```bash
npm run vercel:login -- samay58@gmail.com --github
```

or:

```bash
npm exec vercel -- login samay58@gmail.com --github
```

If plain `vercel login` fails with a legacy-auth message, your global CLI is older than the repo version.

Create a Vercel project from the GitHub repo with these settings:

- Root Directory: `apps/web`
- Install Command: `cd ../.. && npm ci`
- Build Command: `cd ../.. && npm run build -w @cold-start/web`
- Output Directory: `.next`
- Production Branch: `main`

The app package depends on workspace packages through `file:` links, so installing from the repo root is intentional.

## Database

Create a Neon Postgres database and use its pooled connection string for `DATABASE_URL`.

Run migrations against production before the first generation. Use a local file that only exists for this purpose and is never committed:

```bash
set -a
source .env.production.migrate.local
set +a
COLD_START_PRODUCTION_MIGRATION=1 npm run db:migrate:production
```

The migration guard refuses an empty, local, or `.env.local` database URL. It hides the actual value in command output.

Do not use `vercel env pull` or `vercel env run` for production database migrations. Protected Vercel secrets may be unreadable to local commands, and `.env.local` can shadow the cloud value. Get the pooled production connection string from Neon or the deployment secret owner, put it in `.env.production.migrate.local`, and run the guarded command above.

## Inngest

Install or configure the Inngest Vercel integration for the Vercel project. It should set:

- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`

The served endpoint is `/api/inngest`. The route declares `maxDuration = 300` for long-running generation steps.

## Production Environment Variables

Set these in Vercel Production and Preview as appropriate:

```text
DATABASE_URL
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
X402_PRIVATE_KEY
STABLEENRICH_BASE_URL
STABLEENRICH_EXA_SEARCH_URL
STABLEENRICH_EXA_SIMILAR_URL
STABLEENRICH_FIRECRAWL_URL
STABLEENRICH_ORG_ENRICH_URL
DIRECT_EXA_API_KEY
DIRECT_EXA_BASE_URL
DIRECT_FIRECRAWL_API_KEY
FAST_BASICS_ENABLED
PUBLIC_GENERATION_ENABLED
NEXT_PUBLIC_WEB_ORIGIN
CHROME_EXTENSION_ID
ALLOWED_EXTENSION_ORIGINS
EXTENSION_API_TOKEN
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
```

### Optional environment overrides

These are not required for normal deploys. Set them only when you have a reason to.

```text
# Per-stage Anthropic model overrides. Each falls back to ANTHROPIC_MODEL if unset.
ANTHROPIC_RESEARCH_PLAN_MODEL
ANTHROPIC_EXTRACT_MODEL
ANTHROPIC_BLOCK_MODEL
ANTHROPIC_SYNTHESIS_MODEL
ANTHROPIC_VERIFIER_MODEL

# Prompt cache TTL on stable system prompts. Defaults to "1h"; verified end-to-end against the
# Anthropic API via scripts/verify-cache-ttl.ts. The traced LLM helper attaches the
# `extended-cache-ttl-2025-04-11` beta header automatically when TTL is 1h. Set to "5m" to roll
# back without redeploy if cost telemetry shows the 1h create cost is not amortizing. Re-run
# `npm run verify:cache-ttl` after upgrading @anthropic-ai/sdk.
ANTHROPIC_CACHE_TTL

# AgentCash CLI overrides. The default uses the bundled `agentcash@<version>` package via npx.
# Override these only when running with a custom-installed CLI.
AGENTCASH_BIN
AGENTCASH_PACKAGE
AGENTCASH_HOME

# StableEnrich AgentCash request timeout. Defaults to the per-endpoint registry value in
# packages/providers/src/provider-budget.ts. Set this only as an emergency global override.
STABLEENRICH_AGENTCASH_TIMEOUT_MS
```

For current internal production testing:

```text
NEXT_PUBLIC_WEB_ORIGIN=https://cold-start-samay58s-projects.vercel.app
PUBLIC_GENERATION_ENABLED=false
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<your-loaded-extension-id>
CHROME_EXTENSION_ID=<your-loaded-extension-id>
EXTENSION_API_TOKEN=<long-random-token>
```

The extension token generated during setup is stored locally at `.vercel/extension-api-token.production.local`. The file is ignored by git and should not be committed. Its value must match Vercel `EXTENSION_API_TOKEN`.

`VITE_COLD_START_API_ORIGIN` is not a Vercel runtime variable. It is only used when building the extension. Production builds ignore accidental localhost values unless `VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN=true` is also set. Production manifests also omit the localhost host permission by default.

## Version Alignment

The web API, Chrome extension, and eval runner share one contract file: `packages/core/api-contract.json`.

- API responses set `x-cold-start-api-contract`.
- Extension and eval requests send `x-cold-start-client-contract`.
- The extension rejects successful responses without the matching API contract and shows an out-of-date deployment message.

When route semantics change, deploy the web app first, then rebuild and reload `apps/extension/dist`. Vite dev output lives in `apps/extension/dist-dev`; do not load that folder for production checks. If the extension says the API deployment is out of date, the loaded extension and the deployed API do not match.

Production extension builds automatically migrate stale localhost settings in Chrome storage back to the deployed API origin. If the token field is empty afterward, paste the production token once from `.vercel/extension-api-token.production.local`; subsequent opens should reuse it.

Security notes:

- The extension ID is not a secret. The bearer token is.
- Never commit, screenshot, or paste the production token into docs, issues, PRs, or chat logs meant to be durable.
- Rotate `EXTENSION_API_TOKEN` immediately if it is exposed. Deleting a commit is not enough after a push.
- Keep `PUBLIC_GENERATION_ENABLED=false` unless public generation is intentionally being opened.

## Extension Build

After the matching web deployment exists, build the extension. The deployed API is the default extension origin:

```bash
npm run build -w @cold-start/extension
```

Load `apps/extension/dist` unpacked in Chrome, copy the extension ID from `chrome://extensions`, then update Vercel:

```text
CHROME_EXTENSION_ID=<copied id>
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<copied id>
```

Redeploy after changing Vercel environment variables. Vercel environment variable changes do not affect old deployments.

If the extension setup screen appears, use:

```text
API origin: https://cold-start-samay58s-projects.vercel.app
API token: value in .vercel/extension-api-token.production.local
```

For quick paste:

```bash
pbcopy < .vercel/extension-api-token.production.local
```

Do not use `local-extension-token` against the deployed API. That token is only valid for local development.

## First Smoke Test

1. Open the deployed site and confirm `/privacy`, `/robots.txt`, and `/sitemap.xml` render.
2. Open a company site in Chrome.
3. Open the unpacked Cold Start extension.
4. Set API origin to `https://cold-start-samay58s-projects.vercel.app` and token to the value in `.vercel/extension-api-token.production.local`.
5. Generate basics for `cartesia.ai`.
6. Confirm the public page exists at `/c/cartesia`.
7. Confirm `/api/cards/cartesia` does not include `synthesis`.
8. Confirm the extension can run analysis and see `synthesis`.
9. If the extension reports an out-of-date API deployment, redeploy the web app, rebuild the extension, and reload it in `chrome://extensions`.

Optional API check:

```bash
TOKEN="$(cat .vercel/extension-api-token.production.local)"
curl -s https://cold-start-samay58s-projects.vercel.app/api/extension/cards/cartesia \
  -H "x-cold-start-extension-id: <your-loaded-extension-id>" \
  -H "authorization: Bearer $TOKEN" | jq '.domain, has("synthesis")'
```

## Known Risks Before Public Launch

- `slug` is still the first hostname label, so `foo.com` and `foo.ai` collide.
- There is no admin/debug run console yet for stale `queued` or `running` jobs.
- `npm run audit:deps` uses `scripts/audit-deps.mjs`, not raw `npm audit`. The wrapper allows current upstream transitive findings that need breaking dependency work, and fails on new high or critical findings outside that allowlist. Do not run `npm audit fix --force` as a drive-by cleanup.
