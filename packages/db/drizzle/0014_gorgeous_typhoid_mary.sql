CREATE TABLE "alpha_invite_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alpha_invites" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "alpha_invites" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "alpha_invites" ADD COLUMN "ordinal" integer;--> statement-breakpoint
ALTER TABLE "alpha_invites" ADD COLUMN "card_png_base64" text;--> statement-breakpoint
CREATE INDEX "alpha_invite_attempts_created_idx" ON "alpha_invite_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alpha_invites_slug_idx" ON "alpha_invites" USING btree ("slug");