# Landing Page and Public Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public card at `/c/{slug}` to the catalogue-card mockup, add `/catalog`, and rebuild the landing page with a real access-request form, per `docs/superpowers/specs/2026-07-30-landing-and-public-card-redesign-design.md`.

**Architecture:** New card face components live in `apps/web/src/components/card/` with pure display logic in `apps/web/src/lib/card-face/model.ts`; `packages/ui` changes are additive tokens plus one barrel re-export, and `CardShell` dies once the swap lands. The landing and catalog are new App Router pages fed by the existing cached public index. Access requests get migration 0015, a repository, a rate-limited POST route, and an operator script following the alpha-common pattern.

**Tech Stack:** Next.js 15 App Router, React 19 server components, Tailwind-free hand CSS in partials, Framer Motion `^12.38.0` (hero recorded build only), Drizzle + Postgres, Playwright gallery specs, vitest with the `renderToStaticMarkup` server-component harness.

## Global Constraints

- The extension is untouched: nothing under `apps/extension` changes; `packages/ui/src/tokens.css` changes are additive only; the barrel must keep exporting `safeExternalHref`, `formatCompactCurrency`, `formatMediumDate`, `formatShortDate` (extension imports them from `@cold-start/ui`).
- Spelling: "Catalog", never "Catalogue". In prose, "company profiles". "sourced company profiles" must not survive anywhere.
- Every number rendered is real or the element is absent. Absent card facts render italic "not publicly disclosed". No fabricated stats, no placeholder stats.
- Light parchment only. No dark mode on any web surface.
- At Textual (`--font-text`) only for receipt slots: call numbers, dates, citation marks, evidence labels, stamps, meta strips, event lines, footers. IBM Plex Sans everywhere else. Display face is `--font-display`.
- Public routes never return or render synthesis. No API route shapes change; no contract bump.
- Merge bar per phase: `npm run check` green, gallery reviewed. Commits go to main, never pushed unless Samay asks.
- Read `SECURITY.md` before the access-request route task (it adds a public POST endpoint).
- All mockup-derived colors, copy, and choreography values referenced below are verbatim from the two mockups in `docs/design/mockups/`; do not improvise alternatives.

---

## Phase 0: Foundations

### Task 1: Additive tokens and the CitationLedger re-export

**Files:**
- Modify: `packages/ui/src/tokens.css`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Produces: CSS vars `--cat-ghost-1 #EEE4CE`, `--cat-ghost-2 #F1E8D5`, `--cat-ghost-border-1 #CBBFA2`, `--cat-ghost-border-2 #CDC1A4`, `--cat-conflict-fill #F7EFE0`, `--cat-conflict-rule #D8B8AF`, `--cat-conflict-rule-soft #E4CCC4`, `--cat-hold #EDE3CC`, `--cat-hold-flash #DCCFF0`, `--seal-deep #3C2F63`, `--seal-hover #4E3F79`, `--cat-rule-dotted #C9BCA0`, `--cat-muted-2 #8A8271`. Barrel export `sourceClassForCitation`, `buildCitationLedger`, `sortedUniqueCitations`, `citationHostname` and the `CitationSourceClass` type.

- [ ] **Step 1: Append the new tokens** to the end of the `:root` block in `packages/ui/src/tokens.css` under a comment `/* Catalogue card web face (2026-07-30 redesign): additive only */`, with the exact names and hex values listed above. Do not rename or retune any existing token.
- [ ] **Step 2: Add the barrel line** `export * from "./CitationLedger";` to `packages/ui/src/index.ts`. Confirm `CitationLedger.ts` exports `sourceClassForCitation`, `buildCitationLedger`, `sortedUniqueCitations`, `citationHostname`, and `CitationSourceClass` (it does; `sourceClassForCitation` is at `CitationLedger.ts:6`).
- [ ] **Step 3: Verify the extension is unaffected.** Run: `npm test -w @cold-start/extension && npm run build -w @cold-start/extension && npm run audit:css -w @cold-start/extension`. Expected: all pass with no changes under `apps/extension`.
- [ ] **Step 4: Run ui tests.** `npm test -w @cold-start/ui`. Expected: PASS.
- [ ] **Step 5: Commit** with message `Add the catalogue-face tokens and open the citation ledger exports`.

### Task 2: Split globals.css into a partial manifest and remove dead CSS

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/styles/foundation.css`, `apps/web/src/app/styles/card.css`, `apps/web/src/app/styles/home.css`

**Interfaces:**
- Produces: `globals.css` as an import manifest (mirrors `apps/extension/src/styles.css`): tokens import, tailwind import, then `./styles/foundation.css`, `./styles/card.css`, `./styles/home.css`. Later tasks add `catalog.css` and `landing.css` lines.

- [ ] **Step 1: Move existing blocks into partials, byte-identical.** `foundation.css` takes the root font override, element resets, `.cs-skip-link`, `.cs-home`/`.cs-card-page` shells, and `.cs-loading-*`. `card.css` takes the entire `/* Catalogue card: public /c/{slug} web surface */` block. `home.css` takes the live `.cs-home-*` hero/list block. Delete outright: the `.cs-index-*` block (~400 lines, dead since the home rewrite) and the `.cs-web-research*` block (never wired into `CardShell`). Verify deadness before deleting: `grep -rn "cs-index-\|cs-web-research" apps/web/src --include=*.tsx` must return nothing.
- [ ] **Step 2: Reduce `globals.css`** to the import manifest described above, keeping the `@import "@cold-start/ui/tokens.css";` and `@import "tailwindcss";` lines first.
- [ ] **Step 3: Verify no visual change.** Run `npm run build -w @cold-start/web` (expect green), then `npm run dev` and eyeball `/` and one `/c/{slug}` against production. Run `npm test -w @cold-start/web`. Expected: PASS.
- [ ] **Step 4: Commit** with message `Turn globals.css into a partial manifest and drop the dead index and research blocks`.

### Task 3: Web gallery harness (fixtures, seed script, Playwright)

**Files:**
- Create: `apps/web/tests/fixtures/gallery-cards.ts`
- Create: `scripts/seed-web-gallery.ts`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/tests/e2e/web-gallery.spec.ts`
- Modify: `apps/web/package.json` (devDependency `@playwright/test: ^1.60.0`, scripts), root `package.json` (script `qa:web:gallery`)

**Interfaces:**
- Produces: fixture exports `richConflictCard`, `thinFileCard`, `emptySectionsCard` (each a full `ColdStartCard` object, no synthesis); slugs `voxlathe-example`, `hollowlabs-example`, `plainfield-example`; `npm run qa:web:gallery` (root) → `playwright test tests/e2e/web-gallery.spec.ts` in `apps/web`; screenshots land in `~/Downloads/cold-start-qa/{timestamp}/web/`.

- [ ] **Step 1: Write the three fixtures.** Copy the `fact<T>()` builder pattern from `apps/web/tests/home-page.test.tsx`. `richConflictCard` (Voxlathe, `voxlathe.example`): 6 citations spanning source classes (2 independent, 2 reporting, 1 company, 1 enrichment), full funding (totalRaised, lastRound with lead), founders + one exec, `team.headcount` with `status: "mixed"` and citations pointing at the two reporting sources, 4 signals (funding/launch/customer/hiring; the customer one cited only by the company-class citation), 2 comparables. `thinFileCard` (Hollow Labs, `hollowlabs.example`): 2 citations (company + reporting), description, one launch signal, everything else null/empty. `emptySectionsCard` (Plainfield, `plainfield.example`): 4 citations, identity + headcount only; funding and comparables empty. Every fixture must pass `hasUsablePublicProfile`.
- [ ] **Step 2: Write the seed script.** `scripts/seed-web-gallery.ts`: refuse to run unless `DATABASE_URL` contains `localhost:55432` or `127.0.0.1:55432` (throw with a plain message otherwise). Import the fixtures and write each card through the same repository write path the app uses; find it with `grep -n "export async function" packages/db/src/repositories/cards.ts` and use the exported upsert/store function that sets `card_json` and `domain`. If no store function is exported, insert directly: `await db.insert(cards).values({ slug, domain, cardJson: card, generatedAt: new Date(card.generatedAt) }).onConflictDoUpdate(...)` using the `cards` table from `@cold-start/db` schema exports. Add root script `"seed:web-gallery": "tsx scripts/seed-web-gallery.ts"`.
- [ ] **Step 3: Playwright config.** Copy the shape of `apps/extension/playwright.config.ts`: `testDir: "./tests/e2e"`, `fullyParallel: false`, `workers: 1`, `webServer: { command: "npm run dev", cwd: "../..", port: 3000, reuseExistingServer: true, timeout: 120000 }`. Two projects by viewport: `desktop` `{width: 1440, height: 1200}` and `mobile` `{width: 390, height: 844}`.
- [ ] **Step 4: Gallery spec.** One `RUN_TIMESTAMP` at module load (copy `lens-gallery.spec.ts`). For each of `/`, `/c/voxlathe-example`, `/c/hollowlabs-example`, `/c/plainfield-example`: `page.goto`, `waitForTimeout(400)` settle, `page.screenshot({fullPage: true, path})` into `~/Downloads/cold-start-qa/${RUN_TIMESTAMP}/web/${project}/${name}.png`. This is a spec file, not a tsx driver (`addInitScript` breaks under tsx). Later tasks extend it with interaction states.
- [ ] **Step 5: Run the loop once against the current (old) surfaces.** `docker-compose up -d postgres`, `set -a; source .env.local; set +a`, `npm run seed:web-gallery`, `npm run qa:web:gallery`. Expected: screenshots of the current pages exist. This proves the harness before the redesign starts.
- [ ] **Step 6: Commit** with message `Stand up the web screenshot gallery: fixtures, local seed, Playwright loop`.

---

## Phase 1: The public card

### Task 4: Card face model (pure logic, TDD)

**Files:**
- Create: `apps/web/src/lib/card-face/model.ts`
- Test: `apps/web/tests/card-face-model.test.ts`

**Interfaces:**
- Consumes: `sourceClassForCitation`, `citationHostname` from `@cold-start/ui` (Task 1); `formatCompactCurrency`, `formatShortDate` from `@cold-start/ui`.
- Produces (exact exports later tasks import):

```ts
export type EvidenceState = "verified" | "reported" | "company" | "conflict" | "unknown";
export interface CitationIndex { ordered: Citation[]; displayNumber(id: string): number | null }
export function buildCitationIndex(card: PublicCardData): CitationIndex;
export function callNumber(card: PublicCardData): string;                  // "CS·VOXLATHE·26" from domain first label + generatedAt YY
export function isThinFile(card: PublicCardData): boolean;                 // <3 citations, or no independent/reporting citation
export function vettedCounts(card: PublicCardData): { verified: number; total: number };
export interface StatSlot { key: "stage"|"raised"|"headcount"|"valuation"|"openRoles"; label: string; value: string | null; detail: string; state: EvidenceState | null; conflict: boolean; citationIds: string[] }
export function statSlots(card: PublicCardData): StatSlot[];               // always length 5, in that order
export interface FactBullet { text: string; state: EvidenceState; citationIds: string[]; muted?: boolean }
export function moneyBullets(card: PublicCardData): FactBullet[];
export interface HeadcountConflict { value: number; asOf: string | null; sources: { label: string; date: string | null; citationId: string }[] }
export function headcountConflict(card: PublicCardData): HeadcountConflict | null;
export function riskCaveats(card: PublicCardData, sections: ResearchSection[]): FactBullet[];
export interface NextQuestion { question: string; subline: string }
export function nextQuestionForCard(card: PublicCardData, sections: ResearchSection[]): NextQuestion | null;
export function evidenceStateForFact(card: PublicCardData, fact: ResolvedFactLike): EvidenceState;  // ported from CardShell
```

`PublicCardData` is a local alias for `Omit<ColdStartCard, "synthesis" | "synthesisWithheld">`-compatible input.

- [ ] **Step 1: Port, don't rewrite, the evidence-state logic.** Copy `publicEvidenceStatusForFact` and `evidenceStateFromConfidence` verbatim from `packages/ui/src/CardShell.tsx` into `model.ts` as `evidenceStateForFact` (they are deleted from ui in Task 10). Keep behavior identical.
- [ ] **Step 2: Write failing tests** covering: `buildCitationIndex` renumbers in card order and returns null for unknown ids; `callNumber(richConflictCard) === "CS·VOXLATHE·26"`; `isThinFile` true for `thinFileCard`, false for `richConflictCard`; thin when 5 citations are all company-class; `statSlots` returns 5 slots with Valuation and Open roles always `value: null`, `detail: "no source in ledger"`; headcount slot `conflict: true` for the mixed fixture with detail `"sources disagree, see below"`; raised slot formats `$91M`-style via `formatCompactCurrency`; `moneyBullets` composes the raised sentence, the round sentence with lead and month, and a muted trailer naming missing pieces; `headcountConflict` returns null on non-mixed and the source list (label from citation title, else hostname) on mixed; `riskCaveats` fires the company-only-proof rule for `richConflictCard`'s customer signal section and the stale rule when a section has `status: "stale"`; `nextQuestionForCard` priority: company-only proof → conflict → no funding → thin file → null, with sublines `"Not a recommendation. The first thing this ledger cannot answer."` and thin-file `"Thin file, not a verdict."`. Reuse the Task 3 fixtures via import.
- [ ] **Step 3: Run to fail.** `npm test -w @cold-start/web -- card-face-model`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement `model.ts`.** Template text (exact):
  - raised bullet: `` `Raised ${formatCompactCurrency(v)} across disclosed rounds.` ``
  - round bullet: `` `${round.name} closed ${monthYear(round.announcedAt)}${lead ? `, led by ${lead}` : ""}.` `` (monthYear like "March 2026"; omit clause when null)
  - missing trailer (muted, state "unknown"): `` `${listOf(missing)} ${missing.length === 1 ? "is" : "are"} not publicly disclosed.` `` over the candidates "Round size", "post-money valuation", "the full investor list"
  - risk company-proof caveat: `The customer proof is company-sourced only. No independent source in this ledger confirms it.` (state "company", citationIds of the company-class proof)
  - risk stale caveat: `` `The ${sectionLabel} section is stale. Its sources predate the last successful refresh.` ``
  - next-question texts: `Ask for one referenceable production customer.` / `Ask the company for a current headcount and the date it was counted.` / `Ask what the company has raised and from whom.` / `Ask who funds the company and on what terms.`
- [ ] **Step 5: Run to pass.** Same command. Expected: PASS.
- [ ] **Step 6: Commit** with message `Model the card face: citation index, stat slots, thin files, honest questions`.

### Task 5: Card object shell: ghost stack, stamps, header, meta strip

**Files:**
- Create: `apps/web/src/components/card/CardFace.tsx`, `apps/web/src/components/card/Stamp.tsx`
- Modify: `apps/web/src/app/styles/card.css` (new `cs-face-*` rules appended; old `cs-card` rules die in Task 10)

**Interfaces:**
- Consumes: Task 4 model (`callNumber`, `isThinFile`, `buildCitationIndex`).
- Produces: `CardFace({ card, sections })` server component rendering meta strip + shell + header and slots for children sections (Tasks 6-9 fill it in); `Stamp({ kind: "filed" | "thin", date?, sourceCount? })`.

- [ ] **Step 1: Build `Stamp`.** Double-strike: a relative container, two absolute copies of the bordered lockup. FILED: under layer `left:1px; top:2px; rotate(-4.4deg); border:2px solid var(--color-seal); border-radius:2px; opacity:.22`; over layer `rotate(-4.9deg); opacity:.72` with `mask-image: radial-gradient(140% 160% at 22% 14%, #000 32%, rgba(0,0,0,.62) 66%, rgba(0,0,0,.34) 100%)` (plus `-webkit-mask-image`). Text: "FILED" 22px 700 `letter-spacing:.2em` + the date `2026·07·27`-formatted at 10px, all `var(--font-text)` seal color. THIN FILE variant: `#8A8271`/`--cat-muted-2` borders and ink, rotations -3.6/-4.1deg, text "THIN FILE" 17px + `"{n} sources on record"` 10px.
- [ ] **Step 2: Build the shell in `CardFace`.** Structure: meta strip above the card (`--font-text`, left `COLD START / catalog / c/{slug}` with "COLD START" in seal, right `retrieved {ISO minute} UTC · {n} sources read`); then the card object: two ghost layers (absolute, `--cat-ghost-*` fills/borders, offsets 9/11px and 5/6px, no rotation), face on top (`--cat-paper`, 1px `--cat-paper-edge` border, 6px radius, `box-shadow: 0 1px 0 rgb(255 255 255 / .5) inset, 0 10px 22px -14px rgb(40 34 20 / .35)`), 4px seal bar across the top, then the existing `CardTexture` child, then CSS wear overlays (the radial stain set and the 112deg fiber repeating-gradient at `mix-blend-mode: multiply`, both `pointer-events: none`). Header inside: company name (`--font-display`, `clamp(50px, 6.4vw, 82px)`, 700, tight tracking), one-liner at 21px, receipt meta line (domain link, HQ city, `founded {year}` when known); right rail: CALL NO. label (11px, `.16em`) over `callNumber(card)` (17px bold seal), `Stamp` beneath (`filed` with `formatShortDate(generatedAt)` or `thin` with citation count from `isThinFile`).
- [ ] **Step 3: Layout scaffolding in CSS.** Plate `max-width: 1120px` centered on `--cat-ground`; grid `minmax(620px, 720px) minmax(280px, 340px)` with `clamp(32px, 4vw, 56px)` gap; below 700px single column (pocket card takes over in Task 9).
- [ ] **Step 4: Render it standalone.** Temporarily mount `CardFace` in `/c/[slug]/page.tsx` behind `?face=new` (query param check, old CardShell still default). Run `npm run qa:web:gallery` and inspect the three fixture headers/stamps at both widths.
- [ ] **Step 5: Commit** with message `Raise the card object: ghost stack, wear, double-struck stamps, header`.

### Task 6: Stat strip

**Files:**
- Create: `apps/web/src/components/card/StatStrip.tsx`
- Modify: `apps/web/src/app/styles/card.css`

**Interfaces:**
- Consumes: `statSlots`, `StatSlot`, `CitationIndex` from Task 4.
- Produces: `StatStrip({ slots, index })` rendered by `CardFace` between header and sections.

- [ ] **Step 1: Implement.** Five-column grid (`repeat(5, 1fr)`, 26px gap). Per slot: label 13px 600 seal (conflict slot label `--color-conflict`); value line 19px 600 with a 9px evidence mark (filled/outline/half/hatch per state; hatch = 1.5px conflict border + `linear-gradient(45deg, transparent 42%, var(--color-conflict) 42%, var(--color-conflict) 58%, transparent 58%)`); detail line 13px `--font-text` `--cat-muted-2` with citation marks. Absent slots: value `not publicly disclosed` italic 500 `--cat-muted-2`, no mark. The headcount conflict detail is an in-page link `<a href="#headcount-conflict">sources disagree, see below</a>` in conflict red.
- [ ] **Step 2: Gallery check.** Rerun the gallery; verify the rich card shows five populated-or-honest slots, the thin card shows mostly absent slots, and nothing wraps badly at 1440. If the two permanently absent slots (Valuation, Open roles) read as broken rather than honest at review time, the sanctioned fallback per spec is swapping Open roles for Founded (`identity.foundedYear`); record the call in the commit message.
- [ ] **Step 3: Commit** with message `Set the five-slot stat strip with honest absences`.

### Task 7: Section rows and the conflict panel

**Files:**
- Create: `apps/web/src/components/card/SectionRows.tsx`, `apps/web/src/components/card/ConflictPanel.tsx`
- Modify: `apps/web/src/app/styles/card.css`
- Test: extend `apps/web/tests/card-face-model.test.ts` if new pure logic emerges (section presence)

**Interfaces:**
- Consumes: Task 4 model (`moneyBullets`, `headcountConflict`, `riskCaveats`, `nextQuestionForCard`, `evidenceStateForFact`, `isThinFile`); `publicEvidenceText` pattern from old CardShell for section-item truncation (port it into `model.ts` alongside).
- Produces: `SectionRows({ card, sections, index })` rendering, in order: Money, People (with `ConflictPanel` when mixed), Signals, Comps, Risk, Next question, Investor read. `ConflictPanel({ conflict, index })` with DOM id `headcount-conflict`.

- [ ] **Step 1: Shared row shell.** Grid `112px 1fr`, 24px gap, hairline `--cat-rule` between rows, labels 14px 600 seal sentence case. Fact bullets: 17px/1.5 with the 9px mark, citation marks `[n]` in `--font-text` seal with a faint seal underline (`border-bottom: 1px solid rgb(110 92 158 / .35)`).
- [ ] **Step 2: Sections per spec.** Money: `moneyBullets` plus financing research-section items; full empty state between dashed `--cat-paper-edge` rules: `No filing, no announced round, no reported figure.` over receipt `No public funding found.` People: founders/execs as name (18px 600) + role (14px) pairs with citations; `ConflictPanel` when `headcountConflict` returns non-null; omit entirely when empty on thin files. Signals: table `104px 84px 1fr auto` (date receipt, category tag 12px 600 seal, statement with mark, citation), cap 6 date-desc; company-class rows append the inline receipt caveat `company claim, not independently confirmed` in `#8A6A28`; when exactly one signal exists add footer `One signal on file. A signal needs a date and a source.` Comps: rows or the empty state `No comparable company is named by any source in this ledger.` / `The section stays empty until one is.` Risk: `riskCaveats` bullets, section omitted when empty. Next question: checkbox glyph (16px, 1.5px seal border, 2px radius) + question in `--font-text` 20px on a dotted underline (`border-bottom: 1px solid var(--cat-rule-dotted)`), subline 14px indented. Investor read: five label rows (Why care, What must be true, What could break, Why now, What to learn next), each label 16px against a blank ruled line `height:1px; background: repeating-linear-gradient(90deg, var(--cat-rule-dotted) 0 6px, transparent 6px 11px)`; locked copy beneath in receipt: `Filled in the side panel for invited readers. This card carries sourced facts only.`; renders only when `!isThinFile(card)`.
- [ ] **Step 3: `ConflictPanel` (degraded form; competing values are not recoverable, verified 2026-07-30).** Bordered box `--cat-conflict-rule` on `--cat-conflict-fill`, header hatch mark + `Headcount: sources disagree` 13px 600 conflict red. Body: the stored value large (34px 700) with `as of {date}` receipt when present, then each disagreeing source as `{label} · {date} [n]` receipt lines. Footer strip over a `--cat-conflict-rule-soft` top border: `Both values stand. Cold Start does not average sources.` 13px `--font-text`.
- [ ] **Step 4: Gallery check** across all three fixtures: rich card renders all sections, thin card omits People/Comps/Risk/Investor read, empty-sections card shows the Money and Comps empty states. Verify the stat-strip anchor jumps to the panel.
- [ ] **Step 5: Commit** with message `File the section rows: money to investor read, conflicts left standing`.

### Task 8: Sources rail and citation choreography

**Files:**
- Create: `apps/web/src/components/card/SourcesRail.tsx`, `apps/web/src/components/card/choreography.tsx` (client)
- Modify: `apps/web/src/app/styles/card.css`, `apps/web/src/components/card/CardFace.tsx` (wrap columns in the provider), `SectionRows.tsx`/`StatStrip.tsx` (use `CiteMark`)

**Interfaces:**
- Consumes: `CitationIndex`, `sourceClassForCitation`, `citationHostname`.
- Produces:

```tsx
// choreography.tsx ("use client")
export function ChoreographyProvider({ children }: { children: React.ReactNode }): JSX.Element;
export function CiteMark({ id, number }: { id: string; number: number }): JSX.Element;   // renders [n]
export function LedgerRow({ id, children }: { id: string; children: React.ReactNode }): JSX.Element;
```

- [ ] **Step 1: Implement the provider.** React context `{ hover: string | null, held: string | null, setHover, toggleHeld }`. `CiteMark`: `onMouseEnter/onMouseLeave` set hover, `onClick` toggles held (clicking the held id releases it; clicking another id moves the hold). `LedgerRow` computes `on = hover === id || held === id` and `dimmed = held !== null && held !== id`.
- [ ] **Step 2: CSS.** Mark base: `--font-text` 14px seal, faint underline; on-state: text `--seal-deep`, background `--cat-hold-flash`, underline `1.5px solid var(--color-seal)`. Row base: `transition: background 140ms ease, transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease`; on-state: `background: var(--cat-hold); box-shadow: inset 2px 0 0 var(--color-seal); transform: translateX(3px)`; a held row also plays `animation: cs-ack 900ms ease-out` where `@keyframes cs-ack { from { background: var(--cat-hold-flash) } to { background: var(--cat-hold) } }`; dimmed rows `opacity: .5`. No scrolling is ever triggered; remove any `scrollIntoView` from the old citation path.
- [ ] **Step 3: Build `SourcesRail`.** Sticky (`position: sticky; top: 24px`) inside the right column, `border-left: 1px solid --cat-rule-strong; padding-left: 28px`. Header `Sources` 14px 600 seal + right meta `tracings · {n}` receipt. Rows (each a `LedgerRow`): `[n]` badge receipt seal bold, publisher/title 15px 600, receipt line date + hostname, evidence mark + class label (`verified`/`reported`/`company`/`vendor`/`unknown` mapped from `sourceClassForCitation`) in the class color at 11px `.05em`. No "read and dropped" footnote (dropped sources are not publicly recoverable, verified 2026-07-30). Card footer below the columns: left `{callNumber} · filed {date} · sourced facts only` receipt; right the VETTED chip `VETTED · {verified} OF {total}` from `vettedCounts` (single layer, 11px 700 `.14em` seal, 1.5px seal border, 2px radius, `rotate(-2.2deg)`, `opacity:.68`); chip renders only when `total > 0`.
- [ ] **Step 4: Extend the gallery spec** with interaction states on the rich card: hover a `CiteMark` (`page.hover('[data-cite-id]')` on the first Money citation) and screenshot; click to hold and screenshot (held row highlighted, others dimmed). Rerun and inspect the 140ms feel manually in the dev browser too.
- [ ] **Step 5: Commit** with message `Wire the sources rail and the hover-to-hold citation choreography`.

### Task 9: Pocket card (mobile tabs)

**Files:**
- Create: `apps/web/src/components/card/PocketCard.tsx` (client)
- Modify: `apps/web/src/components/card/CardFace.tsx`, `apps/web/src/app/styles/card.css`

**Interfaces:**
- Consumes: Task 4 model, `Stamp`, `ConflictPanel`.
- Produces: `PocketCard({ card, sections, index })`. `CardFace` renders both faces; CSS shows `.cs-face-desktop` at ≥700px and `.cs-face-pocket` below.

- [ ] **Step 1: Implement tabs.** `useState<"card"|"people"|"signals"|"sources">("card")`. Tab chips: 13px 600, `padding: 8px 13px 7px`, rounded top corners `4px 4px 0 0`; active: ink `--seal-deep`, background `--cat-hold`, 1px `--cat-rule-strong` border with no bottom, `box-shadow: inset 0 2px 0 var(--color-seal)`; inactive muted. Content panel merges under the active chip.
- [ ] **Step 2: Tab content per spec.** Card: label-value rows (Stage, Raised, Headcount, Valuation, Comps as `none named by a source`), then Next question. People: names, compressed `ConflictPanel` (number 28px, footer swaps to `Both stand. No average is shown.` via a `compact` prop), hiring bullet if present. Signals: stacked rows (date + tag line, statement below, caveat shortens to `company claim`). Sources: the full ledger rows. Any citation mark tapped on other tabs calls the tab setter to jump to Sources (no hover choreography on touch). Footer on all tabs: `filed {date}` / `{n} sources` receipt. Single ghost layer and stain-only wear on the pocket face; name at 34px.
- [ ] **Step 3: Extend the gallery spec** (mobile project): screenshot each tab on the rich card and the thin card's Card tab.
- [ ] **Step 4: Commit** with message `Fold the card into the pocket: divider tabs for narrow widths`.

### Task 10: Swap the page, retire CardShell

**Files:**
- Modify: `apps/web/src/app/c/[slug]/page.tsx`
- Delete: `packages/ui/src/CardShell.tsx`, `packages/ui/tests/CardShell.test.tsx`, plus `SourceDrawer.tsx`, `CitationGroup.tsx`/`CitationMarker` if orphaned
- Modify: `packages/ui/src/index.ts`, `apps/web/src/app/styles/card.css`
- Test: `apps/web/tests/card-page.test.tsx` (new)

**Interfaces:**
- Consumes: `CardFace` (Task 5-9 complete).
- Produces: `/c/[slug]` renders `CardFace` unconditionally; `@cold-start/ui` barrel keeps exactly what the extension and web now need: `FactRow` helpers, `safeExternalHref`, `CitationLedger` exports.

- [ ] **Step 1: Swap.** Replace the `CardShell` import and the `?face=new` gate in `page.tsx` with a plain `CardFace` render, keeping `CardTexture`, metadata generation, and `notFound()` untouched.
- [ ] **Step 2: Write the page test** copying the `home-page.test.tsx` harness verbatim (mock `../src/lib/cards`, `next/cache`, `next/server`; dynamic import; `renderToStaticMarkup`): assert the rich fixture renders its name, `CS·VOXLATHE·26`, `not publicly disclosed`, `Both values stand. Cold Start does not average sources.`, and does NOT contain any synthesis text planted on a full-card fixture (feed a card carrying `synthesis` and assert none of its strings appear). Assert the thin fixture renders `THIN FILE` and no `Investor read`.
- [ ] **Step 3: Delete CardShell and orphans.** Verified 2026-07-30: `CardShell` is imported only by `apps/web/.../c/[slug]/page.tsx` and its own test; the extension imports only `tokens.css`, `safeExternalHref`, and the three `FactRow` format helpers. Delete `CardShell.tsx` + test. Then `grep -rn "SourceDrawer\|CitationGroup\|CitationMarker\|sourceDomId" apps packages --include=*.ts*` and delete whatever is now unimported. Trim `packages/ui/src/index.ts` to the surviving modules. Also delete the now-dead legacy `.cs-card` rules from `card.css` (everything the new `cs-face-*` rules replaced).
- [ ] **Step 4: Full gate.** `npm run check` (includes knip, which confirms no dead exports; extension build confirms its imports survive). Expected: green.
- [ ] **Step 5: Commit** with message `Swap /c/{slug} to the catalogue face and retire CardShell`.

### Task 11: Card polish pass

**Files:** iterate on `apps/web/src/app/styles/card.css` and card components; extend `apps/web/tests/e2e/web-gallery.spec.ts` as gaps appear.

- [ ] **Step 1: Loop.** `npm run seed:web-gallery && npm run qa:web:gallery`, review every screenshot at 1x, fix, rerun. Exit checklist (from DESIGN.md's verification pass): display type tracking and clamp behavior at 1440/1120/700, citation tap targets ≥ 24px effective, ledger readable without zoom, conflict panel scans in one glance, stamps look struck rather than rendered, wear texture invisible at reading distance but present at 1x, pocket tabs reachable one-handed, no horizontal scroll at 390.
- [ ] **Step 2: OG image drift check.** Open `/c/voxlathe-example/opengraph-image` and confirm it still renders sanely against the new face (it is not a redesign target; fix only breakage).
- [ ] **Step 3: Commit** iteration rounds as they land, message pattern `Tighten the card face: {what changed}`.

---

## Phase 2: The Catalog

### Task 12: /catalog page

**Files:**
- Create: `apps/web/src/app/catalog/page.tsx`
- Create: `apps/web/src/app/styles/catalog.css` (+ manifest line in `globals.css`)
- Test: `apps/web/tests/catalog-page.test.tsx`

**Interfaces:**
- Consumes: `getPublicProfileIndex` via the same `unstable_cache` wrapper pattern as the current home page (`revalidate: 30`); `sourceClassForCitation` for per-row evidence signatures; `callNumber`, `isThinFile` from Task 4.
- Produces: `/catalog`; the count convention every later surface reuses: `profiles.length` from the cached index, formatted `"{n} profiles filed"`.

- [ ] **Step 1: Write the failing test** (same harness): with three summaries mocked, the page contains "The Catalog", "3 profiles filed", each company name, a `CS·…` call number per row, and `THIN FILE` on the thin row; with zero summaries it contains "No profiles filed yet."
- [ ] **Step 2: Implement.** Header: "The Catalog" in `--font-display` on the manila ground, real count beneath in receipt. Rows (filed-date desc, `<Link href={/c/{slug}}>`): name (display face ~24px), domain + call number receipt, filed date, `{n} sources`, a mini evidence signature (tiny marks with per-class counts derived from `row.card.citations` via `sourceClassForCitation`), `THIN FILE` tag (receipt, `--cat-muted-2` border chip) when `isThinFile(row.card)`. Row hover: the Task 8 acknowledgment language (`--cat-hold`, inset seal bar, `translateX(3px)`, 140ms) as pure CSS `:hover`.
- [ ] **Step 3: Run tests to pass**, extend the gallery spec with `/catalog` at both widths, rerun, review.
- [ ] **Step 4: Commit** with message `Open the Catalog: every filed profile in one drawer`.

---

## Phase 3: Landing and access requests

### Task 13: access_requests schema, migration, repository

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/0015_*` via `npm run db:generate`
- Create: `packages/db/src/repositories/access-requests.ts`
- Modify: `packages/db/src/index.ts` (re-export)
- Test: `packages/db/tests/access-request-decision.test.ts` (pure, vitest)

**Interfaces:**
- Produces:

```ts
export const accessRequests = pgTable("access_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  note: text("note").notNull(),
  ipHash: text("ip_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  handledAt: timestamp("handled_at", { withTimezone: true }),
});
// repositories/access-requests.ts
export type AccessRequestOutcome = "created" | "rate_limited_ip" | "rate_limited_email";
export function accessRequestDecision(input: { recentFromIp: number; recentFromEmail: number }): AccessRequestOutcome; // pure
export async function createAccessRequest(db: ColdStartDb, input: { name: string; email: string; note: string; ipHash: string }, now?: Date): Promise<AccessRequestOutcome>;
export async function listOpenAccessRequests(db: ColdStartDb): Promise<Array<{ id: string; name: string; email: string; note: string; createdAt: Date }>>;
export async function markAccessRequestHandled(db: ColdStartDb, id: string): Promise<boolean>;
```

- [ ] **Step 1: Confirm the migration number.** `ls packages/db/drizzle/`; highest is `0014_gorgeous_typhoid_mary.sql` (verified 2026-07-30); the generated file must be 0015. If something landed in between, renumber expectations, not the file.
- [ ] **Step 2: TDD the pure decision.** Failing tests: `recentFromIp >= 3` → `"rate_limited_ip"`; `recentFromEmail >= 1` → `"rate_limited_email"`; both zero → `"created"`; IP limit checked before email. Implement; pass.
- [ ] **Step 3: Add the table + repository.** `createAccessRequest` counts rows (`ipHash` match, `createdAt > now - 1h`) and (`email` match, `createdAt > now - 24h`), feeds `accessRequestDecision`, inserts only on `"created"`. Neon HTTP has no transactions; a lost race here admits at worst one extra request row, which is acceptable, so plain sequential queries are fine (no advisory locks). `markAccessRequestHandled` sets `handledAt` where null, returns whether a row changed.
- [ ] **Step 4: Generate the migration.** `npm run db:generate`, inspect the SQL, then `set -a; source .env.local; set +a && npm run db:migrate` against local Postgres. Note in the commit body: production migration deliberately deferred to deploy time.
- [ ] **Step 5: Gate.** `npm test -w @cold-start/db` and `npm run check`. Expected: green (the real-Postgres suites run against the migrated local DB).
- [ ] **Step 6: Commit** with message `Add access_requests: table, migration 0015, rate-limit decision, repository`.

### Task 14: POST /api/access-requests

**Files:**
- Create: `apps/web/src/app/api/access-requests/route.ts`
- Test: `apps/web/tests/access-requests-route.test.ts`

**Interfaces:**
- Consumes: `createAccessRequest` from `@cold-start/db`.
- Produces: `POST /api/access-requests` accepting JSON `{ name, email, note, company }` where `company` is the honeypot; responses `200 {ok: true}`, `400 {ok: false, error: "invalid"}`, `429 {ok: false, error: "rate_limited"}`.

- [ ] **Step 1: Read `SECURITY.md`** (this adds a public write endpoint).
- [ ] **Step 2: Failing route tests** (mock `@cold-start/db`): honeypot filled → 200 and the repository is never called; missing/overlong fields (name >120, note >500, email failing `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) → 400; repository `"rate_limited_ip"`/`"rate_limited_email"` → 429; `"created"` → 200 with the repository receiving `ipHash = sha256(firstForwardedFor)`.
- [ ] **Step 3: Implement.** Trim inputs; hash the first `x-forwarded-for` hop (fall back to `"unknown"`) with `createHash("sha256")`; honeypot returns the success body without touching the DB. No CORS additions (same-origin form), no email automation.
- [ ] **Step 4: Pass, then `npm run check`.**
- [ ] **Step 5: Commit** with message `Accept access requests: honeypot, hashed-IP rate limit, quiet refusals`.

### Task 15: Operator script

**Files:**
- Create: `scripts/access-requests.ts`
- Modify: root `package.json` (`"access:requests": "tsx scripts/access-requests.ts"`)

**Interfaces:**
- Consumes: `loadProductionEnv`, `parseCliArguments`, `valueFor`, `runCli`, `withAlphaDb` from `scripts/alpha-common.ts` (signatures verified 2026-07-30); `listOpenAccessRequests`, `markAccessRequestHandled` from `@cold-start/db`.

- [ ] **Step 1: Implement.** Default action prints open requests newest-first as flat lines `{createdAt} {id} {name} <{email}>: {note}` plus a count; `--handled <id>` stamps one and prints the result; `--help` prints usage. `loadProductionEnv()` first, `runCli(import.meta.url, main)` wrapper so the module stays importable.
- [ ] **Step 2: Smoke against local Postgres** (source `.env.local`, insert a row via the Task 14 route or psql, list it, mark it handled, list again).
- [ ] **Step 3: Commit** with message `Give access requests an operator: list and mark handled from the terminal`.

### Task 16: Recorded-build export and frozen data module

**Files:**
- Create: `scripts/export-recorded-build.ts`
- Create: `apps/web/src/components/landing/recorded-build-data.ts` (checked-in frozen output)

**Interfaces:**
- Produces:

```ts
export interface RecordedBuild {
  domain: string; companyName: string; oneLiner: string; filedDate: string;
  clippings: Array<{ source: string; date: string; headline: string }>;      // up to 4, from the card's citations/signals
  events: string[];                                                          // ordered stage lines derived from the real trace
  counts: { documentsOpened: number; documentsKept: number; factsKept: number };
  sections: { money: string[]; people: string[]; signals: string[]; sources: string[] };
  lens?: { whyCare: string; whatMustBeTrue: string };                        // present only when the card carries synthesis
}
export const recordedBuild: RecordedBuild;
```

- [ ] **Step 1: Write the export script.** `loadProductionEnv()`, read-only. Args: `--slug <slug>` required. Load the card and its most recent completed run's `trace_json` from `generation_runs`. Derive: `documentsOpened = sourceGate.acceptedCount + sourceGate.rejectedCount`, `documentsKept = sourceGate.acceptedCount`, `factsKept = extraction.citationCount ?? extraction.evidenceCount`. Events (only lines whose numbers exist in the trace; skip a line rather than fabricate): `Reading {domain}`, `Opened {opened} documents, kept {kept}`, `Cut {factsKept} facts, each pinned to a document`, `Filed`. Clippings from the four most recent signals (source hostname, date, title). Sections from the real card (money bullet texts, founder names, signal titles, citation publishers). `lens` only if the full card has synthesis: `whyItMatters.text` and the first `bullCase` entry. Print the module to stdout and write it to the data file path.
- [ ] **Step 2: Choose the company and run it.** Preference order: `cartesia.ai` if a filed prod card exists, otherwise the richest recent card (most citations with a complete trace). Run `set -a; source .env.production.migrate.local; set +a && tsx scripts/export-recorded-build.ts --slug <chosen>`, review every line of the emitted module for accuracy and voice, commit the frozen output. Every number in it must trace to the real run.
- [ ] **Step 3: Commit** with message `Freeze a real filed profile as the landing's recorded build`.

### Task 17: Landing page, static sections, copy sweep

**Files:**
- Modify: `apps/web/src/app/page.tsx` (full rewrite), `apps/web/src/app/layout.tsx:28`, `apps/web/src/app/c/[slug]/page.tsx:12`, `apps/web/src/app/c/[slug]/opengraph-model.ts:31`
- Create: `apps/web/src/components/landing/{Hero,ComparisonTable,SourcesLegend,ExtensionPanel,AccessForm,LandingFooter}.tsx`, `apps/web/src/app/styles/landing.css` (+ manifest line); delete `styles/home.css` and the old home block
- Test: rewrite `apps/web/tests/home-page.test.tsx`; update `apps/web/tests/opengraph-model.test.ts:78`

**Interfaces:**
- Consumes: the cached index count convention (Task 12), `recordedBuild` (Task 16; Hero renders its finished card statically in this task, animation arrives in Task 18), `POST /api/access-requests` (Task 14).
- Produces: the shipped `/` page. `AccessForm` is a client component posting JSON `{name, email, note, company}`.

- [ ] **Step 1: Failing tests.** Rewrite `home-page.test.tsx` for the landing: contains "Deeply understand the companies you care about", "Get up to speed like a serious investor would.", "Browse the catalog", `"{n} profiles filed"` from mocked summaries, "Cold Start can replace PitchBook", "Public facts, cited. Not investment advice.", and must NOT contain "sourced company" (case-insensitive) or "Make the profile" (the dropped URL input). Update the opengraph test expectation to "Company profile, cited."
- [ ] **Step 2: Build sections with mockup copy verbatim.** Nav: seal hairline top; "Cold Start" lockup + receipt descriptor "company profiles, cited"; links Catalog (`/catalog`), Extension (`#extension`), Ask for access (`#access`). Hero: H1 + subhead; seal pill `Browse the catalog` + receipt count; right column the recorded-build finished card (static this task). PitchBook section: H2 "Cold Start can replace PitchBook"; intro "PitchBook is generic, static and brittle. Cold Start builds the profile when you need it, cites every claim, finds and leverages the highest quality sources, interprets them with nuance, and keeps the profile current."; table rows verbatim: (A company founded in the last year | A full cited profile in about a minute | Thin profile, or none at all), (Depth | What it does, who pays, why it works, plus a bull case, a bear case, and the questions for a first call | Generic tags and fields), (After it is built | Keeps enriching, and stale sections rebuild the next time you open it | Static until an analyst updates the row), (Sources | Every fact links to a public source you can open | Proprietary numbers you cannot trace), (Cost | Under 10 cents per full profile, sub-caption "one seat of PitchBook buys 250,000 profiles" | About $25k per seat per year, reported), (Sharing | A public link, no login | Seat licensed); closing "Round ledgers, fund and LP data, and exit comps stay in PitchBook. The first ten minutes on a company you have not looked at yet is most of what a seat gets used for, and that is the part Cold Start takes." Sources legend: H2 "Understand the sources"; five rows with the marks and copy "Two independent sources say it." / "One outside source says it." / "Only the company says it." / "The sources give different numbers." / "No source has it." Extension: eyebrow "Chrome extension"; H2 "A companion for understanding a company, not just looking it up."; body "Open the extension on a company's site and it works through the five questions you would ask anyway: why care, what must be true, what could break, why now, what to learn next."; panel replica renders `recordedBuild.lens` when present (two answered rows + three locked rows valued `invited accounts` in receipt), or five locked rows when absent; CTA is an `Ask for access` seal button anchored to `#access` with receipt caption "invite-only alpha" (no store listing exists, verified 2026-07-30). Access: H2 "Ask for access"; body "Send us your name, email and one line about why this is interesting to you. A person reads it and answers either way."; `AccessForm` fields name/email/note + hidden honeypot input named `company` (offscreen via CSS, `tabIndex={-1}`, `autoComplete="off"`); success replaces the form with "Sent. A person reads it and answers either way."; failure states: 429 → "Too many requests from here today. Try again tomorrow."; other → "That did not send. Check the fields and try again." No queue stat. Footer: `Cold Start · {n} profiles filed · last filing {formatMediumDate(latest.generatedAt)}` + "Public facts, cited. Not investment advice." No VETTED stamp. Mobile per mockup: nav links drop (lockup + `{n} filed`), hero card static with no clippings, comparison stacks to three-line rows with the compressed wording, legend collapses to inline labels, panel replica drops, footer stacks.
- [ ] **Step 3: Pass tests, sweep the phrase.** `grep -rn "ourced company" apps packages --include=*.ts*` must return nothing.
- [ ] **Step 4: Gallery + gate.** Add `/` interaction screenshot (form success via route mock is not needed; screenshot the resting form), rerun gallery, `npm run check`.
- [ ] **Step 5: Commit** with message `Land the landing: hero, PitchBook case, sources legend, honest access form`.

### Task 18: Recorded-build animation

**Files:**
- Create: `apps/web/src/components/landing/RecordedBuild.tsx` (client)
- Modify: `apps/web/package.json` (add `framer-motion: "^12.38.0"`), `Hero` usage, `landing.css`

**Interfaces:**
- Consumes: `recordedBuild` data module (Task 16).
- Produces: `RecordedBuild({ build }: { build: RecordedBuild })`, the only Framer Motion surface in `apps/web`.

- [ ] **Step 1: Stage machine.** `stage: number` state 0..6. Start when scrolled into view (`useInView` from framer-motion, `once: true`): 600ms initial delay, then advance every 850ms to stage 6 and hold (no auto-replay loop). A receipt "replay" affordance resets to 0 and reruns. Bindings: clipping `i` visible at `stage > i` (slide in from `x: -28, opacity: 0` with slight per-clipping rotations 1.4/-1.8/-1/1.8deg); section `i` opacity `0.12 → 1` in filing order (summary, money, people, signals, sources); seal fill `rgb(110 92 158 / ${Math.min(stage,4) * 0.05})` and scale 1.04 at stage 6; FILED stamp opacity 0 → 1 at stage 6 with a spring settle. Springs per DESIGN.md: stiff, damping just under critical (`{ type: "spring", stiffness: 420, damping: 34 }` as the baseline; tune in the gallery loop). Event line: `build.events[Math.min(stage, build.events.length - 1)]`; elapsed counter `({stage} * 0.7).toFixed(1)s` while running, holding at the final value.
- [ ] **Step 2: Reduced motion.** `useReducedMotion()` true → render stage 6 statically (finished card, stamp down, final event line), no timers, no replay.
- [ ] **Step 3: Mobile.** Below 700px render the finished card statically with no clippings (matches the mockup and Task 17's placeholder, which this component now replaces at all widths).
- [ ] **Step 4: Verify.** Gallery screenshots (initial, mid, finished via `waitForTimeout` beats), manual feel pass in the browser, `npm run check` (knip must show framer-motion used).
- [ ] **Step 5: Commit** with message `Play the recorded build: a real profile assembling on grounded springs`.

### Task 19: Final polish, gates, and doc sync

**Files:** iterate across `styles/*`; Modify: `DESIGN.md`, `CLAUDE.md` + `AGENTS.md` (commands), `docs/README.md` if command lists live there

- [ ] **Step 1: Full-site polish loop** (`seed:web-gallery` + `qa:web:gallery`) until the Task 11 checklist holds across landing, Catalog, and cards; check `/`, `/catalog`, `/c/{slug}` in a real browser including keyboard focus order and the skip link.
- [ ] **Step 2: Gates.** `set -a; source .env.local; set +a && npm run evo:ux-gate` and `npm run check`. Expected: green.
- [ ] **Step 3: Doc sync.** DESIGN.md: update the Public Card layout section to the shipped anatomy (stat strip, section order, conflict panel, pocket tabs, stamps) and note the landing surface. CLAUDE.md + AGENTS.md (keep in sync): add `qa:web:gallery`, `seed:web-gallery`, `access:requests`, migration 0015, and the new file map lines (`apps/web/src/components/card/`, `components/landing/`, `lib/card-face/model.ts`, styles partials).
- [ ] **Step 4: Commit** with message `Sync the design law and agent maps to the shipped surfaces`.

---

## Self-review notes

- Spec coverage: card anatomy (Tasks 4-11), Catalog (12), landing sections and copy (17), recorded build (16, 18), access requests (13-15), naming sweep (17), honesty rules (fixtures and templates throughout), gallery loop (3, 11, 19), extension untouched (Task 1 guard + global constraints). Deferred list untouched by any task.
- Conflict panel ships degraded-form only and the ledger footnote is dropped; both spec contingencies resolved by verification, recorded inline in Tasks 7-8.
- Production migration 0015 is deliberately not applied by any task; it rides the standard deploy flow (`db:migrate:production`) when Samay ships, same as 0014.
