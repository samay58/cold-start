# September 14 consolidation

This release combines the deployed profile recovery repair with the completed evaluator, retention, and dependency repairs from the primary checkout.

## Changes

- Full-profile extraction retains its cancellable deadlines, independent fallback, typed normalization, and complete attempt trace.
- Background How it wins writes require the current evidence and evaluator signature. Changing only the writer preserves the paid judge cache.
- Alpha retention uses one bounded policy across the cron route and operator script. Judgment retention is measured from creation.
- Supported dependency updates include Next 15.5.25, Inngest 4.20.0, and AgentCash 0.17.1. The existing audit gate remains enforced. Vercel's pinned Undici 5 dependency still has a dated exception; the tree is not vulnerability-free.
- The API and extension replace exhausted-extraction provider details with a short user-facing error. Stored errors and traces retain the diagnostic detail.
- Public cards combine duplicate people only when the full name and nonempty role match. Sources and founder/executive membership remain intact.
- Financing text retains every sentence. Boski's stored warning that the Boksi funding report belongs to another company had been clipped from the page.
- The landing page identifies its 18-cent median as an August sample of 61 companies, before How it wins was added. It no longer presents that measurement as the current cost of every full profile.
- Deployment instructions distinguish historical observations, code defaults, and sensitive configuration that cannot be read back from Vercel.

## Verification

The combined branch passed the full repository check before the final display and error-copy changes. The error-copy regression reproduced the raw provider detail before the fix. The financing regression reproduced the missing qualification before the fix. Scoped API, extension, card, and landing tests pass after those changes. The final `npm run check` passed over the complete source, including both real Postgres suites, browser builds, lint, typechecks, tests, unused-code checks, the secrets scan, and the dependency gate. Sixteen frozen extraction replays also passed without model calls. GitHub CI and production readback follow publication.

Before publication, the live landing page, catalog, Boski card, and Dumb card were inspected in the browser. Both stored company journeys remain available. Neon confirms Dumb's September 14 analysis run `70540ffd-ea21-4ba6-8ccc-c71d6eaa87a1` completed with How it wins enabled and status `read`. No active or queued Inngest jobs were returned at the pre-release check.

Final readback checks the custom-domain deployment revision, Inngest sync, both saved canaries, public/private separation, citation resolution, and the two corrected displays. It makes no new paid generation requests. The prior investigation's $4.9907061 reservation remains unchanged; reservations are not an invoice.

## Preservation and rollback

The initial dirty checkout has a verified archive and per-file hashes in the local Codex backup directory. The private design study remains ignored in its original location. Recovery scripts, saved provider outputs, budgets, and project credentials were copied from the repair worktree and verified byte-for-byte before removing it. Generated dependencies and build output can be recreated.

The preceding production deployment is `dpl_EYDpc1HUWKeRtSTcWzoVMdmCKvwT`, serving `aca21652d633ae2b278d868115e3088ddd6bc29f`. No production environment changes or database migrations are needed. Restore that deployment if final production checks fail. The final deployment, CI, preservation, and API receipts are recorded locally in `.cold-start/consolidation-release.json`.
