# Research Panel Polish Ledger

## WHERE WE LEFT OFF

Spec A and the screenshot-driven Dia-width correction are complete on `main` at `586d108`. The company identity no longer collides with the filing status at 431 to 437px, and the unavailable Investor Lens is a quiet prerequisite row rather than a second disabled card. The full-height purple progress mesh is deliberately unchanged. The 47-state UI suite, packaged MV3 smoke, local full check, GitHub Check run `29426509545`, and production deployment `dpl_GUMnLynyjJ8y1ySGvNfDNTe36Ryh` are green. No deviations remain.

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

### Consolidation release pass

- Reviewed the light and dark Money, memo, tray-present, tray-absent, and inferred-dossier evidence alongside the combined source. The two features merged without conflicts or dropped selectors.
- Combined extension verification: 46/46 Playwright UI states, CSS token audit, and 1/1 real MV3 smoke passed. The Firefox production target also built successfully.
- Full `npm run check` passed with zero-warning lint, every workspace typecheck, 873 Vitest tests, 29 Node eval tests, both production builds, the 12-company golden dry run, knip, secrets scan, and guarded dependency audit.

### Production receipt

- Pushed the fast-forward release to `origin/main`; Vercel production deployment `dpl_E327tgMuuBEDdUh3RL463Z9ghvnW` reached Ready and promoted the stable internal alias.
- Live `/privacy`, `/robots.txt`, and `/sitemap.xml` returned HTTP 200. The public card API returned contract `2026-07-15.inferred-email-basis-v1` without synthesis or private person fields.
- Dia already tracked `apps/extension/dist` under the production allowlisted identity. Samay reloaded and tested that unpacked extension after the production build completed.

### Adversarial hardening pass

- Review found the final one-plate Money result was implemented twice: obsolete boxed declarations near the original component rules, then a late override block that reset them. Commit `37665b5` moved the final values into the canonical selectors and deleted 74 lines of competing cascade without changing the rendered output.
- Focused browser verification passed the Money-panel one-plate computed-style case and the complete 46/46 UI matrix. The suite covered both themes and both motion modes; generated dossier screenshots were restored to their committed evidence after the run.
- CSS token audit passed independently and as part of the extension suite. The packaged Chrome MV3 smoke passed 1/1. Firefox built successfully and self-hosted `web-ext` lint reported 0 errors and 6 documented compatibility or bundled-library warnings.
- Full `npm run check` passed after Firefox build and pinned lint were added permanently to both the root gate and GitHub Actions.
- Browser-only limitation: Samay manually exercised the unpacked release in Dia. Firefox behavior is covered by unit contracts, build, and package lint, but was not manually launched in this release session.

### Final hardening release receipt

- Pushed the hardening release to `origin/main`. Vercel production deployment `dpl_CB6WzN3QaNtYmMXLV6PkXdoJt5C9` reached Ready and promoted `https://cold-start-samay58s-projects.vercel.app`.
- GitHub Check run `29421374905` passed lint, typecheck, all tests, Chrome build, Firefox build, pinned self-hosted Firefox lint, golden dry run, knip, secrets scan, and dependency audit.
- Live `/privacy`, `/robots.txt`, and `/sitemap.xml` returned HTTP 200. The public card route retained contract `2026-07-15.inferred-email-basis-v1` and no private fields.
- Deleted the merged `research-panel-polish` and `inferred-email-coverage` branches locally and from `origin`. No stale worktrees existed; `main` remains the only worktree.

### Dia-width screenshot correction

- Samay's live Dia captures at 431 to 437px showed the title, seal, and reading status competing in the same header row, plus a large disabled Investor Lens card directly below it.
- A regression fixture reproduced the collision before production edits: the status began at `30.7px`, above the identity bottom plus the required `8px` clearance. The fixture now exercises the SymphonyAI building state at 437px light and 431px dark, checks title fit, status separation, horizontal fit, theme-rule contrast, and the absence of a disabled Lens button.
- `CompanyHeader` now uses an intrinsic two-column identity grid with the status on its own ruled row. This avoids relying on the old 430px breakpoint that missed Dia's real panel width.
- The unavailable Lens now renders as a transparent ledger row with the prerequisite `Opens when the cited profile is filed.` The ready, running, and filed Lens surfaces remain unchanged.
- An initial interpretation removed the building shell's full-height mesh. Samay rejected that change because the purple gradient is an intentional signature surface. The mesh height, shader colors, animation, fallback, and opacity are unchanged in the final diff.
- Before evidence: Samay's `CleanShot 2026-07-15 at 09.38.49@2x.png` and `CleanShot 2026-07-15 at 09.38.54@2x.png`. After evidence: `/private/tmp/cold-start-symphony-dia-width-after.png` and `/private/tmp/cold-start-symphony-dia-width-dark-after.png`.
- Verification: focused Playwright 1/1, extension component tests 63/63, CSS audit green, extension typecheck green, full side-panel UI 47/47, and packaged Chrome MV3 smoke 1/1. The smoke's first launch hit the existing empty-token storage-seed race; the captured Access screen confirmed that mechanism, and the unchanged rerun passed. The final `npm run check` passed zero-warning lint, all workspace types and tests, Chrome and Firefox production builds, Firefox package lint, the golden dry run, knip, secrets scan, and dependency audit.
- Release receipt: GitHub Check run `29426509545` passed every gate. Vercel production deployment `dpl_GUMnLynyjJ8y1ySGvNfDNTe36Ryh` reached Ready and promoted the stable alias. Live privacy and robots routes returned HTTP 200; the public card API retained contract `2026-07-15.inferred-email-basis-v1` with no synthesis or private person fields.
