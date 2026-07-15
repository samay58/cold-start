# Research Panel Polish Ledger

## WHERE WE LEFT OFF

Spec A meets its Done definition on `research-panel-polish`. The focused extension gates, 44-state side-panel suite, MV3 smoke rerun, and full `npm run check` are green. Next: review the staged shape, commit, push `research-panel-polish`, then start Spec B from local `main` on `inferred-email-coverage`.

## 2026-07-15

### Starting state

- Branch cut from clean local `main` at `d3da06d`, one docs-only commit ahead of `origin/main`.
- No prior Spec A ledger existed.
- Done test: one plate inside every research card; receipt face limited to sources, Filed, and numeric receipts; empty memo case compressed; zero-item tray absent with no dormant frames; required fixtures green in both motion modes; four changed states captured before and after in both themes.

### Ghost-tray reproduction and diagnosis

The regression fixture was written before production code. It files all six cards in both motion modes, then requires zero `.cs-dormant-card-frame` nodes and no `Research card stack` section.

Red run:

```text
npx playwright test --project=sidepanel-ui tests/e2e/sidepanel-ui.spec.ts -g "all research cards filed"
2 failed: the stack section remained mounted at 0 waiting in full and reduced motion.
```

Hypothesis results:

- Exiting frames painting outside the collapsing pile: disproven. Reordering the assertions confirmed `.cs-dormant-card-frame` reached zero in both modes before the tray assertion failed.
- Interrupted exits from changing transition identity: disproven. No frames remained after exits settled, and the failure was identical in both motion modes.
- Reduced-motion opacity-only exits leaving transforms visible: disproven. Full motion failed identically and both paths had zero frame nodes.
- Confirmed mechanism: the tray rendered unconditionally. At zero items, `.cs-card-pile::before` and `::after` remained mounted as decorative stacked-card layers, producing the visible ghosts over the `0 waiting` shell. The fix belongs at the collection boundary: the whole tray now exits when the final dormant card leaves.

### Implementation

- `apps/extension/src/ResearchLayerPanel.tsx`: the tray mounts only when dormant layers exist and exits through `AnimatePresence`; investor names render in one ledger row; source links use classed dots and bare domains; source overflow is keyboard-reachable through the shared tooltip; both-empty tension sides compress into one `The case` row; one-sided empty copy is shortened.
- `apps/extension/src/styles.css`: Money, Signals, generic rows/items, and source marks now use one-plate hierarchy with spacing and token hairlines. Memo labels use the body face, one 76px column, one rule token, and uniform 10px row padding. The old investor-pill selectors were removed.
- `apps/extension/tests/e2e/fixtures.ts` and `sidepanel-ui.spec.ts`: added the Office Hours-shaped single-round fixture, a multi-round variant, zero-source and empty-memo cases, both motion modes, classed source overflow, one-plate computed-style checks, and the screenshot matrix.
- `AGENTS.md` and `CLAUDE.md`: added the collection zero-state and final-item exit convention.
- `apps/extension/src/research-layer.ts` and its test: comments now describe the ledger presentation rather than the removed pills. Display behavior is unchanged.

### Polish loop

- Pass 1: the four required after states matched the one-plate direction in light and dark. One verification gap remained: the production-derived multi-round financing path and fourth-source overflow were not rendered by the initial fixture.
- Pass 1 correction: added a multi-round card and fourth cited source. The derived financing section intentionally carries the aggregate and latest round rather than every raw round; the spec marks display-model changes as a non-goal, so the test verifies that production path without changing it. The `+1` source control opens the hidden-source tooltip.
- Pass 2: zero deviations. Money has no hero, investor, history, or source boxes; memo rows share the 76px baseline; the both-empty case is one row; source marks are bare; the zero tray is absent; all changed colors use existing theme tokens.
- Pass 3: zero deviations on the full 44-state side-panel run. This is the second consecutive clean pass.

### Verification so far

- `npm run typecheck -w @cold-start/extension`: green.
- Focused Vitest suites: 24/24 after removing one orphaned source-overflow selector.
- `npm run audit:css -w @cold-start/extension`: green.
- New focused Playwright acceptance cases: 8/8.
- `CI=1 npm run qa:extension:ui -w @cold-start/extension`: 44/44 green. A prior non-CI invocation reused a terminating Vite process and produced `ERR_CONNECTION_REFUSED`; the fresh-server run is the recorded result.
- `npm run qa:extension:smoke -w @cold-start/extension`: first run reached the Access form with an empty smoke token; the unchanged rerun passed 1/1, confirming the existing storage-seed timing race rather than a bundle regression.
- First full `npm run check`: caught one stale unit assertion that still queried the removed `.cs-money-pill` selector. The assertion now verifies the deduplicated, unlinked `.cs-layer-money-investors` ledger row instead; its focused rerun passed 1/1.
- Final `npm run check`: green. Lint completed with zero warnings; all typechecks, 855 Vitest tests, 29 Node eval tests, production builds, 12-company golden dry run, knip, secrets scan, and guarded dependency audit passed. The dependency audit reported only the repository's known non-blocking temporary advisories.

### Screenshots

The `tray-absent` baseline files deliberately capture the broken terminal state: zero real frames, but the unconditional tray and its two decorative ghosts still visible.

| State | Light before | Light after | Dark before | Dark after |
|---|---|---|---|---|
| Money | [before](screenshots/research-panel-polish/before/light-money.png) | [after](screenshots/research-panel-polish/after/light-money.png) | [before](screenshots/research-panel-polish/before/dark-money.png) | [after](screenshots/research-panel-polish/after/dark-money.png) |
| Memo | [before](screenshots/research-panel-polish/before/light-memo.png) | [after](screenshots/research-panel-polish/after/light-memo.png) | [before](screenshots/research-panel-polish/before/dark-memo.png) | [after](screenshots/research-panel-polish/after/dark-memo.png) |
| Tray present | [before](screenshots/research-panel-polish/before/light-tray-present.png) | [after](screenshots/research-panel-polish/after/light-tray-present.png) | [before](screenshots/research-panel-polish/before/dark-tray-present.png) | [after](screenshots/research-panel-polish/after/dark-tray-present.png) |
| Tray absent | [broken baseline](screenshots/research-panel-polish/before/light-tray-absent.png) | [after](screenshots/research-panel-polish/after/light-tray-absent.png) | [broken baseline](screenshots/research-panel-polish/before/dark-tray-absent.png) | [after](screenshots/research-panel-polish/after/dark-tray-absent.png) |

### Open deviations

None against the Spec A Done definition. The existing MV3 smoke storage seed has a timing-sensitive first-load path; it passed unchanged on rerun and is outside this presentation spec.
