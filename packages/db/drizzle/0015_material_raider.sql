CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"note" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "access_requests_ip_hash_created_idx" ON "access_requests" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "access_requests_email_created_idx" ON "access_requests" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "access_requests_handled_at_idx" ON "access_requests" USING btree ("handled_at");