# Inferred email coverage and display

Date: 2026-07-15
Status: approved direction, ready for implementation planning
Owner: Samay
Relates to: `docs/product/contact-enrichment-yield-and-design-2026-07-01.md`, `SECURITY.md`, `packages/core/src/email-pattern.ts`, `packages/pipeline/src/github-contact-facts.ts`

## The ask

Cards should carry likely-working emails for the named founders and execs, going forward, whenever we can construct one with reasonable confidence. Samay's framing on 2026-07-15: without emails the cards are not useful enough. Decisions made the same night: show every inferred address, labeled with its basis (honesty is the gate, not a threshold); open a small budgeted paid fallback for companies with no GitHub signal; display stays inside the person dossier hovercard, improved, with no new chip marks or contact rows on the card.

## What already exists

The engine shipped with the 2026-07-01 design and works end to end; the gaps are coverage and visibility, not machinery.

- `fetchGithubContacts` (`packages/providers/src/github-contacts.ts`) resolves the company's GitHub org and harvests real `@domain` commit emails, free.
- `deriveEmailPattern` (`packages/core/src/email-pattern.ts`) derives the domain convention (`first.last`, `first`, `flast`, `f.last`, `firstlast`) from observed anchors; `applyEmailPattern` constructs an address for a named person.
- `buildGithubContactFacts` (`packages/pipeline/src/github-contact-facts.ts`) attaches observed emails to extracted founders and execs by name match (status verified, confidence medium) and constructs inferred addresses for the rest when a pattern exists (status inferred, confidence low). It never invents people.
- `personSchema` (`packages/core/src/card.ts`) carries `email` and `emailStatus` ("observed" or "inferred"); both are stripped from the public card.
- The dossier hovercard (`apps/extension/src/CompanyHeader.tsx`, rendered through `SharedTooltip`) shows one email per person, preferring observed over inferred.

Measured on the golden set (2026-07-02, `npm run measure:contact-yield`): the shipped resolver finds a pattern for 58% of companies against a proven 74% ceiling; the entire gap is org-resolution quality (misses like `snowflakedb`, `modal-labs`, `tryretool`, `hex-inc`). Non-technical companies (the officehours.com case) have no GitHub signal at all and today get nothing.

## Change one: org resolver v2

Close the free-coverage gap first. Two additions to the resolver in `github-contacts.ts`: a small curated login map seeded with the known golden-set misses, and a second confirmed-search pass (search GitHub orgs by company name, confirm by website match against the card domain) when the login guesses miss. Acceptance: pattern coverage on the golden set reaches at least 70% via `measure:contact-yield`, free path only.

## Change two: anchor provenance on inferred emails

"Show all, labeled with basis" requires the basis to survive to the UI. `deriveEmailPattern` starts reporting how many anchors agreed on the winning pattern. The pipeline threads that into a new optional `emailBasis` field on `personSchema` next to `emailStatus`: a short human string such as "domain pattern first.last, 3 observed addresses". Per the card-field rule in `CLAUDE.md`, the field lands in schema, pipeline assembly, and UI together; extraction is untouched because only providers populate it. `emailBasis` is stripped from the public card alongside `email` and `emailStatus`, and the strip is covered by the existing public-card redaction tests plus one new case.

## Change three: budgeted paid pattern fallback

When the free path yields no pattern, one cheap paid probe may recover it. Trigger conditions, all required: contact enrichment is enabled for the run; the GitHub harvest returned no pattern and no observed `@domain` email; at least one named founder or exec has no email; the per-run AgentCash budget has headroom. One StableEnrich email-discovery probe runs for the domain; observed addresses it returns flow through the exact same trust machinery as GitHub anchors (verified, medium confidence, cited to the probe), and the derived pattern constructs inferred addresses for the remaining people as usual.

Mechanics follow existing doctrine: the endpoint is registered in `packages/providers/src/provider-budget.ts` with cost, timeout, and stop conditions before the pipeline may call it; AgentCash calls do not retry; failures degrade gracefully as structured probe failures. A new env flag `EMAIL_PATTERN_FALLBACK_ENABLED` (default on) allows rollback without deploy. Expected cost is on the order of one to two cents per fallback-eligible card, inside the existing `PER_RUN_AGENTCASH_BUDGET_USD` guard; this changes no Websets behavior and leaves the user-triggered deep contact find exactly as designed on 2026-07-01.

The concrete endpoint is chosen at implementation time from the registered StableEnrich set after a `spike:stableenrich` run against three known-miss domains (one consumer, one fintech, one services), because the 2026-07-01 doc budgeted Hunter-class lookups but did not exercise them for pattern discovery.

## Change four: the dossier email row, improved

Display stays in the hovercard, per Samay's call. Three refinements: the address shows its status plainly ("Observed" or "Inferred"); inferred addresses show the `emailBasis` line under the address in the dossier's small text; clicking the address copies it to the clipboard with a brief copied acknowledgment in place. No mailto links, no chip marks on the people row, no dedicated contacts section. The dossier keeps preferring an observed address over an inferred one when the same person has both.

## Measurement and verification

`scripts/measure-contact-yield.ts` extends to report: share of golden-set companies with a derived pattern (free path); share of cards whose named people carry at least one email, split observed versus inferred; and, when run against production traces, fallback fire rate, hit rate, and spend. After deploy, one read-only production pass over recent runs confirms the resolver gain and the fallback numbers before the feature is called done. The officehours.com card is the concrete acceptance case: after a fresh analysis-tier run, its named founders carry either an inferred address with a basis line or an honest absence with the fallback recorded as fired and missed.

## Trust rules, restated

An inferred address is a guess and always says so; nothing constructed by `applyEmailPattern` may surface as observed or verified. Public `/api/cards/{slug}` and `/c/{slug}` never carry `email`, `emailStatus`, or `emailBasis`. The verifier and synthesis paths are untouched. Every email fact keeps a citation: the commit source or org URL for GitHub anchors, the probe result for fallback anchors.

## Cost posture

The free path stays first and covers most of the technical wedge. The fallback adds at most a few cents to the minority of runs that need it, under the existing budget guard, with spend visible in `wallet:status` and the generation traces. No new subscription, no ZoomInfo-class dependency.

## Non-goals

No backfill of existing cards; emails arrive on natural regeneration. No SMTP or RCPT verification (ruled out 2026-07-01: Google Workspace catch-all makes it unreliable and reputation-hostile). No emails on the public card, ever. No outreach, sequencing, or CRM features. No people-row chip marks or contacts section (declined 2026-07-15).

## Open questions

Which StableEnrich endpoint serves pattern discovery best, and its real hit rate on non-technical domains: answered by the implementation spike, and the fallback hit-rate expectation in the plan is set from that spike rather than guessed here.

## Done definition

Golden-set pattern coverage is at least 70% on the free path, reported by `measure:contact-yield`. The fallback fires only under its trigger conditions, within budget, with its endpoint registered in `provider-budget.ts` and a kill flag. The dossier shows status, basis, and copy-on-click for emails in both themes. Public-card redaction of the new field is test-covered. A production read-only measurement pass confirms the numbers, and the officehours.com acceptance case behaves as specified. Full `check` is green.
