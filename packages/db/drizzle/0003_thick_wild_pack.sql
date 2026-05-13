ALTER TABLE "generation_runs" ADD COLUMN "job_kind" text DEFAULT 'analysis' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "trace_json" jsonb;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "inngest_event_id" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "inngest_run_id" text;--> statement-breakpoint
CREATE INDEX "generation_runs_job_kind_started_idx" ON "generation_runs" USING btree ("job_kind","started_at");