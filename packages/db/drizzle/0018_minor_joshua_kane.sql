CREATE TABLE "how_it_wins_judgments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_packet_hash" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"vocabulary_hash" text NOT NULL,
	"slug" text NOT NULL,
	"model" text NOT NULL,
	"judgment_json" jsonb NOT NULL,
	"estimated_cost_usd" numeric(10, 4),
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "how_it_wins_judgments_inputs_idx" ON "how_it_wins_judgments" USING btree ("evidence_packet_hash","prompt_hash","vocabulary_hash");--> statement-breakpoint
CREATE INDEX "how_it_wins_judgments_slug_idx" ON "how_it_wins_judgments" USING btree ("slug");