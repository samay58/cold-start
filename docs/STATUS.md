# Status

What is in progress, what comes next, and what shipped recently. Update this page whenever a plan closes or a new one starts. Last updated 2026-09-22.

## In flight

- How it wins Phase 5: the scoped judge is built and off. `HOW_IT_WINS_SCREEN=shadow` runs in production and never changes a read. `scoped` waits on Samay's blind review. See [the layered screen spec](superpowers/specs/2026-09-22-how-it-wins-layered-screen.md).
- Friend alpha production readiness. The open gates are the owner rehearsal through the store install, production spend-control and alert readbacks, five fresh current-version company journeys, a clean seven-day `alpha:status --gate`, and a 24-hour owner-only soak. No invitation goes out without approval. See [the plan](superpowers/plans/2026-07-24-alpha-production-readiness.md) and [the evidence record](product/alpha-production-readiness-2026-07-24.md).
- Firefox: the port shipped through 2026-07-29. The in-sidebar activeTab probe still needs a live check in real Firefox. See [the port plan](archive/plans/2026-07-13-firefox-port.md).

## Next

- Production migration 0020 (`sources.published_at`) must run through `npm run db:migrate:production` before the next deploy: main now reads and writes that column. Samay decides when.
- Run the evidence and judgment remediation, which comes before choosing the judge. Tasks 0 to 2C and the Task 3 wording are built on local main (not pushed, not deployed): every Exa search asks for page text, every model reads page text instead of provider JSON, snippets keep the extraction model's note and fall back to page text, extraction reads a 45k-character source budget, person reads read about the right person, own-site pages are labeled as the company, publish dates reach the judge, each snippet reaches the judge once, the keyword filter on verified claims is gone, and the prompts state once that normal private-company absences are not findings. Task 3's paid before-and-after check and Samay's blind read come next. Waiting on Samay: (1) the Opus 5 judge timeout: the stored Notion card's judge call now takes 217 s of its 240 s limit (output 19.9k tokens against 10.9k on September 22), and the rebuilt Notion card times out; (2) the backfill; (3) Task 4 wording. The first re-file of each card after deploy misses its memoized How it wins judgment once, because the evidence packet hash changes. Numbers: `eval/curation/remediation-2026-09/README.md`. See [the plan](superpowers/plans/2026-09-23-evidence-and-judgment-remediation.md).
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
