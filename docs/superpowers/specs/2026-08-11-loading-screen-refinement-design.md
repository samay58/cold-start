# Loading Screen Refinement

> Superseded in one respect on 2026-08-23: the boxed Early read remains deleted, but a strictly gated, source-linked sentence may appear between the clippings and build tree. `DESIGN.md` is the current visual rule.

Design spec, approved by Samay 2026-08-11. Scope: the extension's building phase (the profile loading screen) in `apps/extension/src/company/` and `src/research/`. Six changes. No server changes, no web card changes, no analysis-wait changes.

## Why

Three complaints from live use, one standing requirement.

1. The featured carousel bubble carries a solid lilac top edge. It reads as an accent ribbon, which this codebase has already removed everywhere else.
2. Bubble preview text sometimes renders raw JSON or markup. Exa snippets are the known offender. Nothing checks that the text is prose before it renders.
3. The Early read box adds nothing now that the carousel exists. It restates the carousel in drier words, then the profile lands and says it better.
4. Standing requirement: at every visible moment of the building phase, something must show real progress. The screen must never look frozen.

## 1. Featured bubble: edge out, glow in

Current: the featured carousel bubble gets a lilac-tinted outline plus a solid lilac top edge (`company-arc.css:1195`, `.cs-clipping[data-active="true"] .cs-clipping-link`).

Change: remove the solid top edge. Replace the treatment with a soft seal-toned glow: a faint ring plus a low, wide shadow in the seal tone. The featured bubble should read as lit, not labeled. Opacity and scale stagger against the queued bubbles stays as is.

Constraints:

- All color through theme tokens. `npm run audit:css -w @cold-start/extension` must pass, both themes.
- Exact glow values are tuned in the screenshot loop (section 6), not settled in code review. Samay judges on real renders.

## 2. Prose gate on bubble text

Current: a bubble's note is the source title when `clippingHasUsefulTitle` passes, else the first sentence of the source snippet (`clipping-model.ts`, `clippingNote`). No prose check exists on either path. A JSON snippet renders as JSON.

Change: add a prose gate in `packages/core` (near the other shared text heuristics; `sentences.ts` and `headline.ts` are the pattern). One function that answers: is this string readable prose? It rejects JSON, HTML or XML markup, code, key-value runs, URL-encoded blobs, and strings that are mostly symbols. Bias toward rejection. A domain-only bubble is never embarrassing. JSON in a bubble always is.

Both the title and the snippet pass through the gate before `clippingNote` may use them. When nothing survives:

- The bubble renders favicon, domain, and type label only (the existing note-less rendering).
- `clippingHasUsefulTitle` stays false for it, so it never takes the featured slot. That demotion machinery already exists; the gate feeds it.

The gate lives in core because it serves any surface that renders source text. It is not re-implemented per surface.

Fixtures: real stored Exa snippets that exhibit the bug, pulled from production sources, not invented strings. Plus clean-prose counterexamples so the gate does not over-reject.

Follow-on, out of scope: sanitizing snippets server-side at event emission. It touches the API contract and every consumer.

## 3. Early read: removed

Current: `ReadRegion.tsx` renders a boxed slip on both the building surface (receipt, withheld, and substantive states) and the profile (substantive only). The comment in the file calls it the lilac-seamed slip.

Change: delete the component from both surfaces, with its CSS (`company-arc.css` read-region and early-read rules) and its test file (`read-region.test.tsx`). The carousel is the payoff during the wait; the header summary and expanded description carry it on the profile.

Two states migrate into the header whisper (`whisperCopyFromEvents` in `research-progress.ts`) as plain text lines:

- Entity check: while first-payoff events report the entity match is unconfirmed, the whisper reads along the lines of "Confirming this is the right company".
- No evidence: when a receipt or withheld event reports no accepted evidence, the whisper carries that honestly instead of a generic building line.

Exact copy is settled in the plan. Both lines trigger from the first-payoff events already on the run trail. No new events.

What stays: everything below the surface. `first-payoff.ts` logic, `first-payoff-events.ts`, and the `earlyReadState` filing decision in `company-display.ts` are untouched. The building-to-profile flip does not change.

Loose end for the plan: `ReadRegion` fires `markPerformance("cold-start-first-read-visible")`. Find its consumers (UX benchmark is the suspect) and retire or remap the marker deliberately. Do not drop it silently.

## 4. Build tree always open

Current: `ResearchTrail.tsx` shows a compact four-stage ledger (Find, Read, Build, File) plus a Details button. The full `SourcePassInstrument` tree replaces the ledger when toggled or on attention. The tree is lazy-loaded to keep its chunk out of first paint.

Change: the tree renders from the first frame of the building phase, always. The compact ledger, the Details button, the `detailsOpen` state, and the `research.details_toggled` analytics event are all removed. The lazy import becomes a direct import; the code split existed only because the tree hid behind a toggle, and a Suspense gap on an always-visible surface would violate the never-frozen rule.

The four-stage identity survives inside the tree, which already renders stage markers and labels.

## 5. Progress at all times

Two rules, one gap.

Rule 1, unchanged: every stage transition comes from a real run event. No wall-clock stage advancement, no fake timers. This doctrine already governs the seal and the ledger and it stays.

Rule 2, new: at every visible moment, at least one element is animating. The active substep in the tree carries a constant quiet loader. It animates under reduced motion too, in the calm variant, per the repo's standing rule that essential loading indicators always animate.

The gap: runs can hold up to about 32 seconds between start and the first source event (QA attack list item 1). On this surface the whisper and seal already move at plan-ready, but the details tree renders nothing for it: `displayResearchEventMessage` returns null for `plan.ready`, and no substep flips. Change: plan-ready produces a visible state change in the tree. A Find substep flips to done and the stage note advances. The pre-source window then shows two movements (started to plan-ready, plan-ready to first source) instead of one frozen stage.

Carousel empty state: before the first clipping, the carousel region shows only a thin rule. With the tree always open below it, the tree carries the visible progress for that window. No skeleton bubbles; fake content is off-brand.

## 6. Testing loop

Unit:

- Prose gate: real slop fixtures plus clean counterexamples, in `packages/core` tests.
- `clipping-model` tests: junk title, junk snippet, both-junk demotion to domain-plus-type.
- `ResearchTrail` tests: tree renders immediately, no toggle, ledger gone.
- Whisper tests: the two migrated honesty lines fire on the right events.
- Assembly and arc tests updated for the removed Early read region.
- Removed: `read-region.test.tsx`.

Visual, iterate until taste-passed:

- Build, capture the building phase with the existing Playwright harness (`qa:extension:ui` mounts the panel; the gallery specs are the screenshot pattern).
- Samay reviews the glow, the slop-demoted bubbles, and the open tree on real renders. Repeat.
- Known harness quirk: archive dossier screenshots drift 1 to 2 px per run; discard those diffs.

Live, once visuals pass:

- One end-to-end run on a fresh company from the QA queue (`docs/qa/fresh-test-queue-2026-08-02.md`), watched on the real screen. Three checks: no JSON text anywhere, no frozen seconds anywhere including the pre-source window, tree open from the start.

Gate:

- `npm run check` green, exit code read directly, never through a pipe.

## Out of scope

- New server events or any pipeline change.
- Server-side snippet sanitizing (noted follow-on).
- The web card face and landing page.
- The analysis wait instrument (`AnalysisWaitInstrument.tsx`); it is a different surface with its own five-stage plan.

## Decision record

- Ribbon: kill the solid lilac top edge. A tasteful glow is welcome. (Samay, 2026-08-11)
- Early read: kill the box everywhere, keep the two honesty lines in the whisper. (Samay)
- Slop bubbles: domain plus type only, never featured. (Samay)
- Dead seconds: stage split plus ambient motion, extension-side only. (Samay)
