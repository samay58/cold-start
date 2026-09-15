# Column funding repair verification

The production failure was reproduced from the actual saved Column card. The old finalizer converted a valid input into an invalid card containing `33299999.999999996`. The repaired finalizer retains the bank profile and leaves unrelated funding unknown.

## Verified

- Six failing funding regressions were reproduced before the fix. All nine funding tests pass afterward, covering decimal expansion, unsafe amounts, malformed grouping, cumulative totals, unrelated sources, and existing financing behavior.
- The real saved-card replay passed final schema validation, Postgres insert/read, rejection of an invalid replacement, and a subsequent background-style mutation. No model request was made.
- The repository gate passed: lint, types, tests, real Postgres suites, builds, Firefox lint, golden dry run, unused-code check, secret scan, and guarded dependency audit. The existing temporary upstream dependency advisories remain; this release changes no dependencies.
- An extension regression verifies that a repaired card is shown even when its latest historical run remains failed, without another generation request.
- Production scan: 415 cards, six invalid before repair, zero invalid afterward. Only Column had the fractional funding error. Four legacy cards had `agentcash:` strings in optional person links; Graphite had one dangling citation alongside three resolving citations.
- All six records were backed up, schema-checked, and updated in one transaction after matching both their versions and full prior JSON. Timestamps governing freshness, costs, and run history were preserved. Raw source records were retained.
- Public and authenticated card endpoints returned 200 and schema-valid, usable cards for all six repaired records. Public responses did not expose synthesis. Column had 11 resolving citations and no invented funding amount. Its authenticated bootstrap returned the repaired card.
- Column's two failed runs remain terminal with their original diagnostic evidence. No alpha run reservations were attached, so no allowance refund or second debit was required.
- Browser inspection found the old funding paragraph in the separate financing section after the card was repaired. A regression reproduced that stale display. The section merge now checks references against the current card and falls back to current facts when evidence has been removed. Column's stored financing section was also cleared with a matching-prior-content check.

## Release boundary

The previously active Vercel deployment was `dpl_AWFJYfmtvqceMV8RWpVDE38hYWjo`, revision `6b9dfeacda28d111c2132b6c105f25510db11156`. Inngest had four synced functions on SDK 4.20.0. No production environment changes are part of this repair.

Publication, deployment, and post-release results are recorded separately in the ignored local release receipt. The source-identity restriction is conservative: an article must already support extracted company identity or live on the company domain. This reduces name collisions but does not establish that every sentence concerns the company. The fix does not claim that arbitrary external content is trustworthy or that providers cannot fail.

The incident's source was about a public-notice business, while the requested domain belongs to a bank. References: [Column](https://column.com/) and [the unrelated funding article](https://www.govtech.com/biz/startup-public-notice-tech-firm-column-raises-30m).
