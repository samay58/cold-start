# Extension Dark Mode Spec (v0)

Date: 2026-06-24. Status: draft spec, ready to evolve into a full implementation plan.

Sources synthesized: two ChatGPT Pro runs of the same exploration prompt (one Web Search
connector, one GitHub connector) plus a direct read of the codebase. Where the two reports
diverged, the codebase adjudicated. Items marked [injected] came from the code and appeared in
neither report.

## End goal

Ship a warm, paper-toned "Kyoto Paper Dark" dark mode for the Chrome extension side panel, the
product's main surface. It should feel like flipping on a dimmed reading lamp over the same kept
catalogue card, not a different app, and never a cold gray or pure-black SaaS dark mode. It
activates automatically on OS/browser dark and, best-effort, when Dark Reader is darkening the
active tab; a manual override always wins. It is built on a proper semantic-token architecture
so it is maintainable, and it is refined through a screenshot iteration loop across every panel
state.

Out of scope: the public web card at `/c/{slug}` stays light. Dark is the new surface; the
existing app is the light mode.

Success: every panel state reads as comfortable, warm, legible dark paper in Chrome and Dia,
with OS-dark and Dark-Reader activation working, no flash of the wrong theme on open, evidence
classification still distinguishable, and the seal still reading as a seal.

## Decision log (resolved)

| # | Decision | Choice | Source | Confidence |
|---|---|---|---|---|
| 1 | Activation mechanism | `html[data-theme]` attribute + theme controller, not media-query-only | both | high |
| 2 | Precedence | manual override > Dark Reader (active tab) > OS `prefers-color-scheme` > light | both | high |
| 3 | Dark Reader reachability | panel cannot self-detect DR (chrome-extension:// not scripted); use active-tab bridge | both + code | high |
| 4 | DR detection signal | primary `html[data-darkreader-scheme]` = `dark` or `dimmed`; `style.darkreader` / `meta[name=darkreader]` secondary; `darkreader-lock` is opt-out, not activation | GitHub (dimmed) | high |
| 5 | DR bridge permissions | add `scripting`; probe active tab via `activeTab` + `chrome.scripting.executeScript`; no `<all_urls>` | GitHub (read manifest) | high |
| 6 | No-flash boot | external classic (non-module) script in `sidepanel.html` head; inline script is blocked by MV3 CSP | GitHub | high |
| 7 | Token tiers | primitive -> semantic role -> component; dark overrides the semantic+component tiers only | both | high |
| 8 | Scoping | dark overrides live in an extension-only `theme.tokens.css`; never in shared `packages/ui/src/tokens.css` | [injected] | high |
| 9 | `light-dark()` | not the primary system; sparing use only where active color-scheme matches resolved theme | both | high |
| 10 | Tints | `color-mix(in oklab, ...)` for seal tints, washes, focus, hover, selection | both | high |
| 11 | Cascade | adopt `@layer`; wrap then split | both | medium-high |
| 12 | Restructure | coupled + incremental; semantic tokens required, full file split optional and surface-by-surface | both | high |
| 13 | Palette | warm brown-black ground, aged off-white text, lifted lilac seal, retuned evidence; v0 pending extraction from real Ghostty/Codex theme | both (v0) | medium |
| 14 | Logo chips | keep logos on a muted parchment mat; do not invert third-party marks | both | high |
| 15 | Generation shader | pass a dark color set to `@paper-design/shaders-react` in code + dark CSS fallback gradient | [injected] | high |
| 16 | Manual toggle UI | add a 3-state theme control to the existing settings panel | [injected] | medium |
| 17 | Iteration harness | extend existing `qa:extension:ui` + `tests/e2e/fixtures.ts`, do not build new | [injected] | high |
| 18 | DESIGN.md | amend the three "No dark mode" guardrails to carve out the extension exception | [injected] | high |
| 19 | Storage | preference in `chrome.storage.local` (`coldStartThemePreference`), mirrored to `localStorage` for pre-paint boot | both | high |
| 20 | v1 vs phased | OS-dark + manual toggle is a shippable v1; the Dark Reader bridge is a defined later phase | both | high |

## Architecture

### Theme resolution

```
type ThemePreference = "auto" | "light" | "dark";   // persisted
type ResolvedTheme   = "light" | "dark";            // computed
type ThemeReason     = "manual" | "dark-reader" | "system" | "default";

function resolve(pref, darkReaderSignal, osPrefersDark): { theme, reason } {
  if (pref === "dark")  return { theme: "dark",  reason: "manual" };
  if (pref === "light") return { theme: "light", reason: "manual" };
  if (darkReaderSignal === "on") return { theme: "dark", reason: "dark-reader" };
  if (osPrefersDark)             return { theme: "dark", reason: "system" };
  return { theme: "light", reason: "default" };
}
```

Dark Reader `unknown` never forces light; it falls through to OS then default.

Root contract: `<html data-theme="dark" data-theme-reason="dark-reader">`. The `reason`
attribute is for debugging and screenshot review.

`color-scheme` is set from the resolved theme so UA-painted surfaces (scrollbars, form
controls, spellcheck) match. It is not the app theme switch.

```css
:root           { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark; }
:root[data-theme="light"] { color-scheme: light; }
```

### Boot (no flash)

MV3 extension pages run under a default CSP of `script-src 'self'`, which blocks inline
scripts. The pre-paint theme application must be an external classic (non-module) script,
loaded in `sidepanel.html` head before the stylesheet and the React module (module scripts are
deferred and run after paint, so this one must be classic and synchronous).

```html
<!-- sidepanel.html head, before styles and the app module -->
<script src="/theme-boot.js"></script>
```

```js
// theme-boot.js  (classic, synchronous)
(function () {
  try {
    var mirror = localStorage.getItem("coldStartThemeEffective");
    var osDark = matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = mirror || (osDark ? "dark" : "light");
  } catch (e) {
    document.documentElement.dataset.theme =
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
})();
```

React then reconciles: read `coldStartThemePreference` from `chrome.storage.local`, read OS via
`matchMedia`, read the cached Dark Reader signal, compute the resolved theme, write
`data-theme` + `data-theme-reason`, and mirror the effective theme to
`localStorage.coldStartThemeEffective`.

### Theme hook

Mirror the existing `usePrefersReducedMotion.ts` pattern (matchMedia + `change` listener +
guard) as `useResolvedTheme` / `usePrefersColorScheme`. Same shape, same lifecycle.

### Token tiers and the no-op first PR

Tier 1 primitives (palette atoms, used only inside the token file). Tier 2 semantic roles
(the contract components use). Tier 3 component tokens (cards, chips, stamps, sheens, shadows,
logo chips). Dark overrides Tier 2 and Tier 3 only.

The first PR introduces a new extension-only `theme.tokens.css` that aliases today's tokens to
semantic names so light is visually unchanged:

```css
/* theme.tokens.css  (imported by the extension only) */
:root {
  --cs-bg: #f7f5ee; --cs-surface-1: #fffdf8;
  --cs-text-1: #171a1f; --cs-text-2: #68706a;
  --cs-rule: #ccc7b8; --cs-rule-strong: #9c978a;
  --cs-accent-seal: #6e5c9e;

  /* keep legacy names working by aliasing onto the semantic layer */
  --color-field: var(--cs-bg);
  --color-plate: var(--cs-surface-1);
  --color-ink: var(--cs-text-1);
  --color-muted: var(--cs-text-2);
  --color-rule: var(--cs-rule);
  --color-rule-strong: var(--cs-rule-strong);
  --color-seal: var(--cs-accent-seal);
}
```

Hard scoping rule [injected]: the `:root[data-theme="dark"]` override block lives in this
extension-only file, never in `packages/ui/src/tokens.css`, because that file is imported by
both the extension and `apps/web/src/app/globals.css`. The web card must stay light.

### Cascade layers

```css
@layer tokens, base, primitives, surfaces, components, states, utilities;
```

First wrap existing CSS into layers; split files in later, surface-by-surface.

## Dark Reader bridge

Verdict: the side panel is a chrome-extension:// document; Dark Reader's content scripts run on
http/https/file, not extension pages, and Dark Reader does not change `prefers-color-scheme`.
The panel is blind to it. Both reports and the code agree.

Bridge: detect Dark Reader on the active tab and message the panel.

```
active web page  -> content function detects DR DOM markers
service worker   -> stores signal by tabId, broadcasts changes
side panel       -> recomputes resolved theme
```

Detector (run in the active tab via `chrome.scripting.executeScript`):

```js
function detectDarkReader() {
  var root = document.documentElement;
  var mode = root.getAttribute("data-darkreader-mode");
  var scheme = root.getAttribute("data-darkreader-scheme");
  var locked = !!document.querySelector('meta[name="darkreader-lock"]');
  var hasStyle = !!document.querySelector('style.darkreader, style[class*="darkreader--"]');
  var hasMeta  = !!document.querySelector('meta[name="darkreader"]');
  if (!locked && mode && (scheme === "dark" || scheme === "dimmed"))
    return { state: "on", confidence: "high" };
  if (!locked && (hasStyle || hasMeta))
    return { state: "on", confidence: "medium" };
  return { state: "off", confidence: "medium" };
}
```

Do not use `--darkreader-*` CSS variables as the primary signal; they are internal pipeline
artifacts, useful only for diagnostics.

Permissions [from GitHub report, confirmed against the manifest]: add `scripting` to the
existing `sidePanel`, `activeTab`, `storage`. Probe via the `activeTab` grant (granted when the
user clicks the action that opens the panel). Do not add `<all_urls>` for a theme hint.

Probe lifecycle: on panel mount, on tab activation, on navigation complete. The `activeTab`
grant can go stale on navigation and restricted pages (chrome://, extension pages, Web Store,
some PDFs) return `unknown`; `unknown` falls back to OS + manual, never to a user-visible error.

v1 may ship without the bridge: OS dark + manual toggle is a complete, reliable experience. The
bridge is Phase 6.

## Dark palette (v0, pending extraction)

Neither report could verify a public canonical "Kyoto Paper Dark" hex set. These are a
calibrated v0 leaning on the GitHub report's values (darker, warmer ground; brand gold kept).
The Web report's lighter ground (`#1f1b18` family) is the comparison candidate. Phase 0
extracts the real palette from the installed Ghostty/Codex theme before these are frozen.

Contrast figures below are the reports' own computed ratios and are unverified; re-check with a
real contrast tool in Phase 0. Targets: primary text >= 7:1, secondary >= 4.5:1, required
boundaries/dots >= 3:1 against the adjacent surface, and dots always paired with a label or
tooltip (color is never the only carrier of classification).

| Token | v0 dark value | reported ratio vs field | role |
|---|---|---|---|
| --color-field | #18130F | ground | warm brown-black paper in shadow |
| --color-plate | #211A14 | ~1.07 vs field | raised paper; lift from edge/grain/shadow, not gray contrast |
| --cs-surface-2 | #2A221A | ~1.18 vs field | popovers, active rows, nested cards |
| --cs-surface-sunken | #14100C | - | wells, track backgrounds |
| --color-ink | #E8DDC9 | ~13.7:1 | primary text, aged off-white |
| --color-muted | #AA9C86 | ~6.9:1 | secondary text, labels, metadata |
| --color-rule | #5C4F3F | ~2.3:1 | decorative hairlines (not a sole affordance) |
| --color-rule-strong | #7A6953 | ~3.5:1 | required dividers, input borders |
| --color-seal | #B6A4DD | ~8.2:1 | dusty-lilac seal, lifted, not neon |
| --color-verified | #78BFAE | ~8.7:1 | independent source (green) |
| --color-reported | #91AAD4 | ~7.8:1 | reporting/press (blue) |
| --color-company | #D2A65B | ~8.2:1 | company-sourced (gold-brown) |
| --color-conflict | #D98276 | ~6.5:1 | conflict (terracotta red) |
| --color-focus | #D7B84A | ~9.5:1 | brand gold focus, kept from light |

Catalogue aliases (extension borrows them): `--cat-ground #15110D`, `--cat-paper #211A14`,
`--cat-paper-edge #7A6953`, `--cat-ink #E8DDC9`, `--cat-muted #AA9C86`, `--cat-rule #5C4F3F`,
`--cat-rule-strong #7A6953`.

Derived dark-only tokens:

```css
:root[data-theme="dark"] {
  --cs-edge-highlight: rgb(239 222 190 / 0.07);       /* warm paper-fiber lift, NOT white */
  --cs-edge-highlight-strong: rgb(239 222 190 / 0.11);
  --cs-inset-shadow: rgb(8 6 4 / 0.38);
  --cs-shadow-pickup: 0 10px 26px rgb(8 6 4 / 0.34), 0 1px 0 var(--cs-edge-highlight) inset;
  --cs-seal-tint-08: color-mix(in oklab, var(--cs-accent-seal) 8%, transparent);
  --cs-seal-tint-18: color-mix(in oklab, var(--cs-accent-seal) 18%, transparent);
  --cs-selection-bg: color-mix(in oklab, var(--cs-accent-seal) 34%, transparent);
  --cs-selection-text: #F2E8D7;
  --cs-scrollbar-thumb: #6B5C49; --cs-scrollbar-track: #18130F;
  --cs-logo-chip-bg: linear-gradient(180deg, rgb(205 189 156 / 0.98), rgb(182 165 132 / 0.96));
  --cs-logo-chip-ink: #171A1F; --cs-logo-chip-border: #8E7B5F;
  --paper-grain-opacity: 0.10;
}
```

The single biggest visual risk both reports flag: the light theme's white inset sheens cannot
carry over. On dark they become a faint warm amber edge lift (~`rgb(239 222 190 / 0.06-0.11)`)
plus a real dark contact shadow. Carried-over white sheens read as glossy plastic, not paper.

## Special-case surfaces [injected]

These are not reachable by CSS tokens alone:

1. Generation mesh shader: `@paper-design/shaders-react` `MeshGradient`/`StaticMeshGradient`
   in `sidepanel.tsx` takes its colors as JS props. Pass a warm-dark color array when the
   resolved theme is dark. The CSS fallback `.cs-generation-mesh-fallback` (hardcoded
   `#f4eddc`/`#fffdf8` gradients) needs a dark variant. The `::after` multiply overlay needs
   review on dark (`mix-blend-mode: multiply` behaves differently over dark grounds).
2. Company logo chips: keep a small muted parchment mat behind logos; do not invert marks.
   Test real logos across black, white, colored, transparent, and square-background assets.
3. Panel-state crossfade (`.cs-panel-stage` + per-panel keys): verify no white flash between
   state swaps in dark.
4. Paper grain and noise overlays (`.cs-start-panel::after`): faint warm luminance variation,
   lower opacity than light; switch blend mode if multiply muddies text.
5. Brand mark / aperture colors: verify legibility on dark.
6. Manual toggle UI: add a 3-state control (auto / light / dark) to the settings panel.

## Literal migration (the ~580)

Replace by visual role, never by global color value.

| Literal family (count) | Role | Replace with |
|---|---|---|
| cream/white washes ~127 (`rgb(255 253 248/x)`, `#fafaf7`) | paper lift, card fill, highlight | `--cs-surface-*`, `--cs-paper-wash-*`, `--cs-edge-highlight`, `--cs-logo-chip-bg` |
| warm ink shadows ~90 (`rgb(23 26 31/x)`) | elevation, contact, pressed | `--cs-shadow-pickup`, `--cs-shadow-popover`, `--cs-inset-shadow` |
| seal tints ~137 (`rgb(110 92 158/x)`) | accent wash, border, hover, focus | `--cs-seal-tint-*`, `--cs-seal-rule` via `color-mix` |
| white inset sheens ~76 | raised paper edge | `--cs-edge-highlight(-strong)` (warm, low-opacity on dark) |
| hairlines | dividers, catalogue edges | `--cs-rule`, `--cs-rule-strong`, component `--card-border` |
| evidence alphas | classification semantics | `--cs-evidence-*`, `--cs-evidence-*-wash` |

Add an audit script that counts raw color literals per file and fails CI on new literals
outside a shrinking allowlist (`transparent`, `currentColor`, rare one-off SVG/art). Goal:
~580 -> under ~120 after first dark launch, remaining literals documented.

## Modular restructure

Required for dark: theme state + root attribute, semantic tokens + dark overrides, replacing
the dark-blocking literal families, `@layer` boundaries, visual fixtures. Optional and
incremental: splitting the monolith per surface as each is touched, the audit script,
screenshot regression. Not required for v1: perfect modularization, removing every literal in
one pass, a token build pipeline.

Target file shape (move a surface only when it is tokenized; do not move untouched CSS):

```
apps/extension/src/styles/
  index.css  theme.tokens.css  base.css  primitives.css  states.css
  surfaces/  start-intake.css loading-generation.css research-layer.css
             first-read.css investor-lens.css company-context.css source-ledger.css errors.css
  components/ cards.css buttons.css inputs.css evidence.css citations.css logo-chip.css
              stamps.css scrollbars.css focus.css
```

Safest migration order: frame/base -> start/intake -> loading/generation -> research layer ->
source ledger + evidence -> first read + investor lens -> error states. Source ledger and
evidence dots get special care; classification is core product language.

## Iteration loop

Reuse the existing harness [injected]: `npm run qa:extension:ui` already serves
`sidepanel.html` via Vite, drives every state with the chrome-API shim and mocked cards in
`tests/e2e/fixtures.ts`, and writes full-page screenshots to `/private/tmp/cold-start-*.png`.
Extend it to render each state under `data-theme="dark"`.

States to cover: start/intake, loading/generation, partial profile, full research layer (first
read + investor lens), company context, source ledger, error/empty. Capture matrix per state:
Chrome and Dia, each in OS-light, OS-dark, and OS-light + Dark-Reader-on, plus manual light and
manual dark.

Per-state ship bar and failure modes to reject:

| State | Good enough |
|---|---|
| start/intake | warm dark paper field; input lifted, not a gray SaaS card; placeholder readable |
| loading/generation | shader and marks warm, not blue-gray or metallic |
| partial profile | pending sections read intentional, not disabled into illegibility |
| full first read | long text comfortable for minutes; primary does not glare; secondary readable |
| investor lens | accent and stamps feel like the same catalogue object at night |
| source ledger | evidence dots distinct by hue and >= 3:1; rows do not flatten to one value |
| error | conflict red clear but not emergency-neon; surfaces stay warm |

Reject: ground drifts blue/slate; cards become flat gray; structural hairlines vanish; white
sheens survive and look glossy; seal turns electric purple; evidence collapses into one pastel
family; logos disappear on dark chips; theme flashes light before dark on open. Loop: adjust
tokens first, then component tokens, then component CSS; repeat. Review live with macOS Reduce
Motion OFF.

## Docs to update

- DESIGN.md: amend the three "No dark mode" statements (lines ~86, ~91, ~321) to carve out the
  extension side panel as the one dark surface; keep the public web card light-only.
- This spec evolves into the full implementation plan.

## Phased plan (skeleton)

- Phase 0  Verify: extract the real Kyoto Paper Dark palette from Ghostty/Codex into
  `docs/theme-sources.md`; probe `prefers-color-scheme` and Dark Reader DOM markers in Chrome
  and Dia across the OS x DR matrix; re-check the v0 contrast ratios with a real tool.
- Phase 1  Token tiers + aliases: add extension-only `theme.tokens.css`, alias legacy tokens,
  no visual diff in light. Add `@layer` wrapping.
- Phase 2  Theme controller + boot: classic pre-paint `theme-boot.js`, `useResolvedTheme` hook,
  `color-scheme`, settings-panel manual toggle, storage + mirror.
- Phase 3  OS auto: `matchMedia` listener; verify OS toggle flips the panel in Chrome and Dia.
- Phase 4  Migrate literal families surface-by-surface behind the screenshot loop.
- Phase 5  Special-case surfaces: shader dark colors + CSS fallback, logo chips, grain, blend
  modes, brand mark, crossfade.
- Phase 6  Dark Reader bridge: add `scripting`, active-tab probe, service-worker tab-state
  store, panel reconciliation; honest fallback on `unknown`.
- Phase 7  Debt + docs: audit script + CI guard, shrink literal count, amend DESIGN.md, full
  state matrix sign-off.

## Risks and open questions

- Palette is v0, not canonical. Extract before freezing. [Phase 0]
- Dia parity is assumed, not proven. Verify side panel, `scripting`, `activeTab`, and DR markers
  on the installed Dia build. [Phase 0/6]
- Dark Reader detection depends on another extension's DOM artifacts (grounded in current DR
  source, not a public API). It is a convenience; OS + manual is the reliable base.
- `activeTab` grant goes stale on navigation; probing returns `unknown` and falls through.
- Contrast ratios are model-computed; verify with a tool.
- Shader: confirm passing a dark color array does not regress generation-panel performance.

## Verification gates

`npm run typecheck`, `npm run test`, `npm run lint`, `npm run qa:extension:ui`. Full
`npm run check` is known to fail only at `audit:deps` (pre-existing @opentelemetry advisories);
treat clean-through-secrets as pass. Rebuild and reload `apps/extension/dist` in
chrome://extensions after building; restart `dev:full` if env changes.
