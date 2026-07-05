---
name: verify-cold-start
description: Repo verification sequence for Cold Start before a commit or ship. Use for "verify", "pre-commit check", "ship check", "is this ready to commit", or before ending a coding session in this repo.
---

# Verify Cold Start

Run from the repo root unless noted. Source env first for anything touching the database, providers, or LLMs: `set -a; source .env.local; set +a`. `CLAUDE.md`: "Use `set -a; source .env.local; set +a` before commands that hit the database, providers, or LLMs directly."

## Full local gate

`npm run check`. `CLAUDE.md`: "`npm run check` is the full local gate and already chains lint, typecheck, test, build, a `eval:golden --dry-run --limit 12` pass, knip, secrets:check, and audit:deps. CI (`.github/workflows/check.yml`) runs those same steps individually on Node 24, so a green local `check` should mean green CI."

## Individual gates, for a scoped change where the full gate is overkill

- `npm run typecheck`, tsc --noEmit across workspaces (`CLAUDE.md` Common Commands).
- `npm run test`, vitest across workspaces, then `node --test` over `eval/*.test.mjs` and `eval/**/*.test.mjs` (`CLAUDE.md` Common Commands).
- `npm run lint`, ESLint flat-config check (`CLAUDE.md` Common Commands).
- `npm run build`, build all workspaces (`CLAUDE.md` Common Commands).

## Scoped test runs

`npm test -w @cold-start/pipeline -- generate-card` or `npm test -w @cold-start/pipeline -- -t "verifier drops"` (`CLAUDE.md` "Single test examples").

## Extension changes

`npm run audit:css -w @cold-start/extension` fails on raw color literals and on any border/outline triplet whose dark value collapses onto the page ground; it already runs inside the extension's own `test` script. `CLAUDE.md`: "`npm run audit:css -w @cold-start/extension` is chained into the extension `test` (so it runs in `check` and CI) and fails on raw color literals and on any border/outline triplet whose dark value collapses onto the page ground." (`apps/extension/package.json`: `"test": "npm run audit:css && vitest run --passWithNoTests"`, `"typecheck": "tsc --noEmit"`.)

## Secrets and dependency hygiene

`npm run secrets:check` scans tracked surfaces for accidental secrets, `npm run audit:deps` is the guarded production dependency audit (`CLAUDE.md` Common Commands). Both already run inside `npm run check`.
