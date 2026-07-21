# Extension Closed-Loop Testing Playbook

Cold Start should not use Computer Use as the normal QA loop for extension development. It is useful as a last-mile human-browser sanity check, but it is too slow, too indirect, and too brittle for card dragging, side-panel state, generation resume, citations, and visual regressions.

## Recommendation

Use a three-layer loop:

- **Fast UI harness**: Playwright drives the extension React surface with a controlled `chrome` API shim and mocked API responses. It uses `apps/extension/vite.sidepanel.config.ts`, a plain Vite config that avoids the CRX dev server. This catches drag, snap, accordion expansion, progress shimmer, citations, settings persistence, and stale-copy regressions in seconds.
- **Real extension smoke**: Playwright launches Chromium with the built MV3 extension loaded through a persistent context, discovers the extension id from the service worker, and opens `chrome-extension://<id>/sidepanel.html` for a minimal production-like smoke. This proves the built extension boots, reads stored settings, and renders a cached production card.
- **Production trace loop**: Keep `trace:generation` and `qa:generation` as the backend truth for provider, source-gate, extraction, synthesis, citation, cost, and duration behavior. UI tests should not spend LLM budget unless a run is explicitly marked live.

This replaces slow desktop automation with deterministic browser automation. Computer Use stays out of the default loop.

## Why This Is The Right Split

Playwright's official extension guidance uses a persistent Chromium context with `--disable-extensions-except` and `--load-extension`, then discovers the MV3 service worker to get the extension id. That is the right base for a real extension smoke, not a full product QA suite. [Source](https://playwright.dev/docs/chrome-extensions)

Chrome side panels are not ordinary app pages. The current Cold Start background correctly calls `chrome.sidePanel.open()` from the extension action click, and the original implementation plan notes that this must happen from a user action. Automated tests should avoid fighting Chrome toolbar UI as the primary path. [Source](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

Puppeteer also supports Chrome extension testing with service worker targeting, but Cold Start's extension is already React/Vite/Vitest, and Playwright gives stronger cross-browser test ergonomics, tracing, screenshots, and network interception for UI work. [Source](https://pptr.dev/guides/chrome-extensions)

Vitest Browser Mode can run browser-backed tests, but it is not the best primary tool here because the extension QA loop needs drag simulation, screenshots, network routing, persistent Chromium profiles, and optional loaded-extension smoke. Playwright is the cleaner single dependency. [Source](https://vitest.dev/guide/browser/)

## Test Shape

The fast UI harness should mount the side-panel app in a browser page with a small shim:

- `chrome.runtime.id` fixed to `extension-test-id`.
- `chrome.storage.local` seeded with production origin and token-like test data.
- `chrome.storage.session.activeDomain` seeded per scenario.
- `chrome.storage.onChanged` exposed so tests can simulate tab changes.
- `fetch` routed by Playwright, not by global Vitest mocks, so tests exercise browser DOM, pointer, layout, and screenshot behavior.

The fast UI harness must stay separate from the CRX dev server. Do not point it at `apps/extension/vite.config.ts`, because CRX development mode can inject `localhost:5173` imports into `dist/service-worker-loader.js`. If that happens, Chrome will fail extension loading with service worker status code 3 until the extension is rebuilt.

The real extension smoke should:

- Run `npm run build -w @cold-start/extension`.
- Launch Chromium with `apps/extension/dist` loaded as the only extension.
- Discover extension id from the MV3 service worker URL.
- Seed `chrome.storage.local` with test settings.
- Seed or drive the active domain path in one controlled way.
- Open the side panel page directly for rendering smoke.
- Save screenshots to `~/Downloads/cold-start-qa/<timestamp>/`.

## What To Test First

- Settings bootstrap: deployed origin appears by default, no localhost regression.
- Cached card: Browserbase or Cartesia renders company context without generation.
- Missing card: generate gate appears and does not auto-start.
- Basics running: progress surface renders text-first shimmer, no old chunky bar.
- Analysis running: pinned active card shows inline running state and resumes after reload.
- Analysis withheld: a blocked run renders the honest withheld state with real reasons, not an inferred empty-synthesis state, and offers a Refresh evidence and retry action.
- Drag and snap: card visibly moves, snap preview appears, release above threshold activates only that card.
- Keyboard activation: Enter and Space activate the same card path.
- Citations: body text strips inline markers, source chips link with Lens Blue styling and `target="_blank"`.
- Empty states: no fake populated cards, no generic plain text placeholders.
- Stale UI contract: no old Analyze CTA, no duplicate progress shell, no mock-only cards.

## Commands

- `npm run qa:extension:ui -w @cold-start/extension`
- `npm run qa:extension:smoke -w @cold-start/extension`

`qa:extension:ui` is cheap and default. `qa:extension:smoke` rebuilds the MV3 bundle, loads the real extension in Chromium, and proves the service worker and side-panel page boot from `apps/extension/dist`. A future live-production command should be added only when it actually hits production intentionally and is labeled with the budget and side effects.

## Guardrails

- Do not use Computer Use for normal regression testing.
- Do not click through Chrome toolbar UI as the main mechanism.
- Do not run full production generation from UI tests by default.
- Do not add a new hosted observability service for this pass.
- Do not fork the extension into a separate test-only UI. Use a thin harness around the real app.

## Fragile Assumption

This plan assumes the side panel React surface can be mounted with a faithful enough `chrome` shim for most behavior, and that the loaded-extension smoke catches the remaining Chrome-specific risks. If that assumption fails, the fallback is still Playwright, but the smoke layer becomes heavier: launch the real extension in Chromium and drive the background/action path through Chrome DevTools Protocol instead of Computer Use.

---

## Sources

- https://playwright.dev/docs/chrome-extensions
- https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- https://pptr.dev/guides/chrome-extensions
- https://vitest.dev/guide/browser/

---

*Captured: 2026-05-12*
