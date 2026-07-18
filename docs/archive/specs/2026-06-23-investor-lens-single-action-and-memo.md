# Investor Lens Single Action and Memo Spec

## Recommendation

Build Investor Lens as one explicit gated action after Basics: `Run investor lens`. The run should produce a compact `Investor Read` first, then let the existing analysis cards become supporting detail from the same synthesis. Do not build a long memo, a score, a dashboard, hidden section jobs, or a broad new module taxonomy. The product should optimize for one thing: a few cited claims that change the next diligence move.

## Why This Spec Exists

The current repo already has most of the technical spine:

- Full analysis runs through `/api/generate` with `mode: "analysis"` and no `sectionId`.
- `openQuestions` and `theCase` render from `card.synthesis`.
- `risks` and `the_case` are blocked from standalone section dispatch.
- Synthesis is gated, verified, and dropped if claims do not survive citation support.

The current experience still does not feel product-defining because the Lens is discovered inside analysis cards, `Why care` and `Timing` still act like separate section jobs, and there is no compact Lens artifact that tells the user what changed.

The external research mostly validates the direction. Keep its best ideas: one deliberate CTA, Investor Read first, source posture, strict claim limits, best next question, and honest absence states. Reject its weaker drift: too many modules, a heavy new data model, full memo structure, and anything that makes the side panel feel like a database dashboard.

## Product Principle

Investor Lens helps a serious investor decide what to do with the next 10 minutes.

It should answer:

- Why might this company matter?
- What evidence actually supports that?
- What could break the story?
- Is timing supported or not found?
- What is the best next diligence question?

It should not answer:

- Should I invest?
- What is the right valuation?
- Is this a buy or pass?
- What is the full IC memo?

## User Flow

1. User opens the extension on a company domain.
2. Cold Start loads or generates Basics.
3. If Basics is not investor-ready, the Lens control is disabled with a concrete reason.
4. If Basics is investor-ready and no synthesis exists, the extension shows `Run investor lens`.
5. User clicks `Run investor lens`.
6. The extension starts one full analysis run with no `sectionId`.
7. While running, the side panel shows Lens-specific progress, not generic research copy.
8. When complete, the panel shows an `Investor Read` card first.
9. Existing analysis cards below become browsable supporting detail.
10. Unsupported modules render as Not found or are collapsed, not padded.

## CTA Behavior

Place the Lens action near the company context or Research header. It should not be available only inside `Next question` or `The case`.

Primary enabled copy:

```text
Run investor lens
Sourced synthesis for the case, risks, timing, and next diligence question.
```

Disabled reasons should use existing profile quality gates where possible:

- `Run basics first.`
- `Profile needs cited sources before analysis.`
- `Profile needs more structured facts before analysis.`
- `Profile needs source-backed evidence before analysis.`
- `Profile needs a concise overview before analysis.`
- `Profile needs investor evidence before analysis.`

Do not hide the control when disabled. A disabled Lens with a concrete reason teaches the product better than an absent control.

## Generation Contract

The global Lens action must call:

```json
{
  "domain": "<domain>",
  "mode": "analysis",
  "confirmStart": true
}
```

The request must not include `sectionId`; that is the boundary between the global Lens and section refreshes.

Standalone section jobs stay allowed for public evidence cards and optional later refreshes, but not for the first Lens experience.

Rules:

- `openQuestions` and `theCase` must never dispatch standalone section jobs.
- `Why care` and `Timing` should not auto-queue standalone section jobs during first Lens activation.
- If a full Lens run is active, section queues pause or clear.
- If a section job is active and the user starts Lens, Lens wins and the section queue is cleared.
- Server-side rejection of synthesis-only section ids remains mandatory.

## Investor Read Card

The first post-run artifact is `Investor Read`. This is the Lens. Everything else is supporting detail.

It has five rows at most:

| Row | Requirement |
| --- | --- |
| Why it might matter | One sentence connecting buyer, workflow, and possible importance. |
| Evidence that holds | Two or three proof chips, each tied to source posture. |
| What could break | One specific risk or gap that would change the read. |
| Best next question | One question a founder, buyer, customer, expert, or former employee could answer. |
| Evidence status | One receipt line with supported claims, source posture, dropped claims, and omitted modules. |

Example shape:

```text
Why it might matter
If this works, it matters because [buyer] moves [workflow] from [old path] to [new path], changing [cost, speed, risk, revenue, compliance, or labor].

Evidence that holds
Named customer deployment · company-claimed
Funding signal · reporting
Independent product coverage · independent

What could break
The story breaks if public deployments are pilots rather than repeat usage.

Best next question
Ask a [buyer persona] whether usage expanded after the first deployment; expansion would support workflow pull, while single-team usage would suggest pilot risk.

Evidence status
Lens filed · 5 supported claims · 3 dropped · Timing not found
```

The card should feel like a filed analyst index card, not a generated memo.

## Supporting Analysis Cards

After Lens completes, these analysis cards remain useful:

- `Why care`: the strongest supported why-care line, derived from `card.synthesis.whyItMatters`.
- `The case`: a compact tension map from surviving bull and bear claims.
- `Next question`: the top ranked diligence question, with evidence basis.
- `Timing`: shown only when market/timing claims survived verification.

Public evidence cards remain separate:

- `Who pays`
- `Proof`
- `Signals`
- `Money`
- `Comps`
- `Product`

Do not add a large new set of default analysis cards in this pass. The web research suggested useful concepts like unit economics, strategic relevance, and market structure, but those should remain conditional future modules or be folded into the Investor Read when supported.

## Case Format

The current bull-stack plus bear-stack presentation should become a tension map, because the investor value is in the condition that decides the read.

Preferred display:

| Field | Meaning |
| --- | --- |
| If true | The supported claim that would make the company matter. |
| It breaks if | The specific condition that weakens or falsifies the case. |
| Test | The diligence question or evidence needed next. |

The data can still come from `synthesis.bullCase`, `synthesis.bearCase`, and `openQuestions`. The UI should compose them into tension, not just list them.

## Open Question Contract

Open questions are the highest-value part of the Lens. They should be ranked by usefulness, not category completion.

Each question should eventually carry:

- `question`
- `category`
- `rank`
- `testsBelief`
- `evidenceBasis`
- `wouldChangeReadIf`

For the first implementation, avoid a large schema migration if it slows shipping. If needed, derive `evidenceBasis` and rank from prompt order and local formatting, but the next durable schema should support it explicitly.

Good question:

```text
Ask a customer whether usage expanded from one team to multiple teams after the first deployment; expansion would support workflow pull, while single-team usage would suggest pilot risk.
```

Bad question:

```text
Can the company scale?
```

## Timing Contract

Timing is conditional. It should not appear as a default filled card.

Show Timing only when at least one verified market/timing field exists:

- buyer budget
- pain severity
- adoption trigger
- market structure
- profit pool
- expansion path
- timing risk

If no timing claims survive, show:

```text
Timing not found
Current sources did not support a timing read
```

Do not show:

```text
Market structure analysis has not been generated for this card yet.
```

That copy implies the system forgot work. The correct state is absence of support.

## Source Posture

Investor Lens should show source posture without turning the UI into a citation spreadsheet.

Use a compact evidence status line:

```text
Lens filed · 5 supported claims · 3 dropped · 2 independent · 3 company-claimed
```

Use source chips on claim rows:

- `Independent`
- `Company-claimed`
- `Reporting`
- `Customer proof`
- `Investor-claimed`
- `Enrichment`
- `Not found`

The current card citation model already has source quality fields. Prefer deriving these chips from existing citation metadata before adding a new citation model.

## Prompt and Content Contract

The synthesis contract should tighten around fewer, sharper claims instead of asking the model to fill a fixed layout.

Current issue:

- The synthesis parser requires exactly three bull claims, exactly three bear claims, and exactly three open questions.
- Verification drops unsupported claims, but exact counts still push the model toward category completion before verification.

Desired shape:

- `whyItMatters`: exactly 1 claim.
- `bullCase`: 0 to 2 claims.
- `bearCase`: 0 to 2 claims.
- `openQuestions`: 1 to 3 questions, ranked by usefulness.
- `marketStructureAndTiming`: sparse and optional.

Add instruction pressure:

- Do not fill a claim slot unless the claim changes the next diligence move.
- A true but generic claim should be omitted.
- Every bull claim must name buyer, workflow, mechanism, proof, or missing proof.
- Every bear claim must name the thesis element that could fail and how to test it.
- Every open question must identify who to ask and what answer changes the read.
- Timing must be omitted unless sources support a real timing mechanism.

## Verifier and Usefulness Gate

Keep source-support verification, but add a usefulness check so supported filler does not get first-screen space.

The current verifier answers:

```text
Is this claim supported by the cited snippets?
```

Investor Lens also needs:

```text
Does this supported claim deserve first-screen investor space?
```

The usefulness gate can be implemented as a deterministic lint pass first, then a model pass later if needed.

Reject claims that:

- only restate the homepage one-liner;
- say the market is large without buyer/workflow evidence;
- use vague strategy language without concrete proof;
- claim traction from funding alone;
- cite a company-authored source as independent proof;
- say competition exists without naming an actual substitute, budget, workflow, or incumbent;
- make timing claims from generic AI tailwinds or recent funding alone.

## Robustness States

| State | Behavior | Copy |
| --- | --- | --- |
| Basics missing | Disable Lens. | `Run basics before Investor Lens.` |
| Profile not investor-ready | Disable Lens with reason from `analysisBlockedReason`. | Existing reason, sentence-cased. |
| Analysis running | Show one Lens progress state. | `Checking support` or current stage. |
| Analysis failed | Preserve Basics and allow retry. | `Investor Lens did not complete. Public facts are still available.` |
| Verifier drops everything | Show honest no-supported-lens receipt. | `No supported investor read survived citation checks.` |
| Partial synthesis | File partial Lens and show missing modules as Not found. | `Lens filed partially · Timing not found.` |
| Synthesis exists without timing | Do not mark Lens incomplete. | `Timing not found.` |
| Reopen during run | Resume active Lens, do not restart. | `Investor Lens still checking support.` |
| Public card route | Never expose synthesis. | No private teaser. |

## Progress Copy

Replace generic analysis progress with Lens-specific steps that explain the single Lens run.

Suggested sequence:

1. `Reading cited sources`
2. `Extracting investor claims`
3. `Checking support`
4. `Dropping weak claims`
5. `Filing Investor Read`

Reduced motion behavior:

- No reliance on drag.
- No shimmer or typing animation.
- Progress should be readable as text only.
- Reveal can use opacity only.

## UI Placement

Target placement:

- Company header / Research header gets the CTA.
- Active analysis cards no longer own the primary Lens entry point.
- Locked analysis modules can still show a local prompt: `Run Investor Lens to populate this section.`

The Lens receipt should sit above active research cards. It should not replace the public facts card.

## Data Model Guidance

Do not rush into a new `InvestorLensRun` table unless needed. The first pass should use existing card synthesis and generation run traces where possible.

Minimum viable data additions to consider:

- Allow synthesis arrays to be shorter than three.
- Add open-question metadata if needed: rank, evidence basis, and what answer changes the read.
- Add trace fields for dropped claim count and source posture if not already derivable.

Avoid:

- A broad new module schema.
- A separate full investor memo object.
- Duplicating stored research sections for synthesis-only outputs.

## Implementation Seams

Likely files to touch:

- `packages/core/src/card.ts`
- `packages/core/src/research-sections.ts`
- `packages/llm/src/synthesis.ts`
- `packages/llm/src/verifier.ts`
- `packages/pipeline/src/generate-card.ts`
- `apps/extension/src/research-layer.ts`
- `apps/extension/src/ResearchLayerPanel.tsx`
- `apps/extension/src/sidepanel.tsx`
- `apps/extension/src/sidepanel-network.ts`
- `apps/web/src/app/api/generate/route.ts`
- `apps/web/src/inngest/functions.ts`

Likely no-op areas:

- Public `/api/cards/{slug}` should not gain synthesis.
- Public `/c/{slug}` should not gain private Lens copy.
- `risks` and `the_case` standalone rejection should remain.

## Acceptance Criteria

The feature is done when:

- A user can start Lens from one global CTA after Basics.
- The request sends `mode: "analysis"` and no `sectionId`.
- The user sees one running Lens state, not four independent running cards.
- Completion shows an `Investor Read` card before supporting analysis cards.
- `Why care`, `The case`, and `Next question` render from one synthesis.
- Timing says Not found when no timing claims survive.
- Synthesis can produce fewer than three bull or bear claims without schema failure.
- Open questions are ranked by usefulness and include a visible reason or evidence basis.
- Unsupported or generic claims are dropped rather than padded.
- Public routes never expose synthesis.
- Reduced motion users can start, follow, and read Lens without drag or animation dependency.

## Test Plan

Unit and API tests:

- `parseSectionId` rejects `risks` and `the_case`.
- Public card serialization strips `synthesis`.
- Extension card route returns `synthesis` only with valid extension auth.
- Full Lens POST contains no `sectionId`.
- Section mode mismatch still fails.
- Synthesis schema accepts shorter bull and bear arrays if that contract changes.
- Timing output without market fields renders Not found.

Extension tests:

- Global CTA appears when Basics is investor-ready and synthesis is missing.
- Disabled CTA shows a concrete reason when `canRunInvestorAnalysis` fails.
- Clicking CTA starts one full analysis run.
- Locked analysis modules prompt the same global Lens action.
- Active Lens run shows one Lens progress state.
- Reopening during analysis resumes without restarting.
- Section queue is cleared or paused when Lens starts.
- Fresh Lens with no timing support shows `Timing not found`.
- Verifier-empty result shows no-supported-lens receipt.
- Reduced motion path does not rely on drag or motion-only cues.

Golden-company eval:

- Run 20 to 30 mixed companies.
- Score whether the Lens has a non-generic why-care.
- Score whether The Case names a concrete tension.
- Score whether Best Next Question would improve a real call.
- Score whether Timing is supported, omitted honestly, or hallucinated.
- Score whether citations support the exact claims.
- Track generic phrase count.
- Track verifier drop rate.
- Track percentage of runs with a marked read-changing sentence.

## Rejected Paths

- Reject independent section generation as the default Lens model because it increases cost, creates contradiction risk, and makes the user assemble the judgment themselves.
- Reject a full generated investor memo because it does not fit the side panel and will reward polished filler over first-screen utility.
- Reject scoring because it creates false precision and crosses into recommendation-like behavior.
- Reject always-on synthesis because it blurs public/private boundaries and hides cost.
- Reject default Timing and TAM modules because most first-pass timing and TAM content will be unsupported filler unless evidence is present.
- Reject a large new schema before first implementation because the current system can probably prove the product moment with smaller schema changes plus UI reframing.

## Open Decisions

- Should `Why care` and `Timing` remain section-refreshable after Lens, or move to synthesis-only?
- Should open questions get first-class citation ids, or a lighter evidence-basis field?
- Should source posture be derived from existing `citation.sourceQuality`, or stored in the Lens trace?
- Should the first implementation allow shorter synthesis arrays, or keep backend shape and filter harder in UI?
- Should optional deep section refresh ship in the same pass or wait until the Lens artifact is proven?

## Recommended Build Order

1. Add the global Lens CTA and route it to full analysis with no `sectionId`.
2. Add the `Investor Read` card derived from existing synthesis.
3. Fix missing Timing copy to honest Not found.
4. Stop first-run `Why care` and `Timing` activation from feeling like separate Lens entry points.
5. Tighten synthesis prompts around fewer, sharper claims.
6. Allow shorter bull/bear arrays if needed.
7. Add open-question evidence basis or derived display.
8. Add usefulness lint or eval gate.
9. Add golden-company eval.
10. Only then consider optional deep refresh modules.

## Non-Negotiables

- Public facts stay public.
- Synthesis stays extension-gated.
- No hidden generation work.
- No investment recommendation.
- No scores.
- No padded claims.
- No Timing without evidence.
- One Lens run should feel like one deliberate analyst pass.
