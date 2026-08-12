# Loading Screen Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved spec at `docs/superpowers/specs/2026-08-11-loading-screen-refinement-design.md`: prose-gate bubble text, kill the Early read box, keep its two honesty states in the header whisper, open the build tree from the first frame, make plan-ready visible, and swap the featured bubble's lilac top edge for a soft seal glow.

**Architecture:** One new pure function in `packages/core` (the prose gate), consumed by the extension's clipping model. Everything else is subtraction and rewiring inside `apps/extension`: `ReadRegion` deleted, `ResearchTrail` reduced to a thin always-open mount of `SourcePassInstrument`, one new display message in `research-progress.ts`, two new whisper lines, one CSS treatment change. No server changes, no API contract bump, no Inngest changes.

**Tech Stack:** TypeScript, React 19, Framer Motion, Vitest (jsdom), plain CSS with theme tokens.

## Global Constraints

- Stage transitions come only from real run events. No wall-clock advancement, no fake timers, no skeleton bubbles. (Spec section 5, rule 1.)
- Every color goes through theme tokens; `npm run audit:css -w @cold-start/extension` must pass (it is chained into the extension `test` script).
- Essential loading indicators animate under reduced motion too, in the calm variant (`cs-reduced-breathe`). A frozen loader under reduced motion is a bug.
- `apps/extension/tests/styles-classes.test.ts` enforces two-way sync between `cs-` classes in components and stylesheets. Every component-class deletion needs its CSS rules deleted in the same task, and vice versa.
- Prose-gate fixtures are real stored strings (harvested from the local DB on 2026-08-11, embedded verbatim below), never invented junk.
- No changes to `packages/core/api-contract.json`, `packages/core/src/alpha-analytics.ts`, or any Inngest event name / step id.
- `npm run check` runs directly at the end, exit code read from the shell, never piped.
- Commit style: short imperative subject, e.g. `feat: gate bubble text on readable prose`. End commit messages with the Claude co-author line.

## Pre-verified facts (do not re-derive)

- `markPerformance("cold-start-first-read-visible")` has exactly two references: the call in `ReadRegion.tsx:168` and the assertions in `apps/extension/tests/read-region.test.tsx`. No benchmark script or web-app consumer reads it. It retires with the component; note the retirement in the final report.
- `profile.first_payoff_viewed` feeds `scripts/alpha-status.ts` (`first_profile_result_at` funnel column). The emission in `CompanyArc.tsx` stays, reinterpreted as "first-payoff artifact available"; only the box dies. Do not delete `visibleFirstPayoff`, `buildingPayoff`, or `profileRead`.
- `research.details_toggled` is only emitted from `ResearchTrail.tsx`. The emission dies with the toggle; the name stays in `alpha-analytics.ts` (old extension versions still send it).
- The active stage row in `SourcePassInstrument` already renders `DrizzleLoader` via `StatusMark status="running"`, and `.cs-drizzle-loader` already animates under full motion (`type-and-motion.css` + `research-cards.css:219`) and reduced motion (`research-cards.css:271`, `cs-reduced-breathe`). The constant quiet loader of spec section 5 is this existing loader made permanently visible by the always-open tree; no new loader is built.
- After `plan.ready`, stage 0 (`Find`) has events, so `buildResearchProgressPlan` skips its synthetic running substep, and `displayResearchEventMessage` returns `null` for `plan.ready`; the tree renders zero substeps for the whole pre-source window. That is the frozen-seconds bug.
- `sources.raw_text` in the DB is a provider JSON envelope for 1678 of 1701 local rows; the extension's `snippet` is `rawText.slice(0, 700)` (`source-fetching.ts:102`) or a 240-char compaction (`generation-helpers.ts:256`). JSON bubbles are the default failure, not an edge case.

---

### Task 1: Prose gate in core

**Files:**
- Create: `packages/core/src/prose.ts`
- Create: `packages/core/tests/prose.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./prose";` alongside the `./sentences` export)

**Interfaces:**
- Produces: `isReadableProse(value: string): boolean`; later tasks import it from `@cold-start/core`.

- [ ] **Step 1: Write the failing test**

`packages/core/tests/prose.test.ts`. The offender strings are verbatim prefixes of real stored `sources.raw_text` rows (local DB, 2026-08-11), whitespace-collapsed exactly as `clippingNote` does before rendering.

```ts
import { describe, expect, it } from "vitest";
import { isReadableProse } from "../src/prose";

// Real stored source text, harvested 2026-08-11. Each entry is the leading slice of a
// sources.raw_text row exactly as the snippet pipeline would hand it to a bubble.
const REAL_OFFENDERS = [
  // Exa search envelope (cartesia.ai run)
  '{"requestId":"2f3fbeb69bc7c6b81d1bd35367afafc2","results":[{"id":"https://cartesia.ai/sonic?gad_campaignid=23084431172","title":"Real-time TTS API with AI laughter and emotion | Cartesia Sonic-3","url":"https://cartesia.ai/sonic?gad_campaignid=23084431172","author":null,"score":0.9488493204116821}',
  // Apollo organization record (cartesia.ai run)
  '{"organization":{"id":"6578dc4066927303d3b5b396","name":"Cartesia","website_url":"http://www.cartesia.ai","angellist_url":null,"linkedin_url":"http://www.linkedin.com/company/cartesia-ai"',
  // Content envelope carrying markdown nav junk (legora.com run)
  '{"url":"https://legora.com/","title":"Legora","content":"Product\\n\\n+\\n\\nSolutions\\n\\n+\\n\\n[Security](https://legora.com/security)\\n\\n[Customers](https://legora.com/customers)',
  // Markdown image/link chain with encoded query params (twelvelabs.io run)
  "[![](https://framerusercontent.com/images/J0k8tAFEkkDowBZmjeWMoRC5ZfI.png?width=200&height=200)",
  // Markdown heading start (flora.ai run)
  "###### Through July 1: Nano Banana 2 + Pro usage is on us. Pro/Max plans only.",
  // Mid-envelope slice: no leading brace, still JSON
  '"requestId":"14b1834c467eb39e32c056c091810fca","resolvedSearchType":"","results":[',
  // A bare URL as the whole string
  "https://cartesia.ai/sonic?gad_campaignid=23084431172",
];

const REAL_PROSE = [
  // Stored source titles and clean raw_text rows from the same DB
  "Real-time TTS API with AI laughter and emotion | Cartesia Sonic-3",
  "Legora raises $550 million Series D to fuel US growth",
  "Public commit authors on cartesia.ai: 10 work email(s).",
  "GitHub org makenotion.",
  // Strings the existing clipping tests already rely on
  "Exa raises a Series B round",
  "The company sells workflow software to regional clinics. A second sentence is omitted.",
  // Short but clean: a bare product name must pass (current bubbles show these)
  "Exa",
];

describe("isReadableProse", () => {
  it("rejects every real stored offender", () => {
    for (const junk of REAL_OFFENDERS) {
      expect(isReadableProse(junk), junk.slice(0, 60)).toBe(false);
    }
  });

  it("accepts real titles and clean sentences, including short names", () => {
    for (const prose of REAL_PROSE) {
      expect(isReadableProse(prose), prose.slice(0, 60)).toBe(true);
    }
  });

  it("rejects empty and whitespace-only strings", () => {
    expect(isReadableProse("")).toBe(false);
    expect(isReadableProse("   ")).toBe(false);
  });

  it("rejects markup, escaped-newline runs, and query-pair runs even mid-string", () => {
    expect(isReadableProse("Read the <div class=\"hero\">launch post</div> today")).toBe(false);
    expect(isReadableProse("Meet Sonic-3\\n\\nLearn more\\n\\nPricing")).toBe(false);
    expect(isReadableProse("thumbnail.png?width=1200&height=630&fit=crop")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @cold-start/core -- prose`
Expected: FAIL with `Cannot find module '../src/prose'` (or equivalent).

- [ ] **Step 3: Write the implementation**

`packages/core/src/prose.ts`:

```ts
/*
 * Bubble-text prose gate. The extension shows source titles and snippet
 * sentences inside clippings; the snippet pipeline is a raw slice of
 * sources.raw_text, which for most providers is a JSON envelope, so
 * without a gate a bubble renders JSON. One question, answered
 * conservatively: is this string readable prose? Bias toward rejection.
 * A domain-plus-type bubble is never embarrassing; JSON in a bubble
 * always is. Shared in core because any surface that renders source
 * text needs the same answer.
 */

const STRUCTURAL_OPENER = /^\s*(?:[{[<]|#{2,}\s|!\[|https?:\/\/)/i;
const JSON_KEY = /"[^"\n]{1,80}"\s*:/;
const MARKUP_TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?>/i;
const MARKDOWN_LINK = /\]\(|!\[/;
const URL_ENCODED_RUN = /%[0-9a-f]{2}%[0-9a-f]{2}/i;
const QUERY_PAIR_RUN = /[a-z0-9_]+=[^&\s]*&[a-z0-9_]+=/i;
const CODE_SIGNAL = /(?:=>|;\s*\}|\{\s*\}|\\n|\\u[0-9a-f]{4}|```)/i;

export function isReadableProse(value: string): boolean {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    return false;
  }
  if (
    STRUCTURAL_OPENER.test(text) ||
    JSON_KEY.test(text) ||
    MARKUP_TAG.test(text) ||
    MARKDOWN_LINK.test(text) ||
    URL_ENCODED_RUN.test(text) ||
    QUERY_PAIR_RUN.test(text) ||
    CODE_SIGNAL.test(text)
  ) {
    return false;
  }
  // Structure characters that prose never accumulates. Pipes stay out of
  // this set: real titles separate with them ("Product | Company").
  const structural = (text.match(/[{}[\]<>`~^]/g) ?? []).length;
  if (structural >= 3 || (structural > 0 && structural / text.length > 0.02)) {
    return false;
  }
  // Letters must carry the string; identifiers, urls, and number soup fail.
  const letters = (text.match(/[a-z]/gi) ?? []).length;
  return letters / text.length >= 0.55;
}
```

Add to `packages/core/src/index.ts`, in alphabetical position near the `./sentences` export:

```ts
export * from "./prose";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @cold-start/core -- prose`
Expected: PASS. If a fixture fails, tune the regexes/thresholds, never the fixture. The fixtures are ground truth.

- [ ] **Step 5: Run the full core suite**

Run: `npm test -w @cold-start/core`
Expected: PASS (no other core surface imports the new module yet).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/prose.ts packages/core/tests/prose.test.ts packages/core/src/index.ts
git commit -m "feat: add shared prose gate for source text surfaces"
```

---

### Task 2: Gate bubble text in the clipping model

**Files:**
- Modify: `apps/extension/src/company/clipping-model.ts` (`clippingNote`, `clippingHasUsefulTitle`)
- Test: `apps/extension/tests/clippings.test.ts`

**Interfaces:**
- Consumes: `isReadableProse` from `@cold-start/core` (Task 1).
- Produces: unchanged signatures. `clippingNote` returns `null` for junk; `clippingHasUsefulTitle` returns `false` when the rendered text fails the gate, which keeps junk bubbles out of the featured slot via the existing demotion machinery in `Clippings.tsx` (no changes there).

- [ ] **Step 1: Write the failing tests**

Append to the `clippingsFromEvents` describe block in `apps/extension/tests/clippings.test.ts` (the JSON strings are the same real offenders as Task 1):

```ts
  it("refuses a JSON snippet as a note instead of rendering provider payloads", () => {
    const [clipping] = clippingsFromEvents([
      event({
        id: "sources",
        type: "source.found",
        metadata: {
          sources: [{
            url: "https://cartesia.ai/sonic",
            domain: "cartesia.ai",
            title: "Cartesia",
            sourceType: "company_site",
            snippet: '{"requestId":"2f3fbeb69bc7c6b81d1bd35367afafc2","results":[{"id":"https://cartesia.ai/sonic?gad_campaignid=23084431172","title":"Real-time TTS API with AI laughter and emotion | Cartesia Sonic-3"'
          }]
        }
      })
    ]);

    // Junk snippet, generic title: the bubble keeps domain and type only.
    expect(clipping?.note).toBeNull();
  });

  it("refuses a junk title outright, even as the last fallback", () => {
    const [clipping] = clippingsFromEvents([
      event({
        id: "sources",
        type: "source.found",
        metadata: {
          sources: [{
            url: "https://api.example.com/record",
            domain: "example.com",
            title: '{"organization":{"id":"6578dc4066927303d3b5b396","name":"Cartesia"',
            sourceType: "enrichment",
            snippet: ""
          }]
        }
      })
    ]);

    expect(clipping?.note).toBeNull();
  });
```

Append to the `clippingHasUsefulTitle` describe block:

```ts
  it("never lets gate-failing text take the featured slot", () => {
    const base = { domain: "cartesia.ai", sourceClass: "company_site" as const };
    expect(clippingHasUsefulTitle({
      ...base,
      title: '{"requestId":"abc","results":[{"title":"Real-time TTS API with AI laughter"}]}'
    })).toBe(false);
    expect(clippingHasUsefulTitle({
      ...base,
      title: "Cartesia",
      note: '[![](https://framerusercontent.com/images/J0k8tAFEkkDowBZmjeWMoRC5ZfI.png?width=200&height=200)'
    })).toBe(false);
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -w @cold-start/extension -- clippings`
Expected: the three new tests FAIL (notes currently render the junk; the junk title counts as useful words).

- [ ] **Step 3: Wire the gate**

In `apps/extension/src/company/clipping-model.ts`, add `isReadableProse` to the existing `@cold-start/core` import, then replace `clippingNote` and the top of `clippingHasUsefulTitle`:

```ts
function clippingNote(
  title: string,
  domain: string,
  sourceClass: ClippingSourceClass,
  snippet?: string
) {
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  const proseTitle = isReadableProse(cleanTitle) ? cleanTitle : null;
  if (proseTitle && clippingHasUsefulTitle({ title: proseTitle, domain, sourceClass })) {
    return proseTitle;
  }
  // Gate the string that would render: the first sentence of the snippet.
  // Most snippets are raw provider JSON (a slice of sources.raw_text), so
  // rejection is the common case, and the bubble falls back to domain+type.
  const cleanSnippet = firstSentence(snippet?.replace(/\s+/g, " ").trim() ?? "");
  if (
    cleanSnippet &&
    isReadableProse(cleanSnippet) &&
    cleanSnippet.toLowerCase() !== domain.toLowerCase()
  ) {
    return cleanSnippet.length > 180 ? `${cleanSnippet.slice(0, 177).trimEnd()}...` : cleanSnippet;
  }
  return proseTitle && proseTitle.toLowerCase() !== domain.toLowerCase() ? proseTitle : null;
}

export function clippingHasUsefulTitle(
  clipping: Pick<Clipping, "domain" | "sourceClass" | "title"> & Partial<Pick<Clipping, "note">>
): boolean {
  const focusText = clipping.note ?? clipping.title;
  if (!isReadableProse(focusText)) {
    return false;
  }
  // ...rest of the function unchanged (useful-words count vs domain words)...
```

- [ ] **Step 4: Run the extension unit suites that touch clippings**

Run: `npm test -w @cold-start/extension -- clippings` then `npm test -w @cold-start/extension -- assembly`
Expected: PASS, including every pre-existing test (their titles and snippets are clean prose and must survive the gate untouched). If an existing test fails, the gate is over-rejecting; fix the gate in core, with the failing string added to `REAL_PROSE`.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/company/clipping-model.ts apps/extension/tests/clippings.test.ts
git commit -m "feat: gate bubble titles and snippets on readable prose"
```

---

### Task 3: Whisper carries the two honesty states

Do this before deleting the Early read so the honesty coverage never has a gap.

**Files:**
- Modify: `apps/extension/src/research/research-progress.ts` (`whisperCopyFromEvents`)
- Test: `apps/extension/tests/research-progress.test.ts`

**Interfaces:**
- Consumes: `parseFirstPayoff` (already imported in this module), `latestRunEvents` scoping via `currentProfileProgressEvents`.
- Produces: two new whisper strings, exact copy fixed here:
  - Entity unconfirmed: `Confirming this is the right company`
  - No accepted evidence: `No solid sources yet, still looking`

- [ ] **Step 1: Write the failing tests**

Add to the `whisperCopyFromEvents` describe block in `apps/extension/tests/research-progress.test.ts`. Build payoff metadata inline (mirror the `firstPayoff()` helper shape from the deleted read-region test; `parseFirstPayoff` validates the schema, so copy a complete valid object):

```ts
  const receiptPayoff = {
    status: "receipt",
    slug: "exa",
    domain: "exa.ai",
    generatedAt: "2026-06-21T00:00:00.000Z",
    generatedAtMs: Date.parse("2026-06-21T00:00:00.000Z"),
    entityConfidence: "high",
    entityConfidenceReason: "Current domain and source text match Exa.",
    evidenceSoFar: [],
    stillChecking: { text: "Named customer proof.", missingEvidenceClass: "customer_proof" },
    suppressionReasons: []
  };

  it("says it is confirming the company while the entity match is unchecked", () => {
    const events = [
      event({ id: "sources", type: "source.found", metadata: { acceptedCount: 3 } }),
      event({
        id: "receipt",
        type: "first_payoff.withheld",
        metadata: {
          firstPayoff: {
            ...receiptPayoff,
            status: "withheld",
            entityConfidence: "needs_check",
            suppressionReasons: ["entity_needs_check"]
          }
        }
      })
    ];
    expect(whisperCopyFromEvents(events, "exa.ai")).toBe("Confirming this is the right company");
  });

  it("says no solid sources honestly instead of a generic building line", () => {
    const events = [
      event({ id: "plan", type: "plan.ready" }),
      event({ id: "receipt", type: "first_payoff.receipt", metadata: { firstPayoff: receiptPayoff } })
    ];
    expect(whisperCopyFromEvents(events, "exa.ai")).toBe("No solid sources yet, still looking");
  });

  it("returns to the standard voice once the read is substantive or filed", () => {
    const substantive = {
      ...receiptPayoff,
      status: "substantive_first_read",
      whatItDoes: {
        text: "Exa builds search infrastructure for AI applications.",
        supportingText: "Exa builds search infrastructure for AI applications.",
        sourceIds: ["company_site-exa.ai"],
        citationIds: [],
        sourceClass: "company_site",
        claimKind: "what_it_does"
      }
    };
    const events = [
      event({ id: "sources", type: "source.found", metadata: { acceptedCount: 8 } }),
      event({ id: "ready", type: "first_payoff.ready", metadata: { firstPayoff: substantive } })
    ];
    expect(whisperCopyFromEvents(events, "exa.ai")).toBe("8 sources, building profile");
    expect(
      whisperCopyFromEvents([...events, event({ id: "saved", type: "card.saved" })], "exa.ai")
    ).toBe("Filed");
  });
```

Note: `first_payoff.receipt` maps to stage 1 / seal level 2, so the "no solid sources" case sits at level 2 where the generic line would otherwise be "Building profile"; the honest line must win. In the needs-check case a later payoff event with the entity resolved supersedes it (latest artifact wins).

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @cold-start/extension -- research-progress`
Expected: the new tests FAIL with the generic building lines.

- [ ] **Step 3: Implement**

In `research-progress.ts`, add a latest-artifact scan and fold it into `whisperCopyFromEvents` (do not import from `first-payoff-events.ts`, since that module imports this one; inline the scan instead):

```ts
function latestFirstPayoffFromEvents(scoped: ExtensionResearchRunEvent[]): FirstPayoff | null {
  for (const event of [...scoped].reverse()) {
    const parsed = parseFirstPayoff(event.metadata.firstPayoff);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

export function whisperCopyFromEvents(events: ExtensionResearchRunEvent[], domain: string): string {
  const level = sealLevelFromEvents(events);
  if (level >= 4) {
    return "Filed";
  }
  if (level <= 0) {
    return "Queued";
  }
  // Two honesty states outrank the generic progress voice while building:
  // the entity match is unconfirmed, or nothing solid has been accepted.
  const firstPayoff = latestFirstPayoffFromEvents(currentProfileProgressEvents(events));
  if (firstPayoff && firstPayoff.status !== "substantive_first_read") {
    if (firstPayoff.entityConfidence === "needs_check") {
      return "Confirming this is the right company";
    }
    if (firstPayoff.evidenceSoFar.length === 0) {
      return "No solid sources yet, still looking";
    }
  }
  if (level === 1) {
    return `Reading ${domain}`;
  }
  const count = acceptedSourceCountFromEvents(events);
  if (count && count > 0) {
    return `${count} ${count === 1 ? "source" : "sources"}, building profile`;
  }
  return "Building profile";
}
```

- [ ] **Step 4: Run to verify green**

Run: `npm test -w @cold-start/extension -- research-progress`
Expected: PASS, including the existing whisper progression test.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/research/research-progress.ts apps/extension/tests/research-progress.test.ts
git commit -m "feat: carry entity-check and no-evidence honesty in the whisper"
```

---

### Task 4: Delete the Early read

**Files:**
- Delete: `apps/extension/src/company/ReadRegion.tsx`
- Delete: `apps/extension/tests/read-region.test.tsx`
- Modify: `apps/extension/src/company/CompanyArc.tsx` (remove both mounts and the import)
- Modify: `apps/extension/src/styles/company-arc.css` (remove `cs-read-region*` and `cs-early-read-*` rules)
- Modify: `apps/extension/tests/e2e/sidepanel-ui.spec.ts` (two blocks assert `getByLabel("Early read")`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `earlyReadState`, `first-payoff-events.ts`, `company-display.ts`, and the `profile.first_payoff_viewed` emission all stay exactly as they are. Only the rendering dies.

- [ ] **Step 1: Delete component and test**

```bash
git rm apps/extension/src/company/ReadRegion.tsx apps/extension/tests/read-region.test.tsx
```

- [ ] **Step 2: Unmount from CompanyArc**

In `CompanyArc.tsx`:
- Remove the `import { ReadRegion } from "./ReadRegion";` line.
- Remove the profile-phase block (the whole `<AnimatePresence initial={false}>` wrapper whose only child is the `context="profile"` `ReadRegion`, around lines 505-513).
- Inside the building flow, remove the `<AnimatePresence initial={false}>` wrapper whose only child is the `context="building"` `ReadRegion` (around lines 523-531).
- Keep `buildingPayoff`, `profileRead`, `visibleFirstPayoff`, and the `profile.first_payoff_viewed` effect untouched (funnel metric, see pre-verified facts).

- [ ] **Step 3: Delete the CSS**

In `apps/extension/src/styles/company-arc.css` remove:
- The `.cs-read-region`, `.cs-read-region-head`, `.cs-early-read-tab-label`, `.cs-read-region-body`, `.cs-read-region-need` block (lines 1-47) and its leading comment.
- The `.cs-early-read-claim` through `.cs-early-read-more` rules (lines 490-566).
- The `.cs-building-flow > .cs-read-region` rule (lines 1004-1006).

Then verify nothing dangles:

```bash
grep -rn "read-region\|early-read" apps/extension/src/
```

Expected: no matches.

- [ ] **Step 4: Update the two e2e blocks**

In `apps/extension/tests/e2e/sidepanel-ui.spec.ts`:
- The building-phase test (asserts the read between header and details, ~line 1165): drop the `getByLabel("Early read")` assertions and the read box-ordering checks. Re-point it at the new surface contract of Tasks 5-6: assert `page.locator(".cs-build-tree")` is visible with no `.cs-assembly-details-toggle`, and keep the header-above-details ordering check using `.cs-company-context` and `.cs-assembly-details`. Rename the test accordingly (e.g. `"building keeps the build tree open between header and footer"`).
- The remount test (~line 2182, "the same read must ride across the remount"): the ride-across contract is dead. Rewrite to assert the building phase shows the tree, then after `basicsFinished = true` the profile phase mounts `getByLabel("Research layer")`. Drop the `claim` visibility assertions.

- [ ] **Step 5: Run the unit suites**

Run: `npm test -w @cold-start/extension`
Expected: PASS (assembly, sidepanel, and styles-classes suites catch any leftover mount or orphaned CSS). The e2e spec compiles but does not run here.

- [ ] **Step 6: Commit**

```bash
git add -A apps/extension
git commit -m "feat: remove the early read box from building and profile"
```

---

### Task 5: Build tree always open

**Files:**
- Modify: `apps/extension/src/research/ResearchTrail.tsx` (rewrite)
- Modify: `apps/extension/src/research/SourcePassInstrument.tsx` (comment only: the "behind the Details toggle" note on the `variant` prop is now wrong)
- Modify: `apps/extension/src/styles/research-trail.css` (remove ledger and toggle rules)
- Test: `apps/extension/tests/research-trail.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `SourcePassInstrument` (direct import now), `buildResearchProgressPlan`, `RESEARCH_PROGRESS_STAGES`, `acceptedSourceCountFromEvents`, `generationStageIndexFromEvents`.
- Produces: `ResearchTrail` keeps its exact props (`companyDomain`, `events`, `generationStatus`) so `CompanyArc` does not change. `companyDomain` becomes unused by the body; remove it from the props type and the `CompanyArc` call site, since the analytics emission dies with the toggle.

- [ ] **Step 1: Rewrite the test file**

Replace `apps/extension/tests/research-trail.test.tsx` body tests with (keep the render/event helpers at the top of the file as they are):

```tsx
describe("ResearchTrail", () => {
  it("renders the full build tree from the first frame, no ledger, no toggle", async () => {
    const container = await render(
      <ResearchTrail events={[]} generationStatus="running" />
    );

    expect(container.querySelector(".cs-build-tree")).not.toBeNull();
    expect(container.querySelector(".cs-progress-ledger")).toBeNull();
    expect(container.querySelector(".cs-assembly-details-toggle")).toBeNull();

    const labels = Array.from(container.querySelectorAll(".cs-build-stage-copy strong")).map(
      (node) => node.textContent
    );
    expect(labels).toEqual(["Find", "Read", "Build", "File"]);

    // The active stage carries the constant quiet loader from the first frame.
    expect(
      container.querySelector('.cs-build-stage[data-active="true"] .cs-drizzle-loader')
    ).not.toBeNull();
  });

  it("advances the tree on source events", async () => {
    const container = await render(
      <ResearchTrail events={[sourceFound]} generationStatus="running" />
    );

    const active = container.querySelector('.cs-build-stage[data-active="true"]');
    expect(active?.querySelector("strong")?.textContent).toBe("Read");
    expect(container.textContent).toContain("3 sources found");
  });

  it("keeps the failure mark on the stage where the run died", async () => {
    const container = await render(
      <ResearchTrail
        events={[
          sourceFound,
          event({ id: "failed", type: "generation.failed", message: "Generation failed: provider error" })
        ]}
        generationStatus="running"
      />
    );

    expect(
      container.querySelector('.cs-build-stage[data-status="failed"]')
    ).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -w @cold-start/extension -- research-trail`
Expected: FAIL (tree hidden behind the toggle; props mismatch).

- [ ] **Step 3: Rewrite ResearchTrail**

Replace the whole component file with:

```tsx
import type { ExtensionResearchRunEvent } from "../shared/extension-config";
import {
  acceptedSourceCountFromEvents,
  generationStageIndexFromEvents,
  RESEARCH_PROGRESS_STAGES
} from "./research-progress";
import { SourcePassInstrument } from "./SourcePassInstrument";

type ResearchTrailProps = {
  events: ExtensionResearchRunEvent[];
  // "withheld" is only meaningful for analysis-mode responses; the building phase this trail
  // renders is basics-only and never produces it, but the shared GenerationStatus type carries
  // it structurally, so it is accepted here and treated like any other non-"queued" status.
  generationStatus: "queued" | "running" | "cached" | "complete" | "failed" | "withheld";
};

function plural(value: number, singular: string, pluralWord = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralWord}`;
}

function stageNoteFor(activeIndex: number, sourceCount: number) {
  if (activeIndex === 1 && sourceCount > 0) {
    return `${plural(sourceCount, "source")} found`;
  }
  if (activeIndex === 2) {
    return "Building first profile";
  }
  if (activeIndex === 3) {
    return "Saving with sources attached";
  }
  return "Checking company, product, funding, and proof sources";
}

// The build tree is the building phase's progress surface, open from the first frame: four
// stages, event-fed substeps, and the drizzle loader on whichever stage is running. Every
// state change comes from a real run event; the loader is the one constant motion.
export function ResearchTrail({ events, generationStatus }: ResearchTrailProps) {
  const eventSourceCount = acceptedSourceCountFromEvents(events);
  const sourceCount = eventSourceCount ?? 0;
  const queuedQuietly = generationStatus === "queued";
  const eventStageIndex = queuedQuietly ? 0 : generationStageIndexFromEvents(events);
  const activeIndex = Math.min(
    RESEARCH_PROGRESS_STAGES.length - 1,
    Math.max(0, eventStageIndex ?? (sourceCount > 0 ? 1 : 0))
  );
  const stageNote = queuedQuietly ? "Company queued" : stageNoteFor(activeIndex, sourceCount);

  return (
    <div className="cs-assembly-details" aria-label="Research details">
      <SourcePassInstrument
        activeIndex={activeIndex}
        complete={false}
        events={events}
        sources={[]}
        stageNote={stageNote}
        stages={RESEARCH_PROGRESS_STAGES}
        variant="compact"
      />
    </div>
  );
}
```

Notes: `useState`, `lazy`, `Suspense`, `useAlphaEvent`, `StageLedgerMark`, `progressPlanHasAttention`, and the `data-attention` attribute all go. In `CompanyArc.tsx`, drop `companyDomain={domain}` from the `ResearchTrail` call. In `SourcePassInstrument.tsx`, fix the `variant` prop comment ("Only ever mounted at compact by ResearchTrail, which keeps the panel-width layout"; no toggle mention).

- [ ] **Step 4: Delete the ledger and toggle CSS**

In `apps/extension/src/styles/research-trail.css` remove `.cs-progress-ledger` through `.cs-progress-ledger-note` (lines 14-111) and `.cs-assembly-details-toggle` rules (lines 113-140), and rewrite the block comment at the top of the file (lines 1-5) to describe the always-open tree. Check for stragglers:

```bash
grep -rn "cs-progress-ledger\|cs-assembly-details-toggle\|data-attention" apps/extension/src/
```

Expected: no matches (the `data-attention` hits on `cs-assembly-whisper` in `CompanyArc.tsx` are a different attribute on a different element and stay).

- [ ] **Step 5: Run the extension suite**

Run: `npm test -w @cold-start/extension`
Expected: PASS. `styles-classes.test.ts` confirms the class deletions are two-sided. `research-progress.test.ts` still owns the plan-builder logic.

- [ ] **Step 6: Commit**

```bash
git add -A apps/extension
git commit -m "feat: open the build tree from the first frame, retire the ledger"
```

---

### Task 6: Plan-ready becomes visible in the tree

**Files:**
- Modify: `apps/extension/src/research/research-progress.ts` (`displayResearchEventMessage`, `proofLineForStage`)
- Test: `apps/extension/tests/research-progress.test.ts`

**Interfaces:**
- Consumes: existing event plumbing.
- Produces: `plan.ready` yields the substep message `Research plan ready` (status `done`), and the Find stage's proof line before plan-ready reads `Planning which sources to check`, advancing to the existing `Checking company, product, funding, and proof sources` on plan-ready. The pre-source hold reads as two movements.

- [ ] **Step 1: Write the failing tests**

Add to the plan-builder describe block in `research-progress.test.ts`:

```ts
  it("shows plan.ready as a done substep so the pre-source hold has a visible movement", () => {
    const plan = buildResearchProgressPlan({
      activeIndex: 0,
      events: [
        event({ id: "started", type: "generation.started" }),
        event({ id: "plan", type: "plan.ready" })
      ],
      stageNote: "Checking company, product, funding, and proof sources",
      stages: RESEARCH_PROGRESS_STAGES
    });

    const findSubsteps = plan[0]?.substeps.map((substep) => substep.message);
    expect(findSubsteps).toContain("Research plan ready");
    expect(plan[0]?.substeps.find((substep) => substep.message === "Research plan ready")?.status).toBe("done");
  });

  it("advances the Find proof line from planning to checking on plan.ready", () => {
    const before = buildResearchProgressPlan({
      activeIndex: 0,
      events: [event({ id: "started", type: "generation.started" })],
      stageNote: "",
      stages: RESEARCH_PROGRESS_STAGES
    });
    expect(before[0]?.proofLine).toBe("Planning which sources to check");

    const after = buildResearchProgressPlan({
      activeIndex: 0,
      events: [
        event({ id: "started", type: "generation.started" }),
        event({ id: "plan", type: "plan.ready" })
      ],
      stageNote: "",
      stages: RESEARCH_PROGRESS_STAGES
    });
    expect(after[0]?.proofLine).toBe("Checking company, product, funding, and proof sources");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @cold-start/extension -- research-progress`
Expected: FAIL (`plan.ready` message is null; proof line does not distinguish planning).

- [ ] **Step 3: Implement**

In `displayResearchEventMessage`, replace the `plan.ready` branch:

```ts
  if (event.type === "plan.ready") {
    return "Research plan ready";
  }
```

In `proofLineForStage`, index 0 branch, distinguish planning from checking (keep the queued and source-artifact lines above it):

```ts
  if (index === 0) {
    const sourceArtifact = sourceArtifactLine({ events, sources });
    if (sourceArtifact) {
      return sourceArtifact;
    }
    if (events.some((event) => event.type === "generation.queued")) {
      return "Company queued";
    }
    return events.some((event) => event.type === "plan.ready")
      ? "Checking company, product, funding, and proof sources"
      : "Planning which sources to check";
  }
```

- [ ] **Step 4: Run the extension suite**

Run: `npm test -w @cold-start/extension`
Expected: PASS. Watch `research-trail.test.tsx` ("renders the full build tree from the first frame"): with zero events the Find proof line now reads "Planning which sources to check"; the assertions above don't pin that string, so no conflict; if any other test pinned the old Find line with no events, update it to the new planning line.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/research/research-progress.ts apps/extension/tests/research-progress.test.ts
git commit -m "feat: surface plan.ready in the build tree"
```

---

### Task 7: Featured bubble glow

**Files:**
- Modify: `apps/extension/src/styles/company-arc.css` (the `data-active` clipping rule, line ~1195)

**Interfaces:**
- Consumes: theme token `--cs-c-110-92-158` (the seal triplet, already used in this file).
- Produces: starting values below; final values come from Samay's screenshot loop in Task 8.

- [ ] **Step 1: Replace the treatment**

Replace the current rule:

```css
.cs-clippings[data-variant="carousel"] .cs-clipping[data-active="true"] .cs-clipping-link {
  border-color: rgb(var(--cs-c-110-92-158) / 0.38);
  border-top-color: var(--color-seal);
  background: var(--color-plate);
}
```

with the lit treatment (faint ring plus low, wide seal shadow; no solid edge):

```css
.cs-clippings[data-variant="carousel"] .cs-clipping[data-active="true"] .cs-clipping-link {
  border-color: rgb(var(--cs-c-110-92-158) / 0.3);
  background: var(--color-plate);
  box-shadow:
    0 0 0 1px rgb(var(--cs-c-110-92-158) / 0.14),
    0 2px 6px rgb(var(--cs-c-110-92-158) / 0.1),
    0 8px 22px rgb(var(--cs-c-110-92-158) / 0.13);
}
```

- [ ] **Step 2: Audit both themes**

Run: `npm run audit:css -w @cold-start/extension`
Expected: PASS. If the dark-theme value of the seal triplet makes the ring invisible against the dark plate, raise the ring alpha in the dark block of `theme-and-dark.css` rather than hardcoding a literal.

- [ ] **Step 3: Run the extension test suite**

Run: `npm test -w @cold-start/extension`
Expected: PASS (audit:css is chained in).

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/styles/company-arc.css
git commit -m "feat: light the featured clipping with a seal glow"
```

---

### Task 8: Gate, capture, and stop for review

- [ ] **Step 1: Full local gate**

Run: `npm run check`
Read the exit code directly from the shell (`echo $?` immediately after if needed). Never pipe the command. Requires local docker postgres up for the DB suites.
Expected: exit 0.

- [ ] **Step 2: Build and capture the building phase**

Build the extension, then use the Playwright harness (`qa:extension:ui` mounts the panel with the Chrome shim; the gallery specs under `apps/extension/tests/e2e/` are the screenshot pattern; do not drive Playwright through `tsx`, it breaks `addInitScript`). Capture at minimum:
1. The empty pre-source window (started + plan.ready only): tree open, planning line, drizzle loader, plan-ready substep.
2. A populated carousel with the featured-bubble glow.
3. A slop-demoted bubble (favicon, domain, type label; not featured).
4. The building phase overall with the whisper honesty line visible if reachable in the fixture.

Known quirk: archive dossier screenshots drift 1-2 px per run; discard those diffs.

- [ ] **Step 3: STOP for Samay's screenshot review**

Present the captures. He judges taste on real renders, tunes the glow values. Iterate Task 7 values until he passes it. Do not proceed to the live run without his pass.

- [ ] **Step 4: Live run (after screenshot sign-off)**

One end-to-end run on a fresh company from `docs/qa/fresh-test-queue-2026-08-02.md`, watched live. Three checks: no JSON text anywhere, no frozen seconds anywhere including the pre-source window, tree open from the first frame. Log the run in `docs/qa/analysis-run-observations.md` with both system evidence and company insight, per that file's own rule.

- [ ] **Step 5: Present the branch for merge**

Diff summary plus evidence (screenshots pass, live-run log, check exit code). Samay decides the merge. Nothing deploys without his word.

## Plan self-review

- Spec coverage: section 1 → Task 7; section 2 → Tasks 1-2; section 3 → Tasks 3-4; section 4 → Task 5; section 5 → Tasks 5-6 (loader pre-exists, see pre-verified facts); section 6 → every task's test steps plus Task 8. Decision record honored throughout.
- The `profile.first_payoff_viewed` emission staying is a deliberate deviation-from-literal-reading (the spec says delete the component; the emission lives in CompanyArc and feeds the alpha-status funnel). Flag it in the final report.
- Type consistency: `isReadableProse(value: string): boolean` used identically in Tasks 1-2; `ResearchTrail` props shrink once (Task 5) with the single `CompanyArc` call site updated in the same task.
