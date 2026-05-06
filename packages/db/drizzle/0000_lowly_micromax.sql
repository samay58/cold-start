CREATE TYPE "public"."cache_status" AS ENUM('hit', 'partial', 'miss');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('verified', 'mixed', 'inferred', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."claim_visibility" AS ENUM('public', 'gated');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('queued', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('company_site', 'news', 'filing', 'enrichment', 'github', 'rdap', 'other');--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"domain" text NOT NULL,
	"card_json" jsonb NOT NULL,
	"public_card_json" jsonb NOT NULL,
	"cache_status" "cache_status" NOT NULL,
	"generation_cost_usd" numeric(10, 4) NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"identity_expires_at" timestamp with time zone NOT NULL,
	"signals_expires_at" timestamp with time zone NOT NULL,
	"synthesis_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"citation_key" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"snippet" text,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"path" text NOT NULL,
	"visibility" "claim_visibility" NOT NULL,
	"status" "claim_status" NOT NULL,
	"confidence" text NOT NULL,
	"value_json" jsonb,
	"citation_keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"domain" text NOT NULL,
	"status" "generation_status" NOT NULL,
	"error" text,
	"cost_usd" numeric(10, 4),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"raw_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cards_slug_idx" ON "cards" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_domain_idx" ON "cards" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "citations_card_key_idx" ON "citations" USING btree ("card_id","citation_key");--> statement-breakpoint
CREATE INDEX "claims_card_path_idx" ON "claims" USING btree ("card_id","path");--> statement-breakpoint
CREATE INDEX "generation_runs_slug_started_idx" ON "generation_runs" USING btree ("slug","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_card_url_idx" ON "sources" USING btree ("card_id","url");