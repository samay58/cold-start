# Extension experience feedback: findings and next steps (2026-07-13)

Samay's review of the deployed side panel (Huckberry card) surfaced seven issues. Each is root-caused below with file references. The fix work is specced in the companion prompt; this file is the durable record.

## 1. Investor read renders one character per line

Symptom: the memo's lede, "If true", and "It breaks if" text renders vertically, one letter per line (screenshots 2026-07-12 23:55).

Root cause: commit `827bff8` removed the `LensPostureDot` elements from the memo markup but left the dot column in the CSS. `.cs-investor-read-lede`, `.cs-lens-tension-side p`, and `.cs-lens-timing p` still declare `grid-template-columns: 10px minmax(0, 1fr)` (`apps/extension/src/styles.css:1807`, `:1872`). The text `<span>`, now the only child, lands in the 10px dot track, and `overflow-wrap: anywhere` plus the blanket `min-width: 0` (`styles.css:1774-1777`) breaks it at every character.

Reproduced in the Playwright sidepanel harness (2026-07-13): the lede span measures 10px wide by 1,260px tall, with a computed row template of `10px 325px`. The existing "investor read stays bounded" spec passes despite this, because its only layout guard is horizontal overflow, which a 10px-wide column never trips.

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

- The dossier tooltip (`SharedTooltip.tsx`) already has the loved behavior: 160ms grace window and pointer-into persistence, dossier variant only. Measured in the harness: the dossier stays open with the pointer inside it; the plain text variant (the Description "(more)" tooltip, `CompanyHeader.tsx:90`) closes before the pointer can reach it. Fix: extend the grace-window persistence to all tooltip variants.
- Formatting: `.cs-dossier-read` (`styles.css:1324`) sets the accent text face where the Description tooltip uses quieter body typography; align the dossier body with the Description tooltip's type.
- Cut-off sentences, reproduced: `.cs-shared-tooltip` caps at `max-height: min(280px, ...)` with `overflow: auto` (`styles.css:1246`). A three-sentence read plus provenance, email, and channels measured scrollHeight 312 against clientHeight 278 in the harness, so the bottom rows sit below the fold with no visible scroll affordance, and a longer read cuts mid-sentence. Secondary upstream guards: `sentenceCount` in `person-read.ts` shares the abbreviation bug (wrongly suppressing valid reads), and the batch `max_tokens: 1500` (`person-read.ts:163`) is shared across all reads in one call.
- The header "+2" chip is a working expand button, confirmed by probe click (`CompanyHeader.tsx:501-511`), but it renders with a 0.42-alpha background on parchment and no other affordance, so it reads as dead. Fix: style it as obviously pressable, add a hover tooltip listing the hidden names and roles, keep click-to-expand.

## How these were reproduced

A temporary Playwright probe spec (deleted after this record) ran against the sidepanel UI harness with the Browserbase fixtures: a synthesis card for the memo measurements, and a people card extended with a long person read, a fifth person, and an expanded description for the tooltip and chip probes. Screenshots landed in `/private/tmp/cold-start-investor-read-long.png` (the vertical-text repro) and `/private/tmp/cold-start-dossier-probe.png` (the dossier fold clip).

## Verification bar for the fix session

Real-panel verification (dev build in Chrome or `qa:extension:ui` fixtures) for every visual fix, a new layout regression test for the vertical-text class of bug, `npm run check` green, and `npm run audit:css -w @cold-start/extension` clean.

## Fix session record (2026-07-13)

All seven workstreams landed on `extension-feedback-fixes`. Verification: full `npm run check` green, `qa:extension:ui` 36/36 including the new collapsed-track layout guard, `audit:css` clean, and healthy-counterpart screenshots of every surface this document flagged (memo in light and dark, the memo overflow tooltip, Money, Comps, both tooltip variants, the dossier long read, and the people chip at rest and on hover).

### Review addendum from the consolidation session (workstreams A, B, D)

A, B, and D were verified faithful to spec at the cited lines. Three follow-ups survived verification and were fixed the same night: the public evidence clamp in `packages/ui/src/CardShell.tsx` and the two local `sentenceCount` copies in the core quality modules now route through the shared splitter (`ff2380e`), and the stale seal comment above `.cs-investor-read` is corrected (`4d94a93`). One non-finding stays by design: the splitter refuses to split after a listed abbreviation even before a capitalized word. That is the documented under-split bias, pinned by tests; do not "fix" it.

### Found at the gate

Stored and derived research sections shadow the card-direct display branches in `displayFromSection`, and production cards always carry derived sections, so the Comps upgrade rendered only on section-less fixture cards. Caught by screenshot verification, fixed in `bcc9774` on both paths. The adversarial review then confirmed four ship findings, fixed in `4a79f5f`: the people chip orphaned its open tooltip on expand, overflow questions dropped their changes-the-read line, the composed money line put the round name in the hero slot instead of the figure, and `formatCompactUsd` rendered "$1000M" in the band under a billion.

### Follow-ups filed, not fixed

- Model-generated financing sections with a differently worded investor line would duplicate the investor pills; the dedup filter matches only the derived wording.
- Plain tooltips have no Escape dismiss (the dossier does); an open tooltip can swallow the first click on a control beneath it until the grace window closes it.
- The splitter treats "no." and "co." as abbreviations even where they end a sentence; bounded by the under-split bias.
- The composed money line can imply one round accounts for the total when earlier rounds simply have no disclosed amounts.
- The synthesis refresh signal was lost with the layer removal: when stale synthesis is re-running in the background, the memo shows the stale read with no refreshing indicator until the run lands. A replacement affordance was ruled out of scope for this session.
