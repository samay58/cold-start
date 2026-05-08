# Cold Start Deployment

This is the internal deployment path for testing Cold Start without keeping the local stack open.

## Recommended Shape

Use one Vercel project for `apps/web`, one Neon Postgres database, and the hosted Inngest service. Keep the Chrome extension loaded unpacked from `apps/extension/dist` until the product is ready for store packaging.

The deployment should be private-by-default for generation. Public pages at `/c/{slug}` can be shared, but production `/api/generate` should only accept extension-authenticated requests unless `PUBLIC_GENERATION_ENABLED=true` is deliberately set.

## Vercel Project

Create a Vercel project from the GitHub repo with these settings:

- Root Directory: `apps/web`
- Install Command: `cd ../.. && npm ci`
- Build Command: `cd ../.. && npm run build -w @cold-start/web`
- Output Directory: `.next`
- Production Branch: `main`

The app package depends on workspace packages through `file:` links, so installing from the repo root is intentional.

## Database

Create a Neon Postgres database and use its pooled connection string for `DATABASE_URL`.

Run migrations against production before the first generation:

```bash
set -a
source .env.production.local
set +a
npm run db:migrate
```

Use a production-only env file locally for this command. Do not point `.env.local` at production unless you are intentionally debugging production data.

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
DIRECT_PDL_API_KEY
FAST_BASICS_ENABLED
PUBLIC_GENERATION_ENABLED
NEXT_PUBLIC_WEB_ORIGIN
CHROME_EXTENSION_ID
ALLOWED_EXTENSION_ORIGINS
EXTENSION_API_TOKEN
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
```

For current internal production testing:

```text
NEXT_PUBLIC_WEB_ORIGIN=https://cold-start-samay58s-projects.vercel.app
VITE_COLD_START_API_ORIGIN=https://cold-start-samay58s-projects.vercel.app
PUBLIC_GENERATION_ENABLED=false
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<your-loaded-extension-id>
CHROME_EXTENSION_ID=<your-loaded-extension-id>
EXTENSION_API_TOKEN=<long-random-token>
```

The custom domain target remains `https://coldstart.semitechie.vc`; use the Vercel project URL above until DNS/domain wiring is complete. The internal extension token generated during setup is stored locally at `.vercel/extension-api-token.production.local`, which is ignored and should not be committed.

`VITE_COLD_START_API_ORIGIN` is only used when building the extension, not by the deployed web app.

## Extension Build

After the web deployment exists, build the extension against the deployed API:

```bash
VITE_COLD_START_API_ORIGIN=https://cold-start-samay58s-projects.vercel.app npm run build -w @cold-start/extension
```

Load `apps/extension/dist` unpacked in Chrome, copy the extension ID from `chrome://extensions`, then update Vercel:

```text
CHROME_EXTENSION_ID=<copied id>
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<copied id>
```

Redeploy after changing Vercel environment variables. Vercel environment variable changes do not affect old deployments.

## First Smoke Test

1. Open the deployed site and confirm `/privacy`, `/robots.txt`, and `/sitemap.xml` render.
2. Open a company site in Chrome.
3. Open the unpacked Cold Start extension.
4. Set API origin to `https://cold-start-samay58s-projects.vercel.app` and token to the value in `.vercel/extension-api-token.production.local`.
5. Generate basics for `cartesia.ai`.
6. Confirm the public page exists at `/c/cartesia`.
7. Confirm `/api/cards/cartesia` does not include `synthesis`.
8. Confirm the extension can run analysis and see `synthesis`.

## Known Risks Before Public Launch

- `slug` is still the first hostname label, so `foo.com` and `foo.ai` collide.
- Duplicate concurrent generation is guarded in app code, not by a database partial unique index.
- There is no admin/debug run console yet for stale `queued` or `running` jobs.
- `npm audit` reports upstream moderate/high findings in Next/PostCSS, CRXJS/Rollup, and Drizzle Kit/esbuild. The suggested fixes are breaking, so handle them as dependency-upgrade work rather than blind `npm audit fix --force`.
