# Extension experience feedback: findings and next steps (2026-07-13)

Samay's review of the deployed side panel (Huckberry card) surfaced seven issues. Each is root-caused below with file references. The fix work is specced in the companion prompt; this file is the durable record.

## 1. Investor read renders one character per line

Symptom: the memo's lede, "If true", and "It breaks if" text renders vertically, one letter per line (screenshots 2026-07-12 23:55).

Root cause: commit `827bff8` removed the `LensPostureDot` elements from the memo markup but left the dot column in the CSS. `.cs-investor-read-lede`, `.cs-lens-tension-side p`, and `.cs-lens-timing p` still declare `grid-template-columns: 10px minmax(0, 1fr)` (`apps/extension/src/styles.css:1807`, `:1872`). The text `<span>`, now the only child, lands in the 10px dot track, and `overflow-wrap: anywhere` plus the blanket `min-width: 0` (`styles.css:1774-1777`) breaks it at every character.

Fix: remove the orphaned 10px track (single-column rows), and add a regression guard in the Playwright UI harness that fails when any long text node renders in a collapsed container.

## 2. Seal ribbon on the memo reads as slop

`border-top: 2px solid var(--color-seal)` at `styles.css:1784`. Accent ribbons on cards are on the kill list; the seal color belongs on the section label only.

## 3. Investor read duplicates the synthesis layer cards

`ResearchLayerPanel.tsx` renders the memo (`InvestorReadCard`, line 935) and, below it, the analysis layer cards `coreIdea` (Why care), `theCase` (The case), `marketStructureTiming` (Timing), and `openQuestions` (Next question) from `RESEARCH_LAYER_CARDS` (`research-layer.ts:76-85`). All five surfaces render the same `card.synthesis`. Decision: the memo is the single synthesis surface; the four synthesis layers leave the default deck. The memo absorbs the extra bull/bear claims and questions behind its existing "+N more" affordance so no verified content is lost. The six card-sourced layers (Who pays, Proof, Signals, Money, Comps, Product) stay.

## 4. Who pays and Product are one short sentence, sometimes cut mid-sentence

Two distinct causes:

- Truncation bug: `firstDescriptionSentence` (`packages/core/src/description-normalization.ts:71-74`) splits on the first `.!?` followed by whitespace, so "Washington D.C. and ..." truncates at "D.C." That damage happens at extraction time (`normalizeOptionalDescriptionSentence`, `packages/llm/src/extraction.ts:588`) and is stored in the card. The same abbreviation-blind regex family exists in `apps/extension/src/extension-format.ts:78` and `packages/llm/src/person-read.ts:86-93` (where it can miscount sentences and wrongly suppress person reads).
- Thinness by design: extraction constrains `serves` and `mechanism` to one sentence each (`extraction.ts:284-286`, `:833`), and the layer bodies render those single fields verbatim (`research-layer.ts:649-662`, `:812-822`).

Fix: one abbreviation-aware sentence utility in core used by all four call sites, plus a loosened extraction contract (up to two concrete sentences per field with substance requirements).

## 5. Comps are flat and shallow

Comparables retrieval exists (`research-plan.ts:112` query, `exa_competition`/`exa_find_similar` source classes in `source-fetching.ts:160`), but the display is a name list with up to four one-liners (`research-layer.ts:792-811`). No sub-segment definition, no crowdedness read, no per-comp "why this is the alternative." Fix direction: a positioning read for the layer (sub-segment framing sentence plus a one-phrase reason per comp), with comparables filtered to genuine buyer alternatives.

## 6. Money is robotic and redundant

The money section body is template prose from `deriveLegacyResearchSectionsFromCard` (`packages/core/src/research-sections.ts:363-380`): "Total raised is $6,250,000." and "Venture Round was $6,250,000 on 2019-07-25." render together, repeating the same number, with raw ISO dates. Investor names exist in the schema (`funding.investors`, `rounds[].leadInvestors`) but render as a text line. Fix: composed copy (compact currency, human dates, no repeated amounts) and quiet investor pills.

## 7. People hovercards and the +N chip

- The dossier tooltip (`SharedTooltip.tsx`) already has the loved behavior: 160ms grace window and pointer-into persistence, dossier variant only. The plain text variant (the Description "(more)" tooltip, `CompanyHeader.tsx:90`) closes instantly on pointer leave. Fix: extend the grace-window persistence to all tooltip variants.
- Formatting: `.cs-dossier-read` (`styles.css:1324`) sets the accent text face where the Description tooltip uses quieter body typography; align the dossier body with the Description tooltip's type.
- Cut-off sentences: two candidates to reproduce and close. (a) `.cs-shared-tooltip` caps at `max-height: min(280px, ...)` with `overflow: auto` (`styles.css:1246`), so long dossiers clip at the fold with no visible scroll affordance. (b) `sentenceCount` in `person-read.ts` shares the abbreviation bug, and the batch `max_tokens: 1500` (`person-read.ts:163`) is shared across all reads in one call.
- The header "+2" chip is a working expand button (`CompanyHeader.tsx:501-511`) but has no interactive affordance. Fix: style it as obviously pressable, add a hover tooltip listing the hidden names and roles, keep click-to-expand.

## Verification bar for the fix session

Real-panel verification (dev build in Chrome or `qa:extension:ui` fixtures) for every visual fix, a new layout regression test for the vertical-text class of bug, `npm run check` green, and `npm run audit:css -w @cold-start/extension` clean.
