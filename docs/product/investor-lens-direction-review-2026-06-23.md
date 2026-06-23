# Investor Lens Direction Review

## Recommendation in one paragraph

Make Investor Lens one explicit, gated action after a usable Basics card exists. The Lens should run full `analysis`, save `card.synthesis`, and first show a compact investor read: why this might matter, the central bull/bear tension, timing only if supported, the top diligence question, and a visible source posture. Keep the modular research cards, but make them browsable outputs of the Lens instead of separate ways to discover what "analysis" means. The current technical base is closer than the product experience suggests: the old hidden `risks` and `the_case` section-job problem appears fixed, synthesis is gated, and verifier drops unsupported claims. The remaining gap is that the user gesture is buried inside analysis cards, the content contract still pushes too many fields, and the UI does not yet make partial, empty, or unsupported Lens outcomes feel like an honest investor-grade result.

## What Investor Lens is supposed to do

Investor Lens should be the first 10 minutes of a serious investor screen, not a longer company profile. Basics answer "what is this company and what sources do we have?" Lens should answer "is there a reason to keep reading?"

Investor-grade should mean:

- It names the buyer, workflow, wedge, and proof posture before generic market framing.
- It explains why now only when there is evidence for timing, budget, adoption pressure, or market structure.
- It preserves tension: what would make the company matter, what could break the case, and which evidence would resolve it.
- It uses citation-backed claims for judgment, not just for facts.
- It is comfortable showing nothing when nothing survived verification.
- It does not recommend an investment, score the company, imply valuation attractiveness, or pad the layout with plausible strategy prose.

The useful output is not "four filled cards." The useful output is a sharper next investor action: keep reading, ask this question, ignore for now, or wait for better evidence.

## What is happening now

The current repo has a real Investor Lens path, but it is not yet a clear product moment.

- The user starts investor analysis by activating an analysis-backed surface, usually `Next question` or `The case`, then clicking a `Lens` button inside that card.
- There is no top-level "Run investor lens" action in the main Research surface.
- `Open Questions` and `The Case` render only from `card.synthesis`.
- `Why care` and `Timing` can render from stored research sections first, then fall back to `card.synthesis`.
- Clicking `Lens` runs full analysis with no `sectionId`.
- Activating `Why care` or `Timing` can still queue a standalone gated section job with `sectionId: "why_it_matters"` or `sectionId: "market"`.
- The old waste path where `risks` and `the_case` could be generated as hidden standalone sections appears fixed. The API rejects those section ids, and the extension e2e test asserts the Lens request has no `sectionId`.
- Running and queue states are mostly honest mechanically. The weak spots are product clarity and unsupported output states, especially Timing.
- Fresh Lens completion requires `card.synthesis`, but it does not require `marketStructureAndTiming`. That means a fresh Lens can complete while the Timing card still says market structure has not been generated.
- Tests prove parts of the intended mechanics, especially full Lens without `sectionId`, active analysis resumption, and server rejection of synthesis-only sections. They do not yet prove that the Lens produces a coherent investor read, honest partial receipts, or investor-grade content.

The current Lens is technically safer than the prior review feared. It is not yet product-defining.

## Current architecture, in plain English

Cold Start currently exposes three related but different generation paths, and the side panel blends them into one Research surface.

- Basics generation creates a public company card with sourced facts.
- Full analysis generation runs `mode: "analysis"` with no `sectionId`; it produces gated synthesis on the card.
- Standalone section generation runs with a `sectionId`; it creates or refreshes one stored research section.

The extension side panel treats these as one Research surface. The pile includes public cards like Who pays, Proof, Signals, Money, Comps, and Product, plus analysis cards like Next question, Why care, The case, and Timing.

The rendering split matters:

- `openQuestions` and `theCase` are synthesis-only UI layers. They read directly from `card.synthesis`.
- `coreIdea` and `marketStructureTiming` are hybrid layers. If a stored section exists, the UI uses that section; otherwise it uses `card.synthesis`.
- Public layers render from the card itself or stored public sections.

The backend has important guards:

- Analysis requires extension auth and an existing investor-usable profile.
- Analysis is blocked until the profile has citations, enough structured facts, source-backed evidence, a concise overview, and at least some investor evidence.
- `risks` and `the_case` remain valid historical section ids, but they are blocked from standalone dispatch.
- Synthesis is generated only after an evidence gate. Claims are then verified against cited snippets. Unsupported bull, bear, why-it-matters, and market claims are dropped.
- Open questions are generated by the synthesis prompt but are not verifier-checked as citation-bearing claims.

The architecture is reasonable. The product issue is that users see cards and queues before they understand the Lens as a single judgment pass.

## Root-cause hypotheses for why the Lens is not yet distinctly useful

- The Lens is hidden inside module activation. A product-defining action should not require the user to discover which analysis card has the real gate.
- The model mixes "research card" and "investor judgment" as if they were the same interaction. Public evidence cards work well as modules; judgment wants a single editorial spine.
- The content contract asks for exactly three bull claims, exactly three bear claims, exactly three questions, and seven market fields before verification. Verifier drops make this safer, but the first draft still invites category completion.
- The verifier proves source support, not usefulness. A claim can be supported and still be too generic to deserve first-screen space.
- The Case is displayed as bull rows plus bear rows. That is less useful than showing the tension that determines whether the company is worth the next call.
- Timing is treated as a normal card even when timing evidence is absent. The UI copy can imply an unfinished generation rather than an honest "not supported."
- Open Questions are ranked by model order but lack visible evidence posture. They can be sharp, but the UI does not show why a specific question is the best use of attention.
- Existing tests protect routing and state, not investor usefulness. There is no golden-company rubric that fails generic prose.

## Evidence from code/docs

- `SPEC.md` frames Investor Lens as the fourth win: the first 10 minutes of a sharp investment screen, with synthesis gated behind extension auth.
- `INTENT.md` says judgment should name buyer, workflow, wedge, proof, friction, funding cadence, market structure, and what changes the read, without becoming a chatbot, CRM, score, or recommendation engine.
- `DESIGN.md` calls for Catalogue Card behavior: calm evidence marks, honest ready/running/saved/blocked/not found states, and no ornamental loading.
- `docs/product/viability-directions-2026-06-23.md` already points toward one visible Lens action that fills Why care, The case, Timing, and Next question together.
- `apps/extension/src/research-layer.ts:71` defines the analysis and card layers in one pile.
- `apps/extension/src/research-layer.ts:84` says Open Questions and The Case render from `card.synthesis`, never a stored section.
- `apps/extension/src/research-layer.ts:552` renders The Case from `card.synthesis.bullCase` and `card.synthesis.bearCase`.
- `apps/extension/src/research-layer.ts:605` renders Timing from `card.synthesis.marketStructureAndTiming` when present, but returns a ready state with "Market structure analysis has not been generated" when synthesis exists without market timing.
- `apps/extension/src/ResearchLayerPanel.tsx:1453` prevents synthesis-only layers from queuing section jobs and leaves their explicit Lens control to start full analysis.
- `apps/extension/src/ResearchLayerPanel.tsx:1655` only shows the `Lens` action for synthesis-only layers when the card has no synthesis.
- `apps/extension/src/sidepanel-network.ts:542` sends the full analysis request without a section id.
- `apps/extension/src/sidepanel-network.ts:471` treats any synthesis as complete on a fresh analysis run, unless the run started from a stale synthesis missing market timing.
- `apps/web/src/app/api/generate/route.ts:52` rejects synthesis-only section ids as standalone section jobs.
- `apps/web/src/app/api/generate/route.ts:271` uses a public card for basics and a full card for analysis, preserving synthesis gating.
- `apps/web/src/inngest/functions.ts:539` branches section jobs away from full card generation.
- `packages/llm/src/synthesis.ts:219` has a strong synthesis prompt: cite card citations only, weight source incentives, avoid top-down TAM filler, make market timing sparse, and reject generic open questions.
- `packages/llm/src/synthesis.ts:84` currently requires exactly three bull claims, exactly three bear claims, and exactly three open questions at parse time.
- `packages/llm/src/verifier.ts:100` verifies support against cited source snippets, but does not judge whether a supported claim is interesting or investor-grade.
- `packages/pipeline/src/generate-card.ts:651` synthesizes, verifies, drops unsupported claims, verifies market fields one by one, and only writes synthesis when a why-it-matters claim survives or can be replaced by a surviving bull/bear claim.
- `packages/core/src/card-quality.ts:205` blocks analysis until the profile has enough investor-ready evidence.
- `apps/extension/tests/e2e/sidepanel-ui.spec.ts:508` asserts filing Next question opens the Lens gate and sends one analysis request with no `sectionId`.
- `apps/web/tests/generate-route.test.ts:452` asserts `risks` and `the_case` cannot run as standalone section jobs.
- `apps/extension/tests/sidepanel.test.tsx:1642` still codifies the mixed model: activating `Why care` sends `mode: "analysis"` with `sectionId: "why_it_matters"`.

## Product model options with tradeoffs

| Model | Why it might help | Main risk | Cost | Trust | Comprehension | Catalogue fit | Reduced motion | Reject if |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| One global `Run investor lens` action | Makes Lens a clear second product moment after Basics. One action, one receipt, one synthesis object. | Needs careful disabled/empty states or it can feel like a big magic button. | Predictable: one full analysis run. | Strong if receipt shows what survived and what did not. | Best. Users understand Basics then Lens. | Fits as a filed/vetted stamp or sealed memo card. | Easy: button, progress receipt, no drag dependency. | The output remains generic even with a stronger contract. |
| Activating any analysis layer starts the whole Lens | Reduces buttons and makes any analysis interest trigger the full pass. | Surprise cost. Dragging Timing should not silently run the whole Lens. | Higher accidental spend. | Medium; feels opaque unless heavily messaged. | Medium; action/result mapping is unclear. | Fits less well because pile cards become traps. | Fine mechanically. | Users cannot predict what starts paid analysis. |
| Analysis modules stay dormant until Lens completes | Clean separation: no analysis cards pretending to be ready before analysis exists. | Hides the value prop until after the user commits. | Predictable. | Strong if disabled reasons are concrete. | Good, but less exploratory. | Strong. Dormant stamps can read as sealed until filed. | Easy. | It makes the extension feel emptier before the payoff. |
| Lens produces one compact memo card first, sections expand below | Gives an immediate investor-grade payoff, then lets users browse detail. | Requires editorial discipline; bad memo copy would be more visible. | Same as global Lens. | Strong if it includes source posture and gaps. | Best for first-run. | Excellent: one filed memo, then catalog cards. | Strong; no motion needed to understand. | The memo repeats the sections instead of summarizing the decision. |
| Split `quick investor read` and `deep section runs` | Lets alpha users get fast judgment and then pay for depth where needed. | Adds product complexity too early. | Potentially efficient, but only after the quick read is good. | Strong if costs are explicit. | Medium; two-tier terms need teaching. | Fits as receipt plus optional filed cards. | Fine. | It ships before the single Lens is coherent. |
| Keep current per-section model but make each card independently valuable | Minimal technical churn and preserves modular exploration. | Keeps the main confusion: what is Lens versus section research? | User-controlled but fragmented. | Medium. Some cards may be strong, others weak. | Weak for first-run. | Fits the pile, but not the investor judgment moment. | Already works. | The goal is product-defining Lens, not just functional cards. |
| Remove or merge weak analysis modules | Cuts bloat and makes Lens sharper. | Could overcorrect and remove useful later detail. | Lower. | Stronger if fewer surfaces are better supported. | Stronger. | Strong. Fewer cards, cleaner hierarchy. | Easy. | The removed module has repeat evidence of user value. |
| Roll back hidden or unused generation paths | Prevents trust and cost leaks. | Already mostly done; little product payoff by itself. | Lower. | Strong. No paid invisible work. | Good hygiene, not a product model. | Neutral. | Neutral. | Current tests already cover the path and no new hidden work exists. |

## Recommended product model

Use a global Lens action plus a compact memo card first. That is the product.

The post-Basics state should look like this:

- Basics card is saved.
- Research modules remain available for public evidence.
- A clear Lens control appears with a disabled reason if the profile is not investor-ready.
- Clicking Lens runs full `analysis` with no `sectionId`.
- While running, the surface says what is happening: reading cited sources, weighing the case, checking timing, filing questions.
- When complete, show a Lens receipt: "Lens filed" or "No supported lens filed."
- The first Lens output is a compact memo card with the strongest why-care line, one case tension, the top diligence question, timing only if supported, and a source posture.
- Below that, the existing analysis cards become browsable sections fed by the same synthesis.
- `Why care` and `Timing` can have optional deep refresh later, but should not be the default path into Lens.

The backup path is to keep the current per-section model but make every analysis card independently useful. This is acceptable if the single Lens memo misses in user testing. It is not the preferred path because it makes the user assemble the investor read from fragments.

## Content-quality recommendations

- Change the contract from "fill these sections" to "produce the sharpest investor screen."
- Allow 0 to 3 bull claims, 0 to 3 bear claims, and 1 to 3 open questions. The current exact-three shape is safe after verification but still invites draft-time filler.
- Add an investor-usefulness gate after support verification. It should reject claims that are true but generic, such as category summaries, homepage restatements, or claims without a concrete buyer, workflow, metric, named source, competitor, or timing mechanism.
- Make open questions explicitly ranked by usefulness. Category is metadata; rank is the product.
- Give each open question a visible reason: what belief it tests and what evidence would confirm or kill it.
- Treat The Case as a tension map, not separate bull and bear stacks. Each row should read like: "If this is true, the company matters because X. It breaks if Y."
- Treat Timing as conditional. Show it only when there are supported claims for buyer budget, pain severity, adoption trigger, market structure, profit pool, expansion path, or timing risk. Otherwise show "Timing not supported by current sources."
- Add source posture to the Lens memo: independent sources, company-authored sources, enrichment-only facts, and whether key judgment came from independent evidence.
- Keep citations at the claim level, but avoid cluttering the first memo. The memo should expose source chips and let the detailed cards carry the receipt trail.
- Continue forbidding investment recommendations, price opinions, valuation attractiveness, and generic TAM/CAGR prose.

## Robustness recommendations

- If analysis fails before synthesis, preserve Basics and show "Lens not filed" with the actual blocked or failure reason in plain English.
- If the evidence gate blocks analysis, do not show a broken placeholder. Show the missing precondition: source-backed evidence, concise overview, structured facts, or investor evidence.
- If the verifier drops everything, treat that as an honest Lens result. The UI should say no supported investment read survived, not imply the system broke.
- If only some fields survive, file a partial Lens. Show what survived and mark unsupported surfaces as Not found.
- If Timing is missing after a fresh Lens, do not say "not generated." Say the current sources did not support a timing read.
- If the user closes and reopens the panel during analysis, keep the resume behavior, but make the resumed state say Investor Lens rather than generic research progress.
- If a cached public card exists but synthesis is missing, show Lens as available if `canRunInvestorAnalysis` passes.
- If synthesis exists but is missing market timing, do not automatically imply the Lens is incomplete. Offer "Refresh timing" only as a deliberate deep action.
- If section jobs and analysis jobs overlap, Lens should win. Clear or pause section queues before full analysis, as the current side panel already mostly does.
- Keep server-side rejection of `risks` and `the_case` standalone jobs. UI safeguards are not enough for paid generation paths.

## UI/interaction recommendations

- Put the Lens action near the company context or Research header, not only inside Next question or The case.
- Use the Catalogue Card language: a small seal, receipt line, source chips, and filed/not found states. Avoid a large AI assistant panel.
- Make the first Lens result a compact filed memo. It should feel like an analyst's first screen, not a dashboard.
- Do not make drag the only discoverable way to reach Lens. Keep drag as tactile filing, but the Lens control should be keyboard and click obvious.
- Rename generic analysis progress copy to Lens-specific copy while full analysis runs.
- Keep reduced motion simple: instant button feedback, progress text changes, and opacity-only reveal. The product meaning should not depend on card movement.
- Collapse weak modules by default. Timing should be absent or Not found when unsupported, not a card with apologetic filler.
- Prefer one visible receipt over multiple simultaneous "Synthesizing" cards. Multiple running cards make it look like four jobs when it is one job.
- Make source posture visible in the Lens memo. The user should know whether the read is built on independent analysis or mostly company-authored facts.

## Measurement and test plan

Use normal tests for mechanics and golden-company evals for product quality, because routing correctness does not prove the Lens is useful.

- Unit test layer mapping: `openQuestions` and `theCase` must never dispatch standalone sections.
- API test public/private separation: public card responses never include `synthesis`; extension responses can include it after auth.
- API test paid path: `mode: "analysis"` with no `sectionId` queues full Lens; `risks` and `the_case` remain rejected as standalone sections.
- Extension test global Lens: clicking the global Lens action sends `{ mode: "analysis", confirmStart: true }` and no `sectionId`.
- Extension test fresh Lens partial: synthesis without market timing files Lens, shows Why care/The case/Next question, and marks Timing as not supported.
- Extension test verifier-empty: analysis completes without synthesis and the UI shows an honest no-supported-lens receipt.
- Extension test reopen: active analysis resumes as Investor Lens and does not restart.
- Extension test overlap: section queues do not run while Lens is active.
- Reduced-motion test: Lens can be started, followed, and read without drag or motion-only cues.
- Golden-company eval: score 20 to 30 companies on whether the Lens gives a non-generic why-care, a concrete tension, a useful top question, and honest source posture.
- Cost telemetry: track analysis cost, verifier drop rate, number of surviving Lens claims, and percent of Lens runs with supported Timing.
- Alpha qualitative metric: after reading Lens, can a user state the next diligence question in under 30 seconds?

## Rejected paths

- Do not make every analysis-card activation silently run the whole Lens. It hides cost and makes user intent ambiguous.
- Do not keep the current buried Lens as the long-term interaction. It works technically but undersells the product.
- Do not add more analysis modules before the core Lens memo is sharp.
- Do not show Timing unless there is evidence. Unsupported timing is not a partial failure; it is a valid Not found state.
- Do not reintroduce standalone `risks` or `the_case` generation. Those outputs are synthesis, not sections.
- Do not add an investment score, buy/pass label, or recommendation. The tool should sharpen diligence, not pretend to be an IC decision.
- Do not solve the problem with more animation. The craft change that matters most is hierarchy and state honesty.

## Open questions

- Should the global Lens action appear immediately after Basics, or only when at least one investor-ready precondition is met?
- Should the first memo be stored as a new explicit synthesis shape, or derived from existing `card.synthesis` fields?
- Should Open Questions gain citation ids or a lighter `evidenceBasis` field so source posture is visible without pretending questions are factual claims?
- Should `Why care` and `Timing` stay section-refreshable after Lens, or should all judgment surfaces move to synthesis-only?
- What is the minimum Lens receipt that feels complete on weak but usable profiles?
- Which alpha users should evaluate the Lens first: sourcing investors, founders, or Samay-only dogfood?

## Exact next spec to write if we proceed

Write `docs/superpowers/specs/2026-06-23-investor-lens-single-action-and-memo.md`

That spec should define:

- The global Lens entry point and disabled reasons.
- The exact Lens memo content contract.
- The post-run receipt states: filed, partial, not supported, failed, blocked.
- The mapping from `card.synthesis` into the memo and cards.
- Whether `Why care` and `Timing` remain section-refreshable.
- The prompt/schema changes needed to allow fewer, sharper claims.
- The verifier or eval additions needed to reject generic but supported claims.
- The UI changes required under normal and reduced motion.
- The routing tests, extension tests, and golden-company evals that must pass before shipping.
