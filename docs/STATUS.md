# Status

What is in progress, what comes next, and what shipped recently. Update this page whenever a plan closes or a new one starts. Last updated 2026-09-24.

## In flight

- How it wins Phase 5: the scoped judge is built and off. `HOW_IT_WINS_SCREEN=shadow` runs in production and never changes a read. `scoped` waits on Samay's blind review. See [the layered screen spec](superpowers/specs/2026-09-22-how-it-wins-layered-screen.md).
- Friend alpha production readiness. The open gates are the owner rehearsal through the store install, production spend-control and alert readbacks, five fresh current-version company journeys, a clean seven-day `alpha:status --gate`, and a 24-hour owner-only soak. No invitation goes out without approval. See [the plan](superpowers/plans/2026-07-24-alpha-production-readiness.md) and [the evidence record](product/alpha-production-readiness-2026-07-24.md).
- Firefox: the port shipped through 2026-07-29. The in-sidebar activeTab probe still needs a live check in real Firefox. See [the port plan](archive/plans/2026-07-13-firefox-port.md).

## Next

- Watch the emphasis read in production after the September 24 marker fix. Before it, 32 of 83 analysis runs over 45 days filed "nothing notable" because a repeated citation marker failed the read. The query to count failures since the deploy is in [the remediation record](../eval/curation/remediation-2026-09/README.md#emphasis-read-marker-fix).
- Evidence and judgment remediation follow-ups, after the September 24 review: (1) After the review deploy, watch the first organic runs: stored page text at most 20,000 characters, direct Exa news results back (Exa rejected the lane's body before `b757332`), and one expected judge memo miss per card. See [the review](qa/review-2026-09-24-evidence-remediation.md#pre-deploy-checks-and-decisions). (2) The Market research section left out its required confidence field in 3 of 21 Sonnet 4.6 runs, which files the section empty. (3) Watch the first production How it wins run after the review deploy: judge output near 11k tokens and well under the 240 s timeout. (4) The customer-evidence search pilot (the plan's Task 6) was not run. (5) The accepted-proof wording deployed on September 24 changed the judge prompt hash, so a manual How it wins retry on a card filed before then is refused until a fresh analysis run. (6) Deferred review minors still open: clipping classification on longer snippets, no runtime guard for a missing migration, the judge trace's thinkingState hardcoded to disabled, and an unparseable JSON-looking model note blocking the page-text fallback. The empty seed snippet and the Opus 5.x substring match were fixed in the review remediation. (7) Exa highlights still use keys Exa has deprecated or ignores (`highlightsPerUrl`, `numSentences`); replacing them changes what paid calls return. See [the plan](archive/plans/2026-09-23-evidence-and-judgment-remediation.md).
- Check the expanded description's second paragraph live (polish A5). It has no offline runner.
- Three copy questions for Samay from the polish pass: the landing page's five questions do not match their labels (`page.tsx:79-81`); the "Verified" legend promises two independent sources while the code accepts one outside source plus any second citation; "The alpha is resting".
- The scripts folder has no typecheck in `npm run typecheck`, so strict errors there only show up by hand.
- Decide whether to turn on `HOW_IT_WINS_SCREEN=scoped` after the blind review.
- Send the first friend invitation once every readiness gate passes and Samay approves it.
- Build the edition timeline, release two of [the re-file design](superpowers/specs/2026-08-11-profile-refresh-and-timeline-design.md). Editions have been saved since 2026-08-12; nothing reads them yet.
- Publish extension 0.2.9 through the Chrome Web Store. It was built from `1cb2614` and carries the How it wins status and retry interface. The last store-accepted version is 0.2.5, per `product/chrome-web-store-alpha/release-version.json`.

## Recently shipped

| Date | Commit | What | Record |
| --- | --- | --- | --- |
| 2026-09-24 | `6419bfc`..`b757332` and the closing docs commit, fast-forwarded to main and deployed | September 24 review remediation: all 21 findings closed, and the direct Exa news search restored (Exa rejects its old body with a 400; when that started is not known). One trust tier per citation on every surface and in the judge, whole-sentence person reads, readable seed summaries, stored sources that gain page text, a 20,000-character page-text cap, one date check, one search-query catalog, the extraction split | [review](qa/review-2026-09-24-evidence-remediation.md) |
| 2026-09-24 | `3ca87c0` | Emphasis read no longer fails on a repeated or missing citation marker; it uses the same marker cleanup as synthesis. On the 12 remediation cards, finished reads went from 10 of 24 to 24 of 24 | [record](../eval/curation/remediation-2026-09/README.md#emphasis-read-marker-fix) |
| 2026-09-24 | `441aa70`, `42192c2` | Judge accepts the proof the rubric allows and reads missing evidence as missing; Opus 5 kept as judge after a blind read; plan closed | [plan](archive/plans/2026-09-23-evidence-and-judgment-remediation.md) |
| 2026-09-24 | `057bde4`..`231a310` | Evidence remediation, deployed with migration 0020: page text for every model, publish dates to the judge, person reads fixed, own-site labels, keyword filter removed, normal private-company absences no longer findings, and the How it wins judge no longer thinks before answering on Opus 5 (it had doubled its output and hit the 240 s timeout since September 22) | [plan](archive/plans/2026-09-23-evidence-and-judgment-remediation.md) |
| 2026-09-22 | `447c657`..`782824e` | Polish follow-ups: wording check with one re-ask for research sections and synthesis, missing-row patch for the judge, no forced tool choice in any stage, truncated replies filed as incomplete output, drag spec fixed, Opus 5.5 judge A/B | [plan](archive/plans/2026-09-22-polish-pass.md) |
| 2026-09-22 | `43baec6`..`3bceeb9` | Polish pass: writing prompts, plain tester errors, not-found page, one Investor Lens name, critic cap, cut-off detection, five-minute judge cache, one price table, file splits, one agent guide, 33 docs archived | [plan](archive/plans/2026-09-22-polish-pass.md) |
| 2026-09-22 | `9f323ae` | How it wins writer on Opus 5.5, judge pinned to Opus 5 | [spec](superpowers/specs/2026-09-22-how-it-wins-layered-screen.md) |
| 2026-09-22 | `88463b6` | Jev screen in shadow mode, and the scoped judge behind an off flag | [spec](superpowers/specs/2026-09-22-how-it-wins-layered-screen.md) |
| 2026-09-15 | `a88d114` | Review remediation, merged and deployed | [plan](archive/plans/2026-09-15-review-remediation.md) |
| 2026-09-14 | `1cb2614` | How it wins recovery with durable jobs | [spec](superpowers/specs/2026-09-14-how-it-wins-recovery.md) |
| 2026-09-14 | `aca2165` | Extraction tolerance | [spec](archive/specs/2026-09-14-extraction-tolerance.md) |
| 2026-09-14 | `65d8116` | Column funding repair | [spec](archive/specs/2026-09-14-column-funding-repair.md) |
| 2026-09-14 | `448415a` | Profile timeout recovery | [spec](archive/specs/2026-09-14-profile-timeout-recovery.md) |
| 2026-08-26 | `5fa78a9` | How it wins repair proved in production and ported | [prompt](archive/specs/2026-08-25-how-it-wins-completion-prompt.md) |
| 2026-08-23 | `02e96ad` | How it wins judge and the judgment standard | [standard](superpowers/specs/2026-08-21-how-it-wins-judgment-standard.md) |
| 2026-08-19 | `106740f` | How it wins crown on the Lens | [plan](archive/plans/2026-08-19-how-it-wins.md) |
| 2026-08-12 | `4ecf705` | Emphasis read, the Pay attention to card | [plan](archive/plans/2026-08-11-investor-lens-emphasis-read.md) |
| 2026-08-12 | `9dbb1d5` | Profile re-file and saved editions | [plan](archive/plans/2026-08-11-profile-refile-and-editions.md) |

Older shipped plans and specs live in `archive/plans/` and `archive/specs/`.
