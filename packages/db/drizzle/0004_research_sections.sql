CREATE TYPE "public"."research_section_visibility" AS ENUM('public', 'gated');--> statement-breakpoint
CREATE TYPE "public"."research_section_status" AS ENUM('not_started', 'running', 'available', 'empty', 'failed', 'stale');--> statement-breakpoint
CREATE TABLE "research_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"domain" text NOT NULL,
	"section_id" text NOT NULL,
	"visibility" "research_section_visibility" NOT NULL,
	"status" "research_section_status" NOT NULL,
	"content_json" jsonb,
	"citation_ids" jsonb NOT NULL,
	"source_ids" jsonb NOT NULL,
	"run_id" text,
	"error" text,
	"generated_at" timestamp with time zone,
	"stale_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "research_sections_slug_section_idx" ON "research_sections" USING btree ("slug","section_id");--> statement-breakpoint
CREATE INDEX "research_sections_slug_status_idx" ON "research_sections" USING btree ("slug","status");
