# Profile Re-file and Editions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let extension users re-file a stale profile with a hold-to-confirm control, archiving the superseded card as an edition so a filing timeline can ship later.

**Architecture:** A new `card_revisions` table archives the old card row at the moment a re-file run successfully stores its replacement (freeze happens inside the existing store step, idempotently, never on background enrichment writes). The re-file trigger reuses the API's existing `forceRefresh` flag end to end; the only new server logic is the freeze plus threading the flag into the run. The extension adds one component (hold-to-refile) and an aged-date treatment shared with the web card via a pure helper in `packages/core`.

**Tech Stack:** Drizzle ORM + Postgres (Neon HTTP in prod, node-postgres locally), Next.js 15 App Router, React 19, Framer Motion, Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-08-11-profile-refresh-and-timeline-design.md`. Read it first. The timeline/diff UI is release two and NOT in this plan; this plan only guarantees the data for it.

## Global Constraints

- `npm run check` green is the merge bar (includes `test:cards-db`, which needs local docker postgres: `docker-compose up -d postgres`, host port 55432).
- Source `.env.local` before any DB-touching command: `set -a; source .env.local; set +a`.
- Production migrations run ONLY through `npm run db:migrate:production`. Do not run it in this plan; deployment is a separate step Samay approves.
- No API contract change: do not bump `packages/core/api-contract.json`. Inngest event names and step ids are frozen; adding fields to event data is allowed, renaming is not.
- Extension CSS: every color through theme-aware tokens; `npm run audit:css -w @cold-start/extension` must pass. No raw color literals.
- Copy register: flat, filed, declarative. The only new user-facing strings in this plan are "Re-file", the failure line "Re-file failed. The filed profile stands.", and ARIA labels. No persuasion copy, no exclamation marks, no em-dashes.
- Neon HTTP has no interactive transactions. Multi-statement writes are sequential with idempotency guards (this plan's freeze) or `db.batch` (not used here; the freeze is idempotent instead).
- Verifier/product invariants untouched: public routes never return synthesis; a re-file stores a basics card and the old synthesis is discarded, not preserved (Investor Lens re-runs on demand; spec decision 4).

---

### Task 1: `card_revisions` schema and migration

**Files:**
- Modify: `packages/db/src/schema.ts` (after the `cards` table definition, near line 82)
- Create: `packages/db/drizzle/0017_*.sql` (via `npm run db:generate`; number must come out 0017 — 0016 is the latest committed migration)

**Interfaces:**
- Produces: `cardRevisions` pgTable export used by Task 2's repository.

- [ ] **Step 1: Add the table to `schema.ts`**

Place directly after the `cards` table. Follow the file's existing style (see `sources` at line ~85 for the reference-with-cascade pattern):

```ts
// One row per superseded edition of a card. Frozen only when a re-file run successfully stores
// its replacement (never by enrichment writes), so an edition exists because someone re-filed.
// card_json is the complete card as it stood, self-contained (citations live inside it).
export const cardRevisions = pgTable(
  "card_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .references(() => cards.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    edition: integer("edition").notNull(),
    cardJson: jsonb("card_json").notNull(),
    supersededByRunId: uuid("superseded_by_run_id"),
    filedAt: timestamp("filed_at", { withTimezone: true }).notNull(),
    frozenAt: timestamp("frozen_at", { withTimezone: true }).defaultNow().notNull(),
    hadSynthesis: boolean("had_synthesis").notNull(),
    appSchemaNote: text("app_schema_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("card_revisions_slug_edition_idx").on(table.slug, table.edition),
    index("card_revisions_slug_idx").on(table.slug)
  ]
);
```

`integer`, `boolean`, and `index` may need adding to the drizzle-orm import at the top of the file; check what is already imported.

`supersededByRunId` is deliberately NOT a foreign key: generation run rows can be retired/cleaned independently of history, and history must outlive them.

- [ ] **Step 2: Generate the migration**

Run: `set -a; source .env.local; set +a; npm run db:generate`
Expected: a new `packages/db/drizzle/0017_*.sql` creating `card_revisions` with both indexes. Read the generated SQL and confirm it contains only this table (no accidental drift from other schema edits).

- [ ] **Step 3: Apply locally and verify**

Run: `docker-compose up -d postgres && npm run db:migrate`
Then: `docker exec $(docker ps -qf name=postgres) psql -U postgres -d cold_start -c '\d card_revisions'` (adjust container/db names to what `docker-compose.yml` declares).
Expected: table exists with the unique `(slug, edition)` index.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat: add card_revisions table for filing editions"
```

---

### Task 2: Revisions repository with idempotent freeze

**Files:**
- Create: `packages/db/src/repositories/card-revisions.ts`
- Modify: `packages/db/src/index.ts` (re-export the new module, matching how other repositories are exported)
- Test: `packages/db/tests/` — mirror the existing real-Postgres cards suite. Find it with `grep -rl "test:cards-db" package.json packages/db/package.json` and read the referenced test file first; new tests join that suite so they run against real Postgres in `npm run check`.

**Interfaces:**
- Consumes: `cards`, `cardRevisions` from `../schema`; `ColdStartDb` from `../client`.
- Produces:
  - `freezeCurrentEditionForRefile(db: ColdStartDb, slug: string, opts: { supersededByRunId?: string | null; appSchemaNote?: string | null }): Promise<{ frozen: boolean }>`
  - `listCardRevisionSummaries(db: ColdStartDb, slug: string): Promise<Array<{ edition: number; filedAt: Date; frozenAt: Date; hadSynthesis: boolean }>>`
  - `countCardRevisions(db: ColdStartDb, slug: string): Promise<number>`

- [ ] **Step 1: Write failing tests**

Test cases, against real Postgres (each seeds a card via the existing `upsertCard`):

```ts
// 1. First freeze archives edition 1 with the live card's JSON, filedAt from
//    card_json.generatedAt, hadSynthesis false for a basics card.
// 2. Freeze, overwrite the card via upsertCard with a NEW generatedAt, freeze again:
//    edition 2 exists; editions 1 and 2 hold different generatedAt values.
// 3. Idempotency: calling freeze twice without the card changing creates exactly one
//    revision (second call returns { frozen: false }).
// 4. Freeze on a slug with no card row: { frozen: false }, no rows written.
// 5. countCardRevisions and listCardRevisionSummaries return editions ascending.
```

Write them as real assertions in the cards-db suite's style. Run the suite; expected: FAIL (module does not exist).

- [ ] **Step 2: Implement the repository**

The freeze is ONE SQL statement (read-and-insert atomically, no read-then-write race), with a duplicate guard making it idempotent under step retries:

```ts
import { asc, eq, sql } from "drizzle-orm";
import type { ColdStartDb } from "../client";
import { cardRevisions } from "../schema";

export async function freezeCurrentEditionForRefile(
  db: ColdStartDb,
  slug: string,
  opts: { supersededByRunId?: string | null; appSchemaNote?: string | null } = {}
): Promise<{ frozen: boolean }> {
  const result = await db.execute(sql`
    INSERT INTO card_revisions
      (card_id, slug, edition, card_json, superseded_by_run_id, filed_at, had_synthesis, app_schema_note)
    SELECT
      c.id,
      c.slug,
      COALESCE((SELECT MAX(r.edition) FROM card_revisions r WHERE r.slug = c.slug), 0) + 1,
      c.card_json,
      ${opts.supersededByRunId ?? null},
      (c.card_json->>'generatedAt')::timestamptz,
      (c.card_json->'synthesis') IS NOT NULL,
      ${opts.appSchemaNote ?? null}
    FROM cards c
    WHERE c.slug = ${slug}
      AND NOT EXISTS (
        SELECT 1 FROM card_revisions r2
        WHERE r2.slug = c.slug
          AND r2.card_json->>'generatedAt' = c.card_json->>'generatedAt'
      )
  `);
  return { frozen: rowCountFromExecuteResult(result) > 0 };
}
```

`rowCountFromExecuteResult`: the neon-http and node-postgres drivers report affected rows differently (`rowCount` vs `rowsAffected` vs array length). Write a small local helper that checks the shapes both drivers return; look at how other `db.execute` callers in `packages/db` read results, if any exist, and match.

The duplicate guard keys on `card_json->>'generatedAt'`: two freezes of the same filing are one edition; a freeze after the card was replaced sees a new `generatedAt` and archives normally. This also makes the sequential freeze-then-store write safe without a transaction (Neon HTTP has none): a crash after freeze but before store leaves one harmless already-frozen edition that the retry will not duplicate.

`listCardRevisionSummaries` and `countCardRevisions` are plain drizzle selects on `cardRevisions` filtered by slug, ordered `asc(cardRevisions.edition)`, selecting only the summary columns (never `cardJson`; bounded reads).

- [ ] **Step 3: Run the suite to green**

Run: `set -a; source .env.local; set +a; npm run test:cards-db` (exact script name per root `package.json`).
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/repositories/card-revisions.ts packages/db/src/index.ts packages/db/tests/
git commit -m "feat: archive superseded card editions with idempotent freeze"
```

---

### Task 3: Thread the re-file flag into the run and freeze at store time

**Files:**
- Modify: `apps/web/src/app/api/generate/route.ts` (~line 880: the `inngest.send` data object; and the `startInlineGeneration` call ~line 878)
- Modify: `apps/web/src/inngest/inline-dispatch.ts` (input type ~line 98)
- Modify: `apps/web/src/inngest/functions.ts` (event data read + the store step ~line 333)
- Modify: `apps/web/src/inngest/generation-helpers.ts` (new pure predicate)
- Test: the existing test file covering `generation-helpers` (find with `ls apps/web/tests | grep -i helper`; create `apps/web/tests/generation-helpers.test.ts` following the folder's vitest style if none exists)

**Interfaces:**
- Consumes: `freezeCurrentEditionForRefile` from `@cold-start/db` (Task 2); `forceRefresh` boolean already parsed in the route (line ~391).
- Produces: `isRefileProfileStore(input: { jobKind: string; forceRefresh: boolean }): boolean` in `generation-helpers.ts`; event/inline data field `forceRefresh?: boolean`.

- [ ] **Step 1: Write the failing predicate test**

```ts
import { isRefileProfileStore } from "../src/inngest/generation-helpers";

// True only for an explicit re-file of the basics profile job.
test("refile store predicate", () => {
  expect(isRefileProfileStore({ jobKind: "basics", forceRefresh: true })).toBe(true);
  expect(isRefileProfileStore({ jobKind: "basics", forceRefresh: false })).toBe(false);
  // A lens retry uses forceRefresh on analysis; it must NOT cut an edition (spec: analysis
  // deepens the same filing).
  expect(isRefileProfileStore({ jobKind: "analysis", forceRefresh: true })).toBe(false);
  expect(isRefileProfileStore({ jobKind: "section:customer_proof", forceRefresh: true })).toBe(false);
});
```

Run: `npm test -w @cold-start/web -- generation-helpers`. Expected: FAIL (not exported).

- [ ] **Step 2: Implement the predicate and thread the flag**

`generation-helpers.ts`:

```ts
// An edition is frozen only when an explicit re-file replaces the basics profile.
// Analysis (including lens retries with forceRefresh) deepens the same filing; section and
// enrichment writes never freeze. Spec: 2026-08-11 profile refresh design, "editions are cut
// only by re-files".
export function isRefileProfileStore(input: { jobKind: string; forceRefresh: boolean }): boolean {
  return input.forceRefresh && input.jobKind === "basics";
}
```

Route: add `...(forceRefresh ? { forceRefresh: true } : {})` to BOTH dispatch payloads (the `inngest.send` data object and the `startInlineGeneration` input). Inline-dispatch: add `forceRefresh?: boolean` to the input type and pass it through to the handler invocation the same way `generationRunId` flows.

`functions.ts`: read the flag from event data where `mode`/`sectionId` are read (default false). In the store step (~line 333), BEFORE the existing mutate/upsert block, inside the same `step.run(input.steps.upsert, ...)` callback:

```ts
if (isRefileProfileStore({ jobKind, forceRefresh })) {
  await freezeCurrentEditionForRefile(db, input.cardToStore.slug, {
    supersededByRunId: generationRunId ?? null,
    appSchemaNote: `store@${new Date().toISOString().slice(0, 10)}`
  });
}
```

Use the actual local variable names in scope for `jobKind` and `generationRunId`; read the surrounding function to find them. The step id `input.steps.upsert` does not change (frozen identity); widening the step body is allowed.

Re-file store semantics (spec decision: nothing stale survives): when `isRefileProfileStore(...)` is true, the store must NOT merge with the current row. Skip the `mutateCardWithRetry(...)` merge branch and call `upsertCard(db, input.cardToStore, ...writeArgs)` directly after the freeze, so the old synthesis and old enrichment are replaced wholesale. The contact-enrichment trigger already fires after basics stores; the block-enrichment worker re-derives the expanded description because the fresh card lacks one. Verify both by reading the code below the store step, not by assumption.

- [ ] **Step 3: Run tests**

Run: `npm test -w @cold-start/web -- generation-helpers` → PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat: freeze the superseded edition when a re-file stores"
```

---

### Task 4: Analytics events for the hold

**Files:**
- Modify: `packages/core/src/alpha-analytics.ts` (the discriminated union at ~line 321 and the event-name schema it references)
- Test: the existing alpha-analytics test file in `packages/core/tests/` (find it; extend, do not fork)

**Interfaces:**
- Produces: three new event names accepted by schema and server: `refile.hold_started`, `refile.fired`, `refile.hold_abandoned`, each with `{ domain }` properties (`domainPropertiesSchema`, already defined ~line 72).

- [ ] **Step 1: Write failing tests**

In the existing test file's style, assert `alphaEventSchema` accepts each of the three names with a valid domain property payload, and rejects `refile.fired` with an extra property (the schemas are `.strict()`).

Run: `npm test -w @cold-start/core -- alpha-analytics`. Expected: FAIL.

- [ ] **Step 2: Add the events**

Follow the exact pattern used by existing domain-scoped events (e.g., `lens.run_requested`): add the three literals wherever event names are enumerated, and three entries in the discriminated union using `domainPropertiesSchema`. Read how `alphaEventNameSchema` is built before editing; if names are derived from the union, only the union needs entries.

- [ ] **Step 3: Run tests to green, then commit**

```bash
git add packages/core
git commit -m "feat: add refile hold analytics events"
```

---

### Task 5: Extension threading — a re-file run that protects the old profile

**Files:**
- Modify: `apps/extension/src/sidepanel-network.ts` (`startBasicsGenerationAndPoll`, line ~619: add trailing `forceRefresh = false` param, pass into `requestGeneration` in place of the literal `false`)
- Modify: `apps/extension/src/sidepanel.tsx` (`runBasicsGenerationWithController` ~line 916: add trailing `forceRefresh = false` param; new `handleRefile` beside `handleRunAnalysis` ~line 1570)
- Modify: `apps/extension/src/company/CompanyArc.tsx` (accept and pass through the new props; render the failure notice)
- Test: `apps/extension/tests/sidepanel-run-lifecycle.test.tsx` (extend in its own style)

**Interfaces:**
- Consumes: `requestGeneration`'s existing `forceRefresh` parameter; `enqueueAlphaEvent` (as used at line ~1560); Task 4's event names.
- Produces: `handleRefile(): boolean` passed to `CompanyArc` as `onRefile`; success-state field `refileNotice?: string` (mirror the existing `analysisNotice` pattern exactly — type, set, clear).

- [ ] **Step 1: Write the failing test**

In `sidepanel-run-lifecycle.test.tsx` style: mock the network layer, drive a saved-profile state, invoke re-file, assert (a) the request carries `forceRefresh: true` and `confirmStart: true`, (b) on network failure the state returns to the prior success state with `refileNotice` set and the prior card intact.

Run: `npm test -w @cold-start/extension -- sidepanel-run-lifecycle`. Expected: FAIL.

- [ ] **Step 2: Implement**

`handleRefile` in `sidepanel.tsx`, modeled on `handleRunAnalysis`'s guard structure:

```ts
function handleRefile(): boolean {
  if (
    !domain ||
    !settings?.apiToken ||
    requestState.status !== "success" ||
    requestState.profileRun ||
    requestState.analysisRun ||
    requestState.activeSectionRun ||
    alphaAccess?.generationEnabled === false ||
    alphaAccess?.profile?.remaining === 0
  ) {
    return false;
  }
  const interactionId = crypto.randomUUID();
  void enqueueAlphaEvent(settings, "refile.fired", { domain }, "side_panel", interactionId);
  const previousState = requestState;
  const controller = new AbortController();
  abortAllRequests();
  activeRequest.current = controller;
  runBasicsGenerationWithController(controller, domain, settings, true, interactionId, true, previousState);
  return true;
}
```

`runBasicsGenerationWithController` gains two trailing params: `forceRefresh = false` and `restoreOnFailure?: <the success-state type>`. Pass `forceRefresh` through `startBasicsGenerationAndPoll`. In the `.catch` branch, when `restoreOnFailure` is present and the controller is not aborted, restore it with the notice instead of entering the error state:

```ts
setRequestState({ ...restoreOnFailure, refileNotice: "Re-file failed. The filed profile stands." });
```

Clear `refileNotice` wherever `analysisNotice` clears. Success path is unchanged: the generating state flips `CompanyArc` to the building phase (the arc replay IS the re-file animation), and the new card lands through the existing completion path with a fresh stamp.

`CompanyArc.tsx`: render `refileNotice`, when present, as one quiet line near the header (reuse the styling class the analysis notice uses; no new visual language).

- [ ] **Step 3: Run tests to green, typecheck, commit**

```bash
git add apps/extension/src apps/extension/tests
git commit -m "feat: wire re-file runs through the panel with old-profile protection"
```

---

### Task 6: The hold-to-refile control

**Files:**
- Create: `apps/extension/src/company/RefileControl.tsx`
- Modify: `apps/extension/src/company/CompanyHeader.tsx` (~line 60: render an optional `refileSlot?: ReactNode` prop beside `cs-freshness-mark`, following the existing `statusSlot` prop precedent)
- Modify: `apps/extension/src/company/CompanyArc.tsx` (compose `RefileControl` into `refileSlot` when a saved profile is showing)
- Modify: the company styles partial under `apps/extension/src/styles/` (find the file that holds `cs-freshness-mark` and `cs-seal-inst` rules; add `cs-refile` rules there)
- Test: Create `apps/extension/tests/refile-control.test.tsx`

**Interfaces:**
- Consumes: `onRefile: () => boolean` (Task 5), `usePrefersReducedMotion` from `../shared`, `enqueueAlphaEvent`-style emitters passed as props (`onHoldStarted`, `onHoldAbandoned` callbacks so the component stays network-free), motion tokens from the shared motion module.
- Produces: `RefileControl({ onRefile, onHoldStarted, onHoldAbandoned, disabled, disabledReason, prefersReducedMotion })`.

- [ ] **Step 1: Write failing tests**

```tsx
// In the extension test setup style (skipAnimations is already configured in tests/setup):
// 1. Press-and-hold to full then release fires onRefile once.
// 2. Early release fires onHoldAbandoned, never onRefile.
// 3. Keyboard: keydown Space starts (onHoldStarted), holding to full then keyup fires onRefile.
//    Repeated keydown events (key repeat) do not restart the fill.
// 4. disabled renders the button disabled with disabledReason as accessible text; no handlers fire.
// 5. aria-label is "Re-file this profile. Hold to confirm."
```

Use fake timers to advance the 700ms fill. Run: `npm test -w @cold-start/extension -- refile-control`. Expected: FAIL.

- [ ] **Step 2: Implement the component**

Behavior contract (spec, decision 5):

- `pointerdown`/`keydown(Space|Enter)` starts the fill: 700ms linear to full. Emit `onHoldStarted` once per press.
- Fill reaching full: ink holds full with a small damped settle; nothing fires yet.
- `pointerup`/`keyup` at full: fire `onRefile()`. Before full: drain the ink back (damped spring; under reduced motion, a fade) and emit `onHoldAbandoned`.
- `pointerleave`/blur/`Escape` mid-hold behaves like early release.
- Key repeat guard: ignore `keydown` while a press is live.
- Reduced motion: the fill still animates (it is essential progress feedback, per the repo's motion doctrine); only the drain/settle springs become fades.

Implementation sketch — track progress in a Framer Motion motion value driving a CSS var so the styles stay in CSS:

```tsx
const progress = useMotionValue(0);
const fillControls = useRef<AnimationPlaybackControls | null>(null);

function startHold() {
  if (pressLive.current || disabled) return;
  pressLive.current = true;
  onHoldStarted();
  fillControls.current = animate(progress, 1, { duration: 0.7, ease: "linear" });
}

function endHold() {
  if (!pressLive.current) return;
  pressLive.current = false;
  fillControls.current?.stop();
  if (progress.get() >= 1) {
    progress.set(0);
    onRefile();
  } else {
    onHoldAbandoned();
    animate(progress, 0, prefersReducedMotion
      ? { duration: 0.15, ease: "easeOut" }
      : { type: "spring", stiffness: 300, damping: 30 });
  }
}
```

Render a `<button type="button" className="cs-refile" aria-label="Re-file this profile. Hold to confirm.">` containing the word `Re-file` and a small seal ring whose fill scales with `--refile-progress` (bind via `useMotionValueEvent(progress, "change", ...)` setting the CSS var on the element). Reuse the seal's visual vocabulary: same ring/fill class structure as `cs-seal-inst-ring`/`cs-seal-inst-fill`, sized to text height. All colors via existing theme tokens (the seal accent token family); `npm run audit:css -w @cold-start/extension` is the gate.

Wire in `CompanyArc.tsx`: `refileSlot` renders only when `arc.phase === "profile"` and the profile came from the archive (the condition already computed as `profileIsStale` at line ~234 — reuse it, do not re-derive) and no run is active. Disabled cases reuse the existing reason strings already computed in `CompanyArc` (`profileStartDisabled` / `profileStartReason` pattern at line ~242): allowance exhausted or generation paused. Hold events map to `enqueueAlphaEvent` calls with `refile.hold_started` / `refile.hold_abandoned` (`refile.fired` is emitted by `handleRefile` itself, Task 5 — exactly one emitter per event).

- [ ] **Step 3: Run tests to green**

Run: `npm test -w @cold-start/extension -- refile-control` and the full extension suite `npm test -w @cold-start/extension` (which includes `audit:css`). Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src apps/extension/tests
git commit -m "feat: hold-to-refile control with seal ink confirmation"
```

---

### Task 7: The aged-date signal on both surfaces

**Files:**
- Create: `packages/core/src/card-age.ts`; export from `packages/core/src/index.ts`
- Test: Create `packages/core/tests/card-age.test.ts`
- Modify: `apps/web/src/lib/card-face/model.ts` (add `aged: boolean` to the derived model)
- Modify: `apps/web/tests/card-face-model.test.ts` (extend)
- Modify: `apps/web/src/components/card/CardFace.tsx` (~line 93, the `filed {date}` footer line) and `PocketCard.tsx` (~line 70): stamp `data-aged` on the filed line when the model says so
- Modify: `apps/web/src/app/styles/card.css` (aged treatment)
- Modify: `apps/extension/src/company/CompanyHeader.tsx` (`cs-freshness-mark` gains `data-aged`) plus the extension styles partial holding that class
- Modify: `apps/web/tests/fixtures/gallery-cards.ts` (set one fixture's `generatedAt` older than 14 days so the gallery captures the aged state)

**Interfaces:**
- Produces: `AGED_PROFILE_THRESHOLD_DAYS = 14` and `isAgedProfile(generatedAt: string, now?: Date): boolean` in `@cold-start/core`.

- [ ] **Step 1: Write failing core tests**

```ts
import { isAgedProfile, AGED_PROFILE_THRESHOLD_DAYS } from "../src/card-age";

test("aged past the threshold, not before", () => {
  const now = new Date("2026-08-11T00:00:00Z");
  expect(isAgedProfile("2026-08-01T00:00:00Z", now)).toBe(false); // 10 days
  expect(isAgedProfile("2026-07-20T00:00:00Z", now)).toBe(true);  // 22 days
  expect(isAgedProfile("not a date", now)).toBe(false);           // invalid input never flags
  expect(AGED_PROFILE_THRESHOLD_DAYS).toBe(14);
});
```

- [ ] **Step 2: Implement**

```ts
// The human-attention threshold for a filed profile's age. Distinct from the cache TTLs in
// packages/db (those decide regeneration; this decides visual weight). Tunable constant.
export const AGED_PROFILE_THRESHOLD_DAYS = 14;

export function isAgedProfile(generatedAt: string, now: Date = new Date()): boolean {
  const filed = new Date(generatedAt);
  if (Number.isNaN(filed.getTime())) {
    return false;
  }
  return now.getTime() - filed.getTime() > AGED_PROFILE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}
```

Web: `model.ts` derives `aged: isAgedProfile(card.generatedAt)` (keep the model pure — accept `now` as an optional argument defaulting inside, matching the file's existing conventions; extend its test). `CardFace`/`PocketCard` render `data-aged="true"` on the filed-date span. CSS in `card.css`: the aged state adds a small dot before the date (an existing classification-dot pattern; pick a warm token already in `foundation.css` — no new colors) and one weight step on the date. Nothing else changes; the stamp is untouched.

Extension: `CompanyHeader` computes `isAgedProfile(card.generatedAt)` when a card is present and stamps `data-aged` on `cs-freshness-mark`; mirror the same dot-plus-weight treatment with extension tokens.

- [ ] **Step 3: Run all touched suites**

`npm test -w @cold-start/core -- card-age`, `npm test -w @cold-start/web -- card-face-model`, `npm test -w @cold-start/extension`. Expected: PASS. Then `npm run seed:web-gallery && npm run qa:web:gallery` once locally and eyeball the aged fixture's card face.

- [ ] **Step 4: Commit**

```bash
git add packages/core apps/web apps/extension
git commit -m "feat: age the filed date past fourteen days on both surfaces"
```

---

### Task 8: Bedrock source seeding behind a flag (droppable without blocking release)

**Files:**
- Modify: `apps/web/src/inngest/worker-env.ts` (new flag `REFILE_SEED_SOURCES`, default off, following the file's existing flag pattern)
- Modify: `apps/web/src/inngest/functions.ts` (when `isRefileProfileStore`-bound run starts, read the prior card's citation URLs before generation begins and pass them down)
- Modify: `apps/web/src/inngest/source-fetching.ts` (`fetchInitialSourcesForGeneration`, line ~254: accept `seedUrls?: string[]`)
- Modify: `apps/web/src/inngest/provider-trace.ts` or the trace assembly in `functions.ts` (record `refileSeed: { offered: number; fetched: number }` in the run trace)
- Test: extend the existing tests around `source-fetching` (find with `ls apps/web/tests | grep -i source`)

**Interfaces:**
- Consumes: prior card via `findCardBySlug(db, slug, { allowStale: true })` before the run's fetch stage; `mergeSources` (line 38 of `source-fetching.ts`) already dedupes by URL.
- Produces: seeded re-reads merged into the run's source pool, marked in the trace.

Rules from the spec (decision 3), non-negotiable in implementation:

1. Fresh discovery ALWAYS runs in full. Seeds are extra fetch candidates re-read through the existing per-URL fetch path (Firecrawl scrape or the direct fetch the pipeline already uses for known URLs — read `fetchInitialSourcesForGeneration` and reuse whatever fetches a known URL today; if no such path exists, fetch seeds through the same client the clippings/source path uses).
2. Seeds merge AFTER discovery via `mergeSources(discovered, seeded)` so discovered sources win URL collisions.
3. If fresh discovery itself fails (provider outage), the run fails exactly as it does today. Seeds must not mask that failure; assert in a test that a discovery-throw still propagates when seeds are present.
4. Cap seeds at 12 URLs, citation order, and record `{ offered, fetched }` in the trace so seeded and discovered sources are distinguishable forever.

- [ ] **Step 1: Write failing tests** — seed merge keeps discovered winner on URL collision; discovery failure propagates despite seeds; flag off means no seed fetches.
- [ ] **Step 2: Implement to green.**
- [ ] **Step 3: Commit**

```bash
git add apps/web/src apps/web/tests
git commit -m "feat: seed re-file runs with prior sources behind a flag"
```

If this task's fetch path turns out to need new provider work, STOP, leave the flag off, note the finding in the plan file, and continue to Task 9 — the release does not block on seeding.

---

### Task 9: Docs sync and the full gate

**Files:**
- Modify: `CLAUDE.md` and `AGENTS.md` (data-flow section: one or two sentences on `card_revisions` and the re-file freeze; keep the two files in sync — this is a stated repo rule)
- Modify: `README.md` (env-var reference: `REFILE_SEED_SOURCES`, only if Task 8 landed)
- Modify: `docs/superpowers/specs/2026-08-11-profile-refresh-and-timeline-design.md` (append a short "Shipped" note listing any deviations discovered during implementation)

- [ ] **Step 1: Make the doc edits.** Short plain sentences; match the surrounding registers.
- [ ] **Step 2: Run the full gate**

Run: `docker-compose up -d postgres && npm run check`
Expected: green end to end (lint, typecheck, all tests including `test:cards-db` and `test:alpha-db`, builds, Firefox build + web-ext lint, eval dry-run, knip, secrets, audit). Do not pipe through `tail` (it eats the exit code — recorded repo gotcha).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md AGENTS.md README.md docs/
git commit -m "docs: record the re-file and editions system"
```

---

## Out of scope for this plan (recorded so nobody "helpfully" adds them)

- The timeline/diff UI, the changes ledger, and the differ (release two; the spec's "Release two direction" section is the brief).
- Any revisions read API or contract bump (nothing consumes revisions yet).
- Freezing editions on natural TTL-triggered regenerations (today those overwrite silently; widening the freeze is a one-line change at the Task 3 call site, deliberately deferred).
- Revision retention/pruning.
- Deployment and production migration: separate step, Samay approves, `npm run db:migrate:production` with the guarded flow, then deploy, then a production canary re-file.
