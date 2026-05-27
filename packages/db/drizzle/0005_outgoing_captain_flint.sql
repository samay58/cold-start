CREATE TABLE "research_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"slug" text NOT NULL,
	"domain" text NOT NULL,
	"section_id" text,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "research_run_events_slug_created_idx" ON "research_run_events" USING btree ("slug","created_at");--> statement-breakpoint
CREATE INDEX "research_run_events_run_created_idx" ON "research_run_events" USING btree ("run_id","created_at");