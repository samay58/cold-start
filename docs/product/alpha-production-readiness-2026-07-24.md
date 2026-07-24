# Friend Alpha Production Readiness

Captured July 24, 2026.
Last updated July 24, 2026.

This is the strict ship gate for five invited friends. The product remains
free, invitation-gated, server-metered, and distributed through an Unlisted
Chrome Web Store item.

## Current Decision

Cold Start is not ready for friend-alpha invitations.

The repository implementation, production migration, compatible deployment,
recovery proof, and kill-switch proof are complete. Paid canary, store review,
owner rehearsal, and soak remain open. Do not distribute the operator token.
Do not use unpacked installation as the friend path.

## Production Evidence

Read-only production checks on July 24 showed:

- Latest `main` CI was green.
- Latest Vercel production deployment was Ready.
- API contract was `2026-07-20.synthesis-withheld-v1`.
- Commit `5bb342b` was deployed to the custom domain without changing that contract.
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
- AgentCash Base held $1.5702.
- Vercel Pro was verified through the project API.
- Neon Launch and seven days of restore history were verified.
- A guarded direct migration URL passed preflight and applied migration `0009`.
- Migration `0010` added the concurrency-safe multi-seat redemption function while leaving the applied `0009` file unchanged.
- Production then contained six alpha tables and four alpha functions.
- A point-in-time restore recreated the pre-migration state in about one second and the temporary branch was deleted after validation.
- One short-lived QA invitation proved inspect, redemption, authenticated bootstrap, and generation-disabled behavior. All QA tester data was deleted.
- Both production kill switches were exercised and access was restored.
- The authenticated retention job returned `200` with zero eligible deletions.
- The `framer` row and card JSON disagreed about `.co` and `.com`.
- Known-dead Apollo-family probes repeatedly returned 404.

These observations triggered the build. The code now covers each software
failure. A paid production canary is still required before that claim becomes
production evidence.

## Implementation Receipt

### Reliability

- Null-shaped timing claims normalize to an absent claim.
- Contradictory partial claims remain invalid.
- Card writes serialize per slug and retry through one bounded mutation seam.
- Fifty concurrent mutations preserve all fields.
- Stable failure codes cover evidence, provider, model contract, concurrent write, timeout, authentication, allowance, and unknown outcomes.
- Known-dead provider probes are skipped.
- Failed terminal rows retain trace-derived cost.
- Stored row and card JSON domains must agree.
- Domain collisions refuse reads and writes.
- The reviewed `framer` repair now uses `framer.com`.

### Identity And Spend

- Invitations are single-use, expiring, and stored as hashes.
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
- `alpha:status --gate` fails on software failures, stale runs, wallet floor, and unsupported clients.
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
- GitHub Check run `30123762133` passed the same gate against commit `5bb342b`.
- The deterministic 0.2.0 ZIP built twice from commit `87bdddf` with identical bytes. The artifact is `dist/chrome-web-store/cold-start-chrome-0.2.0-87bdddfa3d79.zip`; SHA256 is `03a28aeea2e29ef6021360ed28c0824a29c91fc3cd98e10ce41f70734740b050`.

## Production Gates

Code-ready requires every item below:

- Vercel Pro is active.
- Production spend controls are configured.
- Neon Launch is active.
- Restore history is seven days.
- A dedicated direct migration URL is proven.
- Migration `0009_reflective_meteorite.sql` is applied.
- Migration `0010_redeem_alpha_invite.sql` is applied.
- A point-in-time restore into a temporary branch is timed and validated.
- The compatible server deployment is live.
- AgentCash Base holds at least $35.
- Both kill switches are exercised against production.
- The five-company paid canary passes with a $5 cap.
- `alpha:status --gate` passes on canary evidence.
- The deterministic Web Store ZIP is built from the checked commit.
- The Unlisted store submission is complete with deferred publishing.

Invite-ready requires:

- Chrome review approval.
- One owner invitation completes the full fresh-profile journey without oral setup.
- The owner rehearsal covers close and reopen, public card, Lens, source, dossier, diagnostics, support, revocation, and reconnect.
- A 24-hour owner-only soak has no unresolved software failure.
- Five individual invitations are prepared but not sent.

## Open Blockers

As of this update:

- Vercel production spend controls are not yet observed.
- AgentCash Base is below the $35 floor.
- The paid canary has not run.
- Production alert evidence for repeated auth failures and event throttling is not proven.
- Chrome publisher registration, fee, submission, and review are not verified.
- The owner rehearsal and 24-hour soak have not run.

These are hard blockers. AgentCash funding and store submission require owner
action.

## Next Action

Complete the production prerequisites in order:

1. Configure and observe Vercel spend controls.
2. Fund AgentCash.
3. Run the paid canary and alpha gate.
4. Submit the Unlisted extension.
5. Rehearse with the owner.
6. Soak for 24 hours.
7. Prepare five invitations. Do not send them from the build session.
