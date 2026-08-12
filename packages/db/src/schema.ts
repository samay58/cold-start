import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const cacheStatusEnum = pgEnum("cache_status", ["hit", "partial", "miss"]);
export const claimVisibilityEnum = pgEnum("claim_visibility", ["public", "gated"]);
export const claimStatusEnum = pgEnum("claim_status", ["verified", "mixed", "inferred", "unknown"]);
export const generationModeEnum = pgEnum("generation_mode", ["basics", "analysis"]);
export const researchSectionVisibilityEnum = pgEnum("research_section_visibility", ["public", "gated"]);
export const researchSectionStatusEnum = pgEnum("research_section_status", ["not_started", "running", "available", "empty", "failed", "stale"]);
export const sourceTypeEnum = pgEnum("source_type", [
  "company_site",
  "news",
  "filing",
  "enrichment",
  "github",
  "rdap",
  "other"
]);
export const generationStatusEnum = pgEnum("generation_status", ["queued", "running", "complete", "failed"]);
export const alphaInviteStatusEnum = pgEnum("alpha_invite_status", ["pending", "active", "revoked"]);
export const alphaBrowserEnum = pgEnum("alpha_browser", ["chrome", "firefox"]);
export const alphaInstallChannelEnum = pgEnum("alpha_install_channel", ["unlisted", "unpacked", "unknown"]);
export const alphaAllowanceKindEnum = pgEnum("alpha_allowance_kind", ["profile", "lens"]);
export const alphaLedgerEntryKindEnum = pgEnum("alpha_ledger_entry_kind", ["debit", "refund"]);
export const alphaRunDispositionEnum = pgEnum("alpha_run_disposition", [
  "started",
  "joined",
  "cached",
  "withheld",
  "blocked",
  "rejected"
]);
export const alphaRunOutcomeEnum = pgEnum("alpha_run_outcome", [
  "complete",
  "withheld",
  "failed",
  "watchdog_retired"
]);
export const alphaThemeEnum = pgEnum("alpha_theme", ["light", "dark"]);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    domain: text("domain").notNull(),
    cardJson: jsonb("card_json").notNull(),
    cacheStatus: cacheStatusEnum("cache_status").notNull(),
    generationCostUsd: numeric("generation_cost_usd", { precision: 10, scale: 4 }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    identityExpiresAt: timestamp("identity_expires_at", { withTimezone: true }).notNull(),
    signalsExpiresAt: timestamp("signals_expires_at", { withTimezone: true }).notNull(),
    synthesisExpiresAt: timestamp("synthesis_expires_at", { withTimezone: true }).notNull(),
    // Optimistic-concurrency counter for mutateCard. The compare used to be on updated_at, but
    // Postgres stamps that column with microseconds and a JS Date reads back only milliseconds,
    // so the equality could never match a freshly inserted row (every post-insert mutation failed
    // in production, 2026-07-24 through 2026-07-27). An integer compares exactly.
    version: bigint("version", { mode: "number" }).default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("cards_slug_idx").on(table.slug),
    uniqueIndex("cards_domain_idx").on(table.domain)
  ]
);

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

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .references(() => cards.id, { onDelete: "cascade" })
      .notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    rawText: text("raw_text").notNull(),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [uniqueIndex("sources_card_url_idx").on(table.cardId, table.url)]
);

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .references(() => cards.id, { onDelete: "cascade" })
      .notNull(),
    citationKey: text("citation_key").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    snippet: text("snippet"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull()
  },
  (table) => [uniqueIndex("citations_card_key_idx").on(table.cardId, table.citationKey)]
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .references(() => cards.id, { onDelete: "cascade" })
      .notNull(),
    path: text("path").notNull(),
    visibility: claimVisibilityEnum("visibility").notNull(),
    status: claimStatusEnum("status").notNull(),
    confidence: text("confidence").notNull(),
    valueJson: jsonb("value_json"),
    citationKeys: jsonb("citation_keys").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("claims_card_path_idx").on(table.cardId, table.path)]
);

export const generationRuns = pgTable(
  "generation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    domain: text("domain").notNull(),
    mode: generationModeEnum("mode").default("analysis").notNull(),
    jobKind: text("job_kind").notNull(),
    status: generationStatusEnum("status").notNull(),
    error: text("error"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
    traceJson: jsonb("trace_json"),
    inngestEventId: text("inngest_event_id"),
    inngestRunId: text("inngest_run_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    index("generation_runs_slug_started_idx").on(table.slug, table.startedAt),
    index("generation_runs_slug_mode_started_idx").on(table.slug, table.mode, table.startedAt),
    index("generation_runs_job_kind_started_idx").on(table.jobKind, table.startedAt),
    uniqueIndex("generation_runs_active_slug_mode_idx")
      .on(table.slug, table.mode)
      .where(sql`${table.status} in ('queued', 'running')`)
  ]
);

export const researchSections = pgTable(
  "research_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    domain: text("domain").notNull(),
    sectionId: text("section_id").notNull(),
    visibility: researchSectionVisibilityEnum("visibility").notNull(),
    status: researchSectionStatusEnum("status").notNull(),
    contentJson: jsonb("content_json"),
    citationIds: jsonb("citation_ids").notNull(),
    sourceIds: jsonb("source_ids").notNull(),
    runId: text("run_id"),
    error: text("error"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    staleAt: timestamp("stale_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("research_sections_slug_section_idx").on(table.slug, table.sectionId),
    index("research_sections_slug_status_idx").on(table.slug, table.status)
  ]
);

export const researchRunEvents = pgTable(
  "research_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: text("run_id").notNull(),
    slug: text("slug").notNull(),
    domain: text("domain").notNull(),
    sectionId: text("section_id"),
    type: text("type").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("research_run_events_slug_created_idx").on(table.slug, table.createdAt),
    index("research_run_events_run_created_idx").on(table.runId, table.createdAt)
  ]
);

export const alphaInvites = pgTable(
  "alpha_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(),
    presentationTokenHash: text("presentation_token_hash"),
    status: alphaInviteStatusEnum("status").default("pending").notNull(),
    scopes: text("scopes").array().notNull(),
    profileLimit: integer("profile_limit").notNull(),
    lensLimit: integer("lens_limit").notNull(),
    maxInstallations: integer("max_installations").default(1).notNull(),
    slug: text("slug"),
    displayName: text("display_name"),
    ordinal: integer("ordinal"),
    cardPngBase64: text("card_png_base64"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("alpha_invites_token_hash_idx").on(table.tokenHash),
    uniqueIndex("alpha_invites_presentation_token_hash_idx").on(table.presentationTokenHash),
    uniqueIndex("alpha_invites_slug_idx").on(table.slug),
    index("alpha_invites_status_expires_idx").on(table.status, table.expiresAt),
    check("alpha_invites_label_length_check", sql`char_length(${table.label}) between 1 and 120`),
    check("alpha_invites_token_hash_check", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "alpha_invites_presentation_token_hash_check",
      sql`${table.presentationTokenHash} is null or ${table.presentationTokenHash} ~ '^[0-9a-f]{64}$'`
    ),
    check("alpha_invites_profile_limit_check", sql`${table.profileLimit} >= 0`),
    check("alpha_invites_lens_limit_check", sql`${table.lensLimit} >= 0`),
    check("alpha_invites_max_installations_check", sql`${table.maxInstallations} > 0`),
    check(
      "alpha_invites_lifecycle_check",
      sql`(${table.status} = 'pending' and ${table.acceptedAt} is null and ${table.revokedAt} is null)
        or (${table.status} = 'active' and ${table.acceptedAt} is not null and ${table.revokedAt} is null)
        or (${table.status} = 'revoked' and ${table.revokedAt} is not null)`
    )
  ]
);

export const alphaInstallations = pgTable(
  "alpha_installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviteId: uuid("invite_id")
      .references(() => alphaInvites.id, { onDelete: "cascade" })
      .notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    browser: alphaBrowserEnum("browser").notNull(),
    channel: alphaInstallChannelEnum("channel").notNull(),
    extensionVersion: text("extension_version").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("alpha_installations_token_hash_idx").on(table.accessTokenHash),
    index("alpha_installations_invite_last_seen_idx").on(table.inviteId, table.lastSeenAt),
    index("alpha_installations_active_invite_idx")
      .on(table.inviteId)
      .where(sql`${table.revokedAt} is null`),
    check("alpha_installations_token_hash_check", sql`${table.accessTokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "alpha_installations_version_length_check",
      sql`char_length(${table.extensionVersion}) between 1 and 40`
    )
  ]
);

export const alphaAllowances = pgTable(
  "alpha_allowances",
  {
    inviteId: uuid("invite_id")
      .primaryKey()
      .references(() => alphaInvites.id, { onDelete: "cascade" }),
    profileLimit: integer("profile_limit").notNull(),
    profileReserved: integer("profile_reserved").default(0).notNull(),
    profileUsed: integer("profile_used").default(0).notNull(),
    lensLimit: integer("lens_limit").notNull(),
    lensReserved: integer("lens_reserved").default(0).notNull(),
    lensUsed: integer("lens_used").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    check(
      "alpha_allowances_profile_check",
      sql`${table.profileLimit} >= 0
        and ${table.profileReserved} >= 0
        and ${table.profileUsed} >= 0
        and ${table.profileReserved} + ${table.profileUsed} <= ${table.profileLimit}`
    ),
    check(
      "alpha_allowances_lens_check",
      sql`${table.lensLimit} >= 0
        and ${table.lensReserved} >= 0
        and ${table.lensUsed} >= 0
        and ${table.lensReserved} + ${table.lensUsed} <= ${table.lensLimit}`
    )
  ]
);

export const alphaRunRequests = pgTable(
  "alpha_run_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviteId: uuid("invite_id")
      .references(() => alphaInvites.id, { onDelete: "cascade" })
      .notNull(),
    installationId: uuid("installation_id")
      .references(() => alphaInstallations.id, { onDelete: "cascade" })
      .notNull(),
    interactionId: uuid("interaction_id").notNull(),
    allowanceKind: alphaAllowanceKindEnum("allowance_kind").notNull(),
    slug: text("slug").notNull(),
    domain: text("domain").notNull(),
    disposition: alphaRunDispositionEnum("disposition").notNull(),
    dispositionReason: text("disposition_reason"),
    generationRunId: uuid("generation_run_id").references(() => generationRuns.id, { onDelete: "set null" }),
    outcome: alphaRunOutcomeEnum("outcome"),
    failureCode: text("failure_code"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("alpha_run_requests_interaction_idx").on(table.interactionId),
    uniqueIndex("alpha_run_requests_started_run_idx")
      .on(table.generationRunId)
      .where(sql`${table.disposition} = 'started'`),
    index("alpha_run_requests_invite_created_idx").on(table.inviteId, table.createdAt),
    index("alpha_run_requests_run_idx").on(table.generationRunId),
    check("alpha_run_requests_slug_length_check", sql`char_length(${table.slug}) between 1 and 120`),
    check("alpha_run_requests_domain_length_check", sql`char_length(${table.domain}) between 1 and 253`),
    check(
      "alpha_run_requests_generation_check",
      sql`(${table.disposition} in ('started', 'joined') and ${table.generationRunId} is not null)
        or (${table.disposition} not in ('started', 'joined') and ${table.generationRunId} is null)`
    ),
    check(
      "alpha_run_requests_settlement_check",
      sql`(${table.outcome} is null and ${table.settledAt} is null)
        or (${table.outcome} is not null and ${table.settledAt} is not null)`
    )
  ]
);

export const alphaAllowanceLedger = pgTable(
  "alpha_allowance_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviteId: uuid("invite_id")
      .references(() => alphaInvites.id, { onDelete: "cascade" })
      .notNull(),
    runRequestId: uuid("run_request_id")
      .references(() => alphaRunRequests.id, { onDelete: "cascade" })
      .notNull(),
    allowanceKind: alphaAllowanceKindEnum("allowance_kind").notNull(),
    entryKind: alphaLedgerEntryKindEnum("entry_kind").notNull(),
    amount: integer("amount").notNull(),
    refundOfLedgerId: uuid("refund_of_ledger_id").references(
      (): AnyPgColumn => alphaAllowanceLedger.id,
      { onDelete: "cascade" }
    ),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("alpha_allowance_ledger_debit_idx")
      .on(table.runRequestId)
      .where(sql`${table.entryKind} = 'debit'`),
    uniqueIndex("alpha_allowance_ledger_refund_idx")
      .on(table.refundOfLedgerId)
      .where(sql`${table.entryKind} = 'refund'`),
    index("alpha_allowance_ledger_invite_created_idx").on(table.inviteId, table.createdAt),
    check(
      "alpha_allowance_ledger_amount_check",
      sql`(${table.entryKind} = 'debit' and ${table.amount} = 1)
        or (${table.entryKind} = 'refund' and ${table.amount} = -1)`
    ),
    check(
      "alpha_allowance_ledger_refund_reference_check",
      sql`(${table.entryKind} = 'debit' and ${table.refundOfLedgerId} is null)
        or (${table.entryKind} = 'refund' and ${table.refundOfLedgerId} is not null)`
    )
  ]
);

// Source-scoped quota ledger for unauthenticated invite inspect and redeem attempts.
export const alphaInviteAttempts = pgTable(
  "alpha_invite_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceHash: text("source_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("alpha_invite_attempts_source_created_idx").on(table.sourceHash, table.createdAt),
    check(
      "alpha_invite_attempts_source_hash_check",
      sql`${table.sourceHash} is null or ${table.sourceHash} ~ '^[0-9a-f]{64}$'`
    )
  ]
);

export const alphaEvents = pgTable(
  "alpha_events",
  {
    eventId: uuid("event_id").primaryKey(),
    inviteId: uuid("invite_id")
      .references(() => alphaInvites.id, { onDelete: "cascade" })
      .notNull(),
    installationId: uuid("installation_id")
      .references(() => alphaInstallations.id, { onDelete: "cascade" })
      .notNull(),
    eventName: text("event_name").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    sessionId: uuid("session_id").notNull(),
    sequence: integer("sequence").notNull(),
    interactionId: uuid("interaction_id"),
    extensionVersion: text("extension_version").notNull(),
    browser: alphaBrowserEnum("browser").notNull(),
    installChannel: alphaInstallChannelEnum("install_channel").notNull(),
    surface: text("surface").notNull(),
    theme: alphaThemeEnum("theme").notNull(),
    reducedMotion: boolean("reduced_motion").notNull(),
    online: boolean("online").notNull(),
    propertiesJson: jsonb("properties_json").notNull()
  },
  (table) => [
    index("alpha_events_invite_received_idx").on(table.inviteId, table.receivedAt),
    index("alpha_events_installation_session_idx").on(table.installationId, table.sessionId, table.sequence),
    index("alpha_events_name_received_idx").on(table.eventName, table.receivedAt),
    check("alpha_events_name_length_check", sql`char_length(${table.eventName}) between 1 and 80`),
    check("alpha_events_schema_version_check", sql`${table.schemaVersion} > 0`),
    check("alpha_events_sequence_check", sql`${table.sequence} >= 0`),
    check(
      "alpha_events_extension_version_length_check",
      sql`char_length(${table.extensionVersion}) between 1 and 40`
    ),
    check("alpha_events_surface_length_check", sql`char_length(${table.surface}) between 1 and 64`),
    check("alpha_events_properties_object_check", sql`jsonb_typeof(${table.propertiesJson}) = 'object'`),
    check(
      "alpha_events_properties_size_check",
      sql`octet_length(${table.propertiesJson}::text) <= 4096`
    )
  ]
);

// Landing-page "ask for access" submissions. ipHash and email are quota keys, not identity.
export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    note: text("note").notNull(),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    handledAt: timestamp("handled_at", { withTimezone: true })
  },
  (table) => [
    index("access_requests_ip_hash_created_idx").on(table.ipHash, table.createdAt),
    index("access_requests_email_created_idx").on(table.email, table.createdAt),
    index("access_requests_handled_at_idx").on(table.handledAt)
  ]
);
