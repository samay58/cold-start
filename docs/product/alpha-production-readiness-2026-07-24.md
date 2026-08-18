# Friend Alpha Production Readiness

Captured July 24, 2026.
Last updated August 17, 2026.

This is the strict ship gate for five invited friends. The product remains
free, invitation-gated, server-metered, and distributed through an Unlisted
Chrome Web Store item.

## Current Decision

Cold Start is not ready for friend-alpha invitations.

The repository implementation, production migrations through `0016`, compatible
deployment, recovery proof, kill-switch proof, Chrome Web Store release, wallet
floor, and Gecko repair canary are complete. The live release gate still fails
on two older Gecko failures in its seven-day window. The owner rehearsal,
current-version canary set, production alert proof, spend-control readback, and
owner soak remain open. No real friend invitation has been sent. Do not
distribute the operator token or use unpacked installation as the friend path.

## August 17 Wallet And Repair Canary

The final trusted CLI read AgentCash Base at `$38.567209`, clearing the `$35`
release floor by `$3.567209`. The observed funding credit was `$9.615385` from
the prior `$29.180024` balance. This is funded balance, not product spend. The
repository cannot see checkout charges or funding fees, so no out-of-pocket
cost is inferred.

Gecko Robotics run `e3d4ee85-1a63-452f-87b2-17e7991870bb` completed on the
repaired production path. It accepted 20 sources, filed 12 traced citations,
and grew to 16 after background enrichment. The current CompanyEnrich route
returned 8 facts and applied 7. Exact non-overlapping cost was `$0.172649`:
`$0.100000` from five settled AgentCash calls and `$0.072649` from LLMs. Direct
Exa, Websets, and founder voice cost `$0`. The wallet delta remains a
cross-check because other services can use the same wallet.

## August 11 Security Deployment

The scan remediation shipped in `0b8c8a7`. Migration
`0016_pink_husk.sql` is applied in production and its presentation-capability
column, source-scoped invite quota function, and atomic access-request function
were read back from Postgres. One active personalized invitation was explicitly
reissued; the final dry run found no legacy personalized invitations. Existing
installation credentials stayed active.

The public and extension card routes were checked after deployment: public
responses omit synthesis and authenticated extension responses retain it. Commit
`387afca` then replaced the full-card public index with compact identity and
source-quality counts. The 344-profile cache payload fell to 97,403 bytes, and
fresh production requests no longer emit the Next.js 2 MB cache warning. CI run
`31512859530` passed for that revision, which is Ready on the custom domain.

The Vercel environment listing confirmed encrypted `INNGEST_SIGNING_KEY` and
`INNGEST_EVENT_KEY` entries and no `INNGEST_DEV` override. Secret values were not
read. Provider private-network and DNS-rebinding behavior remains an upstream
contract rather than a locally proven egress control.

Migration `0016` is expand-compatible, so an emergency application rollback can
leave it in place. Rolling back before `0b8c8a7` would re-enable the old global
breaker and name-slug preview, so it is an emergency availability action, not a
security rollback. An unredeemed tester's old fragment code stops working only
after that tester's explicit reissue step.

The August 11 `alpha:status --gate` readback found no alpha-scoped failures,
stale runs, client errors, or source throttling. The release gate remains red:
14 historical software failures are still inside the all-traffic seven-day
window, and AgentCash Base is $31.0202 against the $35 floor.

## Production Evidence

Read-only production checks on July 24 showed:

- Latest `main` CI passed the full repository gate.
- The matching Vercel production deployment was Ready on the custom domain.
- The live API contract was `2026-07-24.alpha-principal-v1`.
- 18 runs existed in the latest 24-hour view: 12 complete and 6 failed.
- Two failures were honest evidence insufficiency.
- Two failures came from null-shaped Lens timing claims.
- Two failures came from concurrent card writes.
- The six failed traces included $0.184893 of LLM spend while stored terminal cost was null.
- Successful traced LLM spend was $0.3493.
- First usable basics had 30 complete runs out of 32. Complete p50 was 39.8 seconds and p90 was 53.7 seconds.
- Skip-fresh Lens had seven runs. p50 was 54.2 seconds and p90 was 68 seconds.
- Full-refresh Lens had 28 runs. p50 was 95 seconds and p90 was 143 seconds.
- No silent active runs crossed policy at inspection time.
- AgentCash Base held $35.2148 after funding.
- The pre-canary `alpha:status --gate` passed with no invitations or tester activity.
- Vercel Pro was verified through the project API.
- Neon Launch and seven days of restore history were verified.
- A guarded direct migration URL passed preflight and applied migration `0009`.
- Migration `0010` added the concurrency-safe multi-seat redemption function while leaving the applied `0009` file unchanged.
- Production then contained six alpha tables and four alpha functions.
- A point-in-time restore recreated the pre-migration state in about one second and the temporary branch was deleted after validation.
- One short-lived QA invitation proved inspect, redemption, authenticated bootstrap, and generation-disabled behavior. All QA tester data was deleted.
- Both production kill switches were exercised and access was restored.
- The authenticated retention job returned `200` with zero eligible deletions.
- The Chrome Web Store publisher account is active. Trader information was submitted and verification is pending.
- The `framer` row and card JSON disagreed about `.co` and `.com`.
- Known-dead Apollo-family probes repeatedly returned 404.

These observations triggered the build. The code now covers each software
failure. The August 17 Gecko repair canary is the production proof for the
retired provider route, current response shape, citation recovery, and exact
AgentCash settlement path.

## Implementation Receipt

### Reliability

- Null-shaped timing claims normalize to an absent claim.
- Contradictory partial claims remain invalid.
- Card writes serialize per slug and retry through one bounded mutation seam.
- Fifty concurrent mutations preserve all fields.

2026-07-27 amendment. The mutation seam above was broken in production
from 2026-07-24 through 2026-07-27: its optimistic compare used
`updated_at`, which a fresh insert stamps with microseconds while a JS
Date reads back milliseconds, so every post-insert write failed. That
killed 17 of 18 analysis attempts plus all fresh-card contact and block
enrichment for three days, and would have failed every invited friend's
second interaction with any company. It was a hard blocker for
invitations. Fixed by migration 0011's version counter; a null-text
timing-claim leaf that killed three paid runs was normalized in the
same pass, and `alpha:status --gate` was extended to scan all
generation runs because the alpha-scoped gate saw none of this. A
real-Postgres suite (`test:cards-db`, chained into `check`) now
reproduces the insert-path failure the fifty-mutation mock suite could
not. Post-deploy verification: the three stuck slugs completed clean,
and a never-tested company ran basics, block enrichment, contact
enrichment (3 work emails, 3 person reads), and analysis end to end
with zero failure events. Details in
docs/qa/analysis-run-observations.md, 2026-07-27 entry.
- Stable failure codes cover evidence, provider, model contract, concurrent write, timeout, authentication, allowance, and unknown outcomes.
- Known-dead provider probes are skipped.
- Failed terminal rows retain trace-derived cost.
- Stored row and card JSON domains must agree.
- Domain collisions refuse reads and writes.
- The reviewed `framer` repair now uses `framer.com`.

### Identity And Spend

- Invitations are expiring, stored as hashes, and capped by active installations.
- Revoking an installation with the explicit `--repair` flag frees its seat and makes the original invite redeemable again.
- Revoking an invitation remains terminal and revokes every active installation.
- Each installation receives a separate hashed, revocable credential.
- Authentication returns a server-derived alpha or operator principal.
- The operator credential remains transitional and is never distributed.
- Profile and Lens allowances are independent.
- Reservation, run creation, and debit are atomic.
- Duplicate interaction IDs are idempotent.
- Active-run joins and cached reads are free.
- Standing withheld reads are free until evidence changes.
- Terminal and watchdog failures refund once.
- Per-invite rate, domain-failure, and daily-failure breakers protect paid work.
- Access and generation have separate kill switches.

### Analytics

- The event contract is a strict first-party discriminated union.
- The extension records named product actions at their owning handlers.
- The server records generate request disposition, terminal outcome, cost, and latency.
- Client payloads cannot supply invitation or installation identity.
- Batches are capped at 25 events and 64 KB.
- Event IDs are idempotent.
- The extension queue persists before sending, retries transient failures, and caps age and size.
- Payloads exclude page content, prose, names, emails, URLs, credentials, raw errors, and stack traces.
- Raw events are retained for at most 30 days.
- An authenticated Vercel Cron route enforces the 30-day boundary every day.
- Operator commands prune events and delete tester-linked data.

### Invite And Extension

- `/alpha` captures a fragment secret and removes it immediately.
- Consent comes before redemption and alpha analytics.
- The page explains invocation, public-card creation, identity posture, analytics, retention, deletion, and allowances.
- It handles unsupported, uninstalled, disconnected, expired, used, revoked, limited, offline, old-client, paused, exhausted, and ready states.
- The service worker accepts only typed messages from the exact invitation origin.
- Production builds never show an API origin or token form.
- Connected settings show allowances, public-card behavior, theme, redacted diagnostics, and support.
- The manifest uses only `activeTab`, `sidePanel`, and `storage`.
- Chrome 116 is the minimum version.

### Operations And Package

- `alpha:invite`, `alpha:revoke`, `alpha:delete-tester`, `alpha:prune`, `alpha:status`, and `alpha:test` exist.
- `alpha:status` reports tester funnel, allowances, dispositions, latency, failures, compatibility, wallet exposure, and successful and failed spend.
- `alpha:status --gate` fails on software failures and stale runs across all generation runs (any principal, since 2026-07-27), wallet floor, and unsupported clients.
- Background enrichment caps reserve Inngest capacity.
- The production migration command requires a distinct direct URL and rejects poolers.
- Production migration and restore drill receipts are recorded in `docs/deployment.md`.
- The deterministic extension packager checks version, permissions, host access, excluded files, credentials, ZIP bytes, and checksum.
- Store listing, declarations, permission copy, assets, reviewer instructions, and compatibility matrix are tracked.

## Verification Receipt

Local proof completed on July 24:

- Extension CSS audit passed.
- Focused core, database, web, and extension tests passed.
- The real Postgres alpha integration suite passed 13 tests.
- Eight simultaneous invite redemptions stopped exactly at one or two configured seats.
- Revoking an installation did not make its invitation reusable.
- Fifty simultaneous reservations stopped exactly at 12.
- Duplicate interactions used one debit.
- Failure settlement refunded once.
- One installation was capped atomically at 300 new events per minute.
- The operator suite passed four tests.
- The complete extension UI suite passed 84 tests with one worker.
- Full and reduced-motion Lens entry tests passed.
- Cached Lens rendered at rest.
- Watchdog recovery, contract mismatch, category keyboard travel, final-item exits, and dossier focus behavior passed.
- The built MV3 extension passed its real-bundle smoke test.
- Invite, unconnected, connected settings, Lens, and dossier surfaces were inspected in light and dark.

The full repository `npm run check` passed on July 24. It covered lint,
typecheck, all unit tests, the real Postgres suite, Chrome and Firefox builds,
Firefox manifest lint, golden-eval dry run, dead-code analysis, secret scanning,
and the dependency audit.
- The latest `main` CI run passed the same gate.
- The deterministic 0.2.0 ZIP built twice from commit `f108f26` with identical bytes. The artifact is `dist/chrome-web-store/cold-start-chrome-0.2.0-f108f261acc8.zip`; SHA256 is `74c8de20d7460f5d3edbef861efd3bd9e862da8ba2358b77fa8bdf72d8d0e524`.

August 17 final proof:

- Final code commit `eb80d70` is on `main` and `origin/main`.
- Production deployment `dpl_7QxYakgUk8iBfVbPFqB17NT7d1U6` is Ready and serves `cold-start.semitechie.vc`.
- `npm run check` exited `0` from a stopped local Postgres start. Firefox retained its six known warnings.
- The guarded dependency audit passed. Its known temporary advisories remain disclosed.
- `/`, `/catalog`, `/c/geckorobotics`, and `/api/cards/geckorobotics` returned `200`.
- Public Gecko JSON contained no synthesis, email, email-status, or private-read fields.
- `alpha:status --json` found 59 runs, 13 failures, two software failures, no stale runs, and no incomplete AgentCash accounting.
- The two software failures are the older Gecko runs. The fresh repair canary completed cleanly.

August 18 clean slate:

- Deleted all five expired QA and owner invites with the exact-ID operator command.
- Production readback shows zero testers, invitations, sessions, companies, or allowance activity.
- No replacement invite was created.
- CI now runs both real database suites, skips the unused browser download, uses Node 24 GitHub actions, cancels superseded runs, and caps jobs at 20 minutes.

## Production Gates

Complete:

- Vercel Pro, Neon Launch, seven-day restore history, direct migrations through `0016`, and the restore drill are proven.
- The compatible server deployment and both production kill switches are proven.
- AgentCash Base is above `$35`.
- Chrome Web Store `0.2.5` is accepted and published as Unlisted.
- The Gecko repair canary completed with exact cost accounting.
- The full local repository gate passed on the deployed commits.

Open:

- Read back the production spend controls.
- Prove alert handling for repeated authentication failures and event throttling.
- Complete five distinct current-version company journeys. Count the owner rehearsal if it uses a fresh company; do not run more paid canaries without approval.
- Let the seven-day window clear the two older Gecko failures, then require `alpha:status --gate` to pass without an override.
- Complete the owner rehearsal and a 24-hour owner-only soak.
- Prepare the first real invitation but do not send it without approval.

## Open Blockers

As of August 17:

- The actual store-installed invitation journey has not been rehearsed end to end by the owner.
- The strict five-company current-version proof is incomplete. One Gecko repair canary is recorded.
- Production spend controls and alert handling have not been read back as proof.
- The seven-day gate still includes two older Gecko failures.
- The 24-hour owner-only soak has not run.

These are hard blockers for sending the first real invitation. The code, wallet,
deployment, and Chrome package are not blockers.

## Store Review Status

Version `0.2.5` is accepted and published as Unlisted. The dashboard showed
`0.2.5` in both Draft and Published on August 17. The served CRX matched commit
`a948268`'s packaged artifact apart from Google-added metadata. The accepted
version and checksum are recorded in `chrome-web-store-alpha/release-version.json`
and `chrome-web-store-alpha/release-compatibility-matrix.md`.

## Next Action

Stack-ranked by consequence:

1. Run the owner rehearsal through the published `0.2.5` store path with a fresh company. It passes only if install, connection, first profile, close and reopen, public card, Lens, sources, dossier, diagnostics, revocation, and reconnect work without oral setup. This is the largest unknown because no nontechnical end-to-end journey has been observed.
2. Read back Vercel spend controls and prove alerts for repeated authentication failures and event throttling. It passes when each limit has a production readback and each alert produces a visible operator signal. These controls limit financial and security damage if a tester or provider misbehaves.
3. Complete five distinct fresh current-version company journeys. Use the owner rehearsal as one and request approval before any extra paid canary. Each run must complete, pass the public-card privacy check, and settle every paid call.
4. Run the 24-hour owner-only soak while the two older Gecko failures age out. It passes with no new software failure, no stale run, no incomplete AgentCash accounting, wallet above `$35`, and a clean `alpha:status --gate` result.
5. Prepare one real friend invitation, inspect it, and send only after explicit approval. Expand one tester at a time.
