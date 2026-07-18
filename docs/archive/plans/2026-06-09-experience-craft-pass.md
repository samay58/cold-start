# Cold Start Experience Craft Pass: Working Prompt for Fable 5

> Handoff brief. Built 2026-06-09 from a six-dimension rendered-and-code craft audit of the live product against its own documented bar. Line numbers are point-in-time; verify before editing. This prompt holds you to the EXISTING documented bar (DESIGN.md, INTENT.md). It does not author a new design direction.

## Your mission

Bring every step of the Cold Start experience up to its own documented craft bar, and where flagged, past it. The product's skeleton is right. The failures are concentrated, coherent, and fixable. The single largest one is that the extension's chrome (intake gate, generation/progress, live-card frame) drifted into a SaaS-glass costume that contradicts the Catalogue Card language primitive by primitive, while the content layer and the public card stayed faithful. Fix that surface family, give it the motion it should have had, then tighten the public card's trust machinery and the half-built living-dossier states.

## Read first

- `DESIGN.md`: visual source of truth, the Catalogue Card. Note: its motion section is stale (see Decision 1).
- `INTENT.md`: product intent and trust model.
- `CLAUDE.md` and `AGENTS.md`: conventions, the public/private boundary, the contract-version rule.
- `docs/superpowers/plans/2026-06-07-living-dossier-perceived-speed.md`: the perceived-speed plan; Tasks 1 and 3 are not built yet.

## Who this is for

Samay. Extreme design taste. For him "anti-AI-slop" is not austere minimalism; it is a strong concept carried all the way through with warmth, wit, and craft. The SaaS-glass surface family below is precisely the slop he pays to avoid. Two specific standing facts:

- **Motion intent, his words: "I don't want reduced motion. I want elegant snappy and fun animations that are designed like a professional interaction designer."** The hero target is the full-motion experience: elegant, snappy, settles fast, with character and follow-through. The north star is Rauno Freiberg / Devouring Details physics (velocity projection, sqrt rubber-band, stiff well-damped springs). Not cartoon bounce, but not sterile-mechanical either.
- **His Mac runs macOS Reduce Motion ON.** So he has been reviewing the `prefers-reduced-motion` fallback, which is why his screenshots look frozen. A surface that zeroes all motion under reduced-motion is a bug, not a safeguard. The fallback must be a tasteful reduction (calm cross-fade, shortened timing, still alive), never a freeze. Tell him to toggle Reduce Motion OFF to review the real thing.

## Non-negotiable guardrails

- Public `/c/{slug}` and `/api/cards/{slug}` must never return or render `synthesis`. The boundary is currently airtight; keep it.
- Do not weaken citation discipline. Every citation-bearing fact keeps valid refs; verifier drops stay dropped.
- Do not touch `packages/core/src/card.ts` without a reviewer-approved reason.
- The API contract was bumped on Jun 9 (open-questions and The Case rebuild). Rebuild the extension after any route-shape change and bump `packages/core/api-contract.json` if you change shapes.
- No new paid provider or LLM call may start in the background without the existing explicit generation confirmation.
- Verify in rendered pixels in BOTH motion modes before claiming done (see "Done" below).

## Priority sequence

Work in this order. Each block is a coherent shippable unit.

1. **De-slop the extension chrome and give it life.** The SaaS-glass migration plus the motion-life fixes. This is the headline; it transforms the surface Samay touches most.
2. **Public card trust machinery.** Citation display, source-class consistency, popover, contrast, the share artifact.
3. **Living-dossier honesty and the missing states.** Empty-as-resolved fixes, the source receipt, the stale freshness mark.
4. **Voice alignment and doc reconciliation.**

Within each block, BLOCKS-BAR items are the mandate. ELEVATION items are proposals; surface them to Samay before building, since they cross into design direction he owns.

---

## Block 1. Extension chrome de-slop and motion life

### 1A. The SaaS-glass surface family (BLOCKS-BAR)

The intake, generation, and live-card surfaces are one borrowed visual language. Migrate them to the Catalogue Card as a set, not as scattered nits.

- **Retune the progress mesh-gradient field (DECIDED: keep it, de-slopped, do not delete).** `apps/extension/src/sidepanel.tsx:428,443` (`ProgressMeshGradient` / `ProgressStaticMeshGradient`, colors include `#6e5c9e`/`#d9d0e8`). Samay wants this animated field kept, not removed. Recolor it to a parchment-and-seal palette only (`--cat-paper` / `--color-field` base, seal `#6e5c9e` as a single restrained accent, drop the cool `#d9d0e8`), and calm the motion (lower speed, swirl, and distortion to a slow grounded drift). It must read as warm parchment with a faint seal breath, never a SaaS gradient wash. Strip the surrounding glass, dark button, and navy ink (the items below) so the field is the only animated thing and it reads on-brand. Keep the reduced-motion `StaticMeshGradient` path, but make it a calm still field, not a frozen one. This makes the generation moment the one place the panel intentionally loads the shader; update DESIGN.md:100 / the panel motion rules to permit it (Decision 2).
- **Glass blur cards.** `apps/extension/src/styles.css:1083, 3385` (`backdrop-filter: blur(10px)` on `.cs-live-card-refined`). DESIGN.md: "No glass." Use an opaque `--color-plate` fill with a 1px `--color-rule` border.
- **Dark glossy gradient primary button + radial seal glow + glass insets.** `apps/extension/src/styles.css:447-486` (`.cs-start-primary`, near-black `linear-gradient(180deg,#1d1f21,#070809)`, a `radial-gradient` seal glow `::before`, glass-sweep `::after`, five stacked shadows). Violates no-dark-mode, no-glow, no-glass, no-pill-chrome, and the shadow ceiling. Make it flat: `background: var(--color-ink)`, `color: var(--color-plate)`, `border-radius: 6px`, 1px rule, at most one shallow shadow `0 6px 18px rgb(23 26 31 / 0.08)`, no glow/glass pseudo-elements.
- **Cool-navy ink and cool shadow color replacing warm parchment (systemic, ~76 spots).** Body and label text uses `rgb(8 25 44 / …)` (deep navy; `styles.css:3503, 3394`, and 20+ more); shadows use cool `rgb(2 8 18 / …)` (`:454, 980, 1085, 3387`). The bar's ink is warm: `--color-ink #171a1f` / `--cat-ink #20201e`; shadow color is `rgb(23 26 31 / …)`. Replace navy text with `var(--color-ink)` / `var(--cat-ink)` (or `--color-muted` for secondary) and the cool shadow color with `rgb(23 26 31 / …)`. This is the "SaaS blue-purple drift" tell.
- **Multi-hue category-tint icon chips.** `apps/extension/src/styles.css:661-683` (people sky-blue, signals non-seal purple, questions amber). DESIGN.md: one accent only; evidence color is reserved for verified/reported/company/conflict marks, not decorative category tints. Use a single neutral chip (`--color-plate` bg, `--cat-rule` border, `--cat-muted` icon), seal only for an active verb.
- **Decorative SVG icon grid on the intake.** `apps/extension/src/sidepanel.tsx:696-736` (`StartGenerationPanel`, four cards each with a decorative inline SVG). DESIGN.md bars "No icon grid" and "no decorative icons." Replace the glyphs with section markers (`01`–`04`) and class/seal marks; keep the "pile waiting to be filed" metaphor.
- **Shadows beyond the ceiling and seal-colored glows.** `apps/extension/src/styles.css:980 (0 14px 30px), 1085 (0 14px 34px), 3387 (0 18px 38px), 1310 (0 10px 34px)`, plus seal glows `0 8px 18px rgb(110 92 158 / 0.14)` at `1233, 1258`. Cap any module shadow at `0 6px 18px rgb(23 26 31 / 0.08)`; remove colored glow shadows.
- **Pill chrome and wide all-caps mono labels.** Progress track/fill/cursor as `999px` pills with seal gradient + glow (`styles.css:1198, 1226, 1254`); seal-tinted source chips (`:2122`); `--font-mono` labels at `letter-spacing: 0.22em` (`:3391-3398`) and uppercase `0.14em` (`:3336-3343`). DESIGN.md: no pill chrome, avoid wide all-caps section styling, At Textual is for numerics not status banners. Render progress as a 2px rule with a seal-filled segment; use sentence-case `--font-body` small labels at `--cat-muted`; reserve At Textual for call numbers and indices. Leave the legitimate circular dots (5px/14px where `999px` means 50%) alone.
- **Cool blue-gray rule tints.** `apps/extension/src/styles.css:58, 732, 967, 1078` (`rgb(169 195 199 / …)` etc.). Swap to `var(--cat-rule)` / `var(--color-rule)`.
- **Border radius over the 8px cap.** `apps/extension/src/styles.css:128, 189, 353, 974` (10px) and `:649, 739, 1079, 2672, 5000, 5025` (9px). Clamp to 6px primary / 4px compact.
- **Hardcoded seal hex and one-off grays.** `styles.css:3483, 3495` (`#6e5c9e` should be `var(--color-seal)`); `:345, 396, 412, 422, 567, 721` (cool one-off grays should map to `--color-muted` / `--color-ink`).
- **Cleanup:** dead `@keyframes cs-spin` (`styles.css:3004-3008`, zero consumers) in a no-spinners codebase; the ~360-line dead `cs-app-*` block in `tokens.css:678-1039`.

### 1B. Fake progress (BLOCKS-BAR)

- **Timer-driven stage tree.** `apps/extension/src/sidepanel.tsx:472-477` computes `estimatedStageIndex` from wall-clock, so the build tree climbs through "Finding sources → Reading evidence → Building the profile" on a timer regardless of the run. DESIGN.md Loading State: real verbs from generation events, no fake progress. Hold at the last event-derived stage (`generationStageIndexFromEvents`) and show a static "Researching" until the next real event. Keep the honest elapsed timer (`Run · 0:14`).

### 1C. Motion life (BLOCKS-BAR)

This is where the elegant/snappy/fun lives. The springs are the issue, not the architecture; the team already has correctly-tuned springs in the repo to copy.

- **Overdamped workhorse springs (the sterile feel).** `apps/extension/src/motion-primitives.ts:15` `snapSpring` is stiffness 620 / damping 54 / mass 0.56, ζ=1.45. `:22` `commitSpring` is 470 / 48 / 0.62, ζ=1.41. Both settle past critical: flat, slow-tailed, no follow-through. Pull damping toward or just under critical while keeping stiffness high so they still settle fast: `snapSpring` damping ≈ 32–37 (ζ≈0.85–1.0), `commitSpring` damping ≈ 29–34. The in-repo reference for "right" is the substep override at `SourcePassInstrument.tsx:147` (500 / 30 / 0.62, ζ=0.85) and the drag bounce at `ResearchLayerPanel.tsx:1024` (ζ=0.71). Tune to taste in that band. These two springs drive nearly all committed-UI motion, so this single change lifts the whole feel.
- **Generation → card handoff is a hard cut.** `apps/extension/src/sidepanel.tsx:1412-1452` is a chain of bare `if (status === …) return <Panel/>` with no `AnimatePresence`. The most important moment (research finishing, the card arriving) blinks. Wrap the panel switch in `AnimatePresence mode="wait"` with a short crossfade plus slight y, so the card arrives.
- **Rauno rubber-band defined but never wired.** `apps/extension/src/research-layer-motion.ts:36` `dampenDragOffset` has zero usages; the live drag uses `dragElastic={0.035}` (`ResearchLayerPanel.tsx:1023`), near-locked. Wire `dampenDragOffset` into the drag offset, or raise `dragElastic` to ~0.12–0.18 so the pile has tactile give at the edges.
- **Source arrival has no entrance (ELEVATION).** `ResearchLayerPanel.tsx:1212-1221` and `:933-945` render bare anchors. Sources filing in is a core "something happened" beat. Option: `AnimatePresence` with a staggered opacity+y reveal (stagger ~0.04s).

### 1D. Reduced-motion freeze defects (BLOCKS-BAR)

Every surface below zeroes motion instead of degrading to calm-but-alive. Each is what Samay currently sees. Degrade to a tasteful reduction, do not freeze. Keep the two already-correct patterns (`styles.css:5278` sheen → static highlight, `:5285` eye → centered) as the model.

1. **Expand/collapse body-frame.** `styles.css:3028` (`transition:none`) + `ResearchLayerPanel.tsx:1564,1581` (`duration:0`). Give an 80–120ms opacity + grid-rows fade.
2. **Running dot pulse / drizzle loader / plan-status mark.** `styles.css:5261-5266` (`animation:none`). Replace with an opacity-breathe (~0.55↔1 over ~1.6s); position stays still, life stays.
3. **Dormant pile cards.** `styles.css:5798-5804` + `ResearchLayerPanel.tsx:976,1008`. Allow a short opacity+small-y fade on enter/exit; keep rotations off (vestibular-safe).
4. **Layer commit enter / insertion slot / chevron.** `ResearchLayerPanel.tsx:1561,1564,1618,1581`. Keep a ~100ms fade.
5. **Intake entrance + button press + splash.** `sidepanel.tsx:584-598,630` (all gated off when reduced). Keep an opacity-only fade-in and a faint `whileTap` opacity dip.
6. **Web "shimmer".** `globals.css:667`; it never animated. Give it a real shimmer keyframe or rename.

---

## Block 2: Public card trust machinery

The two-zone layout, header stack, widths, and empty states are faithful. The gaps are in making source weight consistent and legible, and in the share artifact.

- **Inline classification dots encode confidence, not source class, and contradict the ledger (BLOCKS-BAR).** `packages/ui/src/CardShell.tsx:114-132` (`evidenceStateForFact` uses `fact.confidence`/`fact.status`) vs `packages/ui/src/SourceDrawer.tsx:9-21` (`sourceClassForCitation` uses `sourceQuality.tier`). The same citation can show green inline and amber in the ledger. Derive the inline dot from the highest-tier citation in `fact.citationIds` (resolve each id, reuse `sourceClassForCitation`). Keep `conflict` driven by `status === "mixed"`.
- **Inline citation tokens render raw evidence ids, not `[1]` (BLOCKS-BAR).** `packages/pipeline/src/evidence-ledger.ts:39` ids are `e${index+1}`; `packages/ui/src/CitationGroup.tsx:26-28` and `SourceDrawer.tsx:53` print `[{citation.id}]`, so the reader sees `[e1]`, `[c2]`, `[seed-3]`. DESIGN.md specifies `[1]`. Render a 1-based display index built from the same sorted citation order the ledger uses, and apply it to the inline marker, the ledger marker, and the scroll anchor (`sourceDomId`) so `[1]` still resolves.
- **Citation markers are uniformly reported-blue (BLOCKS-BAR).** `packages/ui/src/tokens.css:1351-1357` colors every `.cs-citation` `--color-reported`. Pass the resolved source class down so the marker is verified-green / reported-blue / company-amber from the cited source. Keep the seal-fill-on-hover.
- **No citation popover (BLOCKS-BAR).** `packages/ui/src/CitationMarker.tsx` / `CitationGroup.tsx` are anchor-only; `--shadow-popover` (`tokens.css:36`) is defined but unused. DESIGN.md: hover or focus reveals a compact popover with title, publisher, date, and class. Add a lightweight popover (CSS `:hover`/`:focus-within` with `--shadow-popover`, or the native Popover API). Minimum partial: a native `title`.
- **Small muted text fails WCAG AA (BLOCKS-BAR).** `--cat-muted #786F62` on `--cat-paper #F4EDDC` is 4.24:1, under the 4.5:1 floor, applied at 10.5–12px to `.cs-meta-line, .cs-key-label, .cs-footer-copy/.cs-footer-meta, .cs-card-callno-count, .cs-source-meta`. Darken `--cat-muted` to ~`#6B6256` (≈4.6:1) or reserve `#786F62` for ≥18px. `--color-company #9B6A1E` marks are 4.02:1 but used as small accents, lower priority, same direction.
- **OG share image is on the abandoned Signal Ledger palette and uses a banned left ribbon (BLOCKS-BAR).** `apps/web/src/app/c/[slug]/opengraph-image.tsx:18-33, 277`: mineral plate not parchment, the seal `#6e5c9e` never used, focus-yellow accents, a 12px green left ribbon (DESIGN.md kill list: "Left border ribbons → use status dots"), no filed stamp / call number / vetted stamp. This is the most-shared public surface. Re-skin to parchment, add the catalogue motifs, drop the ribbon for a classification-dot row, align fonts to the card.
- **Loading state is static; `.cs-loading-shimmer` never shimmers (ELEVATION).** `apps/web/src/app/c/[slug]/loading.tsx:16`, `globals.css:667`. Option: drive the stage list from streamed generation-status events and highlight the live row in `--color-focus`; give the title a real subtle shimmer. The static version is acceptable.
- **Sources render twice with no numeric linkage (ELEVATION).** `packages/ui/src/CardShell.tsx:784-791`: the rail uses `includeDomId=false`, so inline `[n]` only scrolls to the bottom ledger, and the top sources appear in both. Option: make the rail the single anchored ledger on desktop, or visually differentiate priority vs full.

---

## Block 3: Living-dossier honesty and the missing states

### 3A. Empty-as-resolved (BLOCKS-BAR)

DESIGN.md: `not found` is a successful state when true; do not style it as failure; the empty state tells the truth and stops.

- **"Evidence gap" label reframes a clean negative as a deficit.** `apps/extension/src/research-layer.ts:227-237` (empty branch) and `:555-569` (`customers` branch) emit both a clean body and `rows: [{ label: "Evidence gap", value: … }]`; in `ResearchLayerPanel.tsx:784` the `rows` branch wins, so the reader sees "Evidence gap: No named customer proof found yet." Drop the synthesized `rows` for empty states; let the plain `definition.emptyState` body show.
- **Card-derived layers invent per-call empty copy.** `research-layer.ts:561, 576, 594, 627, 642, 696, 711-716` write their own strings ("Comparables not yet available.", etc.), a second copy system that will drift from the section definitions. Route every empty branch through `RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].emptyState`.
- **Module dot is always evidence-green regardless of state.** `apps/extension/src/styles.css:5009-5015` (`.cs-active-dot::after` → `--color-verified`). The most semantically loaded color is spent as decoration; an empty or failed section wears the same green as a verified one. Encode the section's top source class, or make the resting dot neutral seal/ink and reserve green for sections carrying verified evidence.
- **Failed is indistinguishable from not-found.** `research-layer.ts:203-214`; no CSS exists for `data-state="failed"` or `"empty"`. A real failure renders as the neutral default with a green dot and a "Queue" retry. Give `failed` a quiet oxide/conflict mark distinct from resolved-empty.

### 3B. Module row anatomy (ELEVATION)

- DESIGN.md Research Module rows have four parts: Title / State / Evidence count / Last event. The head (`ResearchLayerPanel.tsx:1566-1586`, `statusCopy` at `:1514-1528`) overloads one slot, showing either the count or a state, never both, with no per-row last event. Separate the state token from the evidence count and surface a compact last-event line per module.

### 3C. The two missing perceived-speed states

- **Source receipt before a card (Task 1, ABSENT), the highest-impact elevation.** The plan's first useful moment is a sourced receipt shown before any card. Today the missing-card moment shows only the abstract build tree. `sources` is already on the bootstrap response; thread it into the `generating` RequestState (`sidepanel.tsx:67`) and render a compact receipt in `GenerationPanel` (source class mark, title, domain, in the Source Ledger language at panel density), with no extracted fact rows and no "complete" status. Confirm scope with Samay; this turns the wait into a readable dossier opening.
- **Stale-but-readable freshness mark (Task 3, ABSENT, violates a non-negotiable).** The 24h local cache (`apps/extension/src/card-cache.ts:5`) serves cards straight into `success` with no freshness signal; `card.cacheStatus` is never read in the extension. The plan requires "stale cards only when freshness is explicit." Read `card.cacheStatus === "stale"` (and/or cache age) and render a quiet filed-stamp freshness mark in the company-context header (1px rule, muted At Textual, ~10px, a stamp not an alert). When a refresh runs over a stale card, label it "refreshing" without blocking the read.

---

## Block 4: Voice and doc reconciliation

- **Public web research titles use long corporate labels (BLOCKS-BAR, DECIDED: short everywhere).** `packages/core/src/research-sections.ts:135,143,162,171,180` render long titles on the public card ("Buyer & Use Case", "Customer Proof", "Financing & Valuation", "Competitive Position", "Product & Technology"). The extension already uses the DESIGN-blessed short set in `apps/extension/src/research-layer.ts:61-71` (Who pays / Proof / Money / Comps / Product). Rename the public web titles to that short set and update INTENT.md's research-layer label list to match (Decision 4).
- **Editorial and marketing drift (ELEVATION).** `CardShell.tsx:539` "What the sources say first" reads editorial; `:800` footer stacks fragments; `sidepanel.tsx:626-627` intake tagline "Know X like a professional investor would" leans marketing; `sidepanel.tsx:605-623` scope-card labels ("Business", "Questions") diverge from the real layer taxonomy. Tighten to plain declarative investor voice; mirror the real layer groups on the scope cards.
- **Web loading verbs (P3).** `apps/web/src/app/c/[slug]/loading.tsx:19-21` "Render profile" is a UI verb; align to the extension's research verbs (`research-progress.ts:23-26`). The numbered `01/02/03` markers are fine.

### Resolved decisions (locked with Samay 2026-06-09)

1. **Motion doctrine rewrite: DO IT.** `DESIGN.md:160-165` still says "mechanical … no bounce," which produced the overdamped springs. Rewrite to snappy / elegant / characterful / grounded-physics; keep "no cartoon bounce," drop "mechanical."
2. **Progress moment: keep an animated field, retuned (not flat, not the current SaaS wash).** Re-skin the whole progress surface to the catalogue language AND keep the animated parchment-and-lilac field, de-slopped and calmed per Block 1A. Update DESIGN.md:100 / the panel motion rules to permit the panel to load this one retuned shader field during the generation moment; the resting panel stays flat.
3. **Web parchment shader: build it.** Implement `apps/web/src/app/CardTexture.tsx` as the documented near-static WebGL parchment island (add the `@paper-design/shaders-react` dependency), scoped to the public card surface, degrading flat under SSR / no-WebGL / reduced-motion with no layout shift. DESIGN.md:100 already describes the intended behavior; make the code match it.
4. **Labels: short everywhere.** Rename the public web research titles to the short set (Buyer & Use Case → Who pays, Customer Proof → Proof, Financing & Valuation → Money, Competitive Position → Comps, Product & Technology → Product) so both surfaces render `research-layer.ts:61-71`. Update INTENT.md's research-layer label list to the short set.
5. **State vocabulary: align code to docs.** Rename the code states (`needs-analysis` → `ready`, `populated` → `saved`, plus running / blocked / not found / empty / stale) in `research-layer.ts` and the UI status type so code matches DESIGN.md and the plan. This also fixes tone: `ready` frames a dormant section as resolved, not deficient.

---

## Done

- `npm run check` passes (lint, typecheck, test, build, golden dry-run, knip, secrets, guarded dep audit; the dep-audit advisory on `@opentelemetry` is pre-existing, treat clean-through-secrets as pass).
- `npm run qa:extension:ui -w @cold-start/extension` and `npm run qa:extension:smoke -w @cold-start/extension` pass.
- Rendered verification in BOTH motion modes: review every touched surface with macOS Reduce Motion OFF (the hero experience) AND ON (the tasteful fallback). No surface freezes under reduced-motion. Use `qa:extension:ui` screenshots and the deployed `/c/{slug}` for the public card.
- Public route response carries no `synthesis`; extension route still rejects missing auth.
- Extension rebuilt after any contract change.
- Samay signs off visually on Block 1 with Reduce Motion OFF before it is called done. The bar for sign-off is "this feels kept by someone with taste," not "the tests pass."
