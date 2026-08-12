CREATE TABLE "card_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"edition" integer NOT NULL,
	"card_json" jsonb NOT NULL,
	"superseded_by_run_id" uuid,
	"filed_at" timestamp with time zone NOT NULL,
	"frozen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"had_synthesis" boolean NOT NULL,
	"app_schema_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_revisions" ADD CONSTRAINT "card_revisions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_revisions_slug_edition_idx" ON "card_revisions" USING btree ("slug","edition");--> statement-breakpoint
CREATE INDEX "card_revisions_slug_idx" ON "card_revisions" USING btree ("slug");