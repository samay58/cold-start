# Inferred Email Coverage Ledger

## WHERE WE LEFT OFF

Spec B is complete on `main`, including the deep-find merge fix and final auth and clipboard hardening. Free-path coverage is 40/50 patterns (80%); the real `officehours.com` runs produced four labeled inferred addresses with basis; production serves contract `2026-07-15.inferred-email-basis-v1`; and GitHub Check run `29421374905` passed every gate. Live public redaction, Dia access, Firefox stable-ID access, and rejection cases all passed against Vercel deployment `dpl_CB6WzN3QaNtYmMXLV6PkXdoJt5C9`. The merged feature branches are deleted. Natural regeneration remains the intended source of fallback telemetry; no backfill is required by this spec.

## 2026-07-15

### Starting state

- Branch cut from clean local `main` at `d3da06d`, one docs-only commit ahead of `origin/main`.
- No prior Spec B ledger existed.
- Read the approved spec, the 2026-07-01 contact design, the provider budget and StableEnrich flow, the contact-enrichment worker, the public-card trust boundary, the dossier UI, and the measurement script.
- Done test: at least 70% free-path pattern coverage; one budgeted fallback probe under its kill flag and exact trigger guard; basis preserved privately and stripped publicly; dossier status, basis, and copy interaction verified in both themes; production trace measurement and officehours.com acceptance recorded; full check green.

### Free-path baseline

Command:

```text
set -a; source .env.local; set +a; npm run measure:contact-yield
```

Result, authenticated with the configured GitHub token and read-only:

```text
companies:                    50
GitHub org found:             50 (100%)
>=1 human @domain anchor:     30 (60%)
domain email pattern derived: 29 (58%)
```

The live miss shape confirms resolver quality is still the free-path constraint, but not through outright `no_org_match`: plausible-name false positives such as `SnowflakeAi` and `modalai` pass the current name-only confirmation and hide the canonical organizations. GitHub's public API confirmed the spec's known canonical logins and several adjacent golden-set misses by website: `snowflakedb`, `modal-labs`, `tryretool`, `hex-inc`, `pinecone-io`, `chroma-core`, `anthropics`, `makenotion`, `brexhq`, `gleanwork`, `neondatabase`, and `MercuryTechnologies`. `togethercomputer` has no website on its GitHub profile, so it is eligible only through the explicit curated map, not search confirmation.

### Spend

- No paid calls made before the required balance gate.
- The first wallet command sourced `.env.local` as required but failed with `ECONNREFUSED 127.0.0.1:55432` because that file selects the stopped local Postgres. It did not reach AgentCash or spend money.
- The successful read-only retry sourced `.env.local` first, then the repository's production-read env so `wallet:status` could query production run history. Pre-spend AgentCash Base balance: `$10.4016`.
- Approved spike shape: one `$0.01`-capped `exa_email_search` probe each for `notion.so`, `ramp.com`, and `officehours.com`; maximum possible spend `$0.03`, below the `$0.50` cap. No retries.
- The three-domain spike made exactly three calls and no retries. Results: `notion.so` recovered five observed anchors and a three-anchor `first` pattern; `ramp.com` recovered one anchor and a one-anchor `first` pattern; `officehours.com` recovered five anchors and a three-anchor `first` pattern. Each call returned eight sources with no structured failures.
- Endpoint chosen: registered `exa_email_search` at `$0.01` estimated cost, because it was the only one-call domain primitive that recovered patterns across consumer/collaboration, fintech, and services without invoking the broad deep-find chain.
- The spike process reported a `$0.02` wallet delta from its own before/after snapshots. The required independent `wallet:status` receipts moved Base from `$10.4016` to `$10.3716`, so the conservative actual-spend receipt is `$0.03`, exactly the registered ceiling and still `$0.47` below the spike cap.

### Resolver v2 iteration

Red tests confirmed both mechanisms before production changes:

- The canonical-login fixture expected `snowflakedb` first and instead saw the generic `snowflake` guess.
- The search fixture offered a plausible-name lookalike before a website-confirmed organization; the current resolver accepted the lookalike.
- The pattern-provenance fixture expected `{ pattern: "first.last", anchorCount: 2 }` and received only the pattern string.

Implementation:

- `packages/providers/src/github-contacts.ts`: added the public-API-verified domain-to-login map, tried before generic guesses; search results now require a website match to the card domain, preventing plausible-name false positives; provider results retain the winning anchor count.
- `packages/core/src/email-pattern.ts`: `deriveEmailPattern` now returns the winning pattern and the number of agreeing anchors.
- Focused provider and core suites are green: 4/4 resolver tests and 15/15 email-pattern tests.

Authenticated read-only measurement after the change:

```text
companies:                    50
GitHub org found:             50 (100%)
>=1 human @domain anchor:     41 (82%)
domain email pattern derived: 40 (80%)
```

This is an 11-company pattern gain over baseline and clears the spec's 70% free-path requirement by 10 percentage points.

### Private field and paid fallback

- Added optional `emailBasis` beside `emailStatus` in the private person schema, carried it through provider merges, and stripped it with `email` and `emailStatus` from public cards. The API contract moved to `2026-07-15.inferred-email-basis-v1`; the deployed extension must be rebuilt against this contract after merge.
- The dossier keeps contact detail inside the hovercard, labels Observed versus Inferred, shows the basis only for inferred addresses, copies the address in place, and has no `mailto` or people-row contact mark.
- Added `EMAIL_PATTERN_FALLBACK_ENABLED`, default on. The pure trigger guard requires contact enrichment enabled, the kill flag on, no GitHub pattern, no GitHub observed domain address, a named person missing email, and at least `$0.01` budget headroom. All seven guard cases are test-covered.
- The worker runs one non-retrying `exa_email_search` fallback at a hard `$0.01` sub-budget, records hit/miss and wallet spend in the generation trace, cites observed and inferred facts to the probe evidence, and subtracts the fallback endpoint from any explicit deep-find budget. Websets behavior is unchanged.
- Focused guard, citation, and web/pipeline typecheck passes are green.

### Accounting correction

The first real trace exposed a telemetry and budget-boundary flaw that unit tests had not covered: the contact worker treated the full `$0.30` ceiling as fresh headroom and its patch replaced the parent generation's StableEnrich endpoint list. A red regression test reproduced the replacement. The final implementation loads the exact parent run by ID, subtracts its registered endpoints before evaluating fallback eligibility, subtracts both parent and fallback endpoints before an explicit deep find, and merges provider counts, endpoints, wallet deltas, and LLM cost additively. The regression test now passes, as does the DB lookup test.

### Dossier verification

- Light screenshot: `docs/superpowers/specs/screenshots/inferred-email-coverage/after/light-inferred-dossier.png`.
- Dark screenshot: `docs/superpowers/specs/screenshots/inferred-email-coverage/after/dark-inferred-dossier.png`.
- Both deliberate visual passes produced zero deviations against the spec and `DESIGN.md`: one hovercard container, no nested email box, body face for contact metadata, token-only colors, plain status, basis beneath inferred addresses, and no contact mark on the visible people row.
- The browser fixture pins the dossier, clicks the address, verifies the in-place `Copied` acknowledgment, and reads the same address back from the clipboard.
- `qa:extension:ui`: 38/38 passed across light, dark, normal motion, and reduced motion.
- `audit:css`: green. `qa:extension:smoke`: the built MV3 extension booted and rendered its cached card.

### Office Hours acceptance

The documented local stack ran this branch against real providers and the local database.

- Fresh basics run `37f06ebc-fb17-4fac-b0bc-0f3df0869043` completed. GitHub resolved `OfficeHoursAI` but returned zero repos, zero observed addresses, and no pattern, so the exact fallback guard fired.
- `exa_email_search` returned eight sources and five usable anchors, derived `first` from three agreeing addresses, and applied four inferred facts. Trace endpoint yield: four applied facts; no fallback failure.
- The private extension card carried `patrick@officehours.com`, `keenan@officehours.com`, `alison@officehours.com`, and `ryan@officehours.com`, each with status `inferred` and basis `domain pattern first, 3 observed addresses`.
- The local public endpoint stripped `email`, `emailStatus`, and `emailBasis` from every person.
- Fresh analysis run `5ff7a479-58b5-4cab-8565-077d4a958c8a` completed with synthesis and preserved all four inferred addresses and basis lines in the private card.

### Production read-only measurement

Final authenticated run, with the production-read database and an explicitly exported GitHub token:

```text
companies:                    50
GitHub org found:             50 (100%)
>=1 human @domain anchor:     41 (82%)
domain email pattern derived: 40 (80%)

Against 19 production cards / 125 named people:
founder/exec direct hits:       3 (2%)
pattern-inferable emails:     100 (80%)
reachable direct+inferred:         82%
cards with >=1 stored email:  0/19 (0%)

Fallback traces: no instrumented runs among 100 recent production rows.
```

The zero stored-email and zero instrumented-fallback results describe the current pre-merge deployment, not this branch. The command performed no writes. A post-deploy rerun is the only remaining production telemetry receipt.

### Final gates

- First `npm run check` stopped on two stale extension assertions that expected visible row emails and `mailto`; those fixtures were updated to verify dossier-only contact detail.
- Final `npm run check` passed lint with zero warnings, every workspace typecheck and test, both builds, golden dry run, knip, secret scan, and dependency audit.
- Known test stderr about the existing React `act` environment and the intentionally simulated trace-persistence failures remains unchanged and non-failing.

### Open deviations

- The post-deploy read-only pass found no instrumented fallback runs among the latest 100 production rows, so live fire, hit, and spend rates remain unpopulated until a card naturally regenerates. No backfill or paid verification run was added; both are outside the approved scope.

### Pre-merge release audit

- The combined-path review found that an explicit deep contact search replaced `paidProviderFacts` and `paidSources` after the one-cent pattern fallback had already run. A fallback could therefore spend, report a hit in telemetry, and then lose the recovered facts before card assembly.
- `mergeContactProviderOutput` now appends later paid facts and deduplicates later sources instead of replacing the fallback output. The regression fixture supplies one fallback result and one deep-find result and requires both to survive.
- Focused verification after the fix: contact-enrichment regression 11/11, web workspace 153/153, web typecheck green, targeted ESLint green, and `git diff --check` green. The full combined-repository gate remains the post-merge release receipt.

### Consolidation release pass

- Spec A and Spec B merged without conflicts. The shared extension fixtures, CSS, and side-panel assertions retained both the one-plate research panel and inferred-email dossier behavior.
- The light and dark dossier screenshots were regenerated from the combined main tree and inspected; both now show the final one-plate memo and shortened empty-side copy beneath the dossier.
- Combined extension verification: 46/46 Playwright UI states, CSS token audit, and 1/1 real MV3 smoke passed. The Firefox production target also built successfully against the new shared contract.
- Full `npm run check` passed with zero-warning lint, every workspace typecheck, 873 Vitest tests, 29 Node eval tests, both production builds, the 12-company golden dry run, knip, secrets scan, and guarded dependency audit.
- Production verification followed the local gate: deploy the web contract, rebuild the unpacked extension, and rerun the read-only measurement for fallback telemetry.

### Production receipt

- Pushed the fast-forward release to `origin/main`; Vercel production deployment `dpl_E327tgMuuBEDdUh3RL463Z9ghvnW` reached Ready and promoted the stable internal alias.
- The live public card route returned contract `2026-07-15.inferred-email-basis-v1` with no synthesis, `email`, `emailStatus`, or `emailBasis`. The Dia allowlisted identity returned HTTP 200 from the authenticated extension route, including synthesis on analysis-tier cards.
- Samay reloaded and tested the unpacked production build in Dia. No production auth or allowlist values changed.
- Post-deploy `measure:contact-yield` remained 40/50 patterns (80%), 41/50 companies with at least one human domain anchor (82%), and 100/125 stored-card people pattern-inferable (80%). Stored production cards remain 0/19 with email because this spec intentionally performs no backfill.
- The measurement was read-only and triggered no provider calls. It found no instrumented fallback runs among the latest 100 production rows; those rates will populate on natural regeneration.

### Adversarial hardening pass

- Review found two release risks outside the core inference algorithm: production origin could substitute for the extension ID, and optional Clipboard API access could display `Copied` without writing anything.
- Commit `37665b5` now requires an allowlisted extension ID plus a timing-safe bearer-token match in production. Comma-separated ID and token lists support Firefox and key rotation while the legacy single-value variables remain valid. Chrome origins must match exactly when present; Firefox random origins and absent origins never substitute for the stable extension ID.
- Direct auth contracts pass 26/26 and extension-card route contracts pass 10/10. Coverage includes Gecko ID with absent or random Firefox origin, missing or wrong Chrome ID, mismatched Chrome origin, token rotation, unsafe production sentinels, and legacy configuration.
- The dossier now acknowledges `Copied` only after `navigator.clipboard.writeText` exists and resolves. Tooltip tests pass 10/10, including unavailable and rejected clipboard writes that keep the address visible and never claim success.
- Full `npm run check` passed with Firefox build and pinned self-hosted lint included in the permanent local and CI gates. The complete UI suite passed 46/46, CSS audit passed, and packaged MV3 smoke passed 1/1.
- Browser-only limitation: Samay manually exercised the unpacked release in Dia. Firefox authentication, build, and package lint are covered, but Firefox itself was not manually launched in this release session.

### Final hardening release receipt

- Added the production multi-browser ID allowlist before deployment, preserving the Dia identity and adding the stable Firefox Gecko ID. The existing bearer credential remains supported through the legacy fallback.
- Vercel deployment `dpl_CB6WzN3QaNtYmMXLV6PkXdoJt5C9` reached Ready on the stable production alias. The public card route returned HTTP 200 with the shared contract, no synthesis, and zero `email`, `emailStatus`, or `emailBasis` fields.
- The live gated route returned HTTP 200 with synthesis for both the Dia identity and the stable Firefox ID with a random `moz-extension://` origin. A wrong ID and mismatched Chrome origin returned 403; a wrong bearer token returned 401.
- GitHub Check run `29421374905` passed the full release matrix, including the newly permanent Firefox build and lint stages.
- Deleted the merged `research-panel-polish` and `inferred-email-coverage` branches locally and from `origin`. `main` is the only branch and worktree.
