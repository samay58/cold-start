# Cold Start sub-card exploration: locked spine (working artifact)

> Decided before fan-out so parallel per-card analysis can't re-derive (and re-drift) the taxonomy.
> Exploration only. No code yet. Source surfaces re-read 2026-05-29.

## Meta-answer (can investor taste go to the next level?)
Yes, but NOT by adding cards or more taste-prose. The honest "no" is to **adaptive per-company card sets**
(seed-devtools vs Series-C-fintech get different cards). That needs brittle company-type classification and
breaks the stable shareable `/c/{slug}` artifact + caching. The non-brittle next level is nearly free:
**fixed set, fixed order, and a cross-card read**, where `whyItMatters` names the single load-bearing card for THIS
company and the sharpest tension across cards ("strong Signals but no buyer budget in Market = momentum without a
market"). Elite taste lives in the cross-card view, not in per-section prose. Each section currently generates
independently, which is why that view is missing today.

## Gate principle (sharpened)
- **Public = sourced facts** ("what is true about this company").
- **Gated = investment judgment** ("should you care / is this a good deal").
- The gate is *investment judgment*, not *any judgment*. Comps ("likely wedge") and Product ("what's
  differentiated") carry descriptive judgment but stay public because they describe the company, not the decision.

## The four-vocabulary drift (the actual disease)
Fix drift in MEANING + COVERAGE, not the existence of layers (SPEC allows internal aliases).
- `packages/core/src/research-sections.ts`: 9 generation sections (prompts, visibility, TTL). Source of truth.
- `apps/extension/src/research-layer.ts`: 9 UI cards, 1:1 via `layerId`. Terse titles.
- `packages/ui/src/CardShell.tsx` web: 6 sections (Proof/Money/People/Signals/Comps/Open questions).
- `CardShell` `ExtensionProfile` (surface="extension"): different again; **confirmed dead** (sidepanel renders
  `ResearchLayerPanel`). Confirm + delete.
- SPEC/INTENT list 11 "investor-screen" labels (adds Business Model, Strategic Relevance, Team & Execution).

## Three confirmed defects
1. **bullCase orphaned.** Generated, verified, stored, used as `whyItMatters` fallback (`generate-card.ts:666`),
   but never rendered to a user (only in dead `ExtensionProfile`). We pay tokens to verify 3 claims nobody sees.
   → FOLD into "Why care" as supported bullets.
2. **Proof renders the wrong field.** `customers` layer fallback renders `description.serves` (intended buyer),
   not named customers. And `serves` layer renders `description.concept`. The three description sub-fields
   (concept/serves/mechanism) are mapped to the WRONG cards. Test `research-layer.test.ts:123` proves it.
3. **"Timing" label ≠ content.** The card is 7 market-structure fields (buyer budget, profit pool, …), mostly not
   timing. Rename → **Market**. Also two competing data shapes: section `napkinMath` vs synthesis
   `marketStructureAndTiming`. Pick one.

## Locked card spine (9 cards, fixed order)
| # | id (layer) | Title | Gate | Distinct job | Source / fix |
|---|---|---|---|---|---|
| 1 | coreIdea | **Why care** | gated | Single load-bearing reason for 30 min, as a cross-card read | lede + 2-3 cited bullets (fold `bullCase`) |
| 2 | serves | **Who pays** | public | Buyer + workflow + pain (demand) | use `description.serves` (not concept) + buyer section |
| 3 | mechanism | **Product** | public | What it is + how it works + what's differentiated (supply) | use `description.concept` + `mechanism` |
| 4 | customers | **Proof** | public | Named customers / proven adoption ONLY | stop serves-fallback; empty if none |
| 5 | signals | **Signals** | public | Dated momentum timeline | card.signals; don't duplicate Money |
| 6 | investors | **Money** | public | Financing ledger | rounds/investors/total/conflicts |
| 7 | competition | **Comps** | public | Ranked competitors + crowdedness + wedge | ranked list, not comma-blob |
| 8 | marketStructureTiming | **Market** | gated | Real/reachable/timely market | napkin-math + structure fields; reconcile data shape |
| 9 | openQuestions | **Risk** | gated | What breaks the case + sharpest diligence question | bearCase + openQuestions |

## Per-card structure must differ (where "elite human wrote this" lives)
Why care = lede+bullets · Who pays = 1 line + ≤3 points · Product = 1 sentence + ≤3 points ·
Proof = named-customer rows · Signals = dated timeline · Money = ledger table · Comps = ranked list ·
Market = napkin-math block + fields · Risk = 0-3 risks + 1 lead question. No two cards share a shape.

## Considered merge to present (not adopted)
Who pays + Product → "What it is" (8 cards). Tradeoff: tighter, but collapses demand-vs-supply distinction an
investor genuinely separates. Recommend keep separate; thinness is a generation-coverage problem, not taxonomy.
