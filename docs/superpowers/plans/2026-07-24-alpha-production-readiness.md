# Cold Start: Friend Alpha Production Readiness

Work in `/Users/samaydhawan/Projects/active/cold-start`.

Status on July 24: the repository implementation and local observation loop are
complete. Production migration, service configuration proof, restore drill,
paid canary, Web Store review, owner rehearsal, and soak remain open. The
separate Friend-Alpha Experience Pressure Test at the end remains the next
product pass after those readiness gates.

This is the build session that decides whether Cold Start can be sent to five
friends. Work to a safe alpha, not to a general-availability platform. Do not
send invitations from this session.

## Start Here

Read:

- `AGENTS.md`
- `SPEC.md`
- `DESIGN.md`
- `SECURITY.md`
- `docs/deployment.md`
- `docs/product/alpha-packaging-spec-2026-07-01.md`
- `docs/product/alpha-production-readiness-2026-07-24.md`
- `docs/qa/generation-trace-and-production-qa.md`
- `docs/qa/analysis-run-observations.md`

Inspect the current extension and API implementation before planning. Verify
the branch, origin, working tree, latest CI result, latest production
deployment, API contract, and migration state rather than trusting this prompt.

Run the read-only production baselines:

```bash
npm run measure:first-usable
npm run measure:analysis-latency
npm run wallet:status
npm run repair:stuck-runs
```

The July 24 evidence that triggered this work was:

- 19 production runs in 24 hours: 13 complete and 6 failed.
- Two malformed Lens timing claims failed before normalization.
- Two analysis runs failed after concurrent card writes.
- Two basics runs failed the evidence floor.
- Apollo organization and people routes repeatedly returned 404.
- AgentCash Base held $1.5702, roughly five profile runs.
- Failed rows omitted `cost_usd` despite $0.184893 of LLM spend in their traces.
- Neon retained six hours of restore history and production migrations used the
  pooled application URL.
- The stored `framer` row disagreed with its card JSON about `.co` versus `.com`.

Re-derive those facts. If the current evidence differs, use current truth and
date-stamp it.

## Outcome

Build the smallest coherent friend-alpha spine:

- Revocable invite and per-install identity.
- Atomic profile and Lens allowances with exact refunds.
- Typed first-party semantic analytics.
- One-click invite, install, and connection.
- Operator status, alerts, kill switches, retention, and recovery.
- Backward-compatible API and Web Store release choreography.

The stop condition is not “the tables exist.” The stop condition is an observed
fresh-profile journey from invite through first filed or withheld Lens, with
correct attribution, spend, recovery, and reporting.

## Hard Constraints

- Preserve the public/private card boundary. Public routes never expose
  synthesis, withheld records, person reads, work emails, or tester identity.
- Do not add billing, Stripe, plans, account management, an admin dashboard,
  third-party analytics, session replay, Redis, or new infrastructure.
- Do not implement a global raw-click listener. Instrument named product
  actions at their owning interaction handlers.
- Client events are observability only. They never debit, refund, authorize, or
  settle a generation run.
- Do not store full URLs, query strings, page titles, page content, claims,
  source snippets, Lens prose, names, email addresses, copied values, raw stack
  traces, invite tokens, or access tokens in analytics.
- Every new payload is bounded and schema-validated. No arbitrary metadata bag.
- Store credential hashes only. Never log a raw invitation or connection token.
- Cached reads, status polls, standing withheld reads, and active-run joins are
  free.
- Failed and watchdog-retired fresh work is refunded exactly once.
- Keep existing event names and Inngest step IDs stable.
- Preserve inline user-facing dispatch and the `GENERATION_DISPATCH=inngest`
  rollback unless evidence requires a deliberate change.
- Every migration is generated, inspected, tested locally, and applied through
  the guarded production migration script.
- Every visual or interaction surface must be rendered and observed in light
  and dark. Preserve the Catalogue Card language.
- Do not push a contract change that strands the current installed extension.
  Prefer additive alpha routes. If a contract bump is unavoidable, support the
  current and previous client through the rollout and prove both.

## Paid Service Decisions

Use paid tiers where they buy recovery or operating margin. Do not use them to
hide application defects.

Record each completed purchase or configuration in `docs/deployment.md` without
recording credentials:

1. Register the Chrome Web Store publisher account and pay the one-time $5 fee
   if it is outstanding. Do this early so store review can proceed in parallel.
2. Upgrade the Vercel team `samay58s-projects` from Hobby to Pro before the
   production alpha deployment. Confirm the dashboard reports Pro, configure
   spend controls, and determine whether the inline generation route should
   use more than its current 300-second ceiling. Do not increase the ceiling
   until the watchdog and client recovery behavior still converge.
3. Upgrade the production Neon project from Free to Launch before alpha
   migrations. Set a seven-day restore window, retain the pooled application
   URL, add a dedicated direct migration URL, and complete the restore drill.
4. Keep Inngest on Hobby. Configure background concurrency within its current
   five-execution limit. Upgrade only if measured queueing or a required
   retention window remains after those caps.
5. Keep product analytics first-party and do not buy Sentry, PostHog, session
   replay, or another observability tier for this alpha.
6. After allowance accounting, refunds, alerts, and both kill switches are
   proven, fund AgentCash Base to at least $35 before the paid production
   canary. The July 24 balance was $1.5702.

Treat Vercel Pro and Neon Launch as invite-readiness requirements. Treat the
Chrome registration fee and funded provider wallet as release prerequisites.
None of these purchases relaxes a test or proof gate.

## Build Order

Use reviewable commits in this order. Do not hide reliability work behind the
larger alpha feature.

### Fix The Live Reliability Defects

Reproduce and fix the two current software failures.

Malformed synthesis:

- Add a fixture for the exact null-shaped timing claim observed in production:
  an object whose `text` and `citationIds` are both null.
- Normalize that shape to an absent market claim before strict validation.
- Continue rejecting a contradictory partial claim, invented text, or malformed
  citation list. Do not weaken the final card schema.
- Prove the same bad provider output converges in one request without a paid
  retry.

Concurrent card writes:

- Build a deterministic test that overlaps analysis, block enrichment, and
  contact enrichment writes for one slug.
- Fix the mutation seam, not the caller symptoms. Re-read and merge the latest
  card on conflict, add bounded backoff or serialization as appropriate, and
  preserve every concurrent field.
- Prove 50 concurrent mutations finish without lost updates or exhausted
  retries.
- Keep Neon HTTP constraints in mind. Do not introduce an interactive
  transaction that production cannot run.

Provider failures:

- Inspect the repeated Apollo-family 404s against current configuration and
  provider behavior.
- Correct the route if it is stale. If the capability is unavailable, stop
  dispatching that known-dead probe and record an explicit skip.
- Contacts remain asynchronous and cannot define first usable.

Failure taxonomy:

- Add stable internal failure codes for evidence insufficiency, provider
  unavailability, model contract, concurrent write, timeout, authentication,
  allowance exhaustion, and unknown.
- Preserve bounded human-readable copy. Reports and alerts use the stable code.

Failed cost:

- Persist trace cost on every terminal run, including failure.
- Update wallet and alpha reporting to include failed spend without counting a
  refunded allowance as refunded provider cost.
- Add a regression fixture for the six July 24 failed rows whose traces totaled
  $0.184893 while `cost_usd` remained null.

Run the focused tests and one paid production canary before continuing. A known
software failure cannot be carried into the alpha framework.

### Add Alpha Identity And Access

Design one deep module with a small interface. Authentication should return a
server-derived principal rather than a boolean:

```ts
type AlphaPrincipal = {
  kind: "alpha" | "operator";
  inviteId: string | null;
  installationId: string | null;
  scopes: readonly string[];
};
```

Add focused tables and repositories for:

- `alpha_invites`: label, token hash, status, expiry, limits, lifecycle times.
- `alpha_installations`: invite owner, access-token hash, browser, channel,
  version, last seen, revocation.
- `alpha_allowances`: profile and Lens limits and current reserved or used
  state.
- `alpha_allowance_ledger`: immutable debit and refund entries.
- `alpha_run_requests`: one row per tester interaction and its disposition.
- `alpha_events`: bounded observational events.

Do not copy the archived June 26 schema verbatim. It trusts client identities,
uses arbitrary metadata, and keeps a racy mutable run count.

Invitation secrets:

- Use at least 128 bits of randomness.
- Store only a hash.
- Make each secret single-use and expiring.
- Put it in the URL fragment, not a path or query.
- Remove the fragment immediately with `history.replaceState`.
- Limit active installations per invitation and make each independently
  revocable.

Connection credentials:

- Return the per-install credential directly to the extension.
- Persist it in `chrome.storage.local`, set the storage access level to trusted
  extension contexts, and treat it as a low-value revocable credential.
- Keep the current operator token as a separate transitional principal. Never
  distribute it to testers.

Add:

- `ALPHA_ACCESS_ENABLED`
- `ALPHA_GENERATION_ENABLED`

Disabling generation must preserve cached profile, public card, filed Lens, and
standing withheld reads.

### Make Allowances Correct Under Concurrency

Keep the current decision unless the live packaging spec is explicitly changed:

- 12 fresh profiles per tester.
- 6 fresh Lens runs per tester.
- Cached reads are free.
- Joining active work is free.
- First fresh withheld result is charged.
- Standing withheld re-click is free until evidence content changes.
- Forced evidence refresh is charged.
- Terminal and watchdog failures are refunded.

Use `interaction_id` as the client idempotency key.

Reservation, generation-run claim, and ledger debit must be one atomic database
operation. Two simultaneous requests cannot both pass a read-side allowance
check. If two testers request the same slug and mode, only the request that
creates fresh work pays. The other receives `joined`.

Centralize terminal settlement. Every completion, failure, queue failure,
watchdog retirement, and preservation path must call one idempotent settlement
seam. Add invariants:

- Ledger sum matches allowance state.
- A run has at most one debit per invitation.
- A debit has at most one refund.
- No refunded run remains charged.
- No cached, joined, or standing-withheld request has a debit.

Add short-window per-principal rate limits, three consecutive failures per
domain, and six failed runs per invite per day. Use stable machine-readable
reasons and clear recovery copy.

Add a domain-collision safety guard. `companySlugFromDomain` currently uses the
first hostname label. Never serve or overwrite a card whose canonical domain
does not match the requested domain. A full slug migration is out of scope
unless the guard proves insufficient.

Repair the existing `framer` mismatch through a targeted, reviewed repair.
Before applying it, determine which domain owns the current evidence. Do not
silently rewrite a public card based only on the row column.

### Add Typed First-Party Analytics

Put the event contract in `@cold-start/core` as a discriminated union. Every
event has:

```ts
{
  eventId: string;
  eventName: AlphaEventName;
  schemaVersion: 1;
  occurredAt: string;
  sessionId: string;
  sequence: number;
  interactionId?: string;
  context: {
    extensionVersion: string;
    browser: "chrome" | "firefox";
    installChannel: "unlisted" | "unpacked" | "unknown";
    surface: AlphaSurface;
    theme: "light" | "dark";
    reducedMotion: boolean;
    online: boolean;
  };
  properties: AlphaEventProperties;
}
```

The server derives invitation and installation identity from the credential and
adds receipt time. Reject identity fields in the client payload.

Instrument these semantic events:

- `invite.accepted`
- `invite.store_clicked`
- `installation.connected`
- `extension.installed`
- `extension.updated`
- `extension.action_invoked`
- `panel.opened`
- `domain.detected`
- `profile.viewed`
- `profile.generate_requested`
- `profile.first_payoff_viewed`
- `profile.retry_requested`
- `lens.run_requested`
- `lens.result_viewed`
- `lens.retry_requested`
- `lens.category_toggled`
- `lens.disclosure_toggled`
- `research.card_activated`
- `research.card_toggled`
- `research.card_run_requested`
- `research.details_toggled`
- `source.opened`
- `public_card.opened`
- `dossier.opened`
- `dossier.pinned`
- `dossier.closed`
- `dossier.email_copied`
- `dossier.channel_opened`
- `dossier.people_toggled`
- `settings.opened`
- `theme.changed`
- `diagnostics.copied`
- `support.requested`
- `client.error_presented`

Do not emit profile or Lens completion from the client. `alpha_run_requests`
records server dispositions: started, joined, cached, withheld, blocked, or
rejected. Terminal result, cost, and latency join to `generation_runs`.

The extension queue must:

- Persist before sending.
- Batch at most 25 events and 64 KB.
- Delete only acknowledged event IDs.
- Retry network errors, 408, 429, and 5xx with exponential jitter capped at five
  minutes.
- Stop on 400, 401, and 403, and present connection repair when appropriate.
- Cap at 200 events and seven days.
- Never block rendering, navigation, or generation.

Use a unique database constraint on `event_id`. Add route limits and exact
schemas per event.

Privacy-safe properties:

- Company domain only after explicit invocation.
- Source class and ordinal, never source URL.
- Dossier email posture only: observed or inferred.
- Stable error code, route, phase, and status, never a raw message or stack.

### Build The Invite And First-Run Journey

Create the invite page on the branded web origin.

Before connection, it must plainly disclose:

- Cold Start reads the current company domain only when invoked.
- Generating creates or updates a public sourced fact card.
- Public cards do not identify who requested them.
- The alpha records named product interactions tied to the invitation for
  reliability and product improvement.
- Raw usage-event retention and deletion behavior.
- The 12 profile and 6 Lens allowances.

Require an affirmative action before recording product analytics or redeeming
the invite.

Add exact `externally_connectable` access for the invite origin. The background
worker validates `sender.url`, accepts only a small typed message, redeems the
invitation, and returns no secret to the web page.

The journey is:

1. Open invitation.
2. Read disclosure and continue.
3. Install the Unlisted extension.
4. Return to the same page.
5. Connect with one click.
6. Open a company site.
7. Click Cold Start.
8. See remaining allowances and the public-card disclosure.
9. Generate the first profile.
10. Run the first Lens.

No friend sees an API origin, bearer token, extension ID, or setup console.
Technical settings move behind quiet diagnostics.

Add specific states for:

- Unsupported browser or Chrome version.
- Extension not installed.
- Invite expired, used, revoked, or at its installation limit.
- Connection lost or storage cleared.
- Access disabled.
- Generation disabled.
- Profile or Lens allowance exhausted.
- Offline.
- Old but supported client.
- Unsupported client that needs an update.

Every state needs one obvious recovery action and a real support path. Add
redacted diagnostics that include extension version, contract, installation
suffix, last stable error code, and timestamps, never credentials or content.

Add a Chrome minimum version compatible with `sidePanel.open()`. Inspect the
actual install permission warnings. Remove `favicon` if its decorative value
does not justify its warning. Prefer the branded API host if it passes the full
API and CORS suite.

### Package And Operate The Alpha

Add a deterministic package command that:

- Builds the production extension from a clean checked commit.
- Verifies the version increased.
- Excludes `.DS_Store`, maps, local settings, fixtures, and secrets.
- Inspects the emitted manifest and host permissions.
- Produces a named Web Store ZIP and checksum.

Prepare tracked store materials:

- Name and short description that identify the build as alpha or beta per
  current Chrome guidance.
- Detailed listing copy.
- Permission justifications.
- Data-use declarations and Limited Use language.
- Store icon.
- At least one 1280 by 800 screenshot.
- A 440 by 280 small promotional tile.
- Homepage, privacy, and support URLs.
- Reviewer instructions and one low-allowance reviewer invitation.

Use Unlisted visibility and deferred publishing. Manual first publication is
preferable to adding Web Store automation.

Update the privacy page before enabling analytics. Define raw event retention,
identity-linked deletion, and de-identified operational retention. Add:

- `npm run alpha:invite`
- `npm run alpha:revoke`
- `npm run alpha:delete-tester`
- `npm run alpha:prune`
- `npm run alpha:status -- --since 7d`
- `npm run alpha:status -- --since 7d --json`
- `npm run alpha:status -- --gate`

`alpha:status` must show:

- One row per tester from invitation through first Lens.
- Current extension version and last seen.
- Sessions and companies used.
- Cached, joined, fresh, withheld, and failed dispositions.
- Profile and Lens allowances, debits, and refunds.
- First progress, first usable, and Lens latency.
- Stable failure codes and provider failures.
- Silent or active runs beyond policy.
- Client errors and offline queue drops.
- Wallet balance and worst-case remaining allowance exposure.
- Successful and failed spend, shown separately.

Configure background Inngest caps against the actual account plan. Reserve
capacity for section work. Add an operator alert path for:

- Any model-contract or concurrent-write failure.
- Three consecutive software failures.
- A silent run crossing the watchdog threshold.
- Wallet below ten worst-case profile runs.
- Repeated auth failures, allowance bypass attempts, or event throttling.
- An extension version outside the supported compatibility window.

Add a dedicated direct production migration URL and make the guarded migration
script reject a pooled endpoint. Keep the pooled application URL for runtime
traffic.

Extend the six-hour Neon restore window to an intentional alpha value supported
by the Launch plan. Protect or snapshot the production branch, then rehearse a
point-in-time restore into a non-production branch. Record the recovery point,
recovery time, validation query, and cleanup in the deployment runbook.

### Make Release Compatibility Real

The current extension requires an exact response contract. Web Store review and
automatic updates make the old operator sequence unsafe.

Choose a rollout that never strands the current client:

- Deploy additive alpha auth and event routes while existing card and generation
  responses remain compatible.
- Accept the operator principal during the transition.
- If existing response shapes must change, negotiate and serve the current and
  previous contract versions.
- Add tests for old extension against new API, new extension against new API,
  generation-disabled mode, and server rollback.
- Document which server version can safely serve each published extension
  version.

Do not rely on Chrome's update timing. Partial Web Store rollouts are not
available below 10,000 active users.

## Verification

### Automated

Add focused unit and integration coverage for:

- Synthesis null-shape convergence.
- Fifty concurrent card mutations.
- Invitation expiry, single use, hashing, and revocation.
- Per-install authentication and operator separation.
- Fifty concurrent reservations stopping exactly at the limit.
- Duplicate interaction IDs.
- Same-run joins across testers.
- Cached and standing-withheld free paths.
- Exactly-once failure and watchdog refunds.
- Domain and invite circuit breakers.
- Generation and access kill switches.
- Domain collision refusal.
- Stored row and card-JSON domain invariants.
- Failed-run cost persistence and reporting.
- Event union and property rejection.
- Spoofed identity rejection.
- Event batch bounds and duplicate acknowledgement.
- Queue persistence, retry classes, expiry, and offline recovery.
- Session rollover and sequence.
- Privacy payload exclusions.
- Funnel and allowance report calculations.
- Current and previous API contract compatibility.

Run:

```bash
npm run audit:css -w @cold-start/extension
npm run test
npm run qa:extension:ui -w @cold-start/extension
npm run qa:extension:smoke -w @cold-start/extension
npm run check
```

### Rendered Journey

Use a fresh Chrome profile and the real packaged build. Do not pre-seed storage.
Capture the invite page and extension in light and dark.

Observe:

- Consent not accepted.
- Not installed.
- Installed but not connected.
- Connected and ready.
- Cached profile.
- Fresh profile, including close and reopen mid-run.
- First payoff.
- Filed profile and public card.
- Ready, running, filed, withheld, failed, and exhausted Lens.
- Revoked, expired, offline, old-client, and generation-disabled states.
- Diagnostics and support.
- Reinstall and reconnect.

Verify keyboard travel, focus return, reduced motion, and no technical setup
language.

### Concurrency And Faults

Use local provider fixtures first:

- Five simultaneous fresh profiles.
- Start Lens as each profile becomes usable so analysis overlaps enrichment.
- Fifty simultaneous cached and status sessions.
- Duplicate clicks.
- Two testers requesting the same new domain.
- Provider 429, timeout, 404, and insufficient balance.
- A dead inline invocation.
- An Inngest terminal failure.
- Event endpoint offline and recovery.

Require:

- Zero lost card fields.
- Zero duplicate paid runs.
- Exact debits and refunds.
- Failed provider and LLM spend present in the report.
- Every state ends complete, explicitly blocked, withheld, or retryable.
- The operator receives the expected alert.

Then run a bounded paid production canary on five novel uncached companies. Cap
the canary spend at $5. Start Lens as soon as profiles become usable to recreate
the collision that failed in production. Require:

- Zero software failures or stranded runs.
- First progress p90 under 5 seconds.
- First usable p90 under 60 seconds.
- Skip-fresh Lens p90 under 90 seconds.
- No upstream 429 wave.
- The alpha report reconstructs all five journeys.

Do not use the two evidence-insufficient outcomes to hide software failures.
Report them separately.

### Final Rehearsal

Create an owner invitation and a reviewer invitation. With a completely fresh
Chrome profile, Samay stays silent while another person:

1. Opens the invitation.
2. Understands the disclosures.
3. Installs and connects.
4. Opens a company site.
5. Generates a profile.
6. Closes and reopens the panel.
7. Reads Early Read and the filed profile.
8. Opens the public card.
9. Runs Lens.
10. Opens a Lens category and a source.
11. Opens and closes a dossier.
12. Finds support without help.

If they need oral setup instructions, the alpha is not ready.

## Exit Gate

Stop before invitations and report the state honestly.

Code-ready requires:

- Every automated gate green.
- Final screenshots inspected.
- Vercel Pro active with production spend controls configured.
- Neon Launch active with a seven-day restore window.
- Production migration and backward-compatible deployment complete.
- Direct migration connection and restore drill proven.
- Paid canary green.
- Kill switches tested.
- Alpha report and alerts proven.
- Deterministic Web Store ZIP built from the checked commit.
- Store submission complete with deferred publishing, or the exact human
  dashboard steps documented if browser access blocks submission.

Invite-ready additionally requires:

- Chrome review approved.
- The owner-only fresh-profile rehearsal green.
- A 24-hour owner-only soak with no unresolved software failures.
- AgentCash Base funded to at least $35.
- Five individual invitations prepared but not sent.

Write short plain documentation. Update `SECURITY.md`, `docs/deployment.md`,
`docs/product/alpha-packaging-spec-2026-07-01.md`, and `docs/README.md` to current
truth. Archive the superseded June 26 implementation plan or mark it explicitly
as historical. Do not leave two competing alpha architectures.

Finish with reviewable commits, push to `origin/main` only after `npm run check`
is green, and report:

- What shipped.
- What was observed.
- Production canary results.
- Screenshot gallery.
- Alpha status output.
- Store submission state.
- Whether the product is code-ready, invite-ready, or still blocked.

Do not add unrelated polish after the gate. Stop.

## Confirmed Investments And Remaining Proof

Samay confirmed the Neon Launch and Vercel Pro upgrades on July 24. Treat the
subscriptions as purchased, not as configured.

Before code-ready:

- Rotate the Neon owner password exposed during setup.
- Put the pooled Neon URL in `DATABASE_URL`.
- Put a non-pooler Neon URL in `DATABASE_DIRECT_URL`.
- Verify the seven-day restore window and complete a restore drill.
- Verify Vercel production spend controls, compatibility variables, function
  duration, deployment health, and alert delivery.
- Fund AgentCash Base to the invite-ready floor and reconcile one paid canary.

Do not add PostHog during this pass. The first-party event ledger remains the
source of truth. After the readiness gate is proven, make a separate decision
on whether PostHog should receive a bounded semantic event subset for funnels
and product exploration. Keep autocapture and session replay off unless a new
privacy review explicitly approves them.

## Friend-Alpha Experience Pressure Test

After the production-readiness work is complete, run a separate thorough pass
through the whole app. Simulate what five close friends or family members will
experience from invitation through independent use.

Use fresh Chrome profiles and many company examples. Include a non-technical
tester posture. Rapidly test:

- Opening the invitation, understanding the disclosure, installing, connecting,
  and finding the extension again without oral help.
- First open on supported, unsupported, ambiguous, and content-heavy pages.
- Cached and fresh profiles, slow work, provider degradation, offline recovery,
  contract mismatch, allowance exhaustion, revocation, and retry.
- Early Read, filed profile, public card, every research card, every Lens state,
  category disclosures, citations, dossiers, theme, diagnostics, and support.
- Closing and reopening Chrome, extension updates, stale local state, multiple
  tabs, fast repeated clicks, keyboard-only use, reduced motion, and narrow or
  unusually tall panels.
- Whether the copy teaches the mechanic, every action has a clear response, and
  every failure returns the user to a useful next step.

Observe behavior, screenshots, motion, focus travel, network requests, stored
state, analytics receipts, allowance ledger entries, generation traces, and
operator status together. Fix only confusion, stranding, broken trust, or clear
craft regressions. Re-run the full gate after any fix. The pass is complete
when a first-time tester can reach a useful profile and Lens result, recover
from the rehearsed failures, reopen the product, and find support without live
guidance.
