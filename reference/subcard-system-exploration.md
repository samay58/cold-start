# Cold Start sub-card system: editorial/product exploration

> Exploration pass, 2026-05-29. No code yet. Spine locked in `subcard-exploration-spine.md`.
> Source surfaces re-read: research-sections.ts, research-layer.ts, ResearchLayerPanel.tsx, CardShell.tsx,
> research-layer.test.ts, investor-taste-kernel.ts, synthesis.ts, SPEC.md, DESIGN.md, INTENT.md.
> Taste calibrated against nventures: deal-scoring-framework, technical-dd-deep-reasoning, submitted Q4-26 portfolio blurbs.

---

## 0. The honest answer to "can investor taste go to the next level?"

Yes, and the version worth doing is cheap. The obvious version is the one to avoid.

**The trap (don't build): adaptive per-company card sets.** Showing a seed devtools company a different card set than a Series C fintech needs company-type classification (error-prone), breaks the stable shareable `/c/{slug}` artifact, and breaks caching. It is exactly the "bloat or brittle systems" you flagged. The answer there is no.

**The real lever (build): a cross-card read.** Elite investor judgment does not live in any single section. It lives in the relationship between sections. "Strong Signals, but Market shows no buyer budget" reads as momentum without a market. "Great Proof, thin Money" reads as real product, financing risk. Right now every section generates in isolation, so that read is structurally impossible to produce. The fix is a synthesis pass that runs last, reads a fixed-schema digest of the other 8 cards, and outputs (a) the single load-bearing card for this company and (b) the sharpest cross-card tension, each cited. This is a contained change in the synthesis layer (prompt, a small schema addition, and run-order), not a new system; the full mechanics are in §7-H. Fixed card set, fixed order, fixed output enum keep it cache-safe and non-brittle. This is the "next level."

**The thing that actually caps quality (name it honestly): retrieval coverage, not card design.** The cleanest 9-card screen still reads like 9 empty boxes if the evidence is not there. On real private companies, Proof, Money, and Market will often be thin. The cards are correct; the binding constraint on "reads like an elite human wrote it" is how much real, cited evidence the pipeline surfaces. See §9.

---

## 1. Blunt critique of the current set

**The deepest problem is not any single card. It is that four card vocabularies have drifted apart.**

| Vocabulary | Where | Cards |
|---|---|---|
| Generation sections | `research-sections.ts` | buyer, customer_proof, traction, financing, competition, product, why_it_matters, market, risks |
| Extension UI cards | `research-layer.ts` | Why care, Who pays, Timing, Proof, Signals, Money, Comps, Product, Next question |
| Web public card | `CardShell.tsx` (web) | Proof, Money, People, Signals, Comps, Open questions |
| Extension profile (legacy) | `CardShell.tsx` (extension) | Investor lens, Company, Funding, Team, Traction, Comparables, Sources |

Plus SPEC/INTENT mandate the long investor-screen labels (Buyer & Use Case, Market Structure & Timing) while DESIGN mandates terse ones and explicitly says avoid "Market Structure & Timing when a shorter label works." That is a doc-versus-doc contradiction, not just code drift.

**Three confirmed defects (code, not opinion):**

1. **`bullCase` is generated, verified, stored, and shown to nobody.** Confirmed by grep: `CardShell` is imported only by the public web page, never with `surface="extension"`, so the `ExtensionProfile` "Supported" block that renders `bullCase` is dead. The active extension surface, `ResearchLayerPanel`, has no bull card. `bullCase` is consumed only as a `whyItMatters` fallback (`generate-card.ts:666`). So we pay tokens to verify three supported claims no user sees. Meanwhile the bear case is surfaced (as Risk). The product shows the skeptic's view and hides the supported view, which is worse analysis, not leaner.

2. **"Proof" renders the wrong field, and the three description fields are mapped to the wrong cards.** In the fallback path: "Who pays" (serves) renders `description.concept`, "Proof" (customers) renders `description.serves`, "Product" (mechanism) renders `description.mechanism`. So "Proof" shows the intended buyer, not named customers, proven by the test at `research-layer.test.ts:123` asserting Proof's body is "Developers and engineering teams." A card called Proof that shows the audience is a weak card pretending to be a strong one.

3. **"Timing" does not match its content.** The card is 7 market-structure fields (buyer budget, pain severity, profit pool, expansion path), mostly not about timing. And it carries two competing data shapes: the section's `napkinMath` versus synthesis's `marketStructureAndTiming` (the latter is the only one with a schema type).

**Card-level weaknesses against your bar:**

- **Why care** renders `whyItMatters.text` as a bare `<p>`. A paragraph violates "no generic AI-generated paragraphs." It should be a lede plus cited bullets.
- **About 6 of 9 cards collapse into the same rendered shape** (generic items-list, rows, or paragraph via `LayerContent`). Money has a real ledger and Timing has napkin-math; the rest feel the same. That fails "each card should feel different in structure and density."
- **Comps renders a comma-joined blob** in its body (`comparables.map(...).join(", ")`), a logo list, exactly what the kernel says competition must not be. The items below are better, but the headline is a blob.
- **Comps carries no citation IDs** (INTENT confirms). The one card that ranks competitors is the one card a skeptic cannot audit, a trust hole inside an otherwise fully cited screen.
- **People/leadership has no card in the extension screen.** It lives in the always-on company-context header (`PeopleLine`), and on web as a "People" section. Defensible, but the spine should say that, not silently drop it, and web and extension treat it differently.
- **Valuation has no explicit home.** Money is a financing ledger; SPEC promised "Financing & Valuation" with price context.

**What is strong (keep):**
- The public/gated split is principled and load-bearing. Do not touch the architecture.
- Money is the best card: real ledger, named investors, conflict handling, citation-backed.
- The empty-state and source-quality discipline is genuinely good and on-brand.
- The 9 questions are the right 9 investor questions. The taxonomy is mostly right; the meaning and coverage drifted, not the shape.

---

## 2. The bar: what "an elite human investor wrote this" means here

Distilled from your own NVentures writing. Every card must hit these or it is slop:

- **Number plus source inline, or omit.** "Manus ~$90M run-rate (Bloomberg confirmed)," never "significant revenue growth." A naked adjective is worthless; the unit is the number with provenance.
- **Attach the "so what" to every fact.** "73,000 crawls per 1 referral, the web's economic model is breaking" beats stating the ratio. A fact without its implication is a data dump.
- **Verdict first, evidence second.** Lead with the claim or decision, stack proof under it. Do not open with a description or a TAM throat-clear.
- **Differentiation is proven, never asserted.** Name the customer, name the competitor they replaced, give the delta. "ConocoPhillips hit 90% vs 50% with DIY ChatGPT." Refuse to call a wrapper a moat; say "connectors aren't a moat" out loud if true.
- **Separate new, incremental, and standard.** Do not let standard tech read as differentiation.
- **0 to 3 supported claims, never padded to look balanced.** Bull and bear both stop at what is supported. A clean claim with no stated weakness reads as un-stress-tested.
- **State risk flatly, inline, and take a position.** "Pre-revenue research stage." "5 active lawsuits." Naming the bad fact next to the good one is what signals judgment; spinning it signals the opposite.
- **No hedging.** Kill might, could, potentially, I-think. Casual expert confidence, briefing a smart colleague, not a board.
- **Compression is the skill.** When one event explains everything, the read is one sentence. Length tracks the situation, never a template. Uniform sentence length is the deepest AI tell.

These become per-card prompt deltas in §4 and §7.

---

## 3. Recommended taxonomy

**Keep 9 cards, fixed order. Fix meaning and coverage, not the shape.** Rename one, re-map three, fold one orphan, add one drift-guard.

| # | id | Title | Gate | The one question it answers that no other card does |
|---|---|---|---|---|
| 1 | coreIdea | **Why care** | gated | Why spend the next 30 minutes: the load-bearing reason, read across the other cards |
| 2 | serves | **Who pays** | public | Who has the budget and what workflow changes (demand side) |
| 3 | mechanism | **Product** | public | What it is, how it works, what is genuinely new vs standard (supply side) |
| 4 | customers | **Proof** | public | Who actually uses or pays for it, named, with results (not who should) |
| 5 | signals | **Signals** | public | What changed recently and why it is momentum, not noise |
| 6 | investors | **Money** | public | What has been raised, from whom, at what price when disclosed |
| 7 | competition | **Comps** | public | Who competes on the same axis, how crowded, where the wedge is |
| 8 | marketStructureTiming | **Market** | gated | Is this a real, reachable, timely market, bottom-up |
| 9 | openQuestions | **Risk** | gated | What breaks the case, and the single sharpest diligence question |

**Leadership/People: not a 10th card.** Leadership facts (founders, execs, headcount) stay in the always-on company-context header on both surfaces; they are identity, not a screen question. Make web consistent with the extension here. **Team & Execution** (founder quality, hiring velocity, execution evidence) is a real future gated card, but only when an evidence backend exists. Today it would render mostly inference, so it fails "earns its place." Park it as a named v1, matching SPEC line 76.

---

## 4. Per-card specifications

Format: Job, Why it exists, Structure (must differ), Budget/max, Empty state, Don't render when, Overlap rule, Elite example, Prompt delta.

### 1 · Why care (gated)
- **Job:** The single load-bearing reason this deserves 30 minutes, synthesized across the other cards.
- **Why it exists:** It is the lede of the whole screen. Without it the reader assembles the thesis themselves, and doing that for them is the product's core value.
- **Structure:** 1 verdict lede line, then 2 to 3 cited supported bullets (the folded `bullCase`), then 1 tension line naming the sharpest cross-card conflict. (Distinct shape: lede plus bullets plus tension.)
- **Budget/max:** Lede 1 sentence (~25 words). Bullets 14 words each, each cited. Tension 1 sentence, cited. Hard stop at 3 bullets.
- **Empty state:** Before run: "Activate the investor lens to synthesize the read." After run with nothing surviving: "Not enough verified evidence to form a read."
- **Don't render when:** Never on the public web card. Shows needs-analysis until synthesis runs.
- **Overlap rule:** May not restate Market ("large market" is banned as a reason) and may not just echo a Signals line. It points at cards; it does not duplicate them.
- **Elite example:** "Voice agents are crossing into production and Vox owns the latency layer everyone else buys. Bullets: 11 of the top-20 CCaaS vendors integrate Vox [3]; sub-300ms round-trip vs ~800ms for ElevenLabs at equal quality [7]; $0 enterprise churn across 14 logos [2]. Tension: Signals are strong but Market shows no disclosed buyer budget yet [4], so adoption is real and willingness-to-pay is unproven."
- **Prompt delta:** Feed the 8-card digest; require `loadBearingCardId` from the fixed enum and a `tension` as an ordered pair of card ids plus one cited sentence. Fold `bullCase` here as the bullets. Forbid "large market" as the reason.

### 2 · Who pays (public)
- **Job:** The buyer with budget and the workflow that changes. Demand side.
- **Why it exists:** "Who has the pain and the money" is the first question on any deal; legacy tiles answer it with a category label, which is useless.
- **Structure:** 1 buyer sentence, then up to 3 points, each one of {who buys, what workflow it replaces, what pain forces adoption}. (Distinct shape: typed who/workflow/pain points.)
- **Budget/max:** 1 sentence plus 3 points, 18 words each.
- **Empty state:** "No buyer or use-case evidence found yet."
- **Don't render when:** Always renders (public). Empty is honest.
- **Overlap rule:** Names the buyer and pain only. No mechanism (that is Product), no named customers (that is Proof). Intended buyer is not proven buyer.
- **Elite example:** "Sold to RevOps leaders at 200 to 2,000-seat SaaS companies. Replaces the manual SDR list-building that eats ~40% of rep time [5]. Pain is acute where pipeline targets rose but headcount froze [5]."
- **Prompt delta:** Require the budget owner (title or function), not just "businesses." Tie the pain to a quantified workflow cost where evidence allows.

### 3 · Product (public)
- **Job:** What it is, how it works, and what is genuinely new vs standard. Supply side.
- **Why it exists:** Differentiation is where most company-intel tools hand-wave. This card forces the new/standard split.
- **Structure:** 1 "what it is" sentence, then up to 3 points tagged new or standard, each naming the differentiator or admitting it is table stakes. (Distinct shape: new-vs-standard split points.)
- **Budget/max:** 1 sentence plus 3 tagged points.
- **Empty state:** "No product or technology evidence found yet."
- **Don't render when:** Always renders (public).
- **Overlap rule:** No buyer (Who pays), no competitor ranking (Comps). It can name what is differentiated; how it ranks vs rivals is Comps.
- **Elite example:** "An eval harness that replays production traffic against model candidates. New: deterministic replay of real traces, so a regression is a failed assertion not a vibe [6]. Standard: the LLM-as-judge scoring everyone ships. The replay corpus is the moat; the judge is not."
- **Prompt delta:** Force the new/incremental/standard split. Ban "AI-powered" and "cutting-edge"; refuse to call a wrapper or connectors a moat.

### 4 · Proof (public)
- **Job:** Who actually uses or pays, named, with the result. Proven adoption only.
- **Why it exists:** Named customers plus deltas are the strongest non-financial signal. This is where "proven, never asserted" lives.
- **Structure:** Named-entity rows: {customer/logo, relationship (customer/pilot/partner), result or scale}. (Distinct shape: named-customer rows.)
- **Budget/max:** 4 proof rows, 1 line each.
- **Empty state:** "No cited customer proof yet," and this is when there is genuinely none, not a fallback to the audience description.
- **Don't render when:** Renders empty rather than faking. Critical fix: never fall back to `description.serves`.
- **Overlap rule:** Only named or proven adoption. Intended buyer is Who pays. A logo with no relationship evidence does not qualify.
- **Elite example:** "ConocoPhillips: production deployment, 90% query accuracy vs ~50% on their DIY ChatGPT build [2]. Cisco: paid pilot across 3 BUs, expanded to 1,200 seats in two quarters [4]."
- **Prompt delta:** Keep the source's exact word (customer/pilot/user). No logo without a relationship plus result. Empty beats vague.

### 5 · Signals (public)
- **Job:** What changed recently, and why each change is momentum (adoption, pull, resource attraction) rather than noise.
- **Why it exists:** Recency plus momentum is the freshest read; the 6-hour TTL says this is the card that decays fastest.
- **Structure:** Dated timeline rows: {date, signal, so-what}, weak signals tagged, reverse chronological. (Distinct shape: dated timeline.)
- **Budget/max:** 6 dated rows. Each so-what 12 words.
- **Empty state:** "No recent signal with a usable source."
- **Don't render when:** Always renders (public).
- **Overlap rule:** A financing event appears here only as momentum ("raised from a tier-1 lead"); the ledger is Money. Do not duplicate the round table.
- **Elite example:** "2026-04: shipped SOC2 and landed first FSI logo, unlocking the regulated buyer they were locked out of [3]. 2026-03: hired ex-Databricks VP Eng, signaling a platform build, not a feature [1]. (weak) 2026-02: 2k GitHub stars."
- **Prompt delta:** Every row needs a so-what. Label weak signals explicitly. No signal without momentum/pull/adoption logic.

### 6 · Money (public)
- **Job:** What has been raised, from whom, at what price when disclosed, with conflicts preserved.
- **Why it exists:** Financing cadence and backer quality are core, and it is where conflict-preservation earns trust.
- **Structure:** Ledger table: {round, amount, lead, date}, plus a total line, plus a valuation row when disclosed, plus conflict rows. (Distinct shape: ledger table, already best-in-class.)
- **Budget/max:** 4 rounds plus total plus optional valuation plus conflicts.
- **Empty state:** "No public funding found."
- **Don't render when:** Always renders (absence is informative).
- **Overlap rule:** Reports financing facts only. Never estimates valuation (kernel rule). Whether the price is good is judgment, which belongs in Why care or Market, not here.
- **Elite example:** "$91M across 2 rounds. Series B $64M, Kleiner lead, 2024-04, ~$400M post (TechCrunch) [1]. Seed $27M, Index, 2023-06 [1]. Conflict: Bloomberg reports $600M closed at $9B; company site silent [e2]."
- **Prompt delta:** Surface disclosed valuation or price context as a row. Keep conflicts as conflicts. Never infer total raised.

### 7 · Comps (public)
- **Job:** Who competes on the same axis, how crowded, and where the wedge is.
- **Why it exists:** "Crowded or not, and why you still win" separates a real competitive read from a logo dump.
- **Structure:** Ranked list: {rank, name, axis of overlap (same buyer / budget / workflow / model layer)}, then 1 crowdedness verdict, then 1 wedge line. (Distinct shape: ranked list plus verdict.)
- **Budget/max:** 3 to 7 ranked plus 1 crowdedness plus 1 wedge.
- **Empty state:** "No useful competitive evidence found yet." Sparse-but-real is a finding, not empty.
- **Don't render when:** Always renders (public).
- **Overlap rule:** Names the axis of overlap (kernel rule), never a bare logo list. Differentiation claims are Product; relative ranking is here.
- **Elite example:** "Crowded on the surface, thin on the wedge. 1 ElevenLabs: same TTS buyer, broader, slower [c2]. 2 Cartesia: same latency wedge, earlier [c5]. 3 OpenAI Realtime: same layer, will converge. Wedge: on-prem plus sub-300ms is the pair only Vox ships today."
- **Prompt delta:** Rank by relevance with the overlap axis stated. Separate quantity (count) from quality. Carry citation IDs (schema change, §7-J).

### 8 · Market (gated, renamed from Timing)
- **Job:** Is this a real, reachable, timely market, built bottom-up, not from TAM.
- **Why it exists:** The structural read (buyer budget, profit pool, adoption trigger) is the densest investor content and the clearest upgrade over a database tile.
- **Structure:** Napkin-math block (formula, buyer count, annual spend, implied size) plus labeled structure claims (buyer budget, pain severity, adoption trigger, profit pool, expansion path, timing risk). (Distinct shape: math block plus labeled fields, the densest card.)
- **Budget/max:** Napkin-math (4 rows) plus up to 7 fields. "Better 2 strong fields than 8 weak ones."
- **Empty state:** "No market-structure claims survived verification."
- **Don't render when:** Never public. Needs-analysis until synthesis runs.
- **Overlap rule:** Bottom-up first, never opens with TAM. Timing risk here is market timing; deal-breaking risks are Risk.
- **Elite example:** "Bottom-up: ~3,500 CCaaS deployments times ~$220k/yr voice-AI line equals ~$770M reachable today, expanding with seat-based usage [4]. Buyer budget: contact-center automation, already funded [4]. Trigger: GPT-4o-class latency crossed the human-handoff threshold in 2025. Timing risk: production voice workflows are still early [1]."
- **Prompt delta:** Unify on one data shape (§7-E). Require the bottom-up formula before any top-down cross-check.

### 9 · Risk (gated, was "Next question")
- **Job:** What breaks the case, plus the single sharpest diligence question.
- **Why it exists:** A screen that only argues the bull case is not a screen. This is the stress test.
- **Structure:** 0 to 3 risk lines, each {risk, so-what / what it threatens}, evidence-anchored, then 1 lead diligence question. (Distinct shape: risk lines plus one question.)
- **Budget/max:** 0 to 3 risks plus 1 lead question (2 more optional).
- **Empty state:** "No supported risks or diligence questions found yet."
- **Don't render when:** Never public. Needs-analysis until synthesis runs.
- **Overlap rule:** Every risk points to evidence or missing evidence; no generic risks. Distinct from Market's timing risk (that is structural; this is deal-breaking).
- **Elite example:** "Risks: revenue is 3 logos deep, concentration, not a market yet [2]. Latency lead is ~12 months and OpenAI is in the layer, so the moat may be temporary. Question: what is the gross margin per minute at scale, and does it survive the model vendors raising inference prices?"
- **Prompt delta:** 0 to 3, no padding. Each risk resolves to what it threatens. Lead with the one question that would most change conviction.

**Structural distinctness summary** (your "feel different" bar): bullets plus tension; who/workflow/pain; new/standard split; named rows; timeline; ledger table; ranked list plus verdict; math block plus fields; risk lines plus question. Nine shapes, reducible to four rendering primitives (claim-list, key-rows, table, timeline) so the maintenance tax stays bounded.

---

## 5. Public vs gated

**Sharpened principle:** Public equals sourced facts ("what is true about this company"). Gated equals investment judgment ("should you care, is this a good deal"). The gate is investment judgment, not any judgment. Comps ("likely wedge") and Product ("what is new") carry descriptive judgment but stay public because they describe the company, not the decision.

- **Public (6):** Who pays, Product, Proof, Signals, Money, Comps. Plus leadership facts in the header.
- **Gated (3):** Why care, Market, Risk.

**Position on the one live tension:** the critic argues gating Market hides the best public differentiator. Keep Market gated anyway. The public card wins on cited facts plus speed; the synthesis (why-it-matters, market structure, risk) is the upsell that justifies the extension. Moving Market public would erode the gate's reason to exist. Who pays already gives the public card the buyer and use-case substance that beats a database tile.

---

## 6. Deletions, merges, splits, renames

- **Rename:** Timing to **Market** (label does not match content today).
- **Resolve by your call (flagging, not deciding for you): card 9 naming.** I recommend **Risk**, folding bearCase plus openQuestions into one card; web's "Open questions" and SPEC's "Risks & Diligence" align to it. Note that DESIGN currently lists "Risk" and "Next question" as two separate module rows, so this is a real merge decision, not a settled label. If you prefer the forward-looking framing, "Next question" leading with the single diligence question is the alternative.
- **Fold (not cut):** `bullCase` into **Why care** as the supported bullets. Fixes the orphan and the bare-paragraph slop in one move. No schema change.
- **Delete:** the dead `ExtensionProfile` branch in `CardShell.tsx` (confirmed unused). Removes the 4th vocabulary and the only stale `bullCase` render.
- **Re-map (not merge):** the three description fields to the right cards: Who pays from serves, Product from concept plus mechanism, Proof from named customers only.
- **Considered and rejected, merge Who pays plus Product into "What it is" (8 cards).** Tighter, but it collapses demand vs supply, which an investor genuinely separates. Their thinness today is a generation-coverage problem, not a taxonomy problem. Keep separate.
- **Considered and rejected, adaptive per-company card sets.** Brittle; breaks the shareable artifact. (§0.)
- **Add (drift-guard, not a card):** one source of truth for label plus gate so the four vocabularies cannot re-drift.
- **Future split:** **Team & Execution** as a gated judgment card once an evidence backend exists (v1). Leadership facts stay in the header now.

---

## 7. Schema / synthesis / pipeline / UI implications

Lettered to the prioritized sequence in §8. The section-generation system and the synthesis system share a boundary the failed code-mapper never fully traced; E, F, and H cross it, so treat their file lists as a first cut to confirm before costing.

**A · Fold bullCase into Why care.** UI-only, no schema change.
- `research-layer.ts` `layerDisplayForCard` coreIdea branch: append `card.synthesis.bullCase` as `items` (lede stays `body`).
- `research-sections.ts` `deriveLegacyResearchSectionsFromCard` why_it_matters: include bullCase items.
- Tests: `research-layer.test.ts` coreIdea test asserts bullet items.

**B · Fix Proof plus re-map description fields.** UI-only, no schema change. Highest visible-bug payoff.
- `research-layer.ts`: `serves` body to `description.serves`; `mechanism` (Product) to `description.concept` plus `description.mechanism`; `customers` (Proof) to named customers, else empty (drop the `serves` fallback).
- Tests: flip `research-layer.test.ts:122-138` expectations.

**C · Add `customers` to the public card** so Proof fills in basics (4-touch field add). Bigger; P2.
- `core/card.ts` schema, then `llm/extraction.ts`, then `pipeline/generate-card.ts` assembly plus `sanitizeCardTrust`, then `ui/CardShell.tsx` plus `research-layer.ts` render. Each customer needs `citationIds`.

**D · Rename Timing to Market.** Trivial.
- `research-layer.ts` title (line 61); align SPEC/INTENT/DESIGN; update test titles.

**E · Reconcile napkinMath vs marketStructureAndTiming.** Schema decision.
- Make `marketStructureAndTiming` the single gated shape; add optional `napkinMath` to it in `core/card.ts` synthesisSchema plus `llm/synthesis.ts` tool schema. Retire the section-only `researchSectionNapkinMathSchema` divergence. UI `marketRows` reads one shape.

**F · Single source of truth for label plus gate.** Kills re-drift.
- Move canonical `{title, visibility}` into `research-sections.ts` definitions; have `research-layer.ts` `RESEARCH_LAYER_CARDS` derive title and gate via `layerId`. Add a test asserting they match. (Today's stale "Timing" and "Next question" titles prove drift is live.)

**G · Delete dead ExtensionProfile.** Confirmed: `CardShell` is imported only by `apps/web/src/app/c/[slug]/page.tsx`, never with `surface="extension"`. Remove the branch plus function from `CardShell.tsx`. `knip` will confirm nothing else references it.

**H · Cross-card read in whyItMatters, the next-level lever.** Synthesis change.
- Run whyItMatters last, after the other 8 cards are generated and verifier-filtered. Note that `synthesizeCard` today emits whyItMatters, bull, bear, and market in a single tool call, so this is a run-order change, not just a prompt tweak.
- Feed a fixed-schema digest: for each of the 8 fixed `layerId`s, supply `{ layerId (closed enum), oneLineState, keyCitedFacts (2 cited sentences with [n]), coverage in {empty, thin, strong} derived structurally from field presence plus surviving-citation count, never an LLM score }`.
- Constrain output: `loadBearingCardId` (from the enum), `tension` (ordered pair of layer ids plus exactly one cited sentence; both cards must have coverage not equal to empty), 2 to 3 cited bullets (the folded bullCase).
- Degrade explicitly: if fewer than 3 cards verified, emit "not enough verified evidence" instead of a load-bearing pick; tension may never cite an empty card.
- Files: `llm/synthesis.ts` (prompt plus tool schema additions), `pipeline/generate-card.ts` (ordering plus digest builder), `core/card.ts` (synthesis fields), `research-layer.ts` (render the tension line under Why care).
- Non-brittleness is in the fixed input schema plus fixed output enum, not adaptive sets and not a salience scorer.

**I · People/leadership.** No new card.
- Keep `PeopleLine` in the extension company-context header. Make web's "People" a header or identity element consistent with it. Document in the spine that leadership is a header fact by design.

**J · Comps citation IDs.** Schema.
- Add `citationIds` to `comparables` in `core/card.ts`; plumb through provider and extraction; render markers in Comps. Closes INTENT open-question #4 and the audit hole.

**K · Sharpened per-card generationPrompts.** Prompt-only, cheap, high-leverage.
- Bake §2's bar into each `research-sections.ts` prompt: number plus source, so-what, new/incremental/standard (Product), 0 to 3 no-padding (Risk, bull, bear), named-proof-only (Proof), axis-of-overlap (Comps), bottom-up-first (Market). Can ship incrementally alongside each card fix.

---

## 8. Prioritized implementation sequence

This sequence assumes the §7 first-cut file lists; confirm the section-versus-synthesis boundary before treating P0/P1/P2 as costed.

**P0, cheap correctness, UI plus tests only, no schema, ship first.**
1. **B**, Fix Proof plus re-map serves/concept/mechanism. Removes the most embarrassing semantic bug.
2. **A**, Fold bullCase into Why care. Makes the gated card earn its tokens; kills the bare paragraph.
3. **D**, Rename Timing to Market plus align docs.

**P1, kill drift plus the next-level lever.**
4. **G**, Delete confirmed-dead ExtensionProfile.
5. **F**, Single source of truth for label and gate plus drift-guard test.
6. **H**, Cross-card read in whyItMatters. The actual "next level."
7. **E**, Reconcile napkinMath into the synthesis market shape.
8. **K**, Sharpened prompts (rolls alongside 1 to 7 per card).

**P2, schema plus coverage, bigger.**
9. **C**, Add `customers` to public schema plus extraction (Proof fills in basics).
10. **J**, Comps citation IDs.
11. **I**, Document People-as-header; spec future gated Team & Execution.

---

## 9. The one thing that actually caps quality

The taxonomy is right and the fixes above are real, but they will not, by themselves, make cards "read like an elite human investor wrote it." That bar is set by how much real, cited evidence the retrieval layer surfaces. On most private companies, Proof has no named customers, Money has one round, Market has no disclosed budget, and a perfect card spec over thin evidence is still a thin card. The §2 voice rules are only achievable when the pipeline finds the number, the logo, the delta. So the honest sequencing truth: the card work above is necessary and cheap; the next investment after it is retrieval depth, not more card design. Name that explicitly so the card pass is not mistaken for the whole job.
