# Cold Start Deployment

This is the internal deployment path for testing Cold Start without keeping the local stack open.

Current internal API origin:

```text
https://cold-start-samay58s-projects.vercel.app
```

The public web origin is `https://cold-start.semitechie.vc` (live; `NEXT_PUBLIC_WEB_ORIGIN` and the code default in `apps/web/src/lib/site-origin.ts` both point at it). The Vercel project URL above remains the extension API fallback and internal testing origin.

## Recommended Shape

Use one Vercel project for `apps/web`, one Neon Postgres database, and the
hosted Inngest service. Internal testing may use `apps/extension/dist`.
Friend-alpha testers use the Unlisted Chrome Web Store item and one revocable
invitation per person.

Generation is private by default. Public pages at `/c/{slug}` can be shared, but production `/api/generate` should only accept extension-authenticated requests unless `PUBLIC_GENERATION_ENABLED=true` is deliberately set.

## Friend-Alpha Readiness

Repository implementation is complete as of July 24, 2026. Vercel Pro, Neon
Launch, migration, restore, and retention scheduling are proven. Production
rollout is still blocked until all of these are true:

- Vercel spend controls are configured and observed.
- AgentCash Base holds at least $35.
- The paid five-company canary passes.
- The Unlisted store submission is reviewed and deferred for publication.

Do not create friend invitations before the production migration, compatible
deployment, canary, and store review are complete.

Production proof on July 24:

- Deployment `dpl_3mYgwsKcrizgZS79bm21h4LvPgSp` served commit `5bb342b` on the custom domain.
- A short-lived QA invitation reached inspect, redeem, authenticated bootstrap, and the generation-disabled response. Its tester data was then deleted.
- `ALPHA_GENERATION_ENABLED=false` returned `503 generation_disabled`.
- `ALPHA_ACCESS_ENABLED=false` returned `503 access_disabled`; access was restored and returned `200 ready`.
- The authenticated retention route returned `200` with zero eligible deletions.
- The final alpha status contained zero testers and zero stale runs. Its only gate failure was the AgentCash wallet floor.

## Vercel Project

Before creating or updating production deployments, verify CLI parity:

```bash
vercel --version
npm exec vercel -- --version
```

If either CLI is older than `54.5.0`, upgrade before production deploy. A global install is convenient but must be an explicit local-machine choice:

```bash
npm i -g vercel@latest
```

Use the repo-local Vercel CLI for normal project commands once the dependency is current. This repo pins `vercel` in the root `package.json`, so prefer:

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

Use the pooled Neon connection for runtime `DATABASE_URL`. Use a distinct direct
connection for `DATABASE_DIRECT_URL`.

Run migrations against production before the first generation. Use a local file that only exists for this purpose and is never committed:

```bash
set -a
source .env.production.migrate.local
set +a
COLD_START_PRODUCTION_MIGRATION=1 npm run db:migrate:production
```

The migration guard refuses an empty or local direct URL, a pooler host, a
direct URL that matches `DATABASE_URL`, and accidental use of `.env.local`. It
hides both values in command output.

Do not use `vercel env pull` or `vercel env run` for production database
migrations. Put both production connection strings in
`.env.production.migrate.local` and run the guarded command above.

Before the alpha migration:

1. Protect or snapshot the production branch.
2. Set Neon restore history to seven days.
3. Apply the migration through the direct URL.
4. Run the alpha repository smoke checks.
5. Restore the pre-migration point into a temporary branch.
6. Validate card count, generation-run count, and the alpha table set.
7. Record the recovery point, elapsed recovery time, validation result, and temporary-branch cleanup here.

Restore drill completed July 24, 2026:

- The pre-migration branch `pre-alpha-20260724` was created from production and retained through July 31.
- Migration `0009_reflective_meteorite.sql` was applied through a guarded direct connection.
- Migration `0010_redeem_alpha_invite.sql` later added the concurrency-safe multi-seat redemption function without changing `0009`.
- Production validation found six alpha tables and four alpha functions.
- Recovery point `2026-07-24T20:02:40Z` was restored to `alpha-restore-drill-20260724` in about one second.
- The restored branch contained 297 cards and 892 generation runs. It did not contain the alpha schema, which proves the recovery point preceded migration.
- The temporary restore branch was deleted after validation.

## Inngest

Install or configure the Inngest Vercel integration for the Vercel project. It should set:

- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`

The served endpoint is `/api/inngest`. The route declares `maxDuration = 300` for long-running generation steps.

Keep Inngest on Hobby for the five-person alpha. Reserve user-facing capacity
by setting:

```text
INNGEST_CARD_ENRICHMENT_CONCURRENCY=2
INNGEST_CONTACT_ENRICHMENT_CONCURRENCY=1
```

Section work uses the remaining account capacity. Upgrade only if production
evidence shows queueing after these caps.

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
ALPHA_ACCESS_ENABLED
ALPHA_GENERATION_ENABLED
ALPHA_SUPPORTED_EXTENSION_VERSIONS
ALPHA_PROFILE_WORST_CASE_USD
ALPHA_LENS_WORST_CASE_USD
ALPHA_INVITE_ORIGIN
CRON_SECRET
NEXT_PUBLIC_WEB_ORIGIN
CHROME_WEB_STORE_URL
CHROME_EXTENSION_ID
ALLOWED_EXTENSION_ORIGINS
EXTENSION_API_TOKEN
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
INNGEST_CARD_ENRICHMENT_CONCURRENCY
INNGEST_CONTACT_ENRICHMENT_CONCURRENCY
```

`DATABASE_DIRECT_URL` is local migration-only configuration. Keep it in the
ignored `.env.production.migrate.local` file. Do not add it to Vercel runtime
environment variables.

### Optional environment overrides

These are not required for normal deploys. Set them only when you have a reason to.

```text
# Per-stage LLM provider routing. Accepts provider-prefixed model strings
# (deepseek/deepseek-v4-flash); unprefixed strings are Anthropic models. Each falls back to its
# ANTHROPIC_* counterpart below, then ANTHROPIC_MODEL. LLM_RESEARCH_SECTION_MODEL falls back to
# ANTHROPIC_SYNTHESIS_MODEL. Rollback from any provider flip = unset the var and redeploy
# (Vercel env changes only apply to new deployments).
LLM_EXTRACT_MODEL
LLM_BLOCK_MODEL
LLM_VERIFIER_MODEL
LLM_SYNTHESIS_MODEL
LLM_RESEARCH_SECTION_MODEL
LLM_RESEARCH_PLAN_MODEL

# Credentials and tuning for non-Anthropic providers. DEEPSEEK_BASE_URL defaults to
# https://api.deepseek.com; the adapter disables DeepSeek thinking mode automatically.
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL
LLM_OPENAI_COMPAT_TIMEOUT_MS

# Per-stage Anthropic model overrides. Each falls back to ANTHROPIC_MODEL if unset.
ANTHROPIC_RESEARCH_PLAN_MODEL
ANTHROPIC_EXTRACT_MODEL
ANTHROPIC_BLOCK_MODEL
ANTHROPIC_SYNTHESIS_MODEL
ANTHROPIC_VERIFIER_MODEL

# Exa Websets contact enrichment. Websets are async agent searches; the contact function
# creates the webset early and polls durably (attempts x seconds, defaults 6 x 20s).
# EXA_WEBSETS_CREDIT_USD tunes cost telemetry to the billing plan (default: Starter rate).
EXA_WEBSETS_CONTACTS_ENABLED
EXA_WEBSETS_API_KEY
EXA_WEBSETS_BASE_URL
WEBSETS_POLL_ATTEMPTS
WEBSETS_POLL_INTERVAL_SECONDS
EXA_WEBSETS_CREDIT_USD

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
NEXT_PUBLIC_WEB_ORIGIN=https://cold-start.semitechie.vc
PUBLIC_GENERATION_ENABLED=false
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<your-loaded-extension-id>
CHROME_EXTENSION_ID=<your-loaded-extension-id>
EXTENSION_API_TOKEN=<long-random-token>
```

For the friend-alpha deployment:

```text
ALPHA_ACCESS_ENABLED=true
ALPHA_GENERATION_ENABLED=false
ALPHA_SUPPORTED_EXTENSION_VERSIONS=0.2.0
CHROME_WEB_STORE_URL=<Unlisted item URL>
INNGEST_CARD_ENRICHMENT_CONCURRENCY=2
INNGEST_CONTACT_ENRICHMENT_CONCURRENCY=1
```

The extension token generated during setup is stored locally at `.vercel/extension-api-token.production.local`. The file is ignored by git and should not be committed. Its value must match Vercel `EXTENSION_API_TOKEN`.

`VITE_COLD_START_API_ORIGIN` is not a Vercel runtime variable. It is only used when building the extension. Production builds ignore accidental localhost values unless `VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN=true` is also set. Production manifests also omit the localhost host permission by default.

## Version Alignment

The web API, Chrome extension, and eval runner share one contract file: `packages/core/api-contract.json`.

- API responses set `x-cold-start-api-contract`.
- Extension and eval requests send `x-cold-start-client-contract`.
- The extension rejects successful responses without the matching API contract and shows an out-of-date deployment message.

Alpha routes and allowance posture are additive to the current contract.
Operator authentication remains accepted during rollout. No response shape
changed, so the API and extension remain on the shared
`2026-07-20.synthesis-withheld-v1` contract.

Deploy additive server support before publishing extension `0.2.0`. Keep the
previous server deployment available for rollback. The compatibility matrix is
tracked in
`docs/product/chrome-web-store-alpha/release-compatibility-matrix.md`.

Production extension builds automatically migrate stale localhost settings in
Chrome storage back to the deployed API origin. Alpha testers never paste a
token. They connect through `/alpha` after consent. The technical token form is
available only in non-production builds for operator testing.

Security notes:

- The extension ID is not a secret. The bearer token is.
- Never commit, screenshot, or paste the production token into docs, issues, PRs, or chat logs meant to be durable.
- Rotate `EXTENSION_API_TOKEN` immediately if it is exposed. Deleting a commit is not enough after a push.
- Keep `PUBLIC_GENERATION_ENABLED=false` unless public generation is intentionally being opened.

## Extension Build

After the matching web deployment exists, build and verify the extension:

```bash
npm run qa:extension:smoke -w @cold-start/extension
npm run alpha:package -- --verify
```

Packaging requires a clean checked commit, extension version `0.2.0` or newer,
and the exact reviewed permission set. A normal package writes a deterministic
ZIP and checksum under `dist/chrome-web-store/`:

```bash
npm run alpha:package
```

Submit the ZIP manually as Unlisted with deferred publishing. Use the materials
in `docs/product/chrome-web-store-alpha/`. Do not advance
`release-version.json` until Chrome accepts the version.

## First Smoke Test

1. Open `/alpha`, `/privacy`, `/robots.txt`, and `/sitemap.xml`.
2. Use a fresh Chrome profile with no seeded extension storage.
3. Open a single-use owner invitation and accept the disclosure.
4. Install the Unlisted extension and connect from the same invitation page.
5. Open a novel company site and invoke Cold Start.
6. Confirm the allowance meter reads 12 profiles and 6 Lens runs.
7. Generate the profile, close and reopen the panel, and reach Early Read.
8. Confirm the public card exists and contains no synthesis or tester identity.
9. Run Lens and reach either a filed or explicit withheld result.
10. Confirm `alpha:status` reconstructs the invitation, installation, request, cost, latency, and allowance result.
11. Revoke the installation and confirm the next private request is denied.

The five-company paid canary has a $5 cap. It must show zero software failures
or stranded runs, first-progress p90 below five seconds, first-usable p90 below
60 seconds, and skip-fresh Lens p90 below 90 seconds. Evidence-insufficient
outcomes are reported separately from software failures.

## Alpha Operations

```bash
npm run alpha:invite -- --label "Owner"
npm run alpha:revoke -- --installation <uuid>
npm run alpha:delete-tester -- --invite <uuid>
npm run alpha:prune -- --before 30d
npm run alpha:status -- --since 7d
npm run alpha:status -- --since 7d --json
npm run alpha:status -- --gate
```

`alpha:status --gate` fails on software failures, stale active runs, an
insufficient wallet floor, and unsupported extension versions. It reports
successful and failed spend separately. Configure
`ALPHA_SUPPORTED_EXTENSION_VERSIONS`,
`ALPHA_PROFILE_WORST_CASE_USD`, and `ALPHA_LENS_WORST_CASE_USD` when the
production anchors are known.

`alpha:invite` builds the invitation URL from `ALPHA_INVITE_ORIGIN`, falling
back to the production web origin when unset. Set it to a local origin only
when testing invite generation against a non-production database.

Vercel Cron calls `/api/alpha/retention` daily at 04:17 UTC. The route requires
the sensitive `CRON_SECRET`, deletes only events older than 30 days, works in
1,000-row batches, and stops after 10,000 rows per invocation. `alpha:prune`
remains the manual inspection and repair path.

Immediate stop controls:

```text
ALPHA_GENERATION_ENABLED=false
ALPHA_ACCESS_ENABLED=false
GENERATION_DISPATCH=inngest
```

Use the generation switch first. It preserves existing work. The access switch
is for a credential or privacy incident. `GENERATION_DISPATCH=inngest` rolls
user-facing work back from inline execution without changing route shapes.

Optional API check:

```bash
TOKEN="$(cat .vercel/extension-api-token.production.local)"
curl -s https://cold-start-samay58s-projects.vercel.app/api/extension/cards/cartesia \
  -H "x-cold-start-extension-id: <your-loaded-extension-id>" \
  -H "authorization: Bearer $TOKEN" | jq '.domain, has("synthesis")'
```

## Remaining Alpha Blockers

- Vercel Pro, the compatible deployment, both kill switches, and daily retention are verified. Production spend controls are not yet observed.
- The provider wallet is below the $35 release floor.
- The five-company paid canary has not run.
- The Chrome publisher registration, submission, review, and deferred publication are not verified.
- An owner-only fresh-profile rehearsal and 24-hour soak have not run.
- Temporal event-endpoint throttling and auth-failure aggregation are not persisted as separate alert streams. Payload bounds and generation rate limits are enforced, but this operational alert evidence remains unproven.

These are release blockers. They are not reasons to distribute the operator
token or bypass the invitation path.
