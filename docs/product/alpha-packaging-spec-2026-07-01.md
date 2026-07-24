# Alpha packaging: the ledgered friend alpha

Date: 2026-07-01

Last verified: 2026-07-24

Status: implemented and deployed; invitations blocked

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

The implementation and production migrations are deployed. Invitations remain
blocked on the release gates in the current readiness record.

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

## Implementation

[Friend Alpha Production Readiness](./alpha-production-readiness-2026-07-24.md)
owns current production evidence, implementation receipts, blockers, and release
order. This document owns package terms and product truth.

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

## Release State

The ledgered-alpha call stands. Code is no longer the main blocker. Use the
[readiness record](./alpha-production-readiness-2026-07-24.md) for current
evidence and next action. Use the [deployment runbook](../deployment.md) for
operator commands.

## Deferred

- Billing and Stripe.
- Plans and account management.
- Credit purchases and overages.
- Paid contact deep-find.
- Third-party product analytics.
- Session replay.
- Redis.
- An admin dashboard.
