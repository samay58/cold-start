CREATE TYPE "public"."alpha_allowance_kind" AS ENUM('profile', 'lens');--> statement-breakpoint
CREATE TYPE "public"."alpha_browser" AS ENUM('chrome', 'firefox');--> statement-breakpoint
CREATE TYPE "public"."alpha_install_channel" AS ENUM('unlisted', 'unpacked', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."alpha_invite_status" AS ENUM('pending', 'active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."alpha_ledger_entry_kind" AS ENUM('debit', 'refund');--> statement-breakpoint
CREATE TYPE "public"."alpha_run_disposition" AS ENUM('started', 'joined', 'cached', 'withheld', 'blocked', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."alpha_run_outcome" AS ENUM('complete', 'withheld', 'failed', 'watchdog_retired');--> statement-breakpoint
CREATE TYPE "public"."alpha_theme" AS ENUM('light', 'dark');--> statement-breakpoint
CREATE TABLE "alpha_allowance_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_id" uuid NOT NULL,
	"run_request_id" uuid NOT NULL,
	"allowance_kind" "alpha_allowance_kind" NOT NULL,
	"entry_kind" "alpha_ledger_entry_kind" NOT NULL,
	"amount" integer NOT NULL,
	"refund_of_ledger_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alpha_allowance_ledger_amount_check" CHECK (("alpha_allowance_ledger"."entry_kind" = 'debit' and "alpha_allowance_ledger"."amount" = 1)
        or ("alpha_allowance_ledger"."entry_kind" = 'refund' and "alpha_allowance_ledger"."amount" = -1)),
	CONSTRAINT "alpha_allowance_ledger_refund_reference_check" CHECK (("alpha_allowance_ledger"."entry_kind" = 'debit' and "alpha_allowance_ledger"."refund_of_ledger_id" is null)
        or ("alpha_allowance_ledger"."entry_kind" = 'refund' and "alpha_allowance_ledger"."refund_of_ledger_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "alpha_allowances" (
	"invite_id" uuid PRIMARY KEY NOT NULL,
	"profile_limit" integer NOT NULL,
	"profile_reserved" integer DEFAULT 0 NOT NULL,
	"profile_used" integer DEFAULT 0 NOT NULL,
	"lens_limit" integer NOT NULL,
	"lens_reserved" integer DEFAULT 0 NOT NULL,
	"lens_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alpha_allowances_profile_check" CHECK ("alpha_allowances"."profile_limit" >= 0
        and "alpha_allowances"."profile_reserved" >= 0
        and "alpha_allowances"."profile_used" >= 0
        and "alpha_allowances"."profile_reserved" + "alpha_allowances"."profile_used" <= "alpha_allowances"."profile_limit"),
	CONSTRAINT "alpha_allowances_lens_check" CHECK ("alpha_allowances"."lens_limit" >= 0
        and "alpha_allowances"."lens_reserved" >= 0
        and "alpha_allowances"."lens_used" >= 0
        and "alpha_allowances"."lens_reserved" + "alpha_allowances"."lens_used" <= "alpha_allowances"."lens_limit")
);
--> statement-breakpoint
CREATE TABLE "alpha_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"invite_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"schema_version" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"interaction_id" uuid,
	"extension_version" text NOT NULL,
	"browser" "alpha_browser" NOT NULL,
	"install_channel" "alpha_install_channel" NOT NULL,
	"surface" text NOT NULL,
	"theme" "alpha_theme" NOT NULL,
	"reduced_motion" boolean NOT NULL,
	"online" boolean NOT NULL,
	"properties_json" jsonb NOT NULL,
	CONSTRAINT "alpha_events_name_length_check" CHECK (char_length("alpha_events"."event_name") between 1 and 80),
	CONSTRAINT "alpha_events_schema_version_check" CHECK ("alpha_events"."schema_version" > 0),
	CONSTRAINT "alpha_events_sequence_check" CHECK ("alpha_events"."sequence" >= 0),
	CONSTRAINT "alpha_events_extension_version_length_check" CHECK (char_length("alpha_events"."extension_version") between 1 and 40),
	CONSTRAINT "alpha_events_surface_length_check" CHECK (char_length("alpha_events"."surface") between 1 and 64),
	CONSTRAINT "alpha_events_properties_object_check" CHECK (jsonb_typeof("alpha_events"."properties_json") = 'object'),
	CONSTRAINT "alpha_events_properties_size_check" CHECK (octet_length("alpha_events"."properties_json"::text) <= 4096)
);
--> statement-breakpoint
CREATE TABLE "alpha_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_id" uuid NOT NULL,
	"access_token_hash" text NOT NULL,
	"browser" "alpha_browser" NOT NULL,
	"channel" "alpha_install_channel" NOT NULL,
	"extension_version" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alpha_installations_token_hash_check" CHECK ("alpha_installations"."access_token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "alpha_installations_version_length_check" CHECK (char_length("alpha_installations"."extension_version") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "alpha_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "alpha_invite_status" DEFAULT 'pending' NOT NULL,
	"scopes" text[] NOT NULL,
	"profile_limit" integer NOT NULL,
	"lens_limit" integer NOT NULL,
	"max_installations" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alpha_invites_label_length_check" CHECK (char_length("alpha_invites"."label") between 1 and 120),
	CONSTRAINT "alpha_invites_token_hash_check" CHECK ("alpha_invites"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "alpha_invites_profile_limit_check" CHECK ("alpha_invites"."profile_limit" >= 0),
	CONSTRAINT "alpha_invites_lens_limit_check" CHECK ("alpha_invites"."lens_limit" >= 0),
	CONSTRAINT "alpha_invites_max_installations_check" CHECK ("alpha_invites"."max_installations" > 0),
	CONSTRAINT "alpha_invites_lifecycle_check" CHECK (("alpha_invites"."status" = 'pending' and "alpha_invites"."accepted_at" is null and "alpha_invites"."revoked_at" is null)
        or ("alpha_invites"."status" = 'active' and "alpha_invites"."accepted_at" is not null and "alpha_invites"."revoked_at" is null)
        or ("alpha_invites"."status" = 'revoked' and "alpha_invites"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "alpha_run_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"interaction_id" uuid NOT NULL,
	"allowance_kind" "alpha_allowance_kind" NOT NULL,
	"slug" text NOT NULL,
	"domain" text NOT NULL,
	"disposition" "alpha_run_disposition" NOT NULL,
	"disposition_reason" text,
	"generation_run_id" uuid,
	"outcome" "alpha_run_outcome",
	"failure_code" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alpha_run_requests_slug_length_check" CHECK (char_length("alpha_run_requests"."slug") between 1 and 120),
	CONSTRAINT "alpha_run_requests_domain_length_check" CHECK (char_length("alpha_run_requests"."domain") between 1 and 253),
	CONSTRAINT "alpha_run_requests_generation_check" CHECK (("alpha_run_requests"."disposition" in ('started', 'joined') and "alpha_run_requests"."generation_run_id" is not null)
        or ("alpha_run_requests"."disposition" not in ('started', 'joined') and "alpha_run_requests"."generation_run_id" is null)),
	CONSTRAINT "alpha_run_requests_settlement_check" CHECK (("alpha_run_requests"."outcome" is null and "alpha_run_requests"."settled_at" is null)
        or ("alpha_run_requests"."outcome" is not null and "alpha_run_requests"."settled_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "alpha_allowance_ledger" ADD CONSTRAINT "alpha_allowance_ledger_invite_id_alpha_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."alpha_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alpha_allowance_ledger" ADD CONSTRAINT "alpha_allowance_ledger_run_request_id_alpha_run_requests_id_fk" FOREIGN KEY ("run_request_id") REFERENCES "public"."alpha_run_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alpha_allowance_ledger" ADD CONSTRAINT "alpha_allowance_ledger_refund_of_ledger_id_alpha_allowance_ledger_id_fk" FOREIGN KEY ("refund_of_ledger_id") REFERENCES "public"."alpha_allowance_ledger"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alpha_allowances" ADD CONSTRAINT "alpha_allowances_invite_id_alpha_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."alpha_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alpha_events" ADD CONSTRAINT "alpha_events_invite_id_alpha_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."alpha_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alpha_events" ADD CONSTRAINT "alpha_events_installation_id_alpha_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."alpha_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alpha_installations" ADD CONSTRAINT "alpha_installations_invite_id_alpha_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."alpha_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alpha_run_requests" ADD CONSTRAINT "alpha_run_requests_invite_id_alpha_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."alpha_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alpha_run_requests" ADD CONSTRAINT "alpha_run_requests_installation_id_alpha_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."alpha_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alpha_run_requests" ADD CONSTRAINT "alpha_run_requests_generation_run_id_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alpha_allowance_ledger_debit_idx" ON "alpha_allowance_ledger" USING btree ("run_request_id") WHERE "alpha_allowance_ledger"."entry_kind" = 'debit';--> statement-breakpoint
CREATE UNIQUE INDEX "alpha_allowance_ledger_refund_idx" ON "alpha_allowance_ledger" USING btree ("refund_of_ledger_id") WHERE "alpha_allowance_ledger"."entry_kind" = 'refund';--> statement-breakpoint
CREATE INDEX "alpha_allowance_ledger_invite_created_idx" ON "alpha_allowance_ledger" USING btree ("invite_id","created_at");--> statement-breakpoint
CREATE INDEX "alpha_events_invite_received_idx" ON "alpha_events" USING btree ("invite_id","received_at");--> statement-breakpoint
CREATE INDEX "alpha_events_installation_session_idx" ON "alpha_events" USING btree ("installation_id","session_id","sequence");--> statement-breakpoint
CREATE INDEX "alpha_events_name_received_idx" ON "alpha_events" USING btree ("event_name","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alpha_installations_token_hash_idx" ON "alpha_installations" USING btree ("access_token_hash");--> statement-breakpoint
CREATE INDEX "alpha_installations_invite_last_seen_idx" ON "alpha_installations" USING btree ("invite_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "alpha_installations_active_invite_idx" ON "alpha_installations" USING btree ("invite_id") WHERE "alpha_installations"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "alpha_invites_token_hash_idx" ON "alpha_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "alpha_invites_status_expires_idx" ON "alpha_invites" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alpha_run_requests_interaction_idx" ON "alpha_run_requests" USING btree ("interaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alpha_run_requests_started_run_idx" ON "alpha_run_requests" USING btree ("generation_run_id") WHERE "alpha_run_requests"."disposition" = 'started';--> statement-breakpoint
CREATE INDEX "alpha_run_requests_invite_created_idx" ON "alpha_run_requests" USING btree ("invite_id","created_at");--> statement-breakpoint
CREATE INDEX "alpha_run_requests_run_idx" ON "alpha_run_requests" USING btree ("generation_run_id");--> statement-breakpoint
CREATE FUNCTION "protect_alpha_allowance_ledger"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' AND NOT EXISTS (
		SELECT 1 FROM "alpha_invites" WHERE "id" = OLD."invite_id"
	) THEN
		RETURN OLD;
	END IF;

	RAISE EXCEPTION 'alpha_allowance_ledger is immutable';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "alpha_allowance_ledger_immutable"
	BEFORE UPDATE OR DELETE ON "alpha_allowance_ledger"
	FOR EACH ROW EXECUTE FUNCTION "protect_alpha_allowance_ledger"();--> statement-breakpoint
CREATE FUNCTION "insert_alpha_event_batch"(
	p_invite_id uuid,
	p_installation_id uuid,
	p_events jsonb,
	p_received_at timestamp with time zone,
	p_event_limit integer
) RETURNS jsonb AS $$
DECLARE
	v_new_count integer;
	v_recent_count integer;
	v_acknowledged jsonb;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended(p_installation_id::text, 824));

	IF NOT EXISTS (
		SELECT 1
		FROM alpha_installations installation
		WHERE installation.id = p_installation_id
			AND installation.invite_id = p_invite_id
			AND installation.revoked_at IS NULL
	) THEN
		RETURN jsonb_build_object('status', 'inactive', 'acknowledged_event_ids', '[]'::jsonb);
	END IF;

	SELECT count(*)
	INTO v_recent_count
	FROM alpha_events event
	WHERE event.installation_id = p_installation_id
		AND event.received_at >= p_received_at - interval '1 minute';

	SELECT count(*)
	INTO v_new_count
	FROM jsonb_to_recordset(p_events) AS payload(event_id uuid)
	WHERE NOT EXISTS (
		SELECT 1 FROM alpha_events existing WHERE existing.event_id = payload.event_id
	);

	IF v_recent_count + v_new_count > p_event_limit THEN
		RETURN jsonb_build_object('status', 'throttled', 'acknowledged_event_ids', '[]'::jsonb);
	END IF;

	INSERT INTO alpha_events (
		event_id,
		invite_id,
		installation_id,
		event_name,
		schema_version,
		occurred_at,
		received_at,
		session_id,
		sequence,
		interaction_id,
		extension_version,
		browser,
		install_channel,
		surface,
		theme,
		reduced_motion,
		online,
		properties_json
	)
	SELECT
		payload.event_id,
		p_invite_id,
		p_installation_id,
		payload.event_name,
		payload.schema_version,
		payload.occurred_at,
		p_received_at,
		payload.session_id,
		payload.sequence,
		payload.interaction_id,
		payload.extension_version,
		payload.browser,
		payload.install_channel,
		payload.surface,
		payload.theme,
		payload.reduced_motion,
		payload.online,
		payload.properties_json
	FROM jsonb_to_recordset(p_events) AS payload(
		event_id uuid,
		event_name text,
		schema_version integer,
		occurred_at timestamp with time zone,
		session_id uuid,
		sequence integer,
		interaction_id uuid,
		extension_version text,
		browser alpha_browser,
		install_channel alpha_install_channel,
		surface text,
		theme alpha_theme,
		reduced_motion boolean,
		online boolean,
		properties_json jsonb
	)
	ON CONFLICT (event_id) DO NOTHING;

	SELECT coalesce(
		jsonb_agg((payload.value->>'event_id')::uuid ORDER BY payload.ordinality),
		'[]'::jsonb
	)
	INTO v_acknowledged
	FROM jsonb_array_elements(p_events) WITH ORDINALITY AS payload(value, ordinality)
	JOIN alpha_events event
		ON event.event_id = (payload.value->>'event_id')::uuid
		AND event.invite_id = p_invite_id
		AND event.installation_id = p_installation_id;

	RETURN jsonb_build_object('status', 'accepted', 'acknowledged_event_ids', v_acknowledged);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION "reserve_alpha_run_request"(
	p_invite_id uuid,
	p_installation_id uuid,
	p_interaction_id uuid,
	p_allowance_kind alpha_allowance_kind,
	p_slug text,
	p_domain text,
	p_job_kind text,
	p_now timestamp with time zone
) RETURNS jsonb AS $$
DECLARE
	v_existing alpha_run_requests%ROWTYPE;
	v_allowance alpha_allowances%ROWTYPE;
	v_request alpha_run_requests%ROWTYPE;
	v_run_id uuid;
	v_run_job_kind text;
	v_fresh boolean;
	v_mode generation_mode;
	v_rejection_reason text;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended(p_interaction_id::text, 821));
	PERFORM pg_advisory_xact_lock(hashtextextended(p_invite_id::text, 822));
	v_mode := CASE WHEN p_allowance_kind = 'profile' THEN 'basics'::generation_mode ELSE 'analysis'::generation_mode END;
	PERFORM pg_advisory_xact_lock(hashtextextended(p_slug || ':' || v_mode::text, 823));

	SELECT request.*
	INTO v_existing
	FROM alpha_run_requests request
	WHERE request.interaction_id = p_interaction_id
	LIMIT 1;

	IF v_existing.id IS NOT NULL THEN
		IF v_existing.invite_id <> p_invite_id OR v_existing.installation_id <> p_installation_id THEN
			RETURN NULL;
		END IF;

		-- This interaction already owns a request row, so the caller is replaying an earlier
		-- click. 'replayed' tells it never to start a second execution against the row.
		RETURN to_jsonb(v_existing) || jsonb_build_object(
			'debited',
			EXISTS (
				SELECT 1
				FROM alpha_allowance_ledger ledger
				WHERE ledger.run_request_id = v_existing.id AND ledger.entry_kind = 'debit'
			),
			'replayed', true
		);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM alpha_invites invite
		JOIN alpha_installations installation
			ON installation.id = p_installation_id
			AND installation.invite_id = invite.id
		WHERE invite.id = p_invite_id
			AND invite.status = 'active'
			AND invite.expires_at > p_now
			AND installation.revoked_at IS NULL
	) THEN
		INSERT INTO alpha_run_requests (
			invite_id,
			installation_id,
			interaction_id,
			allowance_kind,
			slug,
			domain,
			disposition,
			disposition_reason,
			created_at
		) VALUES (
			p_invite_id,
			p_installation_id,
			p_interaction_id,
			p_allowance_kind,
			p_slug,
			p_domain,
			'rejected',
			'access_inactive',
			p_now
		) RETURNING * INTO v_request;

		RETURN to_jsonb(v_request) || jsonb_build_object('debited', false);
	END IF;

	SELECT run.id, run.job_kind
	INTO v_run_id, v_run_job_kind
	FROM generation_runs run
	WHERE run.slug = p_slug
		AND run.mode = v_mode
		AND run.status IN ('queued', 'running')
	ORDER BY run.started_at DESC
	LIMIT 1;

	IF v_run_id IS NOT NULL THEN
		IF v_run_job_kind <> p_job_kind THEN
			INSERT INTO alpha_run_requests (
				invite_id,
				installation_id,
				interaction_id,
				allowance_kind,
				slug,
				domain,
				disposition,
				disposition_reason,
				created_at
			) VALUES (
				p_invite_id,
				p_installation_id,
				p_interaction_id,
				p_allowance_kind,
				p_slug,
				p_domain,
				'rejected',
				'generation_busy',
				p_now
			) RETURNING * INTO v_request;

			RETURN to_jsonb(v_request) || jsonb_build_object('debited', false);
		END IF;

		INSERT INTO alpha_run_requests (
			invite_id,
			installation_id,
			interaction_id,
			allowance_kind,
			slug,
			domain,
			disposition,
			disposition_reason,
			generation_run_id,
			created_at
		) VALUES (
			p_invite_id,
			p_installation_id,
			p_interaction_id,
			p_allowance_kind,
			p_slug,
			p_domain,
			'joined',
			'active_run',
			v_run_id,
			p_now
		) RETURNING * INTO v_request;

		RETURN to_jsonb(v_request) || jsonb_build_object('debited', false);
	END IF;

	-- Only fresh work counts against the burst window. Counting every row would let a run of
	-- cached or withheld answers lock a tester out, and would let each rejection re-arm the
	-- window against itself.
	IF (
		SELECT count(*) >= 20
		FROM alpha_run_requests request
		WHERE request.invite_id = p_invite_id
			AND request.disposition = 'started'
			AND request.created_at >= p_now - interval '1 minute'
	) THEN
		v_rejection_reason := 'rate_limited';
	ELSIF (
		SELECT count(*) = 3
			AND bool_and(recent.outcome IN ('failed', 'watchdog_retired'))
		FROM (
			SELECT request.outcome
			FROM alpha_run_requests request
			WHERE request.invite_id = p_invite_id
				AND request.domain = p_domain
				AND request.disposition = 'started'
				AND request.outcome IS NOT NULL
			ORDER BY request.created_at DESC
			LIMIT 3
		) recent
	) THEN
		v_rejection_reason := 'domain_failure_breaker';
	ELSIF (
		SELECT count(*) >= 6
		FROM alpha_run_requests request
		WHERE request.invite_id = p_invite_id
			AND request.disposition = 'started'
			AND request.outcome IN ('failed', 'watchdog_retired')
			AND request.settled_at >= p_now - interval '1 day'
	) THEN
		v_rejection_reason := 'invite_failure_breaker';
	END IF;

	IF v_rejection_reason IS NOT NULL THEN
		INSERT INTO alpha_run_requests (
			invite_id,
			installation_id,
			interaction_id,
			allowance_kind,
			slug,
			domain,
			disposition,
			disposition_reason,
			created_at
		) VALUES (
			p_invite_id,
			p_installation_id,
			p_interaction_id,
			p_allowance_kind,
			p_slug,
			p_domain,
			'rejected',
			v_rejection_reason,
			p_now
		) RETURNING * INTO v_request;

		RETURN to_jsonb(v_request) || jsonb_build_object('debited', false);
	END IF;

	SELECT allowance.*
	INTO v_allowance
	FROM alpha_allowances allowance
	WHERE allowance.invite_id = p_invite_id
	FOR UPDATE;

	IF v_allowance.invite_id IS NULL OR (
		p_allowance_kind = 'profile'
		AND v_allowance.profile_reserved + v_allowance.profile_used >= v_allowance.profile_limit
	) OR (
		p_allowance_kind = 'lens'
		AND v_allowance.lens_reserved + v_allowance.lens_used >= v_allowance.lens_limit
	) THEN
		INSERT INTO alpha_run_requests (
			invite_id,
			installation_id,
			interaction_id,
			allowance_kind,
			slug,
			domain,
			disposition,
			disposition_reason,
			created_at
		) VALUES (
			p_invite_id,
			p_installation_id,
			p_interaction_id,
			p_allowance_kind,
			p_slug,
			p_domain,
			'rejected',
			'allowance_exhausted',
			p_now
		) RETURNING * INTO v_request;

		RETURN to_jsonb(v_request) || jsonb_build_object('debited', false);
	END IF;

	INSERT INTO generation_runs (
		slug,
		domain,
		mode,
		job_kind,
		status,
		started_at
	) VALUES (
		p_slug,
		p_domain,
		v_mode,
			p_job_kind,
		'queued',
		p_now
	)
	ON CONFLICT (slug, mode) WHERE status IN ('queued', 'running')
	DO UPDATE SET slug = excluded.slug
	RETURNING id, job_kind, (xmax = 0) INTO v_run_id, v_run_job_kind, v_fresh;

	IF NOT v_fresh THEN
		IF v_run_job_kind <> p_job_kind THEN
			INSERT INTO alpha_run_requests (
				invite_id,
				installation_id,
				interaction_id,
				allowance_kind,
				slug,
				domain,
				disposition,
				disposition_reason,
				created_at
			) VALUES (
				p_invite_id,
				p_installation_id,
				p_interaction_id,
				p_allowance_kind,
				p_slug,
				p_domain,
				'rejected',
				'generation_busy',
				p_now
			) RETURNING * INTO v_request;

			RETURN to_jsonb(v_request) || jsonb_build_object('debited', false);
		END IF;

		INSERT INTO alpha_run_requests (
			invite_id,
			installation_id,
			interaction_id,
			allowance_kind,
			slug,
			domain,
			disposition,
			disposition_reason,
			generation_run_id,
			created_at
		) VALUES (
			p_invite_id,
			p_installation_id,
			p_interaction_id,
			p_allowance_kind,
			p_slug,
			p_domain,
			'joined',
			'active_run',
			v_run_id,
			p_now
		) RETURNING * INTO v_request;

		RETURN to_jsonb(v_request) || jsonb_build_object('debited', false);
	END IF;

	UPDATE alpha_allowances allowance
	SET
		profile_reserved = CASE WHEN p_allowance_kind = 'profile'
			THEN allowance.profile_reserved + 1 ELSE allowance.profile_reserved END,
		lens_reserved = CASE WHEN p_allowance_kind = 'lens'
			THEN allowance.lens_reserved + 1 ELSE allowance.lens_reserved END,
		updated_at = p_now
	WHERE allowance.invite_id = p_invite_id;

	INSERT INTO alpha_run_requests (
		invite_id,
		installation_id,
		interaction_id,
		allowance_kind,
		slug,
		domain,
		disposition,
		generation_run_id,
		created_at
	) VALUES (
		p_invite_id,
		p_installation_id,
		p_interaction_id,
		p_allowance_kind,
		p_slug,
		p_domain,
		'started',
		v_run_id,
		p_now
	) RETURNING * INTO v_request;

	INSERT INTO alpha_allowance_ledger (
		invite_id,
		run_request_id,
		allowance_kind,
		entry_kind,
		amount,
		reason,
		created_at
	) VALUES (
		p_invite_id,
		v_request.id,
		p_allowance_kind,
		'debit',
		1,
		'fresh_work_started',
		p_now
	);

	RETURN to_jsonb(v_request) || jsonb_build_object('debited', true);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION "settle_alpha_run_request"(
	p_generation_run_id uuid,
	p_outcome alpha_run_outcome,
	p_failure_code text,
	p_cost_usd numeric,
	p_error text,
	p_settled_at timestamp with time zone
) RETURNS jsonb AS $$
DECLARE
	v_request alpha_run_requests%ROWTYPE;
	v_debit_id uuid;
	v_refunded boolean;
	v_is_refund boolean;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended(p_generation_run_id::text, 831));

	SELECT request.*
	INTO v_request
	FROM alpha_run_requests request
	WHERE request.generation_run_id = p_generation_run_id
		AND request.disposition = 'started'
	LIMIT 1;

	IF v_request.id IS NULL THEN
		RETURN NULL;
	END IF;

	SELECT debit.id
	INTO v_debit_id
	FROM alpha_allowance_ledger debit
	WHERE debit.run_request_id = v_request.id
		AND debit.entry_kind = 'debit'
	LIMIT 1;

	SELECT EXISTS (
		SELECT 1
		FROM alpha_allowance_ledger ledger
		WHERE ledger.refund_of_ledger_id = v_debit_id
	) INTO v_refunded;

	IF v_request.outcome IS NOT NULL THEN
		RETURN jsonb_build_object(
			'request_id', v_request.id,
			'generation_run_id', v_request.generation_run_id,
			'outcome', v_request.outcome,
			'failure_code', v_request.failure_code,
			'settled_at', v_request.settled_at,
			'refunded', v_refunded,
			'applied', false
		);
	END IF;

	PERFORM 1
	FROM alpha_allowances allowance
	WHERE allowance.invite_id = v_request.invite_id
	FOR UPDATE;

	v_is_refund := p_outcome IN ('failed', 'watchdog_retired');

	UPDATE alpha_allowances allowance
	SET
		profile_reserved = CASE WHEN v_request.allowance_kind = 'profile'
			THEN allowance.profile_reserved - 1 ELSE allowance.profile_reserved END,
		profile_used = CASE WHEN v_request.allowance_kind = 'profile' AND NOT v_is_refund
			THEN allowance.profile_used + 1 ELSE allowance.profile_used END,
		lens_reserved = CASE WHEN v_request.allowance_kind = 'lens'
			THEN allowance.lens_reserved - 1 ELSE allowance.lens_reserved END,
		lens_used = CASE WHEN v_request.allowance_kind = 'lens' AND NOT v_is_refund
			THEN allowance.lens_used + 1 ELSE allowance.lens_used END,
		updated_at = p_settled_at
	WHERE allowance.invite_id = v_request.invite_id
		AND (
			(v_request.allowance_kind = 'profile' AND allowance.profile_reserved > 0)
			OR (v_request.allowance_kind = 'lens' AND allowance.lens_reserved > 0)
		);

	IF NOT FOUND THEN
		RAISE EXCEPTION 'alpha allowance invariant failed for run %', p_generation_run_id;
	END IF;

	UPDATE alpha_run_requests request
	SET
		outcome = p_outcome,
		failure_code = p_failure_code,
		settled_at = p_settled_at
	WHERE request.id = v_request.id
	RETURNING * INTO v_request;

	IF v_is_refund THEN
		INSERT INTO alpha_allowance_ledger (
			invite_id,
			run_request_id,
			allowance_kind,
			entry_kind,
			amount,
			refund_of_ledger_id,
			reason,
			created_at
		) VALUES (
			v_request.invite_id,
			v_request.id,
			v_request.allowance_kind,
			'refund',
			-1,
			v_debit_id,
			p_outcome::text,
			p_settled_at
		)
		ON CONFLICT (refund_of_ledger_id) WHERE entry_kind = 'refund' DO NOTHING;
		v_refunded := true;
	END IF;

	UPDATE generation_runs run
	SET
		status = CASE WHEN v_is_refund THEN 'failed'::generation_status ELSE 'complete'::generation_status END,
		error = COALESCE(p_error, run.error),
		cost_usd = COALESCE(p_cost_usd, run.cost_usd),
		completed_at = COALESCE(run.completed_at, p_settled_at)
	WHERE run.id = p_generation_run_id;

	RETURN jsonb_build_object(
		'request_id', v_request.id,
		'generation_run_id', v_request.generation_run_id,
		'outcome', v_request.outcome,
		'failure_code', v_request.failure_code,
		'settled_at', v_request.settled_at,
		'refunded', v_refunded,
		'applied', true
	);
END;
$$ LANGUAGE plpgsql;
