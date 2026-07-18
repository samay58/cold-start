# Market Structure & Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real gated **Market Structure & Timing** research card that assesses buyer budget, adoption trigger, profit pool, market shape, expansion path, and timing risk from cited evidence without top-down TAM filler.

**Architecture:** Keep the card behind the existing `synthesis` gate so public `/api/cards/{slug}` remains facts-only. Extend the typed synthesis model with a structured market object, verify each market claim through the existing verifier, and render it as an analysis-backed enrichment card in the extension research layer.

**Tech Stack:** TypeScript, Zod, Vitest, React 19, existing Anthropic synthesis parser, existing pipeline verifier, existing extension research-layer model.

---

## Scope

This plan implements one new investor-grade card. It does not implement Business Model & Unit Economics, Team & Execution, or Strategic Relevance.

This touches more than 8 files because the card must propagate through schema, trust enforcement, LLM parsing, pipeline verification, extension rendering, tests, and docs.

## File Map

- Modify `packages/core/src/card.ts`: add the typed market schema under `synthesis`.
- Modify `packages/core/src/trust.ts`: strip unsupported market claims and keep public redaction unchanged.
- Modify `packages/core/tests/trust.test.ts`: prove market claims are filtered and public cards still omit synthesis.
- Modify `packages/llm/src/synthesis.ts`: require/normalize `marketStructureAndTiming` in the tool payload.
- Modify `packages/llm/tests/synthesis.test.ts`: prove parser accepts, normalizes, and rejects malformed market claims.
- Modify `packages/pipeline/src/generate-card.ts`: include market claims in verifier input and preserve only supported fields.
- Modify `packages/pipeline/tests/generate-card.test.ts`: prove supported market fields survive and unsupported ones are removed.
- Modify `apps/extension/src/research-layer.ts`: add the `marketStructureTiming` card and renderer.
- Modify `apps/extension/tests/research-layer.test.ts`: assert order, availability, populated display, and source chips.
- Modify `apps/extension/tests/sidepanel.test.tsx`: assert visible side-panel card pile includes Market Structure & Timing.
- Modify `apps/extension/tests/e2e/sidepanel-ui.spec.ts`: update the UI smoke to cover activation.
- Modify `SPEC.md`, `INTENT.md`, `DESIGN.md`, and `docs/qa/post-cost-cuts-test-guide.md`: move Market Structure & Timing from future candidate to implemented analysis-backed card.

## Market Object Shape

Use this exact field set:

```ts
type MarketStructureAndTiming = {
  buyerBudget: SourcedText | null;
  painSeverity: SourcedText | null;
  adoptionTrigger: SourcedText | null;
  marketStructure: SourcedText | null;
  profitPool: SourcedText | null;
  expansionPath: SourcedText | null;
  timingRisk: SourcedText | null;
};
```

Rules:

- Each non-null field must include visible citation markers and `citationIds`.
- Null means the evidence was not strong enough.
- The card is populated when at least one field survives verification.
- The UI should prefer fewer supported fields over filler.
- No field should mention TAM or CAGR unless it explains budget ownership or spend displacement.

---

### Task 1: Add The Core Schema

**Files:**
- Modify: `packages/core/src/card.ts`
- Test: `packages/core/tests/trust.test.ts`

- [ ] **Step 1: Add a failing trust test for market claim filtering**

Append this test inside `describe("stripUnsupportedSynthesis", ...)` in `packages/core/tests/trust.test.ts`:

```ts
it("filters unsupported market structure claims while preserving supported ones", () => {
  const dirty: ColdStartCard = {
    ...baseCard,
    synthesis: {
      ...baseSynthesis,
      marketStructureAndTiming: {
        buyerBudget: {
          text: "Voice agent infrastructure can come from contact-center automation budgets [c1].",
          citationIds: ["c1"]
        },
        painSeverity: {
          text: "The pain point is not supported [missing].",
          citationIds: ["missing"]
        },
        adoptionTrigger: null,
        marketStructure: null,
        profitPool: null,
        expansionPath: null,
        timingRisk: null
      }
    }
  };

  const clean = stripUnsupportedSynthesis(dirty);

  expect(clean.synthesis?.marketStructureAndTiming).toEqual({
    buyerBudget: {
      text: "Voice agent infrastructure can come from contact-center automation budgets [c1].",
      citationIds: ["c1"]
    },
    painSeverity: null,
    adoptionTrigger: null,
    marketStructure: null,
    profitPool: null,
    expansionPath: null,
    timingRisk: null
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -w @cold-start/core -- trust
```

Expected: FAIL because `marketStructureAndTiming` is not in the schema or trust filtering yet.

- [ ] **Step 3: Add the schema in `packages/core/src/card.ts`**

Insert this after `sourcedTextSchema`:

```ts
export const marketStructureAndTimingSchema = z.object({
  buyerBudget: sourcedTextSchema.nullable(),
  painSeverity: sourcedTextSchema.nullable(),
  adoptionTrigger: sourcedTextSchema.nullable(),
  marketStructure: sourcedTextSchema.nullable(),
  profitPool: sourcedTextSchema.nullable(),
  expansionPath: sourcedTextSchema.nullable(),
  timingRisk: sourcedTextSchema.nullable()
});
```

Update `synthesisSchema` to:

```ts
export const synthesisSchema = z.object({
  whyItMatters: sourcedTextSchema,
  bullCase: z.array(sourcedTextSchema),
  bearCase: z.array(sourcedTextSchema),
  openQuestions: z.array(z.string().min(1)),
  marketStructureAndTiming: marketStructureAndTimingSchema.optional()
});
```

- [ ] **Step 4: Add trust filtering in `packages/core/src/trust.ts`**

Add this helper above `stripUnsupportedSynthesis`:

```ts
function supportedMarketStructureAndTiming(
  market: NonNullable<ColdStartCard["synthesis"]>["marketStructureAndTiming"],
  validIds: Set<string>
): NonNullable<ColdStartCard["synthesis"]>["marketStructureAndTiming"] {
  if (!market) {
    return undefined;
  }

  const filtered = {
    buyerBudget: market.buyerBudget ? keepSupportedText(market.buyerBudget, validIds) : null,
    painSeverity: market.painSeverity ? keepSupportedText(market.painSeverity, validIds) : null,
    adoptionTrigger: market.adoptionTrigger ? keepSupportedText(market.adoptionTrigger, validIds) : null,
    marketStructure: market.marketStructure ? keepSupportedText(market.marketStructure, validIds) : null,
    profitPool: market.profitPool ? keepSupportedText(market.profitPool, validIds) : null,
    expansionPath: market.expansionPath ? keepSupportedText(market.expansionPath, validIds) : null,
    timingRisk: market.timingRisk ? keepSupportedText(market.timingRisk, validIds) : null
  };

  return Object.values(filtered).some(Boolean) ? filtered : undefined;
}
```

Update the `synthesis` object inside `stripUnsupportedSynthesis`:

```ts
const marketStructureAndTiming = supportedMarketStructureAndTiming(card.synthesis.marketStructureAndTiming, validIds);

const synthesis = {
  whyItMatters,
  bullCase: supportedTextItems(card.synthesis.bullCase, validIds).slice(0, 3),
  bearCase: supportedTextItems(card.synthesis.bearCase, validIds).slice(0, 3),
  openQuestions: card.synthesis.openQuestions.filter((question) => question.trim().length > 0).slice(0, 3),
  ...(marketStructureAndTiming ? { marketStructureAndTiming } : {})
};
```

- [ ] **Step 5: Run the core test**

Run:

```bash
npm test -w @cold-start/core -- trust
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/core/src/card.ts packages/core/src/trust.ts packages/core/tests/trust.test.ts
git commit -m "feat: add market structure synthesis schema"
```

---

### Task 2: Extend Synthesis Parsing And Prompting

**Files:**
- Modify: `packages/llm/src/synthesis.ts`
- Modify: `packages/llm/tests/synthesis.test.ts`

- [ ] **Step 1: Update the valid synthesis fixture**

In `packages/llm/tests/synthesis.test.ts`, add this property to `validSynthesisPayload`:

```ts
marketStructureAndTiming: {
  buyerBudget: {
    text: "The buyer budget is likely contact-center automation or developer infrastructure spend [c1].",
    citationIds: ["c1"]
  },
  painSeverity: {
    text: "The pain is severe when latency blocks production voice-agent workflows [c1].",
    citationIds: ["c1"]
  },
  adoptionTrigger: {
    text: "The adoption trigger is lower-latency model infrastructure reaching production usability [c1].",
    citationIds: ["c1"]
  },
  marketStructure: null,
  profitPool: null,
  expansionPath: null,
  timingRisk: null
}
```

- [ ] **Step 2: Add parser tests**

Append these tests inside `describe("parseSynthesisToolUse", ...)`:

```ts
it("normalizes market structure citation markers", () => {
  const payload = parseSynthesisToolUse({
    content: [
      {
        type: "tool_use",
        name: "emit_investor_synthesis",
        input: {
          ...validSynthesisPayload,
          marketStructureAndTiming: {
            ...validSynthesisPayload.marketStructureAndTiming,
            buyerBudget: {
              text: "The buyer budget is likely contact-center automation spend.",
              citationIds: ["c1"]
            }
          }
        }
      }
    ]
  });

  expect(payload.marketStructureAndTiming?.buyerBudget).toEqual({
    text: "The buyer budget is likely contact-center automation spend [c1].",
    citationIds: ["c1"]
  });
});

it("rejects market structure claims without citation IDs", () => {
  expect(() =>
    parseSynthesisToolUse({
      content: [
        {
          type: "tool_use",
          name: "emit_investor_synthesis",
          input: {
            ...validSynthesisPayload,
            marketStructureAndTiming: {
              ...validSynthesisPayload.marketStructureAndTiming,
              buyerBudget: {
                text: "This is uncited.",
                citationIds: []
              }
            }
          }
        }
      ]
    })
  ).toThrow();
});
```

- [ ] **Step 3: Run the failing LLM tests**

Run:

```bash
npm test -w @cold-start/llm -- synthesis
```

Expected: FAIL because the tool schema does not yet expose market fields.

- [ ] **Step 4: Add market claim schema in `packages/llm/src/synthesis.ts`**

Insert this after `sourcedTextSchema`:

```ts
const nullableSourcedTextSchema = {
  anyOf: [sourcedTextSchema, { type: "null" }]
} as const;

const marketStructureAndTimingToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    buyerBudget: nullableSourcedTextSchema,
    painSeverity: nullableSourcedTextSchema,
    adoptionTrigger: nullableSourcedTextSchema,
    marketStructure: nullableSourcedTextSchema,
    profitPool: nullableSourcedTextSchema,
    expansionPath: nullableSourcedTextSchema,
    timingRisk: nullableSourcedTextSchema
  },
  required: [
    "buyerBudget",
    "painSeverity",
    "adoptionTrigger",
    "marketStructure",
    "profitPool",
    "expansionPath",
    "timingRisk"
  ]
} as const;
```

Update `synthesisTool.input_schema.properties`:

```ts
marketStructureAndTiming: marketStructureAndTimingToolSchema
```

Add `"marketStructureAndTiming"` to the `required` array.

- [ ] **Step 5: Normalize market citations**

Add this helper below `normalizeClaimCitations`:

```ts
function normalizeNullableClaim(claim: SourcedText | null): SourcedText | null {
  return claim ? normalizeClaimCitations(claim) : null;
}
```

Update `normalizeSynthesisCitations`:

```ts
return {
  ...synthesis,
  whyItMatters: normalizeClaimCitations(synthesis.whyItMatters),
  bullCase: synthesis.bullCase.map(normalizeClaimCitations),
  bearCase: synthesis.bearCase.map(normalizeClaimCitations),
  ...(synthesis.marketStructureAndTiming
    ? {
        marketStructureAndTiming: {
          buyerBudget: normalizeNullableClaim(synthesis.marketStructureAndTiming.buyerBudget),
          painSeverity: normalizeNullableClaim(synthesis.marketStructureAndTiming.painSeverity),
          adoptionTrigger: normalizeNullableClaim(synthesis.marketStructureAndTiming.adoptionTrigger),
          marketStructure: normalizeNullableClaim(synthesis.marketStructureAndTiming.marketStructure),
          profitPool: normalizeNullableClaim(synthesis.marketStructureAndTiming.profitPool),
          expansionPath: normalizeNullableClaim(synthesis.marketStructureAndTiming.expansionPath),
          timingRisk: normalizeNullableClaim(synthesis.marketStructureAndTiming.timingRisk)
        }
      }
    : {})
};
```

- [ ] **Step 6: Include market fields in validation**

In `citedSynthesisSchema.superRefine`, extend the `items` array:

```ts
const market = synthesis.marketStructureAndTiming;
const marketItems = market
  ? [
      market.buyerBudget,
      market.painSeverity,
      market.adoptionTrigger,
      market.marketStructure,
      market.profitPool,
      market.expansionPath,
      market.timingRisk
    ].flatMap((value, index) => value ? [{ path: ["marketStructureAndTiming", index], value }] : [])
  : [];

const items = [
  { path: ["whyItMatters"], value: synthesis.whyItMatters },
  ...synthesis.bullCase.map((value, index) => ({ path: ["bullCase", index], value })),
  ...synthesis.bearCase.map((value, index) => ({ path: ["bearCase", index], value })),
  ...marketItems
];
```

- [ ] **Step 7: Tighten the prompt**

Append these strings to `synthesisSystemPrompt`:

```ts
"marketStructureAndTiming should be sparse. Use null when sources do not support a field.",
"Do not write top-down TAM or CAGR filler. Prefer buyer budget, pain severity, adoption trigger, market structure, profit pool, expansion path, and timing risk.",
```

- [ ] **Step 8: Run the LLM tests**

Run:

```bash
npm test -w @cold-start/llm -- synthesis
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/llm/src/synthesis.ts packages/llm/tests/synthesis.test.ts
git commit -m "feat: synthesize market structure timing"
```

---

### Task 3: Verify Market Claims In The Pipeline

**Files:**
- Modify: `packages/pipeline/src/generate-card.ts`
- Modify: `packages/pipeline/tests/generate-card.test.ts`

- [ ] **Step 1: Add a failing pipeline test**

Append this test inside `describe("generateCardForDomain", ...)`:

```ts
it("verifies market structure claims with the rest of synthesis", async () => {
  const skeleton = buildSkeletonCard("cartesia.ai");
  const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
  const buyerBudget = { text: "The likely buyer budget is contact-center automation. [c1]", citationIds: ["c1"] };
  const painSeverity = { text: "Unsupported market pain. [c1]", citationIds: ["c1"] };

  const card = await generateCardForDomain("cartesia.ai", {
    fetchSources: async () => [],
    extractSections: async () => ({
      identity: skeleton.identity,
      funding: skeleton.funding,
      team: skeleton.team,
      signals: [],
      comparables: [],
      citations: [citation]
    }),
    synthesize: async () => ({
      whyItMatters,
      bullCase: [],
      bearCase: [],
      openQuestions: ["Which buyer owns the budget?"],
      marketStructureAndTiming: {
        buyerBudget,
        painSeverity,
        adoptionTrigger: null,
        marketStructure: null,
        profitPool: null,
        expansionPath: null,
        timingRisk: null
      }
    }),
    verify: async () => [
      { ...whyItMatters, status: "supported" },
      { ...buyerBudget, status: "supported" },
      { ...painSeverity, status: "unsupported" }
    ],
    synthesisRequired: true
  });

  expect(card.synthesis?.marketStructureAndTiming).toEqual({
    buyerBudget,
    painSeverity: null,
    adoptionTrigger: null,
    marketStructure: null,
    profitPool: null,
    expansionPath: null,
    timingRisk: null
  });
});
```

- [ ] **Step 2: Run the failing pipeline test**

Run:

```bash
npm test -w @cold-start/pipeline -- generate-card
```

Expected: FAIL because market claims are not verified and filtered.

- [ ] **Step 3: Add helpers in `packages/pipeline/src/generate-card.ts`**

Add these helpers near `synthesisClaims`:

```ts
type MarketStructureAndTiming = NonNullable<CardSynthesis["marketStructureAndTiming"]>;
type MarketStructureField = keyof MarketStructureAndTiming;

const marketStructureFields: MarketStructureField[] = [
  "buyerBudget",
  "painSeverity",
  "adoptionTrigger",
  "marketStructure",
  "profitPool",
  "expansionPath",
  "timingRisk"
];

function marketStructureClaims(synthesis: CardSynthesis): SourcedText[] {
  const market = synthesis.marketStructureAndTiming;
  return market ? marketStructureFields.flatMap((field) => market[field] ? [market[field]] : []) : [];
}

function allSynthesisClaims(synthesis: CardSynthesis): SourcedText[] {
  return [synthesis.whyItMatters, ...synthesis.bullCase, ...synthesis.bearCase, ...marketStructureClaims(synthesis)];
}
```

Replace `synthesisClaims(synthesis)` calls in `verifiedSynthesisForCard` with `allSynthesisClaims(synthesis)`.

- [ ] **Step 4: Filter the market object after verification**

Add this helper near `verifiedSynthesisForCard`:

```ts
function verifiedMarketStructureAndTiming(
  synthesis: CardSynthesis,
  results: VerificationResult[],
  indexOffset: number
): MarketStructureAndTiming | undefined {
  if (!synthesis.marketStructureAndTiming) {
    return undefined;
  }

  let offset = indexOffset;
  const filtered: MarketStructureAndTiming = {
    buyerBudget: null,
    painSeverity: null,
    adoptionTrigger: null,
    marketStructure: null,
    profitPool: null,
    expansionPath: null,
    timingRisk: null
  };

  for (const field of marketStructureFields) {
    const claim = synthesis.marketStructureAndTiming[field];
    if (!claim) {
      continue;
    }

    const verified = applyVerifierResults([claim], results, offset)[0] ?? null;
    filtered[field] = verified;
    offset += 1;
  }

  return Object.values(filtered).some(Boolean) ? filtered : undefined;
}
```

In `verifiedSynthesisForCard`, after `bearCaseOffset`, add:

```ts
const marketOffset = bearCaseOffset + synthesis.bearCase.length;
const marketStructureAndTiming = verifiedMarketStructureAndTiming(synthesis, results, marketOffset);
```

Update `claimCountAfterVerify`:

```ts
claimCountAfterVerify: whyItMatters
  ? 1 + bullCase.length + bearCase.length + marketStructureClaims({ ...synthesis, marketStructureAndTiming }).length
  : 0
```

Update the returned synthesis object:

```ts
synthesis: {
  ...synthesis,
  whyItMatters,
  bullCase,
  bearCase,
  ...(marketStructureAndTiming ? { marketStructureAndTiming } : {})
}
```

- [ ] **Step 5: Run the pipeline test**

Run:

```bash
npm test -w @cold-start/pipeline -- generate-card
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/pipeline/src/generate-card.ts packages/pipeline/tests/generate-card.test.ts
git commit -m "feat: verify market structure claims"
```

---

### Task 4: Render The Extension Research Card

**Files:**
- Modify: `apps/extension/src/research-layer.ts`
- Modify: `apps/extension/tests/research-layer.test.ts`
- Modify: `apps/extension/tests/sidepanel.test.tsx`
- Modify: `apps/extension/tests/e2e/sidepanel-ui.spec.ts`

- [ ] **Step 1: Add failing research-layer expectations**

In `apps/extension/tests/research-layer.test.ts`, remove `"Market Structure & Timing"` from `futureCardTitles`.

Update the card ID order expectation:

```ts
expect(RESEARCH_LAYER_CARDS.map((card) => card.id)).toEqual([
  "coreIdea",
  "serves",
  "marketStructureTiming",
  "customers",
  "signals",
  "investors",
  "competition",
  "mechanism",
  "openQuestions"
]);
```

Update the title order expectation:

```ts
expect(RESEARCH_LAYER_CARDS.map((card) => card.title)).toEqual([
  "Why It Matters",
  "Buyer & Use Case",
  "Market Structure & Timing",
  "Customer Proof",
  "Traction",
  "Financing & Valuation",
  "Competitive Position",
  "Product & Technology",
  "Risks & Diligence"
]);
```

Add this test:

```ts
it("renders market structure and timing from verified synthesis fields", () => {
  const buyerBudget = {
    text: "The buyer budget is contact-center automation spend [c1].",
    citationIds: ["c1"]
  };
  const timingRisk = {
    text: "Timing risk remains because production voice workflows are still early [c1].",
    citationIds: ["c1"]
  };
  const card = baseCard({
    synthesis: {
      whyItMatters: { text: "Warp turns terminal work into a collaboration layer [c1].", citationIds: ["c1"] },
      bullCase: [],
      bearCase: [],
      openQuestions: ["Can it expand beyond developers?"],
      marketStructureAndTiming: {
        buyerBudget,
        painSeverity: null,
        adoptionTrigger: null,
        marketStructure: null,
        profitPool: null,
        expansionPath: null,
        timingRisk
      }
    }
  });

  expect(layerDisplayForCard(card, "marketStructureTiming")).toMatchObject({
    title: "Market Structure & Timing",
    body: "The buyer budget is contact-center automation spend.",
    sourceCount: 1,
    status: "populated"
  });
  expect(layerDisplayForCard(card, "marketStructureTiming")?.items).toEqual([
    { title: "Buyer budget", body: "The buyer budget is contact-center automation spend." },
    { title: "Timing risk", body: "Timing risk remains because production voice workflows are still early." }
  ]);
});
```

- [ ] **Step 2: Run the failing extension model test**

Run:

```bash
npm test -w @cold-start/extension -- research-layer
```

Expected: FAIL because the ID and renderer do not exist.

- [ ] **Step 3: Add the card ID and config**

In `apps/extension/src/research-layer.ts`, update `ResearchLayerId`:

```ts
export type ResearchLayerId =
  | "coreIdea"
  | "serves"
  | "marketStructureTiming"
  | "customers"
  | "signals"
  | "investors"
  | "competition"
  | "mechanism"
  | "openQuestions";
```

Update `RESEARCH_LAYER_CARDS`:

```ts
export const RESEARCH_LAYER_CARDS: ResearchLayerCard[] = [
  { id: "coreIdea", title: "Why It Matters", description: "Cited investment rationale", source: "analysis" },
  { id: "serves", title: "Buyer & Use Case", description: "Who pays and why", source: "card" },
  { id: "marketStructureTiming", title: "Market Structure & Timing", description: "Budget, timing, profit pool", source: "analysis" },
  { id: "customers", title: "Customer Proof", description: "Adoption evidence", source: "card" },
  { id: "signals", title: "Traction", description: "Recent momentum", source: "card" },
  { id: "investors", title: "Financing & Valuation", description: "Rounds, backers, price context", source: "card" },
  { id: "competition", title: "Competitive Position", description: "Alternatives and durability", source: "card" },
  { id: "mechanism", title: "Product & Technology", description: "What is differentiated", source: "card" },
  { id: "openQuestions", title: "Risks & Diligence", description: "What still needs proof", source: "analysis" }
];
```

- [ ] **Step 4: Add market display helpers**

Add this helper before `layerDisplayForCard`:

```ts
function marketRows(card: ColdStartCard) {
  const market = card.synthesis?.marketStructureAndTiming;
  if (!market) {
    return [];
  }

  return [
    { title: "Buyer budget", claim: market.buyerBudget },
    { title: "Pain severity", claim: market.painSeverity },
    { title: "Adoption trigger", claim: market.adoptionTrigger },
    { title: "Market structure", claim: market.marketStructure },
    { title: "Profit pool", claim: market.profitPool },
    { title: "Expansion path", claim: market.expansionPath },
    { title: "Timing risk", claim: market.timingRisk }
  ].flatMap((row) => row.claim ? [{ title: row.title, body: stripCitationMarkers(row.claim.text), citationIds: row.claim.citationIds }] : []);
}
```

- [ ] **Step 5: Render the market card**

Inside `layerDisplayForCard`, add this branch after `coreIdea`:

```ts
if (id === "marketStructureTiming") {
  if (!card.synthesis) {
    return {
      id,
      title: layer.title,
      body: "Activate the investor lens to assess market structure and timing.",
      sources: [],
      sourceCount: 0,
      status: "needs-analysis"
    };
  }

  const rows = marketRows(card);
  const sources = citationSources(card, rows.flatMap((row) => row.citationIds));
  return {
    id,
    title: layer.title,
    body: rows[0]?.body ?? "No market structure claims survived verification.",
    items: rows.map((row) => ({ title: row.title, body: row.body })),
    sources,
    sourceCount: displaySourceCount(sources),
    status: rows.length > 0 ? "populated" : "empty"
  };
}
```

- [ ] **Step 6: Update side-panel test expectations**

In `apps/extension/tests/sidepanel.test.tsx`, remove `"Market Structure & Timing"` from `futureCardTitles` and assert the visible pile contains it in `"renders the research layer pile for a sourced card"`:

```ts
expect(container.textContent).toContain("Market Structure & Timing");
```

- [ ] **Step 7: Update e2e selector**

In `apps/extension/tests/e2e/sidepanel-ui.spec.ts`, add one smoke activation using:

```ts
const marketCard = page.locator(".cs-dormant-card", { hasText: "Market Structure & Timing" });
await marketCard.focus();
await page.keyboard.press("Enter");
await expect(page.locator(".cs-active-enrichment", { hasText: "Market Structure & Timing" })).toContainText("Synthesizing");
```

- [ ] **Step 8: Run focused extension tests**

Run:

```bash
npm test -w @cold-start/extension -- research-layer
npm test -w @cold-start/extension -- sidepanel.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add apps/extension/src/research-layer.ts apps/extension/tests/research-layer.test.ts apps/extension/tests/sidepanel.test.tsx apps/extension/tests/e2e/sidepanel-ui.spec.ts
git commit -m "feat: add market structure card to extension"
```

---

### Task 5: Update Docs And QA Guidance

**Files:**
- Modify: `SPEC.md`
- Modify: `INTENT.md`
- Modify: `DESIGN.md`
- Modify: `docs/qa/post-cost-cuts-test-guide.md`

- [ ] **Step 1: Move the card from future to active in `SPEC.md`**

In the active taxonomy table, add:

```md
| `synthesis.marketStructureAndTiming` / `marketStructureTiming` | **Market Structure & Timing** | Whether the market is real, reachable, timely, and economically attractive, based on buyer budget, adoption trigger, profit pool, structure, expansion path, and timing risk. |
```

Remove the Market Structure & Timing row from the future-card table.

- [ ] **Step 2: Update `INTENT.md` active list**

Change:

```md
- Market Structure & Timing, once the backend supports it with real evidence
```

to:

```md
- Market Structure & Timing
```

- [ ] **Step 3: Update `DESIGN.md` active pile language**

Ensure every active pile list includes:

```md
Why It Matters, Buyer & Use Case, Market Structure & Timing, Customer Proof, Traction, Financing & Valuation, Competitive Position, Product & Technology, and Risks & Diligence
```

- [ ] **Step 4: Update the QA guide expected order**

In `docs/qa/post-cost-cuts-test-guide.md`, update the expected card order:

```md
**Expect to see the cards in this order:** Why It Matters, Buyer & Use Case, Market Structure & Timing, Customer Proof, Traction, **Financing & Valuation**, Competitive Position, Product & Technology, Risks & Diligence.
```

- [ ] **Step 5: Run stale-label search**

Run:

```bash
rg "<legacy-card-label-pattern>" apps/extension/src apps/extension/tests packages/ui docs/qa SPEC.md DESIGN.md INTENT.md
```

Expected: no matches, except references inside stale-code-contract search commands if those commands intentionally mention legacy label patterns.

- [ ] **Step 6: Commit**

Run:

```bash
git add SPEC.md INTENT.md DESIGN.md docs/qa/post-cost-cuts-test-guide.md
git commit -m "docs: mark market structure card active"
```

---

### Task 6: Final Verification

**Files:**
- No edits expected.

- [ ] **Step 1: Run package tests**

Run:

```bash
npm test -w @cold-start/core -- trust
npm test -w @cold-start/llm -- synthesis
npm test -w @cold-start/pipeline -- generate-card
npm test -w @cold-start/extension -- research-layer
npm test -w @cold-start/extension -- sidepanel.test.tsx
npm test -w @cold-start/ui -- CardShell
```

Expected: all pass.

- [ ] **Step 2: Run typechecks**

Run:

```bash
npm run typecheck
```

Expected: all workspace typechecks pass.

- [ ] **Step 3: Run stale-label scan**

Run:

```bash
rg "<legacy-card-label-pattern>" apps packages docs/qa DESIGN.md SPEC.md INTENT.md
```

Expected: no user-facing stale label matches. Internal compatibility fields may still appear in code.

- [ ] **Step 4: Manual extension visual check**

Run:

```bash
npm run build -w @cold-start/extension
```

Expected: build succeeds. Load `apps/extension/dist` in Chrome or Dia and confirm the card pile shows:

```text
Why It Matters
Buyer & Use Case
Market Structure & Timing
Customer Proof
Traction
Financing & Valuation
Competitive Position
Product & Technology
Risks & Diligence
```

- [ ] **Step 5: Commit any verification-only doc adjustments**

If no files changed, skip this step. If docs changed during verification, run:

```bash
git add SPEC.md INTENT.md DESIGN.md docs/qa/post-cost-cuts-test-guide.md
git commit -m "docs: finalize market structure verification"
```

---

## Self-Review Notes

Spec coverage:

- The card stays gated because it lives under `synthesis`, so public URL behavior remains safe.
- The market work is evidence-bound through `SourcedText`, citation marker normalization, trust filtering, and verifier filtering.
- The UI ships a real card only after schema, synthesis, pipeline, and renderer support exist.
- The plan keeps other future cards out of scope.

Placeholder scan:

- No step uses deferred-detail language or cross-references another step as a substitute for instructions.
- Every code-changing step names the target file and provides the concrete code fragment.

Rollback:

- Reverting this feature is a code rollback only. No DB migration or data migration is introduced because the card JSON schema is additive and optional.
