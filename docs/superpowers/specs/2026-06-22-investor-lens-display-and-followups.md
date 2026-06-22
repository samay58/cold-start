# Investor-lens layers that never display, plus review follow-ups

Status: spec for a fresh session
Date: 2026-06-22
Origin: an adversarial review of the June 4 to 22 arc, then a clarification from the owner. The
review flagged that the extension generates `the_case` and `risks` research sections that the UI
never shows. The first instinct was to stop generating them. The owner's correction: "we should
display them, that is the whole point." So the goal is to make the investor-lens layers reliably
show their content, not to suppress generation.

This spec has one centerpiece (Part 1) and three smaller follow-ups (Parts 2 to 4) that came out of
the same review. Parts are independent commits. Everything stays behind `npm run check`, minus the
known pre-existing `audit:deps` undici advisory.

A warning to the implementer: the parent session was wrong twice about this exact subsystem during
the review (it called a replay-compat branch "dead" and called a tested Queue flow a "shadow
synthesis" bug). Both errors came from reasoning about the current code path while ignoring Inngest
cross-deploy replay and the display-gating logic. Treat the diagnosis below as well-evidenced but
not final. Confirm it against the running code before changing behavior.

---

## Part 1: Investor-lens layers never display their content

### What the owner sees
Some research-layer toggles in the extension side panel never show content. They sit at an "Activate
the investor lens ..." placeholder. The owner believes they are all investor-lens (analysis) layers.
That matches the code.

### The layers
`RESEARCH_LAYER_CARDS` in `apps/extension/src/research-layer.ts` has ten layers. Four carry
`source: "analysis"`; six carry `source: "card"`.

- `source: "analysis"`: `openQuestions` (Next question), `coreIdea` (Why care), `theCase` (The
  case), `marketStructureTiming` (Timing).
- `source: "card"`: `serves`, `customers`, `signals`, `investors`, `competition`, `mechanism`.

Each analysis layer maps to a gated research section via `sectionIdForLayer`:
`openQuestions -> risks`, `coreIdea -> why_it_matters`, `theCase -> the_case`,
`marketStructureTiming -> market` (see `RESEARCH_SECTION_DEFINITIONS` in
`packages/core/src/research-sections.ts`).

### How the analysis layers render (verified)
`layerDisplayForCard` in `research-layer.ts`:

1. If a stored section exists for the layer and the layer is NOT in `SYNTHESIS_LAYER_IDS` and it is
   not the `signals`-from-card case, render from the stored section (`displayFromSection`).
2. Otherwise fall through to per-layer branches that render from `card.synthesis`.

`SYNTHESIS_LAYER_IDS = new Set(["openQuestions", "theCase"])`. The comment there states the intent:
those two are cross-section syntheses with no per-section source, so they render from
`card.synthesis` only, never from a stored section.

Consequence, by layer:
- `coreIdea`, `marketStructureTiming`: section-backed. A `why_it_matters` or `market` section run
  produces a stored section that step 1 renders. They also fall back to `card.synthesis`
  (`whyItMatters`, `marketStructureAndTiming`) when no section exists. These display.
- `openQuestions`, `theCase`: synthesis-only. Step 1 is skipped for them by design, so a generated
  `risks` or `the_case` section is NEVER rendered. They display only when `card.synthesis` is
  present (its `openQuestions` and `bullCase`/`bearCase` fields).

So `card.synthesis` is the real content source for the investor-lens layers. The synthesis object
carries `whyItMatters`, `bullCase`, `bearCase`, `openQuestions`, and `marketStructureAndTiming`: one
synthesis run feeds all four analysis layers. This is the deliberate model from the section
consolidation (commit `6d09930`, "Consolidate research sections and rebuild open questions").

### Where synthesis is produced (verified)
`card.synthesis` is produced by the full card pipeline only when `mode === "analysis"` AND there is
no `requestedSectionId`. See `apps/web/src/inngest/functions.ts`: the `if (requestedSectionId)`
branch generates a single section and returns before synthesis; the synthesize/verify deps are
attached only on the full path (around line 811, gated on `mode === "analysis"`).

### The gap (strong evidence, confirm before acting)
The extension never triggers that full-analysis path. Its only generation starters
(`apps/extension/src/sidepanel-network.ts`):
- `startBasicsGenerationAndPoll`: `mode: basics`, no `sectionId`.
- `startSectionGenerationAndPoll` / `resumeSectionGenerationAndPoll`: always pass a `sectionId`, so
  `requestGeneration` always sends a section job. For a gated section the mode resolves to
  `analysis`, but a `sectionId` is always attached, so the worker takes the section branch and never
  runs synthesis.
- `resumeAnalysisWithController`: resumes an already-active analysis run reported by bootstrap. It
  does not start one. `shouldResumeAnalysisRun` only fires when bootstrap already shows an active
  analysis run.

The panel's only generation callback is `onRunSection(layerId)` (no `onRunAnalysis`/lens callback).
`activateLayer` (ResearchLayerPanel ~1465) calls it only when `!isSynthesisLayer(id)`, so dragging
or clicking `openQuestions`/`theCase` triggers nothing. The per-card action button
(ResearchLayerPanel ~1671) calls `onRunSection(id)` with no synthesis-layer guard, so clicking
"Queue" on `openQuestions`/`theCase` fires a `risks`/`the_case` section run. That run:
- spends LLM budget,
- stores a section the display logic never reads,
- does not produce `card.synthesis`, so the layer stays at the placeholder.

Net: there is no working gesture in the extension to produce synthesis, so the synthesis-only
layers can only display when synthesis was generated some other way (a cached prior run, a fixture
like `browserbaseCardWithSynthesis()` in the e2e tests, or a run started outside the current flow).
For a fresh card the toggles never populate, and the Queue button wastes money.

### Required diagnosis (do this first, do not skip)
Confirm or refute the gap before writing the fix. Specifically:
1. Search the whole repo for any path that requests `mode: analysis` with no `sectionId`, or that
   enqueues a `card/generate.requested` event with `mode: analysis` and no `sectionId`. The
   extension, the web app, any QA or script path. If one exists, the fix is to route activation to
   it, not to build it.
2. Confirm `bootstrap.runs.analysis` can only become active from a full-analysis (jobKind
   `analysis`) run, not from a gated section job (jobKind `section:*`). Read how the bootstrap route
   computes `runs.analysis` and how `findLatestGenerationRunStatusBySlug` keys runs.
3. Confirm in a real local run (or a trace) that a gated section job never writes `card.synthesis`.
4. Write down the precise answer to "what is the one gesture, today, that makes `card.synthesis`
   appear in the extension," with file and line references. If the honest answer is "none," that is
   the bug.

### Resolution
Two coherent options. Recommendation is B, but the diagnosis may shrink it.

Option A: section-back the synthesis layers. Remove `openQuestions`/`theCase` from
`SYNTHESIS_LAYER_IDS` (or add a section fallback) so a generated `risks`/`the_case` section renders
through `displayFromSection`, exactly like `coreIdea`/`market`. Smallest change, literally "display
what is generated." Cost: it reverses the consolidation. The content becomes a single per-section
run (one risks list, one the_case section) instead of the verified cross-section synthesis
(`bullCase`/`bearCase` capped and verifier-checked, `openQuestions` with its category taxonomy). It
also reintroduces the per-section question/case blocks the consolidation removed. Do not pick A
unless the diagnosis shows synthesis is genuinely unreachable and wiring it is out of scope.

Option B (recommended): wire a real investor-lens trigger. Add one path that requests `mode:
analysis` with no `sectionId`, polls it to completion, and lets `card.synthesis` populate all four
analysis layers, which already render from synthesis. Then:
- The lens activation gesture (a single "Run investor lens" control, or activating any analysis
  layer) fires the full analysis run, not a per-section run.
- Stop firing `risks`/`the_case` section runs from the panel. For `openQuestions`/`theCase` the
  per-section run is pure waste; remove that route. For `coreIdea`/`market`, decide whether the
  per-section run stays as an optional refinement or is also folded into the lens (the synthesis
  already carries `whyItMatters` and `marketStructureAndTiming`, so the lens alone can populate
  them; a per-section deep-dive run may still add value, so keep it only if it earns its place).
- The placeholder copy ("Activate the investor lens to ...") becomes accurate: there is now an
  activation that works.

Open UX decision for the implementer (decide explicitly, keep it inside the DESIGN.md Catalogue Card
language and the motion doctrine): is the lens one global control that populates all four analysis
layers at once, or does activating any single analysis layer start the lens? The existing vocabulary
(`canStartInvestorLens`, `hasInvestorLens`, the "Lens" action label on the dormant analysis card at
ResearchLayerPanel ~1092, the "Activate the investor lens" copy) leans toward one lens concept that
fills all four. Prefer that unless there is a reason not to.

### Constraints
- This is the investor-lens (analysis) surface, not First Read. First Read (the seed-window evidence
  slip) stays exactly as is: Evidence Receipt model, motion, substance gate.
- Visuals stay within DESIGN.md (the Catalogue Card). Motion stays within the established doctrine;
  the reviewer runs Reduce Motion ON at the OS level, so do not design to a frozen state.
- Public `/api/cards/{slug}` must never return synthesis. The lens runs through the extension-gated
  path only. Confirm the analysis request carries extension auth.
- The extension/web share a contract version (`packages/core/api-contract.json`). If the request or
  response shape changes (for example a new no-section analysis request shape), bump the version and
  rebuild the extension.
- `synthesis.bullCase`/`bearCase` stay 0 to 3 verified claims; `openQuestions` stays structured
  `{question, category}`. Do not reintroduce client-side category classifiers or per-section
  question blocks (the consolidation in `6d09930` removed them on purpose).
- The e2e test `apps/extension/tests/e2e/sidepanel-ui.spec.ts` currently asserts that Queueing the
  Open Questions layer fires `sectionId: risks`. That encodes the current broken behavior. It must
  be updated to assert the new behavior (a full analysis run, no `sectionId`, for synthesis layers).
  Update the unit tests in `apps/extension/tests/sidepanel.test.tsx` accordingly.

### Acceptance
- On a fresh card with no prior synthesis, there is a working gesture in the extension that produces
  `card.synthesis` and populates `openQuestions`, `theCase`, `coreIdea`, and `marketStructureTiming`
  so all four render real content.
- Activating a synthesis-only layer no longer fires a section run whose output is never displayed.
- No public route returns synthesis; the analysis request is extension-authed.
- Updated e2e and unit tests describe the new behavior. All gates clean.

---

## Part 2: Remove the discarded section-generation path for synthesis layers

This is the cleanup half of Part 1; land it with Part 1 or right after, once the lens works.

Today the panel can dispatch `risks` and `the_case` section jobs whose output the UI never reads.
Once Part 1 routes synthesis-layer activation to the lens, remove the dead route:
- Client: the action-button handler at ResearchLayerPanel ~1671 should not call `onRunSection` for
  synthesis layers (mirror the `!isSynthesisLayer(id)` guard already on `activateLayer` ~1465), or
  better, not render a per-section action for them at all.
- Server (defense in depth, optional but cheap): the comment at `research-sections.ts` ~210 claims
  `the_case` is "never generated." Make that true by rejecting `the_case` and `risks` as
  section-job ids at the dispatch boundary (`parseSectionId` in `apps/web/src/app/api/generate/
  route.ts` and `parseEventSectionId` in `functions.ts`). Keep the ids valid for storage and layer
  mapping; only block them as standalone section jobs. If you do this, fix or delete the stale
  comment, and confirm no remaining caller dispatches them.

Do not do Part 2's server rejection before Part 1 lands, or you will break the only current (if
broken) activation path before the replacement exists.

---

## Part 3: Collapse the db repository compatibility barrel (needs an explicit yes)

`packages/db/src/repository.ts` is a six-line `export *` over `repositories/*`. `index.ts` re-exports
it, and the package only exposes `.` (no `./repository` subpath), so the file is a redundant hop. The
only direct importer is `packages/db/tests/repository.test.ts`.

This is deferred, not decided, because CLAUDE.md and AGENTS.md both document it as "a compatibility
barrel over focused repository modules," so it is described as intended architecture. Removing it is
safe but requires updating both docs.

If approved: move the six `export *` lines into `index.ts`, delete `repository.ts`, repoint the one
test to `../src/index`, and update the two doc sentences. If not approved: leave it and drop this
part. Either way, do not delete documented architecture silently.

---

## Part 4: Unify the signal-category taxonomy

The literal `["news","hiring","launch","funding","filing","github","other"]` is hand-redefined in
several places: `packages/core/src/card.ts` (`signalSchema.category` enum), `packages/llm/src/
extraction.ts` (the tool JSON-schema enum), `packages/providers/src/stableenrich.ts` (a return-type
union), and `apps/extension/src/research-layer.ts` (a runtime `Set`). They must stay in lockstep by
hand; the extension `Set` is a runtime gate, so drift there silently drops valid categories.

Resolution: export `signalCategorySchema = z.enum([...])` and `type SignalCategory` from
`card.ts`, define `signalSchema.category` from it, and derive the other consumers from
`signalCategorySchema.options` (the extension `Set`, the stableenrich return type). The
`extraction.ts` JSON-schema enum is a wire contract for the model and can keep a literal, but build
it from `signalCategorySchema.options` so it cannot drift.

Do not touch `packages/core/src/signal-clusters.mjs`. It is intentionally plain dependency-free JS
shared verbatim with the eval scorer, and its `SPECIFIC_CATEGORIES` is a deliberate internal subset,
not the full enum. Verify the values are identical today before deriving, so this stays a pure
refactor.

---

## Out of scope and deliberately rejected

- Do not re-add the first-read provider lane (removed for cause, commit `77bc388`).
- Do not change source-quality tiering (`packages/core/src/source-quality.ts`).
- Cost-engine consolidation between `anthropic.ts` and `pricing.ts`: rejected. The Anthropic path
  models cache tiers the other does not, and the constraint is byte-identical Anthropic output. High
  care, low payoff. Skip unless cost telemetry is shown to be wrong.
- Citation-ref validator double-traversal micro-opt in `card.ts`: rejected. Negligible reward on the
  most invariant-critical function in the repo.
- Removing the per-call `params.model`: not cleanly possible. The SDK params type requires `model`,
  and the redundant field is harmless.
- Splitting `ResearchLayerPanel.tsx` (1843 lines): worthwhile but its own PR, not part of this spec.
  If undertaken, it is a pure move of the framework-free card-derivation helpers into a sibling
  module, no behavior change.

## Global policies (all parts)
- No em-dashes or AI-slop in any code, comment, commit message, or doc. Run
  `python3 ~/.claude/scripts/slopcheck.py <file>` on self-authored artifacts before delivery.
- Preserve `packages/core/src/card.ts` citation-ref invariants. If the citation schema changes,
  update extraction, pipeline, and UI together.
- Inngest `step.run` ids and `recordEvent` step ids are memoized by id; do not rename them.
- Verify each part independently: `npm run typecheck`, `npm test`, `npm run lint`, `npm run knip`,
  `npm run build`. Run `npm run check` at the end; the only acceptable failure is the pre-existing
  `audit:deps` undici advisory.
