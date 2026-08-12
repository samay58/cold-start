# Execute: Loading Screen Refinement

You are in `~/Projects/active/cold-start` on `main`. The approved design spec is `docs/superpowers/specs/2026-08-11-loading-screen-refinement-design.md`. Read it in full before touching anything. It is the contract. Samay approved every decision in it on 2026-08-11; do not re-litigate them.

At task start, invoke the `fable-judgment` and `fable-execution` skills. Before reporting any conclusion as done, invoke `fable-verification`. Talk to Samay in plain English: short full sentences, outcomes first, no process narration.

## The job

Six changes to the extension's profile loading screen (the building phase in `apps/extension/src/company/` and `src/research/`):

1. The featured carousel bubble loses its solid lilac top edge and gains a soft seal-toned glow (faint ring plus low wide shadow). Samay picks the final values from screenshots.
2. A new prose gate in `packages/core` keeps JSON, markup, code, and symbol junk out of bubble text. Both title and snippet pass through it. When nothing survives, the bubble shows favicon, domain, and type label only, and never takes the featured slot.
3. The Early read box (`ReadRegion.tsx`) is deleted from both the building surface and the profile, with its CSS and tests. Its two honesty states (entity unconfirmed, no accepted evidence) move into the header whisper (`whisperCopyFromEvents`).
4. The build tree (`SourcePassInstrument`) renders from the first frame. The compact ledger, the Details button, and the `research.details_toggled` analytics event are removed. The lazy import becomes direct.
5. Progress shows at all times: the active substep carries a constant quiet loader (animating under reduced motion too, calm variant), and `plan.ready` produces a visible state change in the tree (today `displayResearchEventMessage` returns null for it and no substep flips), so the up-to-32s pre-source hold reads as two movements.
6. Stage transitions stay event-driven. No wall-clock advancement, no fake timers, no skeleton bubbles.

## How to run it

1. Branch off `main` in the main checkout. Do not use a worktree; lint fails in worktrees in this repo. Check `ps` for a live Codex process sharing the tree before you start.
2. Invoke `superpowers:writing-plans` to turn the spec into an implementation plan, then execute it with strict TDD (`superpowers:test-driven-development`). Small commits, one concern each, repo commit style (short imperative, no scope prefixes beyond the existing convention).
3. Suggested build order (the plan may refine it): prose gate in core with fixtures, clipping-model wiring, early-read removal plus whisper lines, always-open tree, plan-ready visibility plus ambient loader, glow CSS last so the screenshot loop starts with everything else settled.

## Repo traps that will bite

- Prose-gate fixtures must be real offender snippets, not invented strings. Harvest them read-only from stored sources (local DB first; production needs `.env.production.migrate.local` and stays read-only). Add clean-prose counterexamples so the gate does not over-reject.
- Every color goes through theme tokens. `npm run audit:css -w @cold-start/extension` is chained into the extension test script and fails on raw color literals and dark border triplets that collapse onto the page ground. The glow must pass both themes.
- Samay's machine has Reduce Motion OFF. Full motion is the design target. But essential loading indicators must also animate under reduced motion, in a calm variant; a frozen loader under reduced motion is a bug.
- Any collection surface that can reach zero items needs that state explicitly designed and fixture-covered. For `AnimatePresence` exits, record what happens when the exiting element is the final item.
- Extension test setup uses `skipAnimations` and sync `AnimatePresence`; follow the existing test patterns in `apps/extension/tests/`.
- `ReadRegion` fires `markPerformance("cold-start-first-read-visible")`. Find every consumer (the UX benchmark scripts are the suspect) and retire or remap the marker deliberately. Do not drop it silently.
- Panel screenshots use the Playwright-spec harness (`qa:extension:ui` pattern); driving it through `tsx` breaks `addInitScript`. Archive dossier screenshots drift 1 to 2 px per run; discard those diffs.
- Run `npm run check` directly and read its exit code. Never pipe it through `tail`; the pipe eats the code.
- No API route shapes change here, so do not bump `packages/core/api-contract.json`.
- Inngest event names and step ids are frozen. Nothing in this job touches them; keep it that way.

## Human-in-the-loop gates (do not skip, do not self-substitute)

1. Screenshot loop: once the visuals build, capture the building phase (glow states, a slop-demoted bubble, the open tree, the empty pre-source window) and stop for Samay's review. He judges taste on real renders. Iterate until he passes it.
2. Live run: one end-to-end run on a fresh company from `docs/qa/fresh-test-queue-2026-08-02.md`, watched live. Three checks: no JSON text anywhere, no frozen seconds anywhere including the pre-source window, tree open from the first frame. Close the run out in `docs/qa/analysis-run-observations.md` with both system evidence and company insight, per that file's own rule.
3. Merge only on Samay's word. Present the branch with the diff summary and the evidence; he decides.

## Done means

Every spec section implemented and tested. `npm run check` green with the exit code read directly. Samay signed off on the screenshots. The live run passed all three checks and is logged. The branch is presented for merge. Nothing deployed without his word.
