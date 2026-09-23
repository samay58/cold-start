# Status

What is in progress, what comes next, and what shipped recently. Update this page whenever a plan closes or a new one starts. Last updated 2026-09-22.

## In flight

- How it wins Phase 5: the scoped judge is built and off. `HOW_IT_WINS_SCREEN=shadow` runs in production and never changes a read. `scoped` waits on Samay's blind review. See [the layered screen spec](superpowers/specs/2026-09-22-how-it-wins-layered-screen.md).
- Polish pass: writing quality, what users see, reliability and cost, code health, and repo organization. See `superpowers/plans/2026-09-22-polish-pass.md`.
- Friend alpha production readiness. The open gates are the owner rehearsal through the store install, production spend-control and alert readbacks, five fresh current-version company journeys, a clean seven-day `alpha:status --gate`, and a 24-hour owner-only soak. No invitation goes out without approval. See [the plan](superpowers/plans/2026-07-24-alpha-production-readiness.md) and [the evidence record](product/alpha-production-readiness-2026-07-24.md).
- Firefox: the port shipped through 2026-07-29. The in-sidebar activeTab probe still needs a live check in real Firefox. See [the port plan](archive/plans/2026-07-13-firefox-port.md).

## Next

- Decide whether to turn on `HOW_IT_WINS_SCREEN=scoped` after the blind review.
- Send the first friend invitation once every readiness gate passes and Samay approves it.
- Build the edition timeline, release two of [the re-file design](superpowers/specs/2026-08-11-profile-refresh-and-timeline-design.md). Editions have been saved since 2026-08-12; nothing reads them yet.
- Publish extension 0.2.9 through the Chrome Web Store. It was built from `1cb2614` and carries the How it wins status and retry interface. The last store-accepted version is 0.2.5, per `product/chrome-web-store-alpha/release-version.json`.

## Recently shipped

| Date | Commit | What | Record |
| --- | --- | --- | --- |
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
