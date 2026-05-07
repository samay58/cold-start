CREATE TYPE "public"."generation_mode" AS ENUM('basics', 'analysis');--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "mode" "generation_mode" DEFAULT 'analysis' NOT NULL;--> statement-breakpoint
CREATE INDEX "generation_runs_slug_mode_started_idx" ON "generation_runs" USING btree ("slug","mode","started_at");
