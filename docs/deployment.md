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
Launch, migration, restore, retention scheduling, and the provider-wallet floor
are proven. Current evidence and blockers live in
`docs/product/alpha-production-readiness-2026-07-24.md`.

Do not create friend invitations before the paid canary and store review are
complete.

Production proof on July 24:

- Deployment `dpl_3mYgwsKcrizgZS79bm21h4LvPgSp` served commit `5bb342b` on the custom domain.
- A short-lived QA invitation reached inspect, redeem, authenticated bootstrap, and the generation-disabled response. Its tester data was then deleted.
- `ALPHA_GENERATION_ENABLED=false` returned `503 generation_disabled`.
- `ALPHA_ACCESS_ENABLED=false` returned `503 access_disabled`; access was restored and returned `200 ready`.
- The authenticated retention route returned `200` with zero eligible deletions.
- Before wallet funding, alpha status contained zero testers and zero stale runs; its only gate failure was the wallet floor.
- After funding, AgentCash Base held $35.2148 and the pre-canary alpha gate passed.

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

Runtime Neon HTTP connections use a three-second connection-establishment timeout and one
retry only for errors that prove the request never connected. Do not broaden that retry to
ambiguous resets or request timeouts; a write may already have reached Neon.

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

# Alternate-provider continuity for judgment stages. The stage value wins over the shared
# value. Fallback runs only when the primary provider is unavailable, including an exhausted
# provider balance, rate limit, 5xx, or network failure. It does not hide authentication,
# schema, citation, or other model-contract failures. Keep the fallback on a different provider.
LLM_FALLBACK_MODEL
LLM_SYNTHESIS_FALLBACK_MODEL
LLM_VERIFIER_FALLBACK_MODEL
LLM_RESEARCH_SECTION_FALLBACK_MODEL
LLM_PERSON_READ_FALLBACK_MODEL
LLM_EXPANDED_DESCRIPTION_FALLBACK_MODEL

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

Alpha principal and extension-facing error shapes changed during rollout; the
expanded-description field bumped the contract again on 2026-07-27. The
current version is pinned in `packages/core/api-contract.json`; read that file
rather than trusting any literal here. Operator authentication remains
accepted during rollout.

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

## Firefox Release Lane

The Firefox build is Mozilla-signed and self-distributed (unlisted channel; AMO
does not host unlisted updates). Firefox floor is 140.0. One version source:
`apps/extension/package.json`. Every AMO signing needs a bump first:

```bash
npm version patch --no-git-tag-version -w @cold-start/extension
npm install --package-lock-only
```

Then, from a clean committed tree:

```bash
npm run package:firefox            # pinned-env production build, manifest inspection,
                                   # deterministic zip under dist/firefox/; --verify double-builds
npm run sign:firefox               # packager + reviewer source zip + web-ext sign
npm run release:firefox -- apps/extension/web-ext-artifacts/<signed>.xpi
```

`sign:firefox` needs `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` in the
environment (addons.mozilla.org → Tools → Manage API Keys; keep them in
`.env.local` or `~/.secrets.zsh`, never git). It attaches the reviewer source
package (`package:firefox:source`, a `git archive` of the extension build graph
plus `apps/extension/README-REVIEWERS.md`) to the submission via
`--upload-source-code`. Automated signing can take up to 24 hours; manual review
up to two weeks.

`release:firefox` copies the signed XPI into `apps/web/public/firefox/` under
its versioned name plus the stable `cold-start.xpi` the invite page links, and
stamps the version and sha256 into `updates.json`, which the extension's baked
`gecko.update_url` (`https://cold-start.semitechie.vc/firefox/updates.json`)
polls. Commit and deploy the web app afterwards; nothing reaches testers until
it ships. The web app serves `.xpi` as `application/x-xpinstall`.

Reproducibility is enforced twice: `package:firefox --verify` builds twice
locally and asserts identical zip bytes, and the `firefox-reproducibility` CI
job builds two clean checkouts on Node 24.14.0 (the documented AMO reviewer
environment) and diffs the `dist-firefox` file hashes.

Vercel env for Firefox clients: `ALLOWED_EXTENSION_IDS` must include the gecko
ID `cold-start@semitechie.vc` (the alpha auth path enforces extension ID in
production). Verify by behavior with a curl, not `vercel env pull`
(`CHROME_EXTENSION_ID` is Vercel-sensitive and pulls empty). Firefox testers
connect through the friend-alpha invite: the invite page links the XPI and the
sidebar panel redeems the pasted invitation link (Firefox has no
page-to-extension messaging).

## First Smoke Test

1. Open `/alpha`, `/privacy`, `/robots.txt`, and `/sitemap.xml`.
2. Use a fresh Chrome profile with no seeded extension storage.
3. Open an owner invitation and accept the disclosure.
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
npm run alpha:revoke -- --installation <uuid> --repair
npm run alpha:delete-tester -- --invite <uuid>
npm run alpha:prune -- --before 30d
npm run alpha:status -- --since 7d
npm run alpha:status -- --since 7d --json
npm run alpha:status -- --gate
```

Installation revocation is repair-only. It frees the seat and makes the original
invite redeemable again. Use `--invite <uuid> --apply` instead if the invitation
link or browser may be compromised.

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

## Release State

Current blockers and release order live in
`docs/product/alpha-production-readiness-2026-07-24.md`. Do not copy live gate
state into this runbook. Do not distribute the operator token or bypass the
invitation path.
