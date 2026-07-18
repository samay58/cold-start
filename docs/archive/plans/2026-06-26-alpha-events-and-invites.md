# Alpha Events And Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first-party alpha data spine for Cold Start so we can invite testers, identify extension connections, and record app-usage events during the Chrome Web Store beta.

**Architecture:** Keep this inside the existing Postgres + Drizzle + Next.js stack. Add focused alpha tables to `@cold-start/db`, expose small repository helpers, then add one web API route for recording alpha events. Do not add a third-party analytics stack for this first pass.

**Tech Stack:** Drizzle ORM, Postgres, Next.js App Router route handlers, existing `apiJsonWithTiming`, existing `webEnv`, existing `@cold-start/db` package exports.

## Global Constraints

- Keep event names as text, not a Postgres enum, so alpha instrumentation can evolve without a migration per event.
- Track product usage enough to answer install and activation questions: invite opened, store clicked, extension connected, side panel opened, domain detected, profile started/completed/failed, Early Read shown/opened, public card opened, Investor Lens started/completed/failed, diagnostics/support actions.
- Do not build the invite page, Chrome Web Store package, `externally_connectable`, or admin UI in this plan. Those are follow-on steps.
- Do not introduce PostHog, Segment, Mixpanel, Amplitude, or Vercel Analytics in this pass.
- Keep payloads bounded. Reject huge arbitrary metadata.
- Follow existing repository patterns in `packages/db/src/repositories/*`.

---

## Files

- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/repositories/alpha.ts`
- Modify: `packages/db/src/index.ts`
- Create: `apps/web/src/app/api/alpha/events/route.ts`
- Create: `packages/db/tests/alpha.test.ts` if the db package can run repository tests against the local test DB; otherwise create focused tests in the closest existing test harness.
- Generated: `packages/db/drizzle/0008_*.sql`
- Generated: `packages/db/drizzle/meta/0008_snapshot.json`
- Generated/modified: `packages/db/drizzle/meta/_journal.json`

## Data Model

Add this enum to `packages/db/src/schema.ts`:

```ts
export const alphaInviteStatusEnum = pgEnum("alpha_invite_status", [
  "invited",
  "accepted",
  "revoked",
  "expired"
]);
```

Add `integer` to the existing import from `drizzle-orm/pg-core`.

Add `alphaInvites`:

```ts
export const alphaInvites = pgTable(
  "alpha_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    invitedEmail: text("invited_email"),
    testerLabel: text("tester_label"),
    status: alphaInviteStatusEnum("status").default("invited").notNull(),
    runLimit: integer("run_limit").default(10).notNull(),
    runCount: integer("run_count").default(0).notNull(),
    notes: text("notes"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    firstExtensionConnectAt: timestamp("first_extension_connect_at", { withTimezone: true }),
    firstProfileStartedAt: timestamp("first_profile_started_at", { withTimezone: true }),
    firstProfileCompletedAt: timestamp("first_profile_completed_at", { withTimezone: true }),
    firstLensCompletedAt: timestamp("first_lens_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("alpha_invites_token_hash_idx").on(table.tokenHash),
    index("alpha_invites_status_created_idx").on(table.status, table.createdAt)
  ]
);
```

Add `alphaExtensionConnections`:

```ts
export const alphaExtensionConnections = pgTable(
  "alpha_extension_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviteId: uuid("invite_id").references(() => alphaInvites.id, { onDelete: "cascade" }).notNull(),
    extensionId: text("extension_id"),
    extensionVersion: text("extension_version"),
    installChannel: text("install_channel").default("unknown").notNull(),
    apiOrigin: text("api_origin"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastDiagnosticJson: jsonb("last_diagnostic_json"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("alpha_extension_connections_invite_idx").on(table.inviteId),
    index("alpha_extension_connections_last_seen_idx").on(table.lastSeenAt)
  ]
);
```

Add `alphaEvents`:

```ts
export const alphaEvents = pgTable(
  "alpha_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviteId: uuid("invite_id").references(() => alphaInvites.id, { onDelete: "set null" }),
    connectionId: uuid("connection_id").references(() => alphaExtensionConnections.id, { onDelete: "set null" }),
    eventName: text("event_name").notNull(),
    installChannel: text("install_channel"),
    extensionVersion: text("extension_version"),
    hostname: text("hostname"),
    slug: text("slug"),
    runId: text("run_id"),
    elapsedMs: integer("elapsed_ms"),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("alpha_events_invite_created_idx").on(table.inviteId, table.createdAt),
    index("alpha_events_event_created_idx").on(table.eventName, table.createdAt),
    index("alpha_events_slug_created_idx").on(table.slug, table.createdAt)
  ]
);
```

## Event Names For First Pass

Support these first:

```text
alpha.invite_opened
alpha.store_clicked
alpha.extension_connected
alpha.sidepanel_opened
alpha.domain_detected
alpha.profile_start_clicked
alpha.profile_queued
alpha.profile_first_payoff_shown
alpha.profile_completed
alpha.profile_failed
alpha.early_read_opened
alpha.public_card_opened
alpha.lens_start_clicked
alpha.lens_completed
alpha.lens_failed
alpha.diagnostics_copied
alpha.support_requested
```

## Task 1: Add Alpha Schema And Migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Generated: `packages/db/drizzle/0008_*.sql`
- Generated: `packages/db/drizzle/meta/0008_snapshot.json`
- Generated/modified: `packages/db/drizzle/meta/_journal.json`

- [ ] Add `integer` to the `drizzle-orm/pg-core` import.
- [ ] Add `alphaInviteStatusEnum`.
- [ ] Add `alphaInvites`.
- [ ] Add `alphaExtensionConnections`.
- [ ] Add `alphaEvents`.
- [ ] Run `npm run db:generate`.
- [ ] Inspect the generated migration and confirm it creates the enum, three tables, foreign keys, and indexes.
- [ ] Run `docker-compose up -d postgres`.
- [ ] Run `npm run db:migrate`.
- [ ] Run `npm run typecheck -w @cold-start/db`.

## Task 2: Add Alpha Repository Helpers

**Files:**
- Create: `packages/db/src/repositories/alpha.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**

Create these exports:

```ts
export type AlphaInvite = {
  id: string;
  tokenHash: string;
  invitedEmail: string | null;
  testerLabel: string | null;
  status: "invited" | "accepted" | "revoked" | "expired";
  runLimit: number;
  runCount: number;
  notes: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  firstExtensionConnectAt: string | null;
  firstProfileStartedAt: string | null;
  firstProfileCompletedAt: string | null;
  firstLensCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AlphaEvent = {
  id: string;
  inviteId: string | null;
  connectionId: string | null;
  eventName: string;
  installChannel: string | null;
  extensionVersion: string | null;
  hostname: string | null;
  slug: string | null;
  runId: string | null;
  elapsedMs: number | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
```

Create these functions:

```ts
createAlphaInvite(db, input)
findAlphaInviteByTokenHash(db, tokenHash)
acceptAlphaInvite(db, id)
recordAlphaExtensionConnection(db, input)
touchAlphaExtensionConnection(db, id, diagnosticJson?)
recordAlphaEvent(db, input)
findAlphaEventsForInvite(db, inviteId, options?)
```

- [ ] Follow the serialization style in `packages/db/src/repositories/research-events.ts`.
- [ ] Keep `metadata` as `{}` unless it is a plain object.
- [ ] Export the new repository from `packages/db/src/index.ts`.
- [ ] Run `npm run typecheck -w @cold-start/db`.

## Task 3: Add Alpha Event API

**Files:**
- Create: `apps/web/src/app/api/alpha/events/route.ts`

**Route:**

```text
POST /api/alpha/events
```

**Request body:**

```json
{
  "inviteId": "uuid-or-null",
  "connectionId": "uuid-or-null",
  "eventName": "alpha.profile_completed",
  "installChannel": "unlisted",
  "extensionVersion": "0.1.0",
  "hostname": "cartesia.ai",
  "slug": "cartesia",
  "runId": "uuid",
  "elapsedMs": 18342,
  "failureReason": null,
  "metadata": {}
}
```

**Validation rules:**
- `eventName` must be one of the first-pass names above or start with `alpha.`.
- String fields must be trimmed and bounded.
- `metadata` must be a plain object.
- Reject metadata payloads over a small serialized size limit, for example 8 KB.
- `elapsedMs` must be a finite non-negative integer when provided.

- [ ] Use `createDb(webEnv().DATABASE_URL)`.
- [ ] Use `apiJsonWithTiming`.
- [ ] Return `201` with the serialized event on success.
- [ ] Return `400` for malformed JSON or validation failures.
- [ ] Run `npm run typecheck -w @cold-start/web`.

## Task 4: Add Focused Tests

**Files:**
- Create: `packages/db/tests/alpha.test.ts` if there is a viable DB test harness.
- Or create web route tests in the existing app test style if route tests are easier in this repo.

**Minimum assertions:**
- Creating an invite returns status `invited`.
- Finding by `tokenHash` returns the invite.
- Recording an extension connection links to an invite.
- Recording an alpha event preserves event name, invite id, hostname, slug, run id, elapsedMs, failure reason, and metadata.
- Non-object metadata serializes to `{}` at the repository layer.

- [ ] Run `npm run test -w @cold-start/db`.
- [ ] Run `npm run typecheck -w @cold-start/db`.
- [ ] Run `npm run typecheck -w @cold-start/web`.

## Task 5: Manual Verification Query

After migration and route work, manually exercise the API against local dev once the web app is running:

```bash
curl -i -X POST http://localhost:3000/api/alpha/events \
  -H 'content-type: application/json' \
  -d '{
    "eventName":"alpha.invite_opened",
    "installChannel":"unlisted",
    "extensionVersion":"0.1.0",
    "hostname":"cartesia.ai",
    "slug":"cartesia",
    "metadata":{"source":"manual-smoke"}
  }'
```

Expected:

```text
HTTP/1.1 201 Created
```

Response body should include:

```json
{
  "eventName": "alpha.invite_opened",
  "installChannel": "unlisted",
  "extensionVersion": "0.1.0",
  "hostname": "cartesia.ai",
  "slug": "cartesia",
  "metadata": {
    "source": "manual-smoke"
  }
}
```

## Definition Of Done

- [ ] `alpha_invites`, `alpha_extension_connections`, and `alpha_events` exist in `schema.ts`.
- [ ] A Drizzle migration exists and applies locally.
- [ ] Alpha repository helpers exist and are exported.
- [ ] `POST /api/alpha/events` records a valid event.
- [ ] Invalid event payloads are rejected.
- [ ] DB and web typechecks pass.
- [ ] Focused tests pass where practical.
- [ ] No invite page, Chrome manifest messaging, or admin UI has been mixed into this step.

## Follow-On Steps

- Step 2: Build `/alpha/[token]` and start writing `alpha.invite_opened` and `alpha.store_clicked`.
- Step 3: Add `externally_connectable` and extension alpha connect messages.
- Step 4: Add side-panel diagnostics and emit extension-side alpha events.
- Step 5: Build the Chrome Web Store beta package and submit as Unlisted.
