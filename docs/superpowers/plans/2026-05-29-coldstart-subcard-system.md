# Cold Start Sub-Card System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the sub-card system so each card has a distinct, correctly-mapped job, the orphaned bull case reaches users, labels stop drifting, and the gated cards earn their tokens, then layer the cross-card read and coverage work on top.

**Architecture:** Cold Start renders nine research cards from two live engines: the monolithic `synthesizeCard` (writes `card.synthesis`, the analysis path) and the per-section `synthesizeResearchSection` (writes the `researchSections` table, the per-module path). Every card store also writes legacy-derived sections via `deriveLegacyResearchSectionsFromCard`. The extension renders a stored section when present (`displayFromSection`) and a hand-coded card-derived fallback otherwise (`layerDisplayForCard` branches). P0 fixes the fallback path and labels; P1/P2 touch the engines and schema.

**Tech Stack:** TypeScript, Zod, React 19, Vitest, Drizzle/Postgres, Anthropic tool-use. Monorepo: `packages/core`, `packages/llm`, `packages/pipeline`, `apps/extension`, `packages/ui`, `apps/web`.

**Why this is phased into three plans:** The eleven items span four independent subsystems with different risk and review needs. Per the writing-plans scope-check, each phase should produce working, testable software on its own. P0 is the shippable core and is fully task-detailed here. P1 and P2 cross the two-engine seam and the card schema; each forces one architectural decision (named below) and should be authored as its own task-level plan once that decision is made. Do not start P1/P2 code from this document; start from the decision gate.

---

## Phase P0: correctness, drift, dead code (one PR, no schema change)

Run from repo root. Tests: `npm test -w @cold-start/extension -- research-layer`. Full gate before PR: `npm run check`.

### Task 1: Re-map description fields and fix Proof

The three description sub-fields are mapped to the wrong cards. "Who pays" (`serves`) renders `concept`; "Proof" (`customers`) renders `serves`; "Product" (`mechanism`) renders only `mechanism`. Fix all three in the hand-coded fallback path. This path runs when no stored section exists for the layer; when a real `customer_proof` section is generated, `displayFromSection` handles Proof instead.

**Files:**
- Modify: `apps/extension/src/research-layer.ts` (the `serves`, `customers`, `mechanism` branches of `layerDisplayForCard`, currently around lines 454-486 and 609-621)
- Test: `apps/extension/tests/research-layer.test.ts` (the "derives populated display data from real card fields" test, currently lines 122-138)

- [ ] **Step 1: Update the failing test to the corrected mapping**

In `research-layer.test.ts`, replace the "derives populated display data from real card fields" test body with:

```ts
  it("derives populated display data from real card fields", () => {
    // Who pays renders the buyer (serves), not the product concept.
    expect(layerDisplayForCard(baseCard(), "serves")).toMatchObject({
      body: "Developers and engineering teams.",
      sourceCount: 1,
      status: "populated"
    });
    // Product renders the concept (what it is), not just the mechanism.
    expect(layerDisplayForCard(baseCard(), "mechanism")).toMatchObject({
      body: "AI-native terminal collaboration layer.",
      sourceCount: 1,
      status: "populated"
    });
    // Proof shows an honest empty state when no named customer proof exists,
    // it must not fall back to the buyer description.
    expect(layerDisplayForCard(baseCard(), "customers")).toMatchObject({
      body: "No named customer proof found yet.",
      status: "empty"
    });
    expect(layerDisplayForCard(baseCard(), "signals")).toMatchObject({
      body: "Warp launches AI features",
      sourceCount: 1,
      status: "populated"
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @cold-start/extension -- research-layer -t "derives populated display data"`
Expected: FAIL. `serves` body is "AI-native terminal collaboration layer.", `customers` body is "Developers and engineering teams." (the current wrong mapping).

- [ ] **Step 3: Fix the `serves` branch (Who pays renders the buyer)**

In `research-layer.ts`, replace the `if (id === "serves") {` branch with:

```ts
  if (id === "serves") {
    const description = card.identity.description;
    const serves = description?.value?.serves;
    const shortDescription = description?.value?.shortDescription;
    const body = serves ?? shortDescription ?? card.identity.oneLiner.value ?? "Buyer and use case are not yet available from cited sources.";
    const sources = citationSources(card, serves || shortDescription ? description?.citationIds : card.identity.oneLiner.citationIds);
    return {
      id,
      title: layer.title,
      body,
      rows: serves ? [{ label: "Buyer", value: serves }] : undefined,
      sources,
      sourceCount: displaySourceCount(sources),
      status: serves || shortDescription || card.identity.oneLiner.value ? "populated" : "empty"
    };
  }
```

- [ ] **Step 4: Fix the `mechanism` branch (Product renders concept plus mechanism)**

Replace the `if (id === "mechanism") {` branch with:

```ts
  if (id === "mechanism") {
    const description = card.identity.description?.value;
    const concept = description?.concept;
    const mechanism = description?.mechanism;
    const sources = citationSources(card, card.identity.description?.citationIds);
    const rows = [
      concept ? { label: "What it is", value: concept } : null,
      mechanism ? { label: "How it works", value: mechanism } : null,
    ].filter((row): row is { label: string; value: string } => row !== null);
    return {
      id,
      title: layer.title,
      body: concept ?? mechanism ?? "Product and technology context not yet available from cited sources.",
      rows: rows.length > 0 ? rows : undefined,
      sources,
      sourceCount: displaySourceCount(sources),
      status: concept || mechanism ? "populated" : "empty"
    };
  }
```

- [ ] **Step 5: Fix the `customers` branch (Proof is named customers only, honest-empty otherwise)**

Replace the `if (id === "customers") {` branch with:

```ts
  if (id === "customers") {
    const definition = RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionIdForLayer(id)];
    return {
      id,
      title: layer.title,
      body: definition.emptyState,
      rows: [{ label: "Evidence gap", value: definition.emptyState }],
      sources: [],
      sourceCount: 0,
      status: "empty"
    };
  }
```

`RESEARCH_SECTION_DEFINITIONS_BY_ID` and `sectionIdForLayer` are already imported in this file. `customer_proof.emptyState` is "No named customer proof found yet."

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -w @cold-start/extension -- research-layer -t "derives populated display data"`
Expected: PASS.

- [ ] **Step 7: Run the full research-layer suite to catch regressions in dependent tests**

Run: `npm test -w @cold-start/extension -- research-layer`
Expected: PASS. If the "orders displayed sources by source quality" or "deduplicates repeated source links" tests (which call `layerDisplayForCard(..., "customers")`) now fail, they were asserting the old serves mapping; update them to call `"serves"` instead of `"customers"` since those tests exercise description-citation source ordering, which now lives on the Who pays card.

- [ ] **Step 8: Commit**

```bash
git add apps/extension/src/research-layer.ts apps/extension/tests/research-layer.test.ts
git commit -m "fix(extension): map description fields to the right cards and stop Proof faking named customers"
```

### Task 2: Fold the orphaned bull case into Why care

`card.synthesis.bullCase` is generated and verified but rendered nowhere live. Surface it as the supported bullets under the Why care lede, in both the stored-section path (legacy derivation) and the hand-coded fallback. Render bullets without a repeated label.

**Files:**
- Modify: `apps/extension/src/research-layer.ts` (the `coreIdea` branch of `layerDisplayForCard`, currently around lines 369-390; and `LayerContent` item rendering is in `ResearchLayerPanel.tsx`)
- Modify: `packages/core/src/research-sections.ts` (`deriveLegacyResearchSectionsFromCard`, the `why_it_matters` branch, currently around line 386)
- Modify: `apps/extension/src/ResearchLayerPanel.tsx` (`LayerContent`, the `display.items` map, currently around lines 442-459)
- Test: `apps/extension/tests/research-layer.test.ts` (the "derives analysis display data only after synthesis exists" test, currently lines 140-164)

- [ ] **Step 1: Write the failing test for bull bullets under Why care**

In `research-layer.test.ts`, extend the "derives analysis display data only after synthesis exists" test. The existing `card` fixture has `bullCase: [{ text: "Developers already show adoption.", citationIds: ["c1"] }]`. Add after the existing `coreIdea` assertion:

```ts
    expect(layerDisplayForCard(card, "coreIdea")?.items).toEqual([
      { body: "Developers already show adoption." }
    ]);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @cold-start/extension -- research-layer -t "derives analysis display data"`
Expected: FAIL. `coreIdea` display currently has no `items` (only `body`).

- [ ] **Step 3: Add bull bullets to the hand-coded `coreIdea` branch**

In `research-layer.ts`, in the `if (id === "coreIdea") {` branch, after `const sources = citationSources(card, card.synthesis.whyItMatters.citationIds);`, build bullets and return them:

```ts
    const bullItems = card.synthesis.bullCase.map((claim) => ({
      body: stripCitationMarkers(claim.text)
    }));
    return {
      id,
      title: layer.title,
      body: stripCitationMarkers(card.synthesis.whyItMatters.text),
      ...(bullItems.length > 0 ? { items: bullItems } : {}),
      sources,
      sourceCount: displaySourceCount(sources),
      status: "populated"
    };
```

The `ResearchLayerDisplay` item type already allows a body-only item (`title` is required in the type today; see Step 5 to relax it).

- [ ] **Step 4: Add bull bullets to the legacy derivation (stored-section path)**

In `packages/core/src/research-sections.ts`, in `deriveLegacyResearchSectionsFromCard`, replace the `why_it_matters` arm:

```ts
    card.synthesis?.whyItMatters
      ? citedContent({
          slug: card.slug,
          domain: card.domain,
          sectionId: "why_it_matters",
          summary: card.synthesis.whyItMatters.text,
          citationIds: card.synthesis.whyItMatters.citationIds,
          items: card.synthesis.bullCase.map((claim, index) => ({
            label: `Support ${index + 1}`,
            text: claim.text,
            citationIds: claim.citationIds
          }))
        })
      : emptyResearchSectionForCard(card, "why_it_matters", "not_started"),
```

`citedContent` already accepts `items`; section items require a non-empty `label`, hence "Support N". The display layer strips labels for `coreIdea` in Step 5.

- [ ] **Step 5: Allow body-only bullets and strip the support label for Why care**

In `apps/extension/src/research-layer.ts`, change the `ResearchLayerDisplay` `items` type so `title` is optional:

```ts
  items?: Array<{
    title?: string;
    body?: string;
    meta?: string;
  }> | undefined;
```

In `displayFromSection`, where it maps `content.items` to display items, drop the "Support N" label for the Why care card so bullets render clean:

```ts
  const items = content.items.map((item) => ({
    ...(section.sectionId === "why_it_matters" ? {} : { title: item.label }),
    body: stripCitationMarkers(item.text),
    ...(item.meta ? { meta: item.meta } : {})
  }));
```

In `apps/extension/src/ResearchLayerPanel.tsx`, in `LayerContent`, guard the `<strong>` so a title-less bullet renders only the paragraph:

```tsx
          {display.items.map((item) => (
            <li key={`${item.title ?? ""}-${item.meta ?? item.body ?? ""}`}>
              <div>
                {item.title ? <strong>{item.title}</strong> : null}
                {item.body ? <p>{item.body}</p> : null}
              </div>
              {item.meta ? <span>{item.meta}</span> : null}
            </li>
          ))}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @cold-start/extension -- research-layer`
Expected: PASS.
Run: `npm test -w @cold-start/core` and `npm test -w @cold-start/pipeline -- generate-card`
Expected: PASS (verify the legacy-derivation change did not break section-derivation or card-preservation tests).

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/research-layer.ts apps/extension/src/ResearchLayerPanel.tsx packages/core/src/research-sections.ts apps/extension/tests/research-layer.test.ts
git commit -m "feat(extension): surface verified bull case as supported bullets under Why care"
```

### Task 3: Rename Timing to Market

The card holds market-structure fields, mostly not timing. Rename the user-facing label.

**Files:**
- Modify: `apps/extension/src/research-layer.ts` (`RESEARCH_LAYER_CARDS`, the `marketStructureTiming` entry, currently line 61)
- Modify: `apps/extension/tests/research-layer.test.ts` (title assertions, currently lines 97-107 and the market-structure tests around 193, 200, 217)
- Modify: `DESIGN.md`, `SPEC.md`, `INTENT.md` (align the label)

- [ ] **Step 1: Update the title assertion test**

In `research-layer.test.ts`, in the "ships only useful activatable cards in stable order" test, change `"Timing"` to `"Market"` in the expected titles array. In the three market-structure tests, change `title: "Timing"` to `title: "Market"`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @cold-start/extension -- research-layer -t "stable order"`
Expected: FAIL (title is still "Timing").

- [ ] **Step 3: Rename the card title**

In `research-layer.ts`, change the `marketStructureTiming` entry to:

```ts
  { id: "marketStructureTiming", title: "Market", description: "Budget, trigger, profit pool", source: "analysis" },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @cold-start/extension -- research-layer`
Expected: PASS.

- [ ] **Step 5: Align docs**

In `DESIGN.md` (Voice and Extension Panel module-row lists) and `SPEC.md`/`INTENT.md` (the research-layer label table), change the user-facing label for this card to "Market" and add a one-line note that the internal id `marketStructureTiming` / section id `market` are unchanged compatibility aliases.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/research-layer.ts apps/extension/tests/research-layer.test.ts DESIGN.md SPEC.md INTENT.md
git commit -m "refactor: rename the Timing card to Market to match its content"
```

### Task 4: One source of truth for label and gate

`RESEARCH_LAYER_CARDS` (titles, in research-layer.ts) and `RESEARCH_SECTION_DEFINITIONS` (visibility, in research-sections.ts) drifted into four vocabularies once. Make the layer cards derive title and gate from a single canonical place and add a guard test.

**Files:**
- Modify: `packages/core/src/research-sections.ts` (add a canonical `cardTitle` to each `ResearchSectionDefinition`)
- Modify: `apps/extension/src/research-layer.ts` (derive `RESEARCH_LAYER_CARDS` title and a gate flag from `RESEARCH_SECTION_DEFINITIONS_BY_LAYER_ID`)
- Test: `apps/extension/tests/research-layer.test.ts` (new guard test)

- [ ] **Step 1: Write the guard test**

In `research-layer.test.ts`, add:

```ts
  it("derives every card title and gate from the canonical section definition", () => {
    for (const layer of RESEARCH_LAYER_CARDS) {
      const definition = sectionDefinitionForLayer(layer.id);
      expect(layer.title).toBe(definition.cardTitle);
      const expectedSource = definition.visibility === "gated" ? "analysis" : "card";
      expect(layer.source).toBe(expectedSource);
    }
  });
```

Import `sectionDefinitionForLayer` from `@cold-start/core` at the top of the test.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @cold-start/extension -- research-layer -t "canonical section definition"`
Expected: FAIL (`cardTitle` does not exist on the definition yet).

- [ ] **Step 3: Add `cardTitle` to the section definition type and each entry**

In `research-sections.ts`, add `cardTitle: string;` to `ResearchSectionDefinition`, and add `cardTitle` to each of the nine `RESEARCH_SECTION_DEFINITIONS` entries: buyer "Who pays", customer_proof "Proof", traction "Signals", financing "Money", competition "Comps", product "Product", why_it_matters "Why care", market "Market", risks "Risk". Keep the existing long `title` for internal/section use.

- [ ] **Step 4: Derive the layer cards from the definitions**

In `research-layer.ts`, replace the hand-written `RESEARCH_LAYER_CARDS` literal so each entry's `title` is `sectionDefinitionForLayer(id).cardTitle` and `source` is `sectionDefinitionForLayer(id).visibility === "gated" ? "analysis" : "card"`. Keep the explicit `id` order and the `description` strings. Example shape:

```ts
const LAYER_ORDER: Array<{ id: ResearchLayerId; description: string }> = [
  { id: "coreIdea", description: "Cited investment read" },
  { id: "serves", description: "Buyer and workflow" },
  { id: "marketStructureTiming", description: "Budget, trigger, profit pool" },
  { id: "customers", description: "Adoption evidence" },
  { id: "signals", description: "Recent momentum" },
  { id: "investors", description: "Rounds, backers, price context" },
  { id: "competition", description: "Alternatives and durability" },
  { id: "mechanism", description: "What is differentiated" },
  { id: "openQuestions", description: "What still needs proof" },
];

export const RESEARCH_LAYER_CARDS: ResearchLayerCard[] = LAYER_ORDER.map(({ id, description }) => {
  const definition = sectionDefinitionForLayer(id);
  return {
    id,
    title: definition.cardTitle,
    description,
    source: definition.visibility === "gated" ? "analysis" : "card",
  };
});
```

Note: the "Risk" rename of the `openQuestions` card title comes for free here once `risks.cardTitle` is "Risk". Update the "stable order" test's expected titles array to match: Why care, Who pays, Market, Proof, Signals, Money, Comps, Product, Risk.

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w @cold-start/extension -- research-layer`
Expected: PASS.
Run: `npm run typecheck`
Expected: PASS (the derived literal must keep the `ResearchLayerCard[]` type).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/research-sections.ts apps/extension/src/research-layer.ts apps/extension/tests/research-layer.test.ts
git commit -m "refactor: derive card titles and gating from one canonical section definition"
```

### Task 5: Delete the dead ExtensionProfile

`CardShell` is imported only by `apps/web/src/app/c/[slug]/page.tsx`, never with `surface="extension"`. The `ExtensionProfile` branch and function are dead (the side panel renders `ResearchLayerPanel`). Remove them.

**Files:**
- Modify: `packages/ui/src/CardShell.tsx` (remove the `if (surface === "extension")` branch and the `ExtensionProfile` function, currently the function at line 243 and the branch at line 542)
- Test: existing `npm run knip` and `npm run typecheck`

- [ ] **Step 1: Confirm there is no live caller**

Run: `rg -n 'surface=.extension|<CardShell' apps --glob '!**/*.test.*'`
Expected: only the web page using `surface="web"` (or `surface={...}` that is always "web"). If any extension caller appears, STOP and do not delete; reframe as "ExtensionProfile is live" and skip this task.

- [ ] **Step 2: Remove the branch and function**

In `CardShell.tsx`, delete the `ExtensionProfile` function (lines ~243-456) and the `if (surface === "extension") { return <ExtensionProfile card={card} />; }` branch at the top of `CardShell`. Remove now-unused helpers that only `ExtensionProfile` used (let knip report them).

- [ ] **Step 3: Verify nothing else breaks**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run knip`
Expected: no new unused-export errors beyond ones you then remove. Remove any helper knip flags as now-unused.
Run: `npm test -w @cold-start/ui` and `npm test -w @cold-start/extension -- sidepanel`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/CardShell.tsx
git commit -m "chore(ui): remove dead extension CardShell profile and its only stale bull-case render"
```

### P0 self-review checklist

- [ ] All five tasks committed; `npm run check` passes.
- [ ] Proof never renders `serves`; Who pays renders `serves`; Product renders `concept` plus `mechanism`.
- [ ] Why care shows the lede plus bull bullets in both the stored-section and fallback paths.
- [ ] Card titles are Why care, Who pays, Market, Proof, Signals, Money, Comps, Product, Risk, all derived from one source.
- [ ] No `surface="extension"` code remains.

---

## Phase P1: the cross-card read and Market data shape (separate plan)

**Author this as its own task-level plan after resolving the two decision gates below.** Each item below is concrete on files and tests; the decision gate is what blocks no-placeholder code.

### P1-A: Cross-card read in Why care (item H) — the next-level lever

**Goal:** `whyItMatters` becomes a cross-card synthesis that names the load-bearing card and the sharpest tension, each cited.

**Confirmed grounding:** `synthesizeCard` (`packages/llm/src/synthesis.ts`) already receives the fully-assembled public card as JSON, so the cross-card inputs (serves, mechanism, signals, funding, comparables) are available at synthesis time. `bullCase`/`bearCase`/`marketStructureAndTiming` are produced in the same single tool call. Verifier offsets are computed in `verifiedSynthesisForCard` (`packages/pipeline/src/generate-card.ts:643-696`).

**Decision gate (must answer before authoring):** single-pass or two-pass?
- Single-pass (recommended): keep one `synthesizeCard` tool call; restructure the prompt so `whyItMatters` is explicitly the cross-card synthesis of the other fields it is producing, and add two optional output fields: `loadBearingCardId` (enum over the eight non-Why-care layer ids) and `tension` (a `sourcedText` plus an ordered pair of layer ids). Cheapest, no reorder.
- Two-pass: generate bull/bear/market first, then a second call for `whyItMatters` over the verifier-filtered digest. Closer to the critic's "run last" ideal, higher cost and latency.

**Touch-points once decided:** `packages/core/src/card.ts` (`synthesisSchema`: add `loadBearingCardId`, `tension`), `packages/llm/src/synthesis.ts` (tool schema + system prompt + `citedSynthesisSchema` for the new cited `tension`), `packages/pipeline/src/generate-card.ts` (verify `tension` as a claim; degrade rule: if fewer than 3 cards have surviving content, omit `loadBearingCardId`), `apps/extension/src/research-layer.ts` (render the tension line under Why care), tests in `packages/llm/tests/synthesis.test.ts` and `packages/pipeline`.

**Non-brittleness rule (carry into the plan):** the input is a fixed digest and the output enum is fixed; no adaptive card sets, no LLM salience score. Coverage flags are derived structurally from field presence and surviving-citation count.

### P1-B: Reconcile the Market data shape (item E)

**Goal:** one data shape for the Market card.

**Confirmed grounding (the seam):** the per-section engine (`packages/llm/src/research-section.ts`) produces `napkinMath` plus `items` for the market section, stored in `researchSections` and rendered by `displayFromSection`. The monolithic engine (`synthesizeCard`) produces `card.synthesis.marketStructureAndTiming` (seven typed fields, no napkinMath), rendered by the hand-coded `marketStructureTiming` branch (`marketRows`). Both are live, so the card renders differently depending on which path populated it.

**Decision gate (must answer before authoring):** which engine is canonical for Market?
- Per-section canonical (recommended): the stored `market` section (napkinMath + items + confidence + topDownCrossCheck) is the Market card; `marketStructureAndTiming` becomes the fallback the legacy derivation maps into the section shape. Aligns with the richer engine and the napkin-math structure in the spec.
- Monolithic canonical: add `napkinMath` to `marketStructureAndTimingSchema` in `card.ts` and the `synthesisTool` schema; the per-section market becomes a refresh of the same shape.

**Touch-points once decided:** `packages/core/src/card.ts` and/or `packages/core/src/research-sections.ts` (converge the schema), `packages/llm/src/synthesis.ts` or `research-section.ts` (whichever stops being canonical maps into the other), `apps/extension/src/research-layer.ts` (`marketRows` and `displayFromSection` read one shape), tests.

### P1-C: Sharpened per-card generation prompts (item K)

**Goal:** raise each card to the calibrated investor bar (number plus source, so-what, new/incremental/standard for Product, 0-3 no-padding for Risk and bull/bear, named-proof-only for Proof, axis-of-overlap for Comps, bottom-up-first for Market).

**Confirmed grounding:** prompts live in `RESEARCH_SECTION_DEFINITIONS[].generationPrompt` (`packages/core/src/research-sections.ts`) for the per-section engine, and in `extractionSystemPrompt`/`synthesisSystemPrompt` for the monolithic engine. Pure prompt edits, no schema. Lowest risk in P1; can ship incrementally per card. No decision gate. Validate with `npm run qa:generation` against fixture companies, not just unit tests, because prompt quality only shows on real evidence.

---

## Phase P2: schema and coverage (separate plan)

### P2-A: Add named customers to the public card (item C)

**Goal:** Proof fills in basics, not only after a `customer_proof` section is generated.

**Confirmed grounding:** there is no `customers` field on the card today; `extractedCardSectionsSchema` is `coldStartCardObjectSchema.pick(...)`. This is the four-touch field add: `packages/core/src/card.ts` (schema, with per-customer `citationIds`), `packages/llm/src/extraction.ts` (`extractionTool` schema, system prompt, `normalizeExtractionInput`), `packages/pipeline/src/generate-card.ts` and `seed-profile.ts` (assembly, `withResolvedCitationRefs`, `finalizeGeneratedCard`), `packages/ui/src/CardShell.tsx` and `apps/extension/src/research-layer.ts` (render). Then point the `customers` (Proof) fallback at the new field instead of the empty state from P0 Task 1. No decision gate, but it is the largest single item; author it as its own plan.

### P2-B: Comparables citation IDs (item J)

**Goal:** make the Comps card auditable like every other public fact.

**Confirmed grounding:** `comparableSchema` (`packages/core/src/card.ts:66-73`) and the extraction `comparableSchema` (`packages/llm/src/extraction.ts:205-217`) both already declare optional `citationIds`. So this is populate-and-render, not a schema change: tighten the `comparables` block guidance/normalization so each comparable carries the citation that supports it, then render citation markers in the Comps card (`research-layer.ts` competition branch and `CardShell.tsx` comps section). Lighter than originally scoped.

### P2-C: People-as-header decision and future Team & Execution (item I)

**Goal:** stop silently dropping leadership and name the future judgment card.

**Confirmed grounding:** the extension already renders leadership in the always-on company-context header (`PeopleLine` in `ResearchLayerPanel.tsx`); the web card renders a "People" section in `CardShell.tsx`. No new card. Documentation change in `subcard-exploration-spine.md`, `INTENT.md`, and `DESIGN.md` stating leadership is a header fact by design, plus a one-paragraph spec for a future gated "Team & Execution" judgment card gated on an execution-evidence backend (matches SPEC line 76). Optionally align the web People section with the header treatment.

---

## Sequencing summary

1. P0 (this document, one PR): Tasks 1-5. Ship first.
2. P1: resolve the two decision gates (single vs two-pass cross-card read; per-section vs monolithic Market), then author and execute P1-A, P1-B, P1-C.
3. P2: author and execute P2-A (customers field), P2-B (comps citations), P2-C (People doc).

The standing truth from the exploration: after all of this, the binding constraint on "reads like an elite human investor wrote it" is retrieval coverage, not card structure. The next investment after P2 is retrieval depth.
