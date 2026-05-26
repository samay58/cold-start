import {
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
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

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    domain: text("domain").notNull(),
    cardJson: jsonb("card_json").notNull(),
    publicCardJson: jsonb("public_card_json").notNull(),
    cacheStatus: cacheStatusEnum("cache_status").notNull(),
    generationCostUsd: numeric("generation_cost_usd", { precision: 10, scale: 4 }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    identityExpiresAt: timestamp("identity_expires_at", { withTimezone: true }).notNull(),
    signalsExpiresAt: timestamp("signals_expires_at", { withTimezone: true }).notNull(),
    synthesisExpiresAt: timestamp("synthesis_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("cards_slug_idx").on(table.slug),
    uniqueIndex("cards_domain_idx").on(table.domain)
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
    jobKind: text("job_kind").default("analysis").notNull(),
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
