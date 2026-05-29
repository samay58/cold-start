# Fugu Card Wedge: "The Read" (Deep Read)

Date: 2026-05-29
Status: exploration. No code yet. This picks the product wedge before any implementation lands.
Predecessor: `docs/product/slow-work/2026-05-27-sakana-fugu-cold-start-evaluation.md` (workflow-fit framing and shadow-eval recommendation).

> **ACCESS DEADLINE: June 7, 2026.** Fugu access (both `fugu-mini` and `fugu-ultra`, via the Sakana beta API at `https://api.sakana.ai/v1/responses`, key `SAKANA_API_KEY`) ends **June 7, 2026**. After that date we can no longer call either model. The beta quota is free and expiring; as of 2026-05-29 it is **~11% used**. Decision (2026-05-29): use both models hard before the cutoff to form our own independent perspective on their value, not Sakana's benchmark claims. Both models are in scope. The priority before June 7 is a high-volume, structured comparison that produces durable artifacts, not the ship decision.

## TL;DR

Ship one new extension-only, gated research card called **Deep Read** that productizes the existing top-truths eval: a ranked set of the few truths that actually matter, the tempting claims we deliberately did not file, and the single hardest conflict in the evidence. Run it with **fugu-ultra**, asynchronously, opt-in, behind an env flag. Test fugu-mini and the Sonnet baseline alongside it on identical frozen bundles; before June 7 both Fugu models are in active test scope, with ultra as the production-default candidate. The card's job is to convert "signal" into "proof" by testing Fugu's orchestration on the messy, high-conflict companies where orchestration should pay, measured against baseline on frozen evidence bundles.

Test both models hard before the June 7 cutoff. The two answer different questions: `fugu-ultra` tests whether orchestration beats a single pass, and `fugu-mini` tests whether Sakana's fast model is competitive with Sonnet at a fraction of the latency. Both are worth an independent answer, and we lose the ability to get one after June 7. The product wedge below (The Read) is the vehicle for the comparison; the comparison itself, run at volume against frozen bundles, is the deadline-driven priority.

## What the eval actually shows (the load-bearing evidence)

From the latest three-way run on the frozen Browserbase bundle (`eval/fugu-top-truths/runs/2026-05-28T02-59-01-209Z-browserbase/`):

| Model | Score | Keep | Latency | Total tokens | Reasoning tokens | Input cached |
|---|---:|---|---:|---:|---:|---:|
| baseline (Sonnet 4.6) | 13/15 | yes | 54.7s | 5,261 | 0 | no |
| fugu-mini | 14/15 | conditional | 28.5s | 5,835 | 0 | 3,092 |
| fugu-ultra | 14/15 | conditional | 203.2s | 58,754 | 50,725 | 0 |

Three facts drive every decision below:

1. **fugu-mini does not orchestrate.** `reasoning_tokens: 0`, input cached, 28s. On this task mini is a fast, ordinary single-pass model that happens to be competitive with Sonnet. Useful, but it is not the multi-pass reasoner the Trinity/Conductor lineage is about.
2. **fugu-ultra orchestrates hard.** 50,725 hidden reasoning tokens, 203s, roughly 10x the visible token cost. That is the orchestration claim made literal.
3. **On this fixture, the orchestration bought nothing.** Ultra (14) did not beat mini (14) and barely edged baseline (13). And the higher raw score came with a discipline regression: both Fugu runs left some `evidenceWeakOrConflicted` fields empty (the `-` rows), which is why they scored 14 but landed `keep: conditional`, while baseline filled every field and earned `keep: yes`.

The honest read: the 3k-character, 10-source fixture is too small to reward orchestration. "Baseline isn't enough" is currently unproven. That is not a reason to drop Fugu; it is the reason the card exists. We need a production surface that runs ultra on inputs large and contradictory enough to separate orchestration from a single good pass, and a measurement rig that can tell the difference from retrieval noise.

A second, quieter finding matters just as much (see Failure States): the eval's 15-point rubric scores output *structure*, not *citation integrity*. `score.mjs` only checks that `sourceIds` is non-empty. It never checks that a citation resolves or that the source supports the claim. So "14/15" says nothing about whether the card is safe to show an investor.

## Part 1. Candidate Fugu-native card concepts

All three are extension-only and gated. Each is judged against the spine the product and the brief impose: it must be **measurable against baseline without retrieval-variance confounds**, must **not duplicate Why care / Timing / Next question**, and must **hold citation discipline**.

### Candidate A. The Read (Top Truths) — RECOMMENDED

**What it is.** The ranked few-things-that-matter view of the whole evidence pack: 3 to 5 truths in importance order, each with why it ranks there and where it is strong vs thin; the tempting claims we excluded and why; and the single hardest conflict with a working resolution or an explicit abstention.

**Why Fugu is uniquely suited.** This is pure ranking, exclusion, and conflict resolution under noisy, uneven evidence. It is the exact task the repo already chose as "the single Cold Start question that best tests Fugu's orchestration claim" (eval README). Ultra's multi-pass planner/worker/verifier shape should help most precisely when sources disagree and importance is contested, which is where a single forward pass tends to flatten or pad.

**Why baseline is not enough.** Two reasons. First, the empirical one is unproven on small inputs but testable on hard ones, and we already own the harness to test it. Second, the structural one: the current synthesis is narrative (why it matters, bull, bear, timing, questions). It never explicitly ranks facts by importance, never shows its exclusions, and never isolates one decisive conflict. Baseline Sonnet can be asked to do this, and the card's whole point is to measure whether orchestration does it *better* on the inputs that should reward it.

**Measurability.** Maps 1:1 onto the existing prompt, scorer, frozen-bundle protocol, and the baseline run we already have. This is the deciding advantage.

### Candidate B. Contradiction Ledger (Conflict Adjudication)

**What it is.** A focused trust surface: for each material cross-source contradiction (the $128.5M enrichment total vs the ~$67.5M sum of disclosed rounds; the $21M vs $27M Series A), show what each source claims, weigh them by authority and recency, then pick a winner or abstain and say why.

**Why Fugu is suited.** Multi-pass cross-source reconciliation and decisive abstention. In the eval this is the dimension where ultra looked most distinctive ("Discard the uncorroborated $128.5M total entirely. Anchor only to documented rounds").

**Why baseline is not enough.** Single-pass models drift toward false certainty or quietly average contradictory numbers. The product already forbids that ("Conflicts should become `mixed`, not averaged away").

**Why not recommended.** It needs a new scorer and throws away the baseline we already ran, which trades measurability for conceptual tidiness in exactly the wrong direction given how hard the brief leaned on "bounded, inspectable, measurable." And it is a strict subset of Candidate A: top-truths already contains the hardest-conflict and excluded-claims surfaces. So adjudication should be the sharpest *component* of The Read, not a competing card.

### Candidate C. Operator Deep Read (full-pack narrative synthesis)

**What it is.** Ultra reads the entire evidence pack and writes an operator-grade prose read of the company.

**Why Fugu is suited.** Maximal use of long context plus orchestration.

**Why baseline is not enough.** Unclear, and that is the problem. Narrative quality is subjective. The predecessor doc explicitly lists "any experiment where the only metric is 'felt smarter'" under What Not To Test First. Highest cost, least bounded, least measurable. It fails the spine. Rejected.

## Part 2. Recommendation

**Build Candidate A, "The Read," surfaced as a card called Deep Read.** Fold Candidate B's adjudication in as its centerpiece (the hardest-conflict block). Reject Candidate C as unmeasurable.

Run it on **fugu-ultra** by default, async and opt-in, with the model selectable by env var so we can A/B ultra vs mini vs baseline and roll back without a redeploy. Ultra is the right default because the orchestration is the point of the experiment; the async architecture makes its 203s latency tolerable; and a clear kill criterion protects us if the lift never shows.

## Part 3. Product spec for Deep Read

**User job.** "Before I forward this card or take this call, tell me the few things that are actually true and load-bearing here, the tempting claims I should not repeat, and the one conflict in the evidence I have to resolve myself." It is the can-I-trust-and-act-on-this pass that sits on top of everything else the card knows.

**Output shape.** A new optional typed block on the section content, mirroring how `napkinMath` hangs off the market section:

```
topTruths: {
  truths: Array<{
    rank: number;              // 1..5, no ties
    truth: string;             // the claim, citation markers stripped for display
    whyRanked: string;         // one tight line
    strength: "strong" | "mixed" | "thin";
    citationIds: string[];     // resolve into card.citations[]
  }>;                          // 3..5 after verification and ref-drops
  excludedClaims: Array<{
    claim: string;
    whyExcluded: string;
    citationIds: string[];     // the sources that tempt the claim
  }>;                          // 0..n
  hardestConflict: {
    conflict: string;
    whyHard: string;
    workingResolution: string; // abstention is a valid, desired resolution
    citationIds: string[];
  } | null;
  confidence: "high" | "medium" | "low";
}
```

The block also degrades into the generic `items[]` shape (one item per truth) so the existing renderer shows something sane if the panel has not been taught the rich layout yet.

**Citations.** Same discipline as synthesis, enforced manually because Fugu is not Anthropic tool-use (see Part 5). The model may cite only citationIds already present on the card. Every ref is checked with `researchSectionCitationIssues`; unresolved refs are dropped (the pattern from commit `a9d8f76`); a truth that loses all refs is dropped; surviving claims run through the existing `verify` dependency; if fewer than two truths survive, the section returns `empty` with an honest gap rather than a thin card.

**Latency target.** Background, not inline. Budget ultra at p95 ~240s with a hard 240s client timeout (the eval used 300s; tighten for production). The extension shows the `running` state and polls, exactly as it already does for analysis sections. Mini fallback completes in ~30s.

**Cost expectations.** Ultra spent ~59k total tokens on a tiny fixture, of which ~50k were reasoning tokens, all billable. Larger evidence packs will push higher. Treat Sakana beta pricing as unknown and log it as unknown (the harness already does). Guardrails: cache 24h like synthesis; run only on explicit opt-in, never on every card; enforce a per-card token ceiling and a daily run cap, mirroring the wallet-floor and rate-cap pattern already in SPEC. Assume Deep Read is the most expensive single thing the product can do, and price it that way.

**Failure states.** The trust gauntlet is the heart of this card, because a non-Anthropic model is writing investor-facing cited text:

- Sakana API error or timeout: section `failed`, retry action, optional one-shot mini fallback.
- Non-JSON or unparseable output: `failed`. Never display a partial parse.
- Zod validation failure on the typed block: `failed`.
- Unresolved citation refs: drop the refs; drop any truth left with none.
- Verifier marks a surviving truth unsupported: drop it. Verifier drops stay dropped.
- Thin evidence (fails the gate): `empty` with the honest evidence gap. Never fabricate to fill five slots.
- Abstaining on the hardest conflict: a valid, desired output, not a failure.

**Why it belongs in the UX.** It is the read an investor wants in the first 60 seconds and the one thing the current nine cards structurally cannot produce, because each of them is slice-wise and this reasons across all of them at once. It is trust-additive: it surfaces what is shaky instead of smoothing it, which is exactly the product's stated trust posture. It satisfies the INTENT operating principle (more useful to an investor in the activation moment) without violating any non-goal: it is not a score, not a recommendation, not a data dump. And it is clean of the three forbidden duplicates. Ranked facts-by-importance plus exclusions plus one conflict is a different object from the investment rationale (Why care), the market read (Timing), and the diligence prompts (Next question).

## Part 4. Taxonomy placement, and opt-in vs flagged vs premium

**Placement.** A tenth research layer. New `layerId: "deepRead"`, new `sectionId: "top_truths"`, user-facing title **Deep Read** (alt: "The Read"), `visibility: "gated"`, source treated as analysis. It slots into the existing pinnable card pile in `ResearchLayerPanel` with no special machinery; the pile, pinning (`coldStartPinnedResearchLayers`), and `onRunSection` path are already generic over layer id.

**Opt-in, flagged, and premium, in that order.**

- **Opt-in** at the user level: it is the heaviest, slowest, most expensive pass, so it never auto-runs. The user activates it deliberately, with an affordance that sets expectations ("deep pass, up to ~3 min").
- **Flagged** at the deploy level: gated behind `COLD_START_FUGU_DEEP_READ` (default `false` in production) until the eval clears the kill criterion. The route declines the section cleanly when the flag is off.
- **Premium** as the framing: this is the flagship deep card. It is reasonable for it to read as the top tier of the gated surface, distinct from the standard analysis cards.

**Design fit.** The Catalogue Card language fits this card unusually well. The ranked truths are the filed entries; excluded claims are the not-filed stamp; the hardest conflict is the flagged classification dot. No new visual system needed; the existing stamps and dots already say what this card means.

## Part 5. Exact changes needed

### Schema (`packages/core`)
- `research-sections.ts`: add `"top_truths"` to `researchSectionIdSchema`; add `"deepRead"` to `researchLayerIdSchema`; add a `RESEARCH_SECTION_DEFINITIONS` entry (gated, `staleAfterMs` 24h, empty state copy, and a generation prompt adapted from `eval/fugu-top-truths/prompt.mjs` but rewritten to cite card citationIds rather than ledger ids).
- Extend `researchSectionContentSchema` with the optional `topTruths` block from Part 3 (additive, backward compatible, parsed in `researchSectionFromRow`).
- No `packages/db` schema migration. `research_sections` and `upsertResearchSection` are already generic over `sectionId`, and `contentJson` is JSONB. The only DB-adjacent effect is that the content Zod parse now accepts the new optional fields.

### LLM / provider (`packages/llm`, `packages/providers`)
- New Sakana client (port `callSakanaResponses` from `eval/fugu-top-truths/harness.mjs`): POST `https://api.sakana.ai/v1/responses`, `SAKANA_API_KEY`, model `fugu-ultra` default, per-model timeout. Natural home is `packages/providers` so it sits beside the other provider wrappers; register cost/timeout/stop in `provider-budget.ts` so it is not a contract miss.
- New `synthesizeTopTruths` generator: build the strict-JSON prompt, call the Sakana client, then run the full manual gauntlet (strict parse, Zod, citation resolution, ref-drop, verifier, fail-closed). Emit a `GenerationLlmCallTrace`-compatible record with `stage: "synthesis"`, `model: "fugu-ultra"`, and token counts including `reasoning_tokens`.

### Pipeline / worker (`apps/web/src/inngest/functions.ts`, `apps/web/src/app/api/generate/route.ts`)
- In the inngest section-generation step, branch on `sectionId === "top_truths"` to call the Fugu generator instead of `synthesizeResearchSection`; reuse `evidenceForSection` to assemble the evidence; run the gauntlet; `upsertResearchSection`; record `section.available` / `section.empty` events.
- Update the hardcoded `GATED_RESEARCH_SECTION_IDS` array (`inngest/functions.ts:133`) to include `top_truths`. The enum change does not propagate to that array on its own.
- The generate route picks the section up automatically through `researchSectionIdSchema`; `modeForSection` maps gated to analysis; `jobKind` becomes `section:top_truths`. Add the env-flag guard so the route declines when the flag is off.

### Extension (`apps/extension`)
- Add the `RESEARCH_LAYER_CARDS` entry for `deepRead` in `research-layer.ts`, plus a `displayFromSection` branch (or a dedicated renderer) for the `topTruths` block: ranked list, an excluded-claims group, and the conflict block. Fall back to `items[]` if the block is absent.
- Bump `packages/core/api-contract.json` (`2026-05-26.research-events-v1`) and rebuild the extension so the client contract header matches.

### Eval (`eval/fugu-top-truths`)
- Add fixtures that actually stress orchestration: at least one messy, high-conflict company and one large evidence pack well beyond 3k characters. The current single fixture is too small to reward ultra.
- Add a **citation-integrity** dimension to `score.mjs`: do the cited ids resolve, and (cheap verifier pass) does the source support the claim. The current rubric scores structure only; this closes the blind spot before anything ships.
- Keep the three-way baseline / mini / ultra comparison, with baseline pinned to the same model the production section path uses.

### Telemetry
- Persist per-run: model, latency, input/output/reasoning/total tokens, citation-drop count, verifier-drop count, abstention flag, and the `sourceBundleHash` of the exact evidence fed in. The last item is what makes the baseline shadow comparison fair (Part 7).
- Add a per-card Deep Read feedback signal (thumbs plus the existing "report wrong" intent in SPEC) writing to Postgres for triage.

## Part 6. Rollout

**Phase 0, the pre-June-7 burn (no product change, highest priority).** This is the deadline-driven sprint. Fugu access ends June 7 and the beta quota is free and expiring, so the goal is to spend it productively: build a corpus of frozen source bundles across varied companies (clean, messy, large), then run a matrix of companies x {baseline, fugu-mini, fugu-ultra} x k>=3 repeats, scored on grounded quality AND the new citation-integrity dimension, with latency and tokens logged. Weight ultra runs heavily; they are the orchestration model we most want to understand and they consume quota fastest. Every run writes durable artifacts to `eval/fugu-top-truths/runs/` so the evidence outlives the model. Ship gate for the card: ultra >= baseline on grounded quality AND citation integrity across N messy companies, with acceptable latency and cost. If ultra cannot clear baseline on the inputs designed to favor it, the card does not ship on ultra. The independent perspective from this burn is the deliverable even if the card never ships.

**Phase 1, ship dark.** Land the code behind `COLD_START_FUGU_DEEP_READ=false` in production; enable only in preview and internal. Extension-only, gated section, default model ultra, env-selectable.

**Phase 2, dogfood.** Enable internally on a watchlist of deliberately messy companies. Collect feedback and log every run's full trace. Each production run also stores its frozen evidence bundle so a baseline shadow run can replay the identical input later.

**Phase 3, decide.** If the kill criterion holds on real runs, enable the flag for the @semitechievc audience. If it fails, flip the env var to mini (and reframe honestly as an integration-plus-competitiveness win, not an orchestration win) or retire the card. The flag and the env model selector make both the rollback and the A/B one-line changes, no redeploy.

**Feedback loops.** Per-card feedback rows feed triage. A weekly job replays stored frozen bundles through baseline and compares against the shipped Fugu output on the same input.

## Part 7. Comparing Fugu vs baseline without confusing retrieval variance with model quality

This is the measurement spine, and it is the reason The Read won over the Contradiction Ledger.

1. **Freeze the bundle. This is the one non-negotiable control.** Both models read the identical stored evidence bundle, same `sourceBundleHash`. Retrieval happens once, upstream, and the model comparison never re-retrieves. The eval already enforces this offline; production must do the same by snapshotting the exact evidence fed to each Deep Read and replaying that snapshot for the baseline shadow run. Never compare a Fugu run on company X's bundle at T1 against a baseline run on the bundle at T2; that is retrieval variance wearing a model-quality costume.
2. **Hold the prompt identical.** Same prompt to both, `promptHash` recorded. The harness already hashes it.
3. **Score on separate axes, not one number.** (a) Grounded quality on the 15-point rubric. (b) Citation integrity as a distinct axis: refs resolve and the verifier supports them. A model can win (a) and lose (b); the current rubric would hide that. (c) Latency. (d) Cost in tokens including reasoning tokens. (e) Keep / edit-burden signal.
4. **Run k>=3 per model per bundle and report median plus spread.** The current eval is n=1. A one-point gap inside run-to-run spread is not a quality difference. Only deltas larger than the spread count.
5. **Decision rule.** Fugu wins only if median grounded quality AND citation integrity are at least baseline, with acceptable latency and cost, across the messy fixture set. Anything short of that, and retrieval or run variance is the more likely explanation, so we do not credit Fugu and we fall back to mini or retire.

## Open questions for Samay

1. ~~Default model on launch~~ Resolved 2026-05-29: test both hard before June 7. `fugu-ultra` is the async deep-pass default candidate; `fugu-mini` runs as the fast comparator. The env model-selector lets one section run either. Pick the production default from the burn evidence, not before it.
2. Is a 240s hard timeout acceptable for an opt-in deep pass, or should the ceiling be tighter even if it truncates ultra?
3. Should Deep Read read as an explicit premium tier in the gated surface, or just another gated card that happens to be slow?
4. Daily run cap and per-card token ceiling: what numbers, given current wallet posture?

---
*Captured 2026-05-29. Builds on the 2026-05-27 workflow-fit evaluation. No implementation; this selects the wedge.*
