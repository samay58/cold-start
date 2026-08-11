# Security

Cold Start has two public surfaces and two gated surface families:

- Public web pages: `/c/{slug}`, `/catalog`, `/i/{presentation-capability}`
- Public API: `/api/cards/{slug}`, `/api/access-requests`
- Gated extension API: `/api/extension/cards/{slug}` and extension-authenticated `/api/generate`
- Friend-alpha access API: `/api/alpha/invite/*` and `/api/alpha/events`

The public surfaces must never expose `synthesis`, withheld records, person reads,
work emails, invitation identity, or installation identity. Gated extension
requests require an accepted extension ID and either an alpha installation
credential or the transitional operator token.

## Secrets

Never commit real secrets.

Ignored local files:

- `.env`
- `.env.local`
- `.env.*.local`
- `.vercel/`
- `.neon/`

Safe committed examples:

- `.env.example` may contain placeholder values only.
- `local-extension-token` is a local development sentinel, not a production secret.

Production secrets:

- `EXTENSION_API_TOKEN`: bearer token for the deployed extension API.
- `EXTENSION_API_TOKENS`: comma-separated bearer tokens; when set, replaces `EXTENSION_API_TOKEN` as the full accepted list, for rotating the token without downtime.
- `ALLOWED_EXTENSION_IDS`: comma-separated extension IDs; when set, replaces `CHROME_EXTENSION_ID` for the identity check in `apps/web/src/lib/extension-auth.ts`.
- `X402_PRIVATE_KEY`: AgentCash wallet key for deployed provider calls.
- `ANTHROPIC_API_KEY`: Anthropic API key.
- `DIRECT_EXA_API_KEY`, `DIRECT_FIRECRAWL_API_KEY`, `DIRECT_PDL_API_KEY`: direct provider keys.
- `GITHUB_TOKEN`: optional GitHub PAT for the free commit-email reachability layer. Public read-only scope is sufficient; do not grant repo write or private scopes.
- `DATABASE_URL`: Neon Postgres connection string.
- `DATABASE_DIRECT_URL`: dedicated direct Neon connection used only by the guarded production migration command.
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`: hosted Inngest credentials.
- `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`: AMO JWT credentials for Firefox signing (`npm run sign:firefox`). Local-machine only (`.env.local` or `~/.secrets.zsh`), never Vercel, never git. These can sign and revoke Firefox releases; rotate at addons.mozilla.org → Tools → Manage API Keys if exposed.

The current internal extension token is stored locally at `.vercel/extension-api-token.production.local`. That file is ignored and must not be pasted into docs, commits, screenshots, issue comments, or PR descriptions.

If any real token is exposed, rotate it immediately in the upstream service and update Vercel. Do not rely on deleting a commit after a secret was pushed.

## Extension And Alpha Auth

The extension ID is not a secret. Bearer credentials are secrets.

Two browsers, one identity model: production accepts a request only when the
`x-cold-start-extension-id` header matches an entry in the allowed-ID list
(the Chrome store ID or the Firefox gecko ID `cold-start@semitechie.vc`) AND
the bearer credential validates. The Origin header is demoted to a Chrome-only
consistency check: a `chrome-extension://` origin must exactly match the
configured origin, while `moz-extension://` and absent origins are ignored as
identity, because Firefox sends a per-install random UUID origin (Bugzilla
1405971) that can be neither enumerated nor trusted. `http(s)` origins stay
rejected in production unless explicitly allowlisted. The alpha-installation
path enforces the same ID gate as the operator path. An ID header is
caller-controlled routing metadata; the credential is the secret, and any
credential embedded in a distributed build is extractable, which is why testers
get per-invite revocable credentials rather than a shared token.

Personalized invitation links carry two separate secrets. A 32-byte presentation
capability is in the path and protects the name and invitation art used by the
page, Open Graph metadata, and `card.png`. The redemption code stays in the URL
fragment. The database stores only SHA-256 hashes of both values. Personalized
preview lookup requires an unexpired, unrevoked invitation in `pending` or
`active` state. The page, metadata, and image route use that same lookup.

Legacy name-slug links no longer reveal personalized identity or art. They fall
back to the generic install-and-connect page, where the existing fragment code
can still redeem. `npm run alpha:reissue-link` is dry-run by default and lists
active personalized invitations that need a capability link. Applying it to one
explicitly confirmed invitation rotates its redemption code and adds the hashed
presentation capability. Existing installation credentials remain active.

Installation access tokens are 32 bytes of randomness. Redemption creates a
separate revocable per-install credential whose hash is stored in
`alpha_installations`. The raw installation credential stays in
`chrome.storage.local`, restricted to trusted extension contexts. Each
invitation is expiring and limited to a configured number of active
installations.

Revoking one installation returns that seat to its invitation so an operator can
repair a failed client-side connection. Revoking the invitation remains terminal.
There is no automatic re-redeem grace window.

The pre-existing operator bearer-token compare is unchanged: `timingSafeStringEqual`
in `apps/web/src/lib/extension-auth.ts` still guards the `EXTENSION_API_TOKEN`
match for the operator principal. Alpha installation tokens are looked up by
their SHA-256 hash through an indexed database equality check, not a raw
in-process string compare.

Authentication returns a server-derived alpha or operator principal. Client
payloads never choose an invitation ID, installation ID, scope, allowance, or
settlement result. The shared operator token remains available for internal
testing and rollback. It must never be distributed to alpha testers.

Production should use:

```text
PUBLIC_GENERATION_ENABLED=false
CHROME_EXTENSION_ID=<loaded-extension-id>
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<loaded-extension-id>
EXTENSION_API_TOKEN=<long-random-token>
```

Production must not use:

```text
CHROME_EXTENSION_ID=local-dev
ALLOWED_EXTENSION_ORIGINS=chrome-extension://*
ALLOWED_EXTENSION_ORIGINS=http://localhost:5173
EXTENSION_API_TOKEN=local-extension-token
PUBLIC_GENERATION_ENABLED=true
```

`apps/web/src/lib/extension-auth.ts` fails closed in production for local sentinel values and wildcard extension origins. Keep that behavior.

Production friend-alpha access also requires:

```text
ALPHA_ACCESS_ENABLED=true
ALPHA_GENERATION_ENABLED=true
```

`ALPHA_ACCESS_ENABLED=false` rejects alpha credentials and invitation
redemption. `ALPHA_GENERATION_ENABLED=false` blocks only fresh paid work.
Cached profiles, public cards, filed Lens results, and standing withheld reads
remain available.

The invitation page sends only two typed external messages to the extension.
The service worker accepts them only from the exact trusted invitation origin.
Invitation secrets use the URL fragment and are removed immediately with
`history.replaceState`.

Firefox has no page-to-extension messaging, so on Firefox the sidebar panel
itself redeems a pasted invitation link through the same `/api/alpha/invite/redeem`
route and the shared redemption module (`apps/extension/src/shared/alpha-connect.ts`).
The credential handling is identical: the raw installation credential is stored
in trusted extension storage and never rendered back to any page. Firefox beta
distribution is the friend-alpha invite system; no shared Firefox token exists.

`/api/alpha/invite/inspect` and `/api/alpha/invite/redeem` are intentionally
unauthenticated: a tester has no credential yet when they open the invitation
link. Both routes validate the token shape, hash it, and consume the same
source-scoped Postgres quota before inspecting or redeeming. Quota consumption
uses a transaction advisory lock and records at most ten attempts per source in
the trailing hour, including valid attempts. There is no global invitation
breaker. Redemption separately takes a per-token advisory lock so concurrent
redemptions cannot double-spend an installation slot.

The default invitation token is a three-word code drawn from a roughly
1,165-word list, about 30 bits of entropy, matched against a 14-256
character pattern shared by every entry point. A legacy 32-byte token
remains available through the operator script's `--skip-card` path. The
three-word format remains acceptable because the source quota, expiry, generic
failure behavior, token hashing, redemption lock, and seat limit apply together.

Production client identity follows Vercel's request contract. Cold Start trusts
only `x-vercel-forwarded-for`, which Vercel documents as the client address that
cannot be overwritten by a proxy in front of the deployment. It does not trust
the caller-controlled first `x-forwarded-for` value in production. A missing or
invalid trusted header fails closed with 503 before quota persistence. Local and
test execution may use the first forwarded hop, with loopback as the no-proxy
default. This deployment assumption must be revisited before hosting the web app
outside Vercel.

## Request And Resource Boundaries

Small unauthenticated JSON routes use the shared bounded reader in
`apps/web/src/lib/bounded-json.ts`. It checks a declared `Content-Length` and
also counts decoded stream bytes, so a missing, understated, or chunked length
cannot bypass the cap. `/api/generate` rejects a production request with no
credential before reading its body, caps the body at 2 KB, and accepts only its
documented keys and value types.

External links use `safeWebUrl` from `packages/core`: HTTP or HTTPS only, no
embedded credentials, valid syntax, and a 2 KB maximum. Public clipping images
use the stricter `safePublicImageUrl`: HTTPS only, no credentials, no IP literal,
and no localhost, private-use, test, or other reserved local hostname suffix.
Person channels and image resources are checked when parsed or ingested and
again at the extension rendering sink, so unsafe legacy records fail closed.

Cold Start never dereferences a provider-supplied image URL on the server. The
server calls only configured provider endpoints. Provider-side private-network
fetch behavior is outside this repository and was not proven locally. Direct
browser image loading also cannot prove a hostname's future DNS resolution;
the code therefore makes no DNS-rebinding claim. An image proxy would be needed
for an enforceable resolved-address policy and is not part of the current threat
model. A broad `img-src https:` CSP would not close that gap and would duplicate
the protocol check, so no new CSP was added.

The Inngest route is served through the official `serve` adapter, which verifies
signed cloud requests when `INNGEST_SIGNING_KEY` is configured. Production must
run with `NODE_ENV=production`, without `INNGEST_DEV=1`, and with both
`INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` present. Source inspection proves
that configuration path, not the live secret values. A read-only
`vercel env ls production` on August 11, 2026 confirmed both encrypted variable
names and no `INNGEST_DEV` override. It did not read either secret value.

## Allowances

Allowance decisions are server-side. Reservation, generation-run creation, and
ledger debit happen in one database operation. Cached reads, active-run joins,
status polls, and unchanged standing-withheld reads are free. Terminal and
watchdog failures refund once through the centralized settlement seam.

Client analytics never debit, refund, authorize, or settle work.

## Alpha Analytics

Alpha analytics are first-party and semantic. The client sends only named
events from owned interaction handlers. Every payload uses the strict
discriminated union in `packages/core/src/alpha-analytics.ts`, is capped at 25
events and 64 KB per request, and is deduplicated by event ID.

Do not add arbitrary metadata or a global click listener. Analytics must not
contain full URLs, query strings, page titles, page content, claims, source
snippets, Lens prose, names, email addresses, copied values, raw errors, stack
traces, invitation secrets, access credentials, or client-supplied identity.
The server derives invitation and installation identity after authentication.

Raw alpha events are retained for at most 30 days. Vercel Cron calls the
authenticated `/api/alpha/retention` route daily. The route is bounded to
10,000 deletions. `npm run alpha:prune` remains the manual repair path.
`npm run alpha:delete-tester` removes identity-linked alpha data on request.
De-identified operational totals may remain.

## Production Migrations

Runtime traffic uses the pooled `DATABASE_URL`. Production migrations require a
distinct direct `DATABASE_DIRECT_URL`. `scripts/migrate-production.mjs`
rejects local endpoints, pooler hosts, an empty direct URL, and a direct URL
that matches the runtime URL.

## GitHub Repo Check

Before pushing, run:

```bash
git status --ignored --short .env .env.local .vercel .neon
git grep -n -I -E '(sk-ant-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|X402_PRIVATE_KEY=0x[0-9a-fA-F]{40,}|EXTENSION_API_TOKEN=[A-Za-z0-9_-]{32,}|DIRECT_EXA_API_KEY=[A-Za-z0-9_-]{24,}|BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY)'
git log --all -p -G'(sk-ant-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|X402_PRIVATE_KEY=0x[0-9a-fA-F]{40,}|EXTENSION_API_TOKEN=[A-Za-z0-9_-]{32,}|DIRECT_EXA_API_KEY=[A-Za-z0-9_-]{24,}|BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY)' -- .
```

Expected: ignored local secret files show as ignored; the grep and history scans return no real secrets.

## Dependency Audit

`npm run audit:deps` is the authority on current audit state. It runs the production-dependency audit, blocks on high or critical findings, and tolerates only the advisories allowlisted in `scripts/audit-deps.mjs`, each carried with a dated comment naming its planned fix. A point-in-time advisory list in this file would rot; the script cannot.

`npm audit fix --force` proposes breaking dependency changes. Do not run it blindly. Treat this as dependency-upgrade work: upgrade the owning packages, rebuild the extension and web app, then rerun tests, build, and `npm audit`.

## Reporting

This is a private project. Report security issues directly to the project owner. Do not open public issues containing secrets, exploit steps, or private deployment details.
