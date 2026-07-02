# Security

Cold Start has two public surfaces and one gated surface:

- Public web page: `/c/{slug}`
- Public API: `/api/cards/{slug}`
- Gated extension API: `/api/extension/cards/{slug}` and extension-authenticated `/api/generate`

The public surfaces must never expose `synthesis`. The gated surface requires both extension identity checks and a bearer token.

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
- `X402_PRIVATE_KEY`: AgentCash wallet key for deployed provider calls.
- `ANTHROPIC_API_KEY`: Anthropic API key.
- `DIRECT_EXA_API_KEY`, `DIRECT_FIRECRAWL_API_KEY`, `DIRECT_PDL_API_KEY`: direct provider keys.
- `GITHUB_TOKEN`: optional GitHub PAT for the free commit-email reachability layer. Public read-only scope is sufficient; do not grant repo write or private scopes.
- `DATABASE_URL`: Neon Postgres connection string.
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`: hosted Inngest credentials.

The current internal extension token is stored locally at `.vercel/extension-api-token.production.local`. That file is ignored and must not be pasted into docs, commits, screenshots, issue comments, or PR descriptions.

If any real token is exposed, rotate it immediately in the upstream service and update Vercel. Do not rely on deleting a commit after a secret was pushed.

## Extension Auth

The extension ID is not a secret. The bearer token is the secret.

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

## GitHub Repo Check

Before pushing, run:

```bash
git status --ignored --short .env .env.local .vercel .neon
git grep -n -I -E '(sk-ant-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|X402_PRIVATE_KEY=0x[0-9a-fA-F]{40,}|EXTENSION_API_TOKEN=[A-Za-z0-9_-]{32,}|DIRECT_EXA_API_KEY=[A-Za-z0-9_-]{24,}|BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY)'
git log --all -p -G'(sk-ant-[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|X402_PRIVATE_KEY=0x[0-9a-fA-F]{40,}|EXTENSION_API_TOKEN=[A-Za-z0-9_-]{32,}|DIRECT_EXA_API_KEY=[A-Za-z0-9_-]{24,}|BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY)' -- .
```

Expected: ignored local secret files show as ignored; the grep and history scans return no real secrets.

## Dependency Audit

As of 2026-05-11, `npm audit --audit-level=moderate` reports known upstream advisories:

- High: Next.js transitive advisories, including its pinned PostCSS path.
- High: OpenTelemetry Prometheus exporter through `@opentelemetry/auto-instrumentations-node`.
- High: Rollup `2.79.2` through `@crxjs/vite-plugin`.
- Moderate: esbuild through Drizzle Kit's `@esbuild-kit/core-utils` path.
- Moderate: PostCSS below `8.5.10` through Next.

`npm audit fix --force` proposes breaking dependency changes. Do not run it blindly. Treat this as dependency-upgrade work: upgrade the owning packages, rebuild the extension and web app, then rerun tests, build, and `npm audit`.

## Reporting

This is a private project. Report security issues directly to the project owner. Do not open public issues containing secrets, exploit steps, or private deployment details.
