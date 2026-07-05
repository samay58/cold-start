# Extension Experience Overhaul: Packet Plan

> **For agentic workers:** This plan is executed per `~/.claude/FABLE-ORCHESTRATION.md` via Workflow fan-out (the subagent-driven variant). Each packet below is one agent's exclusive territory. A packet agent sees only its own packet plus Global Constraints and Interfaces; if something is ambiguous, return a question, never a guess. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the side panel so the assembling card is the progress display, people tooltips carry cited investor-grade reads, and every surface passes the earn-your-space doctrine.

**Architecture:** The building and profile phases render one shared profile skeleton whose slots fill on real generation events; `ResearchTrail`'s five voices collapse into a header whisper (seal instrument + copy) plus clippings that arrive as the card's first content. A new `person_read` LLM stage runs inside the async contact-enrichment worker and stores nullable cited reads on person objects, stripped from the public card like email.

**Tech Stack:** React 19 + Vite/CRXJS extension, Zod schemas in `packages/core`, Drizzle/Postgres, Inngest workers in `apps/web`, Anthropic/OpenAI-compat LLM routing in `packages/llm`, Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-07-04-extension-experience-overhaul-design.md` (authoritative for product behavior).

## Global Constraints

- `npm run check` green is the merge bar; CI mirrors it. Do not pipe check through `tail` (eats the exit code).
- Extension CSS: every color through theme tokens; `npm run audit:css -w @cold-start/extension` must pass; every new `cs-*` class must exist in both a component and `styles.css` (`tests/styles-classes.test.ts` enforces).
- No wall-clock animation or estimation in progress UI. A slot moves only on a real generation event.
- Reduced motion degrades arrivals to plain fades; full motion is the design.
- Public `/api/cards/{slug}` never returns synthesis; person `read` is stripped from the public card exactly like `email`.
- Verifier-drop and honesty conventions hold: thin evidence produces null reads with a structured suppression reason, never filler.
- Sentence-case labels, DESIGN.md Catalogue Card language, no raw hex in components.
- Naming: the per-person field is `read` (a "person read"); it is UNRELATED to `ReadRegion`/First Payoff (the company-level "early read"). Do not modify `ReadRegion.tsx`, `first-payoff.ts`, or `first-payoff-events.ts` in any packet except where explicitly listed.
- Commit after each green step cycle with a plain imperative subject, no em-dashes, footer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Phase map and dependencies

- Phase 1 (parallel): AUDIT-1..6 (read-only), A1, B1, D2.
- Phase 2 (parallel, worktrees): A2 (needs A1), A3 (needs A2), A4 (needs A1), B2 (needs B1), C1 (needs AUDIT reviews), C2 (needs B2+C1+A4 merged).
- Phase 3: D1 (needs A1+B1+B2 merged), adversarial reviews, full gate, integration.

---

### Packet AUDIT-1..6: Surface audits (six parallel agents)

**Model:** Sonnet, effort low. **Read-only; no code changes.**

One agent per surface: (1) intake phase, (2) building phase, (3) profile phase header + facts + people, (4) research-layer module pile + card tray (`research-layer.ts`, `ResearchLayerPanel.tsx`), (5) investor lens memo (`investor-lens.ts`, lens rendering in `ResearchLayerPanel.tsx`), (6) details tree + source instrument (`SourcePassInstrument.tsx`).

Each returns structured output `{surface, elements: [{name, whatItSays, duplicateOf|null, actedOnOrFelt: boolean, verdict: "kill"|"keep"|"move", moveTarget|null, rationale}], screenshots: string[]}`. Screenshots best-effort via `npm run qa:extension:ui -w @cold-start/extension`; if the harness fights back, code-derived analysis is acceptable, say so in the report. Doctrine: an element must say something no other element says AND be acted on or felt; one status voice, one ambient texture, one accent moment per screen. Fable reviews all six lists before C1 runs; audits do not delete anything themselves.

---

### Packet A1: Person read schema, stripping, merge

**Model:** Sonnet. **Blocks:** A2, A4, D1.

**Files:**
- Modify: `packages/core/src/card.ts:50-63` (personSchema)
- Modify: `packages/core/src/trust.ts:209-226` (stripPersonEmails)
- Modify: `packages/pipeline/src/provider-facts.ts:65-75` (mergePerson)
- Test: `packages/core/tests/trust.test.ts`, `packages/pipeline/tests/provider-facts.test.ts` (create if absent)

**Interfaces (produces):**

```ts
// personSchema gains, after personalUrl (packages/core/src/card.ts):
// Nested so the field is literally named `citationIds`: validateCitationRefs
// (card.ts:185-217) only validates arrays with that exact property name.
read: z.object({
  text: z.string().min(1),
  citationIds: z.array(z.string().min(1)).min(1)
}).nullable().optional(),
```

Type consumers use `CardPerson["read"]` = `{ text: string; citationIds: string[] } | null | undefined`.

- [ ] **Step 1: Failing tests.** In `trust.test.ts` extend `describe("public card person channels + email provenance")`: (a) a person with `read: { text: "Second robotics company; the first sold to Deere in 2021.", citationIds: ["s1"] }` parses through `coldStartCardSchema` when `citations[]` contains `s1`; (b) the same card fails schema parse when `read.citationIds` is `["missing"]` (proves the generic walker validates the nested name); (c) `publicCard()` strips `read` while keeping `githubUrl`. In the pipeline test: `mergePerson` prefers a non-null `read` over null and keeps left's read when both set.
- [ ] **Step 2: Run to verify failures.** `npm test -w @cold-start/core -- trust` and `npm test -w @cold-start/pipeline -- provider-facts`. Expected: new tests fail (schema rejects unknown key or strip test fails).
- [ ] **Step 3: Implement.** Add the field verbatim above; extend the destructure in `stripPersonEmails` to `const { email: _email, emailStatus: _emailStatus, read: _read, ...publicPerson } = person;` and update its comment; add to `mergePerson`: `read: left.read ?? right.read ?? null` following the existing null-coalescing style there.
- [ ] **Step 4: Green.** Same two commands pass; then `npm run typecheck`.
- [ ] **Step 5: Commit.** `git commit -m "Add cited person read to the schema, stripped from the public card"`

---

### Packet A2: person_read LLM stage

**Model:** Sonnet. **Needs:** A1 merged. **Blocks:** A3.

**Files:**
- Modify: `packages/core/src/generation-trace.ts:52` (stage union)
- Modify: `packages/llm/src/llm-provider.ts:30-37` (env chain)
- Create: `packages/llm/src/person-read.ts`
- Modify: `packages/llm/src/index.ts` (export)
- Test: `packages/llm/tests/person-read.test.ts`, extend `packages/llm/tests/llm-provider.test.ts`

**Interfaces (produces):**

```ts
// generation-trace.ts stage union gains "person_read".
// llm-provider.ts stageEnvChain gains (research_section fallback pattern):
person_read: ["LLM_PERSON_READ_MODEL", "LLM_SYNTHESIS_MODEL", "ANTHROPIC_SYNTHESIS_MODEL"],

// packages/llm/src/person-read.ts
export type PersonReadEvidence = {
  name: string;
  role: string | null;
  channels: { githubUrl?: string | null; xUrl?: string | null; personalUrl?: string | null };
  evidence: Array<{ citationId: string; title: string; url: string; text: string }>;
};
export type PersonReadResult = {
  name: string;
  read: { text: string; citationIds: string[] } | null;
  suppressionReason: "thin_evidence" | "no_nonobvious_claim" | null;
};
export async function synthesizePersonReads(input: {
  companyName: string;
  domain: string;
  people: PersonReadEvidence[];
  model: string;
}): Promise<{ reads: PersonReadResult[]; usage: unknown }>;
```

- [ ] **Step 1: Failing tests.** llm-provider: copy the `research_section` fallback test (`llm-provider.test.ts:89-99`) for `person_read` asserting precedence `LLM_PERSON_READ_MODEL` then `LLM_SYNTHESIS_MODEL` then `ANTHROPIC_SYNTHESIS_MODEL` then `ANTHROPIC_MODEL`. person-read: with a mocked message client (follow the mock pattern in `packages/llm/tests/research-section.test.ts` if present, else the extraction tests), assert (a) the system prompt contains `investorTasteKernel` and the doctrine lines below; (b) a model response citing an id not in the supplied evidence yields `read: null, suppressionReason: "no_nonobvious_claim"` for that person (invalid ids never pass through); (c) response text over 2 sentences is rejected the same way; (d) an empty evidence array yields `suppressionReason: "thin_evidence"` without any LLM call for that person.
- [ ] **Step 2: Verify failures.** `npm test -w @cold-start/llm -- person-read` and `-- llm-provider`.
- [ ] **Step 3: Implement.** Model on `packages/llm/src/research-section.ts` (`synthesizeResearchSection`, stage literal hardcoded, `createTracedAnthropicMessage`). One call for all people. System prompt = `investorTasteKernel` plus exactly these doctrine lines: "You write one read per person: at most two sentences that are non-obvious, specific, and decision-relevant to an investor."; "In scope: domain fit, repeat-founder history with outcomes, trajectory outliers, honest flags such as short tenures or no public footprint."; "Banned: restating the role, adjectives without evidence, any filler."; "Use citationIds exactly as provided. Do not invent citationIds."; "If the evidence supports no such claim, return null for that person." Post-validate: drop citation ids not present in the person's evidence; if none survive, null the read with `no_nonobvious_claim`.
- [ ] **Step 4: Green + typecheck.**
- [ ] **Step 5: Commit.** `"Add the person_read stage with cited, suppressible person reads"`

---

### Packet A3: Contact-enrichment wiring

**Model:** Sonnet. **Needs:** A2 merged.

**Files:**
- Create: `packages/pipeline/src/person-read-evidence.ts` (pure functions)
- Modify: `apps/web/src/inngest/contact-enrichment.ts` (one new step after `enrich-contacts`, line ~584)
- Test: `packages/pipeline/tests/person-read-evidence.test.ts`

**Interfaces (consumes A2's `synthesizePersonReads`; produces):**

```ts
// packages/pipeline/src/person-read-evidence.ts
// Build per-person evidence from what contact enrichment already holds:
// sections.citations (id/title/url/snippet), provider fact candidates' rawText
// (ProviderFactCandidate, packages/providers/src/types.ts:118-130), stored
// source rawText mentioning the person's name (case-insensitive), capped.
export function buildPersonReadEvidence(input: {
  people: CardPerson[];
  citations: Array<{ id: string; title: string; url: string; snippet?: string }>;
  candidates: ProviderFactCandidate[];
  sources: Array<{ url: string; title: string; rawText: string }>;
  maxEvidencePerPerson?: number; // default 8, each text sliced to 700 chars
}): PersonReadEvidence[];

export function attachPersonReads(
  sections: SectionsWithFacts,
  reads: PersonReadResult[]
): SectionsWithFacts; // matches by trimmed lowercase name against team.founders/keyExecs values
```

- [ ] **Step 1: Failing tests** for both pure functions: evidence only includes texts mentioning the person's name; every evidence entry carries a citationId that exists in `citations`; `attachPersonReads` writes `read` onto the matching person and leaves others untouched; a `PersonReadResult` with `read: null` writes `read: null` (explicit, not absent).
- [ ] **Step 2: Verify failures.** `npm test -w @cold-start/pipeline -- person-read-evidence`.
- [ ] **Step 3: Implement pure functions; then wire.** In `contact-enrichment.ts` after the `enrich-contacts` merge (line ~584): a `person-reads` `step.run` that no-ops when `PERSON_READS_ENABLED === "false"` or there are no people; builds evidence, calls `synthesizePersonReads({ model: modelForStage("person_read") , ...})`, applies `attachPersonReads` to `contactEnriched.value.sections` before `cardWithExtractedSections`. Failures are caught and logged as a structured warn; the card write proceeds without reads (reads are enhancement, never a blocker).
- [ ] **Step 4: Green + typecheck.** Also `npm test -w @cold-start/web` stays green (dispatch tests at `apps/web/tests/contact-enrichment.test.ts` unaffected).
- [ ] **Step 5: Commit.** `"Wire person reads into the contact-enrichment worker"`

---

### Packet A4: Dossier tooltip and the people-line diet

**Model:** Opus (taste-critical). **Needs:** A1 merged.

**Files:**
- Modify: `apps/extension/src/SharedTooltip.tsx` (structured dossier variant)
- Modify: `apps/extension/src/CompanyHeader.tsx:272-505` (personTooltipBody dies; PeopleLine diet)
- Modify: `apps/extension/src/styles.css` (people block 2896-3034, overrides 3591-3628, tooltip block 1265-1310)
- Test: `apps/extension/tests/people-line.test.tsx`, `apps/extension/tests/sidepanel.test.tsx` tooltip tests (lines ~725-840)

**Interfaces (produces):**

```ts
// SharedTooltip gains a structured body; string body remains for other callers.
export type TooltipDossier = {
  kind: "dossier";
  name: string;
  role: string | null;
  read: { text: string; citationIds: string[] } | null;
  provenance: string | null;      // e.g. "via github.com, techcrunch.com"
  email: { address: string; status: "observed" | "inferred" } | null;
  channels: Array<{ label: "GitHub" | "X" | "Site"; url: string }>;
};
// triggerProps accepts { body: string | TooltipDossier, ... }.
```

Behavior to pin with tests before implementing: visible per person = avatar, name, role, email link (email stays; it is the action). Channels, kind chip, and Copy move into the dossier. Dossier shows the read in the evidence serif style when present; when `read` is null it shows role + provenance only, visibly quieter, never filler text. Keyboard: person row stays focusable, dossier content reachable, `aria-describedby` preserved. All colors via tokens; audit:css green.

- [ ] **Step 1: Rewrite `people-line.test.tsx` tests as the contract above (failing).**
- [ ] **Step 2: Verify failures.** `npm test -w @cold-start/extension -- people-line`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Green:** people-line, sidepanel tooltip tests (update assertions there to the dossier shape), `styles-classes`, `npm run audit:css -w @cold-start/extension`.
- [ ] **Step 5: Commit.** `"Replace person tooltips with cited dossiers and slim the people line"`

---

### Packet B1: Source imagery and clipping data plumbing

**Model:** Sonnet. **Blocks:** B2, D1.

**Files:**
- Modify: `packages/providers/src/types.ts:92-100` (ProviderSource gains `imageUrl?: string | null`)
- Modify: `packages/providers/src/direct-exa.ts` (Exa result `image` passthrough), `packages/providers/src/stableenrich.ts` (Firecrawl `metadata.ogImage` passthrough where scrape responses expose it; skip endpoints that do not)
- Create: `packages/db/drizzle/` migration 0007 adding `sources.image_url text` (nullable); modify `packages/db/src/schema.ts`, `packages/db/src/repositories/sources.ts:8-20,63+` (StoredSource/SourceSummary carry `imageUrl`)
- Modify: `apps/web/src/inngest/source-fetching.ts:51-64` (recordSourcesForCard passes imageUrl), `apps/web/src/inngest/functions.ts:639-645` (source.found metadata gains `sources` list)
- Modify: `apps/extension/src/extension-config.ts:48-56` (ExtensionSourceSummary gains `imageUrl?: string | null`)
- Test: `packages/db` sources repository test, `apps/web/tests/` events test alongside existing route tests

**Interfaces (produces):**

```ts
// source.found event metadata gains (functions.ts:639):
sources: acceptedSources.slice(0, 12).map((source) => ({
  url: source.url,
  domain: new URL(source.url).hostname.replace(/^www\./, ""),
  title: source.title,
  sourceType: source.sourceType,
  imageUrl: source.imageUrl ?? null
}))
```

Extension consumers (B2) read this list from the event during building and from `sources[]` on the profile. Missing images are `null`; UI degrades to favicon form.

- [ ] **Step 1: Failing tests:** stored source round-trips `imageUrl`; source.found metadata contains the capped list with domains stripped of `www.`; bootstrap `sources` include `imageUrl`.
- [ ] **Step 2: Verify failures.** `npm test -w @cold-start/db`, `npm test -w @cold-start/web`.
- [ ] **Step 3: Implement + `npm run db:generate` for the migration.**
- [ ] **Step 4: Green + typecheck.** Migration applies on local docker Postgres (`npm run db:migrate`).
- [ ] **Step 5: Commit.** `"Carry source images through storage, events, and the bootstrap payload"`

---

### Packet B2: The assembly surface, whisper, seal, and clippings

**Model:** Opus (the design-sensitive core). **Needs:** B1 merged. Worktree isolation.

**Files:**
- Modify: `apps/extension/src/CompanyArc.tsx` (building renders the profile skeleton with slots)
- Modify: `apps/extension/src/CompanyHeader.tsx` statusSlot area only (whisper line + seal instrument live here; coordinate: A4 owns the PeopleLine/tooltip region of this file; B2 owns the statusSlot/header-status region; merge order A4 then B2 rebases)
- Create: `apps/extension/src/Clippings.tsx` + `apps/extension/src/clippings.ts` (derive clipping models from events/sources)
- Create: `apps/extension/src/SealInstrument.tsx`
- Modify: `apps/extension/src/ResearchTrail.tsx` shrinks to the Details toggle + `SourcePassInstrument` mount + attention handling (TrailTrack, live row, source strip, main status row all die here)
- Modify: `apps/extension/src/research-progress.ts` (add `whisperCopyFromEvents`, `sealLevelFromEvents`; existing exports untouched, SourcePassInstrument still consumes them)
- Modify: `apps/extension/src/styles.css` (new `cs-clipping*`, `cs-seal-inst*`, `cs-assembly*` blocks; do not delete old blocks here, C2 owns deletion)
- Test: `apps/extension/tests/research-progress.test.ts`, new `apps/extension/tests/clippings.test.ts`, new `apps/extension/tests/assembly.test.tsx`, update affected `sidepanel.test.tsx` blocks

**Interfaces (consumes B1's event metadata; produces):**

```ts
// clippings.ts
export type Clipping = {
  url: string; domain: string; title: string;
  sourceClass: "company_site" | "docs" | "funding" | "news" | "people" | "registry" | "jobs" | "customer_proof" | "database" | "other";
  imageUrl: string | null;
};
export function clippingsFromEvents(events: ExtensionResearchRunEvent[]): Clipping[]; // reads source.found metadata.sources
export function clippingsFromSources(sources: ExtensionSourceSummary[]): Clipping[];
// sourceClass via sourceClassFor pattern (packages/core/src/first-payoff.ts:154-178);
// reuse core's exported classifier, do not duplicate the heuristics client-side.

// research-progress.ts additions
export function sealLevelFromEvents(events: ExtensionResearchRunEvent[]): 0 | 1 | 2 | 3 | 4;
// 0 queued/started; 1 plan.ready; 2 source.found; 3 first_payoff.ready|card.partial; 4 card.saved|card.enriched|generation.complete
export function whisperCopyFromEvents(events: ExtensionResearchRunEvent[], domain: string): string;
// "Queued" -> "Reading {domain}" -> "{n} sources, building profile" -> "Filed"
```

Behavior to pin with tests: slots render awaiting (reserved space, quiet rule, no shimmer) then arrive on their event with stagger, settled thereafter; clippings render favicon via `chrome.runtime.getURL("_favicon/?pageUrl=" + encodeURIComponent(url) + "&size=16")` behind a helper with a plain-dot fallback when the API is absent (jsdom); at most two clippings show thumbnails; the whisper is the only progress text; seal fills only on `sealLevelFromEvents` changes and sets as the FILED stamp at level 4; attention states flip the whisper and auto-open the details tree exactly as `needsAttention` does today; reduced motion = fades only. Thumbnails get `referrerpolicy="no-referrer"` and `loading="lazy"`, and a broken image hides itself back to favicon form (`onError`).

- [ ] **Step 1: Write failing unit tests** for `clippingsFromEvents`/`clippingsFromSources`/`sealLevelFromEvents`/`whisperCopyFromEvents` with event fixtures copied from `research-progress.test.ts` patterns, and `assembly.test.tsx` slot-state tests (awaiting/arriving/settled driven by events, never by time; use `MotionGlobalConfig.skipAnimations` from `tests/setup.ts`).
- [ ] **Step 2: Verify failures.**
- [ ] **Step 3: Implement.** Preserve sync `AnimatePresence` (never `mode="wait"`, it wedges on re-entry).
- [ ] **Step 4: Green:** new tests, `research-progress`, `styles-classes`, the `sidepanel.test.tsx` progress blocks you updated, `npm run audit:css -w @cold-start/extension`, typecheck.
- [ ] **Step 5: Commit.** `"Make the assembling card the progress surface with whisper, seal, and clippings"`

---

### Phase 1 audit rulings (Fable, 2026-07-05)

APPROVED kills and moves, assigned to owners:

- **B2 additionally owns (building phase):** kill the CompanyHeader building kicker word ("Queued"/"Researching" duplicate); kill the `cs-company-run-time` mm:ss clock (wall-clock, bans itself); ArcStack does not render during building at all (preview cards, head note "Waiting for evidence", and the "+N more" line all leave with it; the SealedLensRow stays as the one "later" voice); the source strip's job moves into clippings as already specced.
- **A4 additionally owns (profile header):** kill the visible "People" section label (aria-label stays); kill the `cs-person-contact-state` "@" glyph; drop the trailing `sourceLabel(sourceCount)` from the PeopleLine status string (SourcesCheckedStamp owns source count); wire the "+N" overflow chip to actually reveal the remaining people (it currently looks interactive and does nothing).
- **C1 owns (final scope below):** intake, research-layer panel, lens dots, details-tree diet.

OVERRULED kills (keep, with reasons recorded):

- Dormant pile index badges "01".."10": catalogue call-number character; the concept's warmth is "felt". Keep.
- Details-tree stage labels: the auditor's duplicate premise (TrailTrack shows the same labels) disappears when TrailTrack dies; the tree becomes the only home of stage names. Keep.
- Details-tree per-stage ordinal markers: At Textual step indices are DESIGN.md language. Keep with the labels.

### Packet C1: Surface diets from the audits

**Model:** Sonnet. **Needs:** integration branch with A1+B1 (present).

**Files:** `apps/extension/src/CompanyArc.tsx` (intake branch ONLY; the building branch is B2's), `apps/extension/src/ResearchLayerPanel.tsx`, `apps/extension/src/SourcePassInstrument.tsx`, affected tests (`research-layer-panel.test.tsx`, `sidepanel.test.tsx` blocks it owns), `styles.css` only for classes it fully removes usage of.

Scope, exactly and only:
1. Intake: kill the "No profile" status chip (statusSlot renders empty at intake); merge the intake note and ArcStack header into one scope statement (keep the note's sentence as the single version; drop the duplicate vocabulary).
2. ResearchLayerPanel: kill the header ratio ("N / 10"; the tray's "N waiting" owns the count); remove the profile-phase `ResearchTrail` mount (`showResearchProgress` branch) entirely; the whisper + per-module statuses carry it. Fold `PartialProfilePanel`'s Sources/Website dl rows out (the header already states both).
3. Lens memo: remove the four `LensPostureDot` instances and the component; posture stays carried by the footer caveat and each source chip's title words. Do not touch anything else in the memo.
4. SourcePassInstrument: kill the "Research progress" caption, the "{marker} / {total}" head counter chip, and the dead `variant === "full"` footer plus the unreachable full-variant plumbing; keep StatusMark, stage labels, ordinal markers, proofLines, substeps, sr-only line.

Done-definition: affected extension tests green (`npm test -w @cold-start/extension`), `styles-classes` green (remove orphaned selectors for classes whose last usage this packet deletes), `audit:css` green, typecheck green.

### Packet C2: Dead-style sweep

**Model:** Haiku, effort low. **Needs:** A4 + B2 + C1 merged (runs on the merged tree, serial).

Delete orphaned `cs-trail-*` (styles.css 1491-1547), the structural `cs-research-progress*` rules that lost their DOM (1360-1490 as applicable), the source-strip block (1548-1585), their override-section echoes (3240-3360 region), and any people/tooltip rules A4 orphaned (2896-3034, 3591-3628 leftovers). Mechanical gate: `npm test -w @cold-start/extension -- styles-classes` (fails on any class present in CSS but absent from components, both directions), then `audit:css`, then full extension test suite. Commit `"Remove style families orphaned by the assembly surface"`.

### Packet D1: Contract, manifest, e2e rework

**Model:** Sonnet. **Needs:** A1 + B1 + B2 merged.

**Files:** `packages/core/api-contract.json` (version to `2026-07-05.assembly-clippings-person-reads-v1`), `apps/extension/manifest.config.ts:24` (permissions gain `"favicon"`), `apps/extension/tests/manifest-config.test.ts`, `apps/extension/tests/e2e/sidepanel-ui.spec.ts` (rework: "running basics progress shows the research trail" line 383 and "progress tree surfaces real research events as substeps" line 453 become assembly-surface specs; tooltip spec line 135 asserts the dossier; people spec line 276 asserts the diet), `apps/extension/tests/e2e/sidepanel-dark.spec.ts:152` (running-progress dark spec), `apps/web/tests/extension-card-route.test.ts` + `public-card-route.test.ts` (public response never contains `read`).

Done-definition: `npm run qa:extension:ui -w @cold-start/extension` and `qa:extension:smoke` green, manifest test asserts the favicon permission, route tests prove public stripping on the wire.

### Packet D2: Latency verification (read-only + report)

**Model:** Sonnet, effort low. Runs `set -a; source .env.production.migrate.local; set +a` then `npm run measure:first-usable -- --since 30d --limit 500`, filtered to runs after the 2026-07-01 deploy. Compares against the locked baseline (p90 179s, target 143s or better; see `~/.claude/.../coldstart-first-usable-dispatch-bound` facts restated in the spec). Output: a short report with percentiles and a recommendation; it does NOT set Inngest concurrency caps itself (operator decision with dashboard limits in hand).

---

## Phase 3: Verify and integrate (Fable + Opus)

- Opus adversarial review packets on A4 and B2 diffs: prompt is to refute (doctrine violations, event edge cases: cached cards with no events, failed runs, attention states, empty people, zero sources). Findings verified before acting.
- Full gate: `npm run check` at repo root. Then contract-bumped extension build (`npm run build`), load `apps/extension/dist` unpacked.
- Fable: integration taste pass on screenshots, ledger update, Reduce-Motion-OFF walkthrough build for Samay.
- Deploy order: web first (schema tolerant of absent optional fields; run `npm run db:migrate:production` for 0008 (`0008_colorful_overlord.sql`, sources.image_url; the plan's original 0007 slot was already taken on main) and verify migration state, per the prod-migration-drift lesson), then extension rebuild/reload.

## Self-review notes (done)

- Spec coverage: doctrine (AUDIT+C1), building redesign (B2), clippings+imagery (B1+B2), seal (B2), dossier+diet (A4), person read data (A1) pipeline (A2) wiring (A3), gating/stripping (A1+D1), full pass (AUDIT+C1), perceived speed (B2), real latency (D2), contract/manifest (D1), ledger (orchestration, outside repo code).
- Known coordination point: `CompanyHeader.tsx` is touched by A4 (people region) and B2 (status region). Ordered: A4 merges first; B2 rebases. Exclusive-ownership exception is deliberate and confined to this file.
- Type consistency: `read` shape `{ text, citationIds }` identical in A1 schema, A2 `PersonReadResult`, A4 `TooltipDossier`.
