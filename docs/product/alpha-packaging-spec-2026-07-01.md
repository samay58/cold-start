# Alpha packaging: the ledgered friend alpha

Date: 2026-07-01

Last verified: 2026-07-24

Status: implemented locally; production rollout blocked

Owner: Samay

This is the live packaging decision for five invited friends.

## Decision

Keep the ledgered friend alpha.

The alpha is free and invitation-gated. Each installation receives a revocable
credential. Fresh profiles and Investor Lens runs have separate server-side
allowances. Cached reads and active-run joins are free. Failed work is refunded.
Do not build billing.

Use a Chrome Web Store Unlisted item. The store URL is distribution, not access.
The invitation credential remains the access boundary.

The implementation is now on the working tree. It is not yet deployed or safe
to invite friends. Production service upgrades, migration, restore proof,
canary, store review, and rehearsal remain required.

## Package Contract

Default allowance per invitation:

- 12 fresh profiles.
- 6 fresh Investor Lens runs.
- One active Chrome installation.
- 14-day invitation expiry.

The server applies these rules:

- A fresh profile or Lens run debits once when it creates work.
- A cached result is free.
- Joining active work is free.
- The first fresh withheld result is charged.
- Reopening the same withheld evidence is free.
- Forced evidence refresh is charged.
- A terminal or watchdog failure refunds once.
- Research section jobs use the same profile or Lens allowance class as their owning request.

Client events do not authorize, debit, refund, or settle work.

## Shipped In Code

### Reliability

- Null-shaped timing claims normalize to an absent claim before strict validation.
- Contradictory partial claims remain invalid.
- Card mutations serialize per slug and use bounded compare-and-swap retries.
- Fifty overlapping mutations preserve concurrent fields.
- Known-dead Apollo probes are skipped. The available organization route is corrected.
- Terminal runs carry stable failure codes.
- Failed runs retain trace-derived provider and LLM spend.
- Stored row and card JSON domains must agree.
- Requests refuse a card whose canonical domain differs from the requested domain.
- The reviewed `framer` record now uses `framer.com`.

### Identity And Allowances

- `alpha_invites` stores hashed, single-use, expiring invitations.
- `alpha_installations` stores hashed, independently revocable credentials.
- `alpha_allowances` stores profile and Lens state.
- `alpha_run_requests` records tester intent and server disposition.
- `alpha_allowance_ledger` records immutable debit and refund entries.
- Reservation, run creation, and debit happen atomically in Postgres.
- Settlement is centralized across completion, failure, dispatch failure, and watchdog retirement.
- Duplicate interaction IDs are idempotent.
- Fifty simultaneous reservations stop exactly at the configured limit.
- Per-invite rate and failure breakers protect fresh work.
- `ALPHA_ACCESS_ENABLED` and `ALPHA_GENERATION_ENABLED` are independent switches.

### Analytics

- The event contract is a strict discriminated union in `@cold-start/core`.
- The extension records named product actions, not raw clicks.
- The server derives invitation and installation identity.
- Event batches are limited to 25 events and 64 KB.
- Event IDs are idempotent.
- The extension persists before sending, retries transient failures, and caps the queue at 200 events and seven days.
- Analytics exclude content, prose, names, emails, URLs, credentials, raw errors, and stack traces.
- Raw events have a daily authenticated 30-day retention job and an identity-linked deletion command.

### Invite And Store

- `/alpha` captures the invitation from the URL fragment and removes it immediately.
- Consent precedes redemption and alpha analytics.
- The page explains domain access, public-card creation, identity posture, analytics, retention, deletion, and allowances.
- The page handles installation, connection, expiry, revocation, limits, offline, version, access, generation, and allowance states.
- The production extension has no token or origin setup form.
- Connected settings show allowances, public-card behavior, theme, redacted diagnostics, and support.
- The manifest uses `activeTab`, `sidePanel`, and `storage`.
- The decorative `favicon` permission is removed.
- Chrome 116 is the minimum version.
- The deterministic packager verifies permissions, files, version, secrets, ZIP bytes, and checksum.
- Store copy, declarations, icon, screenshot, promotional tile, reviewer instructions, and compatibility matrix are tracked.

## Product Truth

Every tester must understand:

- Cold Start reads the current company domain only after they invoke it.
- Generating creates or updates a public sourced fact card.
- Public cards show facts and sources. They do not identify the tester or expose contacts, person reads, withheld records, or Investor Lens synthesis.
- The alpha records named product interactions tied to the invitation for reliability and product improvement.
- Raw alpha events are kept for at most 30 days and can be deleted on request.
- Opening existing work is free.

Contacts remain asynchronous after the profile run. GitHub and low-cost pattern
discovery run first. No product control requests paid `deepFind`. Do not claim
that Lens includes contacts.

## Current Production Evidence

Read-only scripts were rerun on July 24, 2026.

| Measure | Observation |
|---|---|
| First usable basics | 32 runs, 30 complete, 2 evidence-insufficient. Complete p50 39.8s, p90 53.7s, p95 3m55s, max 6m10s. |
| Skip-fresh Lens | 7 runs. p50 54.2s, p90 68s. |
| Full-refresh Lens | 28 runs. p50 95s, p90 143s. |
| Combined Lens | p90 129s. |
| Last 24 hours | 18 runs, 12 complete, 6 failed. |
| Successful traced LLM spend | $0.3493 in the observed 24-hour window. |
| Failed traced LLM spend | The six failed traces included $0.184893 while their stored cost field was null. The code now persists terminal trace cost. |
| AgentCash Base | $1.5702, about five runs at the conservative $0.30 planning anchor. |
| Silent active runs | None at inspection time. |
| API contract | `2026-07-20.synthesis-withheld-v1`. |

The two basics failures were evidence insufficiency. The other four observed
software failures were malformed model output and concurrent card writes. Both
software defects now have deterministic regression coverage.

July 1 cost figures remain historical. They predate current model routing,
inline dispatch, skip-fresh analysis, and the current contact path. Do not use
the old $31 estimate as a current budget.

## Assessment

The packaging direction is still correct. The earlier weak areas have changed.

Now implemented:

- Per-tester identity and per-install revocation.
- Profile and Lens allowances.
- Atomic debits and exact refunds.
- Rate and failure breakers.
- Public-card disclosure before first generation.
- Invite, install, and connection flow.
- Tester-linked semantic analytics.
- Operator funnel, allowance, reliability, compatibility, and spend reporting.
- Deterministic Web Store packaging materials.
- Vercel Pro.
- Neon Launch with seven-day restore history.
- Guarded direct production migrations `0009` and `0010`.
- A timed point-in-time restore drill.
- Daily authenticated event retention.
- A backward-compatible production deployment.
- Live access and generation kill-switch proof.
- A deterministic 0.2.0 Web Store ZIP.

Still weak or unproven:

- Vercel production spend controls are not yet observed.
- AgentCash holds $1.5702, below the $35 release floor.
- No five-company paid canary has run against the new ledger.
- No Chrome publisher fee, submission, review, or deferred publication is verified.
- No owner-only fresh-profile rehearsal or 24-hour soak has run.
- Auth-failure and event-throttle alert aggregation are not yet proven as durable production signals.

The ledgered-alpha call stands. Code is no longer the main blocker. Production
recovery, release, and observed operating evidence are.

## Release Sequence

1. Configure and observe Vercel spend controls.
2. Fund AgentCash Base to at least $35.
3. Run the five-company canary with a $5 cap.
4. Submit the Unlisted item with deferred publishing.
5. Complete the owner-only fresh-profile rehearsal.
6. Hold a 24-hour owner-only soak.
7. Prepare five individual invitations. Do not send them until every gate passes.

## Operator Commands

```bash
npm run alpha:invite -- --label "Dad"
npm run alpha:revoke -- --installation <uuid>
npm run alpha:delete-tester -- --invite <uuid>
npm run alpha:prune -- --before 30d
npm run alpha:status -- --since 7d
npm run alpha:status -- --since 7d --json
npm run alpha:status -- --gate
```

## Deferred

- Billing and Stripe.
- Plans and account management.
- Credit purchases and overages.
- Paid contact deep-find.
- Third-party product analytics.
- Session replay.
- Redis.
- An admin dashboard.
