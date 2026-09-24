# Status

What is in progress, what comes next, and what shipped recently. Update this page whenever a plan closes or a new one starts. Last updated 2026-09-22.

## In flight

- How it wins Phase 5: the scoped judge is built and off. `HOW_IT_WINS_SCREEN=shadow` runs in production and never changes a read. `scoped` waits on Samay's blind review. See [the layered screen spec](superpowers/specs/2026-09-22-how-it-wins-layered-screen.md).
- Friend alpha production readiness. The open gates are the owner rehearsal through the store install, production spend-control and alert readbacks, five fresh current-version company journeys, a clean seven-day `alpha:status --gate`, and a 24-hour owner-only soak. No invitation goes out without approval. See [the plan](superpowers/plans/2026-07-24-alpha-production-readiness.md) and [the evidence record](product/alpha-production-readiness-2026-07-24.md).
- Firefox: the port shipped through 2026-07-29. The in-sidebar activeTab probe still needs a live check in real Firefox. See [the port plan](archive/plans/2026-07-13-firefox-port.md).

## Next

- Fix the emphasis read's silent failures. In 32 of 72 production analysis runs over the last 45 days, the emphasis read failed its own check that the citation markers in its text match its cited ids, and the run filed "nothing notable" instead, so testers see an empty Pay attention to section about four times in ten. A September 24 check on the 12 remediation cards failed the same way in 14 of 24 runs under both prompt wordings, so the check or the prompt needs a decision, not a wording tweak.
- Evidence and judgment remediation follow-ups, all small and none urgent: (1) Samay's call on backfilling snippets for the roughly 400 existing profiles; the recommendation is to skip, since stored snippets already read as text and a re-file brings page text. (2) The Market research section left out its required confidence field in 3 of 21 Sonnet 4.6 runs, which files the section empty. (3) Watch the first production How it wins run after the September 24 deploy: judge output near 11k tokens and well under the 240 s timeout. (4) The customer-evidence search pilot (the plan's Task 6) was not run. (5) The next deploy carries the accepted-proof wording, which changes the judge prompt hash: How it wins jobs in flight at that moment finish as stale, and a manual retry on a card filed earlier is refused until a fresh analysis run. (6) Deferred review minors: an empty seed-profile snippet, clipping classification on longer snippets, no runtime guard for a missing migration, the judge trace's thinkingState hardcoded to disabled, a future Opus 5.x id inheriting Opus 5's thinking switch through substring matching, and an unparseable JSON-looking model note blocking the page-text fallback. See [the plan](archive/plans/2026-09-23-evidence-and-judgment-remediation.md).
- Choose the How it wins judge. Opus 5 stays pinned (`LLM_HOW_IT_WINS_JUDGE_MODEL=claude-opus-5`). Opus 5.5 now runs as judge, costs 36% less and runs 38% faster, but named 2 current strategies across 8 cards to Opus 5's 8 and turned Notion, Cognition and DeepInfra into nothing-stands-out. Read both sets in `eval/curation/how-it-wins-batch/2026-09-22-2154` against `2026-09-22-1734` before switching. See [the polish pass](archive/plans/2026-09-22-polish-pass.md), C5.
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
