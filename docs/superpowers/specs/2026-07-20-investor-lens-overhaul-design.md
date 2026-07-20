# Investor Lens Overhaul and Person Hovercard Craft Pass

Date: 2026-07-20. Status: approved design, pre-plan. Companion plan: `docs/superpowers/plans/2026-07-20-investor-lens-overhaul.md`.

## Goal

Make the analysis experience worth its wait and its price: no silent failures, a p50 under 60 seconds, a read that looks like a kept memo instead of a pasted wall, hovercards that are a pleasure to use, and a testing loop that makes all of it cheap to iterate.

The content pipeline is the asset and is not touched: investor-taste-kernel voice, verifier drops, citation discipline, and structured suppression all stay. Synthesis stays on Claude Sonnet. This overhaul fixes what surrounds the intelligence, not the intelligence.

## Evidence base

Six verification agents (four code verifiers, one read-only prod DB pass, one docs pass) re-validated the 2026-07-20 findings before any decision was made. What held, what changed:

- Silent gate confirmed exactly: 11 of 51 analysis runs in 60 days completed with no synthesis, all with `gateMessage: "insufficient evidence for synthesis"` and zero LLM calls. Repeat victims: timescaledb three times, aside and fanttik twice each. The gate's four diagnostic fields are computed, returned, and read by nothing. No DB field or UI state distinguishes a withheld run from a success.
- The claimed UI symptom was wrong. "Opens when the cited profile is filed" never shows on filed profiles (that fallback is unreachable dead code). What users actually see is `LensNotFiledCard` fed by a client heuristic that fires the identical "insufficient evidence" copy for unrelated run failures. The fix is server truth, not a copy edit.
- New correctness bug found during verification: 6 hours after the last card write, an analysis click 404s ("profile not found") while the profile is on screen. `findCardBySlug` returns null on any lapsed TTL, the null-check precedes `forceRefresh`, and the extension never sends `forceRefresh`. No recovery path exists. Related rot: `upsertCard` resets all three TTLs on every write, including `synthesisExpiresAt` on basics writes that carry no synthesis.
- Latency, properly scoped to `job_kind='analysis'` with repair-artifact rows filtered: p50 ~100s, p90 ~143s, max 203s. Decomposition (deepinfra, 87s): ~3s queue, ~32s source re-fetch, ~42s synthesis, ~7s verify, ~3s finalize. The people-discovery serial round is basics-only and async; it is not on the analysis critical path.
- The 13-probe re-fetch runs unconditionally even when extraction is fully reused. A 3-probe signals group (`exa_recent_signals`, `exa_customer_proof`, `exa_independent_analysis`) already exists in `stableenrichLateEnrichmentProbesByBlock`; it needs a caller, not an invention.
- Synthesis and verify run sequentially inside one Inngest step; a verify failure retries the whole step including a fresh synthesis call. Analysis emits only four meaningful progress events, with a ~50 second event dead zone spanning exactly the synthesis and verify window.
- `milestones.analysisReadyMs` exists on every genuine completion (51 of 53; the two gaps are repair artifacts) and no script aggregates it.
- Result surface confirmed as briefed, worse in places: effective CSS is a property-by-property composite across 9 unlayered files (final rules match no authored block), `theme-and-dark.css` applies mostly in light mode, `--font-mono` silently aliases to the serif stack, the lede renders at weight 480 not the authored 500, and `data-side` has no CSS consumer so bull and bear are visually identical.
- Hovercard occlusion mechanism confirmed: fixed tooltip at z-index 80 grows upward over sibling rows; the 160ms close-grace is canceled by the tooltip's own pointerenter; the covered row never receives events. Rendered rows are ~50px with 7px gaps. `SharedTooltip` has exactly 8 call sites including all lens overflow affordances, so tooltip mechanics are a shared workstream. A keyboard pin path already exists. The 20/20-green jsdom suite cannot see the bug; the one real-geometry Playwright test hovers only the first row.

## Decision record

Twelve decisions, grilled 2026-07-20, all resolved. Each entry: decision, then the rejected alternatives.

**Gate policy: withhold less, disclose more.** Only a citation floor hard-blocks synthesis (8+ citations and at least one non-enrichment source type). Source-type diversity, cited funding, and named team member become advisory: they run synthesis anyway and surface as visible evidence posture on the read ("news coverage only; no named team member cited"). The verifier remains the real quality gate. When the floor does block, the withheld state names exactly what is missing. Rejected: keeping all four hard blocks with honesty bolted on (leaves the 1-in-5 rate hostage to upstream repairs); never withholding (a read cited entirely from enrichment rows would damage trust).

**Re-click economics: free pre-check, paid retry explicit.** An analysis request against a card with a recorded withhold re-evaluates the gate server-side, instantly and free; if evidence is unchanged it returns the withheld state without queueing a run. Evidence is "unchanged" when the card row has not been updated since the withhold was recorded. A separate refresh-evidence-and-retry action queues a real paid run. Rejected: always re-running (repeat victims paid three times into the same wall); hard-blocking with no override (removes user agency).

**Stale TTL: refresh inside the run.** A stale profile plus an analysis click queues one analysis run that refreshes sources as part of the run it was already going to do. The 404 guard for existing-but-stale cards goes away. `upsertCard` stops resetting `synthesisExpiresAt` on writes that carry no synthesis. Rejected: an explicit two-step refresh (two waits for one intent); serving stale with a flag (defeats the freshness intent of the signals TTL).

**Source re-fetch: skip when fresh, targeted when stale.** Signals fresh (under 6h): no stableenrich re-fetch; the run reuses stored sources. Signals stale: the 3-probe signals group, not the 13-probe fan-out. Promotion is gated by the cost-quality playbook bar: 20+ comparable shadow runs with no drop in verifier-surviving claims or the two card-quality gates. One open verification item folds into the plan: confirm what freshly fetched sources actually contribute to synthesis input on the reuse path (extraction is skipped there; the answer sizes the risk of skipping). Rejected: targeted refresh always (pays on every run for freshness the TTL already guarantees); keeping the full fan-out (~32s and probe cost for demonstrably reused evidence).

**Latency bar: p50 at or under 60s, p90 at or under 90s, free wins only.** The levers are the re-fetch policy above, step decomposition, dispatch trim, and polling waste. Synthesis is untouched: same model, same full-card evidence, same max_tokens. A `measure-analysis-latency` script locks the baseline before any lever lands and proves each one after. Rejected: chasing sub-45s (requires surgery on the judgment stage this pass explicitly protects); no numeric bar (unfalsifiable "feels faster").

**Reveal: whole data, staged entrance.** The verified read lands complete, never claim-by-claim, and composes over roughly 500-700ms: headline, then cases, timing, next question, one spring-staggered sequence using the existing motion primitives. Under reduced motion the stagger collapses to opacity fades. Rejected: true progressive reveal (requires per-claim verifier restructuring and risks showing claims the verifier later kills); instant swap (throws away the one moment of earned theater).

**Waiting UX: same hand as the building arc.** The analysis wait reuses the instrument family users already know: the mesh progress field, a stage list driven by real events, and the clippings that already carry over. Splitting synthesis and verify into separate steps creates real events for the current 50-second dead zone. One new signature moment: the verifier stamping claims as they survive. Stage language follows the motion playbook (Queue, Gather, Read, File). Rejected: a bespoke analysis instrument (highest ceiling, most new work, two visual languages to maintain); minimal honest stages (fails "the wait must be worth watching").

**Reference library: before surface design.** Deep research runs first on three tracks: progress and waiting UX in agentic products, hovercard and popover craft (Linear, GitHub, Radix, floating-ui safe polygons), and high-density memo typography. Curated into a standing playbook that the result-surface and hovercard work cite. Licensed or scraped material stays gitignored per the motion-references convention. Rejected: parallel-as-needed (design decisions would predate the references they should inherit); skipping (the point is taste beyond what is already in the building).

**Result surface: memo, not ledger.** The lede becomes a display-face headline. Sections read as prose rhythm with marks as designed objects. Holds and breaks get real visual opposition. The 76px label rail goes away. Rejected: refining the ledger (keeps the spec-sheet anatomy that reads as a form, not a read); per-card decomposition per SPEC's nine-card model (a real future direction, explicitly deferred; this pass keeps one lens surface and notes the SPEC drift).

**Hovercard: docked dossier plus intent.** The person dossier docks in a fixed region below the people block, overlaying the content beneath rather than sibling rows, so every row stays hoverable while a dossier is open. Roughly 90ms open delay kills the fly-by strobe; the existing 140ms glide retargets between rows; click or Enter pins (extending the existing keyboard pin); the settled email contract is preserved. Plain-text tooltips and overflow chips keep popover behavior with the same intent upgrades; the shared primitive grows two placement modes. Rejected: smarter per-row popover (reduces occlusion, does not eliminate it); click-only inline expansion (kills the hover delight the ask names).

**Sequencing: correctness, then references, then result surface with CSS truth, then hovercards, then latency with waiting UX.** Slice 1 is the gate honesty batch plus the measurement harness. Slice 2 is the memo redesign plus one-source-of-truth CSS consolidation, which also unblocks the hovercard pass. Slice 3 is hovercards. Slice 4 is the latency levers woven with the waiting UX, since step decomposition feeds both. Rejected: hovercards first (small but does not unblock anything); latency first (optimizing a surface that is about to be redesigned).

**Test loop: regression net plus fixture gallery, no pixel gate yet.** Recorded event streams and prod-shaped cards (baseten's real synthesis among them) render every lens phase on demand with a screenshot per phase; the occlusion bug becomes a real-geometry Playwright regression; withheld and empty states get fixtures. Pixel-diff gating in `check` is deferred until the gallery proves its worth. Rejected: full harness with visual gate (heaviest investment before the surfaces stabilize); targeted tests only (leaves iteration as slow as it is today).

## Design by slice

### Slice 1: correctness and observability

Server truth for withholding. The gate's diagnostic fields persist into `traceJson.synthesis` (two verified edits: the trace-patch copy in `generate-card.ts` and the trace type in `generation-trace.ts`; the persisted schema is passthrough, no migration). The card itself records the withhold in gated card JSON (`synthesisWithheld`: reasons, timestamp), stripped from the public card exactly like synthesis. The extension renders an honest withheld card from that record: what ran, what is missing, what would change it, and the refresh-evidence-and-retry action. The current client heuristic and its conflation of withholding with failure are deleted. Gate policy changes land here too: floor stays hard, three conditions demote to advisory posture carried on the read.

Route behavior. Free pre-check on analysis requests against a recorded withhold with an unchanged card. Stale-card analysis queues a refresh-in-run instead of 404ing. TTL reset semantics fixed in `upsertCard`.

Observability. `measure-analysis-latency` script: percentiles and per-step decomposition over recent real traffic, keyed on `analysisReadyMs` and `research_run_events`, filtering repair-artifact rows (empty steps, missing synthesis trace). Baseline locked before any latency lever lands.

Upstream investigations, diagnose-then-fix-or-file: why moonshot's 43 accepted sources collapsed to 19-of-20 news citations (extraction or citation-mapping), and why generaltranslation extracted zero named founders. Small fixes land in slice; larger ones become filed follow-ups with the diagnosis attached.

Contract: one bump covers the withheld payload and any route-shape change in this slice; deployed extension rebuild follows.

Done when: the 11 known slugs re-run into either a read or an honest withheld card naming real missing evidence; a gate-withheld run is distinguishable in the DB and the UI from a success and from a failure; re-click on unchanged evidence costs nothing; the stale-TTL 404 is unreachable; the latency baseline report exists; `npm run check` green.

### Slice 1.5: reference library

Deep-research pass, three tracks, curated into `docs/product/gold-standard-references.md` with raw material gitignored. Done when: the playbook exists with per-track findings and named patterns to adopt or reject, and slices 2 through 4 cite it.

### Slice 2: result surface and CSS truth

The memo. Layout per the approved sketch: headline lede in the extension display face, "The case" as opposed holds/breaks blocks with distinct marks (filled square for holds; the conflict-class slashed square for breaks, per the DESIGN mark table), timing and next question as reading lines, receipt-face footer. A documented type scale with named roles replaces the eight accidental sizes; `data-side` finally gets consumed. Postures render as designed objects, not parenthetical text. "+N more" overflow becomes progressive disclosure inside the card. Empty sections stay honest per the research-module contract ("not found is a successful state").

Motion. The trigger-running-result swap gets AnimatePresence with the staged entrance; reduced motion gets fades, never a freeze.

CSS truth. One source of truth per selector for every lens-card and people-row rule: either the `@layer` system already declared in `foundation.css` gets adopted for real, or the duplicated blocks collapse into their owning seam partial; the plan picks per file. The `--font-mono` serif alias is renamed or retargeted so no rule lies about its face. `theme-and-dark.css` shrinks to actual dark-mode scoping. `audit:css` stays green throughout.

Harness (lands first, as the iteration tool): fixture-driven rendering of every lens phase (trigger states, running with a recorded event stream, withheld, read with full and sparse synthesis, empty cases) with a screenshot per phase via `qa:extension:ui`.

Done when: gallery screenshots of every phase pass review (Reduce Motion OFF when reviewing); the type scale is documented; no lens-card selector is declared in more than one file; `check` green including the CSS audit.

### Slice 3: person hovercards

Mechanics. The dossier docks below the people block in a fixed region (one shallow shadow, per the DESIGN elevation allowance), never covering sibling rows. Open delay ~90ms; close grace preserved for travel into the dock; glide retargets between rows; click/Enter pin parity; Escape and blur behavior unchanged. The shared primitive gains a `docked` placement mode; the other 7 call sites keep popover mode with the same intent upgrades.

Craft. Content hierarchy: identity line, read, email (settled contract: one email, observed over inferred, click-to-copy, basis line only for inferred), channels. A size budget replaces the floor-only cap. "+N more" expansion animates measured height instead of jumping.

Tests. Real-geometry Playwright: hover row 3 then row 1 and assert row 1's dossier opens (the occlusion regression); assert the dock never overlaps the people rows; smoke the other call sites; reduced-motion pass; Firefox parity check.

Done when: the occlusion regression is green in CI and fails on the old code; all 8 call sites verified; review pass on the dossier reading hierarchy.

### Slice 4: latency levers and waiting UX

Levers, each with its cost delta stated against the four trace cost streams: skip re-fetch when fresh (saves ~30s and the stableenrich probe spend per run), targeted 3-probe refresh when stale (saves ~20s versus full), synthesis/verify step decomposition (verify retries stop repeating a ~42s Sonnet call; new step ids noted as a durable-execution risk below), dispatch trim if the baseline shows queue overhead worth chasing, and polling waste (analysis branch fetches the card body only on card-saved or complete events instead of every tick). The re-fetch levers ship behind a flag and promote only past the playbook's shadow bar.

Waiting UX. Real events for every beat: existing four plus synthesize-started and verify-started from the step split, and a claims-surviving beat if cheap. The wait renders the mesh field, the stage list on real events, clippings, and the verifier stamp moment. No dead air longer than a stage.

Done when: `measure-analysis-latency` shows p50 at or under 60s and p90 at or under 90s over two weeks of real traffic; shadow comparison shows no quality regression; the wait surface never shows a stageless gap; `check` green.

## Constraints carried from doctrine

- Synthesis and person reads never reach the public card path; the withheld record is stripped with them.
- Every synthesis sentence resolves to a citation; the verifier's verdict is final; empty sections are honest states.
- Synthesis stays on Claude Sonnet; no routing or quality-gate change without the 20-run shadow bar.
- Catalogue Card language: At Umami display in the extension, IBM Plex Sans body, At Textual receipt accents, one lilac seal accent, light-first, no pervasive mono, 6px radii, marks not washes.
- Motion: acknowledgment under 120ms, transitions 160-260ms, one signature progress loop; reduced motion is a reduction, never a freeze; essential loading indicators still animate.
- Contract bumps for route-shape changes, extension rebuild on bump, Firefox parity on every panel change, `npm run check` green as the bar, Neon HTTP write discipline (batch or CAS, no interactive transactions).
- SPEC.md updates in the same branch as any gating or mode behavior change (the gate policy change qualifies).
- No em-dashes in any generated copy; slop kill list applies to all UI copy.

## Risks

- Withheld copy reading as failure. It must read as a finding ("public evidence is thin here, and here is why") in the product's own voice. Copy goes through review with the fixtures.
- Skipping re-fetch could erode signal freshness in reads. Bounded by the 6h TTL and the shadow bar; the reuse-path verification item sizes the real exposure before the lever ships.
- New Inngest step ids from the synthesis/verify split alter durable-execution identity for in-flight runs at deploy time. Mitigation: deploy in a quiet window; analysis runs are short; `repair:stuck-runs` covers stragglers.
- The docked dossier overlays the research deck; z-index and scroll interactions need explicit fixtures so pinning a dossier never traps deck interactions.
- CSS consolidation has broad blast radius across 9 files. The fixture gallery plus `audit:css` plus per-phase screenshots are the net; consolidation lands selector-family by selector-family, not as one sweep.
- Gate relaxation could let a thin read through on a company where news-only coverage is genuinely insufficient. The advisory posture line plus verifier discipline bound this; the slice-1 gate study over the 11 known cases validates the floor before the policy flips.

## Out of scope

Per-card research activation (SPEC's nine-card model), any synthesis prompt or model change, public web card changes, contact enrichment behavior, and the basics arc except where shared primitives (tooltip, CSS truth) touch it.
