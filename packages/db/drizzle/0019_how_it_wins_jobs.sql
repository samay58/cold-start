CREATE TYPE "public"."how_it_wins_job_outcome" AS ENUM('read', 'thin_file', 'nothing_stands_out');--> statement-breakpoint
CREATE TYPE "public"."how_it_wins_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled', 'superseded');--> statement-breakpoint
CREATE TABLE "how_it_wins_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"root_job_id" uuid NOT NULL,
	"retry_of_job_id" uuid,
	"source_analysis_run_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"evidence_hash" text NOT NULL,
	"evaluator_signature" text NOT NULL,
	"execution_contract_version" integer NOT NULL,
	"inngest_event_id" text NOT NULL,
	"inngest_run_id" text,
	"dispatch_attempts" integer DEFAULT 0 NOT NULL,
	"dispatch_last_attempt_at" timestamp with time zone,
	"dispatch_confirmed_at" timestamp with time zone,
	"status" "how_it_wins_job_status" DEFAULT 'queued' NOT NULL,
	"current_stage" text DEFAULT 'queued' NOT NULL,
	"terminal_reason_code" text,
	"outcome" "how_it_wins_job_outcome",
	"judgment_id" uuid,
	"retry_eligible" boolean DEFAULT false NOT NULL,
	"manual_retry_used" boolean DEFAULT false NOT NULL,
	"configured_cap_microdollars" bigint NOT NULL,
	"reserved_microdollars" bigint DEFAULT 0 NOT NULL,
	"settled_microdollars" bigint DEFAULT 0 NOT NULL,
	"attempts_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checkpoints_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recovery_payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recovery_payload_expires_at" timestamp with time zone,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"version" bigint DEFAULT 0 NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "how_it_wins_jobs_slug_length_check" CHECK (char_length("how_it_wins_jobs"."slug") between 1 and 120),
	CONSTRAINT "how_it_wins_jobs_evidence_hash_check" CHECK ("how_it_wins_jobs"."evidence_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "how_it_wins_jobs_evaluator_length_check" CHECK (char_length("how_it_wins_jobs"."evaluator_signature") between 1 and 512),
	CONSTRAINT "how_it_wins_jobs_contract_version_check" CHECK ("how_it_wins_jobs"."execution_contract_version" > 0),
	CONSTRAINT "how_it_wins_jobs_dispatch_attempts_check" CHECK ("how_it_wins_jobs"."dispatch_attempts" between 0 and 3),
	CONSTRAINT "how_it_wins_jobs_budget_check" CHECK ("how_it_wins_jobs"."configured_cap_microdollars" > 0
        and "how_it_wins_jobs"."reserved_microdollars" >= 0
        and "how_it_wins_jobs"."settled_microdollars" >= 0
        and "how_it_wins_jobs"."reserved_microdollars" + "how_it_wins_jobs"."settled_microdollars" <= "how_it_wins_jobs"."configured_cap_microdollars"),
	CONSTRAINT "how_it_wins_jobs_attempts_array_check" CHECK (jsonb_typeof("how_it_wins_jobs"."attempts_json") = 'array'),
	CONSTRAINT "how_it_wins_jobs_attempts_size_check" CHECK (octet_length("how_it_wins_jobs"."attempts_json"::text) <= 131072),
	CONSTRAINT "how_it_wins_jobs_checkpoints_object_check" CHECK (jsonb_typeof("how_it_wins_jobs"."checkpoints_json") = 'object'),
	CONSTRAINT "how_it_wins_jobs_checkpoints_size_check" CHECK (octet_length("how_it_wins_jobs"."checkpoints_json"::text) <= 524288),
	CONSTRAINT "how_it_wins_jobs_recovery_object_check" CHECK (jsonb_typeof("how_it_wins_jobs"."recovery_payload_json") = 'object'),
	CONSTRAINT "how_it_wins_jobs_recovery_size_check" CHECK (octet_length("how_it_wins_jobs"."recovery_payload_json"::text) <= 524288),
	CONSTRAINT "how_it_wins_jobs_recovery_expiry_check" CHECK (("how_it_wins_jobs"."recovery_payload_json" = '{}'::jsonb and "how_it_wins_jobs"."recovery_payload_expires_at" is null)
        or ("how_it_wins_jobs"."recovery_payload_json" <> '{}'::jsonb and "how_it_wins_jobs"."recovery_payload_expires_at" is not null)),
	CONSTRAINT "how_it_wins_jobs_lease_check" CHECK (("how_it_wins_jobs"."lease_owner" is null and "how_it_wins_jobs"."lease_expires_at" is null)
        or ("how_it_wins_jobs"."lease_owner" is not null and "how_it_wins_jobs"."lease_expires_at" is not null)),
	CONSTRAINT "how_it_wins_jobs_terminal_check" CHECK (("how_it_wins_jobs"."status" in ('queued', 'running') and "how_it_wins_jobs"."completed_at" is null and "how_it_wins_jobs"."terminal_reason_code" is null and "how_it_wins_jobs"."outcome" is null)
        or ("how_it_wins_jobs"."status" = 'succeeded' and "how_it_wins_jobs"."completed_at" is not null and "how_it_wins_jobs"."terminal_reason_code" is null and "how_it_wins_jobs"."outcome" is not null)
        or ("how_it_wins_jobs"."status" in ('failed', 'cancelled', 'superseded') and "how_it_wins_jobs"."completed_at" is not null and "how_it_wins_jobs"."terminal_reason_code" is not null and "how_it_wins_jobs"."outcome" is null)),
	CONSTRAINT "how_it_wins_jobs_root_retry_check" CHECK (("how_it_wins_jobs"."retry_of_job_id" is null and "how_it_wins_jobs"."root_job_id" = "how_it_wins_jobs"."id")
        or ("how_it_wins_jobs"."retry_of_job_id" is not null and "how_it_wins_jobs"."root_job_id" <> "how_it_wins_jobs"."id"))
);
--> statement-breakpoint
ALTER TABLE "how_it_wins_jobs" ADD CONSTRAINT "how_it_wins_jobs_root_job_id_how_it_wins_jobs_id_fk" FOREIGN KEY ("root_job_id") REFERENCES "public"."how_it_wins_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "how_it_wins_jobs" ADD CONSTRAINT "how_it_wins_jobs_retry_of_job_id_how_it_wins_jobs_id_fk" FOREIGN KEY ("retry_of_job_id") REFERENCES "public"."how_it_wins_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "how_it_wins_jobs" ADD CONSTRAINT "how_it_wins_jobs_source_analysis_run_id_generation_runs_id_fk" FOREIGN KEY ("source_analysis_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "how_it_wins_jobs" ADD CONSTRAINT "how_it_wins_jobs_judgment_id_how_it_wins_judgments_id_fk" FOREIGN KEY ("judgment_id") REFERENCES "public"."how_it_wins_judgments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "how_it_wins_jobs_active_inputs_idx" ON "how_it_wins_jobs" USING btree ("slug","evidence_hash","evaluator_signature") WHERE "how_it_wins_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "how_it_wins_jobs_source_inputs_idx" ON "how_it_wins_jobs" USING btree ("source_analysis_run_id","evidence_hash","evaluator_signature") WHERE "how_it_wins_jobs"."retry_of_job_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "how_it_wins_jobs_retry_of_idx" ON "how_it_wins_jobs" USING btree ("retry_of_job_id") WHERE "how_it_wins_jobs"."retry_of_job_id" is not null;--> statement-breakpoint
CREATE INDEX "how_it_wins_jobs_slug_created_idx" ON "how_it_wins_jobs" USING btree ("slug","created_at");--> statement-breakpoint
CREATE INDEX "how_it_wins_jobs_root_idx" ON "how_it_wins_jobs" USING btree ("root_job_id");--> statement-breakpoint
CREATE INDEX "how_it_wins_jobs_deadline_idx" ON "how_it_wins_jobs" USING btree ("deadline_at") WHERE "how_it_wins_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE FUNCTION "admit_how_it_wins_job"(
	p_id uuid,
	p_source_analysis_run_id uuid,
	p_slug text,
	p_evidence_hash text,
	p_evaluator_signature text,
	p_execution_contract_version integer,
	p_inngest_event_id text,
	p_cap_microdollars bigint,
	p_deadline_at timestamp with time zone,
	p_now timestamp with time zone
) RETURNS jsonb AS $$
DECLARE
	v_job how_it_wins_jobs%ROWTYPE;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM generation_runs
		WHERE id = p_source_analysis_run_id
			AND slug = p_slug
			AND mode = 'analysis'
			AND job_kind = 'analysis'
			AND status = 'complete'
	) THEN
		RAISE EXCEPTION 'source analysis run is not a completed analysis for this company';
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(
		p_source_analysis_run_id::text || ':' || p_evidence_hash || ':' || p_evaluator_signature,
		818
	));
	PERFORM pg_advisory_xact_lock(hashtextextended(
		p_slug || ':' || p_evidence_hash || ':' || p_evaluator_signature,
		819
	));

	SELECT * INTO v_job
	FROM how_it_wins_jobs
	WHERE source_analysis_run_id = p_source_analysis_run_id
		AND evidence_hash = p_evidence_hash
		AND evaluator_signature = p_evaluator_signature
		AND retry_of_job_id IS NULL
	LIMIT 1;

	IF FOUND THEN
		RETURN jsonb_build_object('state', 'joined', 'id', v_job.id);
	END IF;

	SELECT * INTO v_job
	FROM how_it_wins_jobs
	WHERE slug = p_slug
		AND evidence_hash = p_evidence_hash
		AND evaluator_signature = p_evaluator_signature
		AND status IN ('queued', 'running')
	ORDER BY created_at DESC
	LIMIT 1;

	IF FOUND THEN
		RETURN jsonb_build_object('state', 'joined', 'id', v_job.id);
	END IF;

	INSERT INTO how_it_wins_jobs (
		id, root_job_id, source_analysis_run_id, slug, evidence_hash,
		evaluator_signature, execution_contract_version, inngest_event_id,
		configured_cap_microdollars, deadline_at, created_at, updated_at
	) VALUES (
		p_id, p_id, p_source_analysis_run_id, p_slug, p_evidence_hash,
		p_evaluator_signature, p_execution_contract_version, p_inngest_event_id,
		p_cap_microdollars, p_deadline_at, p_now, p_now
	) RETURNING * INTO v_job;

	RETURN jsonb_build_object('state', 'admitted', 'id', v_job.id);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;--> statement-breakpoint
CREATE FUNCTION "admit_how_it_wins_retry"(
	p_id uuid,
	p_failed_job_id uuid,
	p_source_analysis_run_id uuid,
	p_slug text,
	p_evidence_hash text,
	p_evaluator_signature text,
	p_execution_contract_version integer,
	p_inngest_event_id text,
	p_deadline_at timestamp with time zone,
	p_now timestamp with time zone
) RETURNS jsonb AS $$
DECLARE
	v_target how_it_wins_jobs%ROWTYPE;
	v_root how_it_wins_jobs%ROWTYPE;
	v_existing how_it_wins_jobs%ROWTYPE;
BEGIN
	SELECT * INTO v_target FROM how_it_wins_jobs WHERE id = p_failed_job_id;
	IF NOT FOUND THEN
		RETURN jsonb_build_object('state', 'not_found');
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(v_target.root_job_id::text, 820));
	SELECT * INTO v_root FROM how_it_wins_jobs WHERE id = v_target.root_job_id FOR UPDATE;
	SELECT * INTO v_target FROM how_it_wins_jobs WHERE id = p_failed_job_id FOR UPDATE;

	SELECT * INTO v_existing
	FROM how_it_wins_jobs
	WHERE retry_of_job_id = p_failed_job_id
	LIMIT 1;
	IF FOUND THEN
		RETURN jsonb_build_object('state', 'joined', 'id', v_existing.id);
	END IF;

	IF v_target.status <> 'failed' OR NOT v_target.retry_eligible THEN
		RETURN jsonb_build_object('state', 'not_retryable', 'id', v_target.id);
	END IF;
	IF v_root.manual_retry_used THEN
		RETURN jsonb_build_object('state', 'retry_exhausted', 'id', v_target.id);
	END IF;
	IF v_target.slug <> p_slug
		OR v_target.evidence_hash <> p_evidence_hash
		OR v_target.evaluator_signature <> p_evaluator_signature
		OR v_target.source_analysis_run_id <> p_source_analysis_run_id
		OR v_target.execution_contract_version <> p_execution_contract_version THEN
		RETURN jsonb_build_object('state', 'identity_mismatch', 'id', v_target.id);
	END IF;

	IF EXISTS (
		SELECT 1 FROM how_it_wins_jobs
		WHERE slug = p_slug
			AND evidence_hash = p_evidence_hash
			AND evaluator_signature = p_evaluator_signature
			AND status IN ('queued', 'running')
	) THEN
		RETURN jsonb_build_object('state', 'active_conflict', 'id', v_target.id);
	END IF;

	UPDATE how_it_wins_jobs
	SET manual_retry_used = true, retry_eligible = false, version = version + 1, updated_at = p_now
	WHERE id = v_root.id;

	INSERT INTO how_it_wins_jobs (
		id, root_job_id, retry_of_job_id, source_analysis_run_id, slug,
		evidence_hash, evaluator_signature, execution_contract_version,
		inngest_event_id, configured_cap_microdollars, checkpoints_json,
		deadline_at, created_at, updated_at
	) VALUES (
		p_id, v_root.id, v_target.id, p_source_analysis_run_id, p_slug,
		p_evidence_hash, p_evaluator_signature, p_execution_contract_version,
		p_inngest_event_id, v_root.configured_cap_microdollars,
		v_target.checkpoints_json, p_deadline_at, p_now, p_now
	);

	RETURN jsonb_build_object('state', 'admitted', 'id', p_id);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;--> statement-breakpoint
CREATE FUNCTION "claim_how_it_wins_job"(
	p_job_id uuid,
	p_lease_owner text,
	p_lease_seconds integer,
	p_stage text,
	p_inngest_run_id text,
	p_now timestamp with time zone
) RETURNS jsonb AS $$
DECLARE
	v_job how_it_wins_jobs%ROWTYPE;
BEGIN
	UPDATE how_it_wins_jobs
	SET status = 'running',
		current_stage = p_stage,
		inngest_run_id = coalesce(p_inngest_run_id, inngest_run_id),
		dispatch_confirmed_at = coalesce(dispatch_confirmed_at, p_now),
		lease_owner = p_lease_owner,
		lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
		started_at = coalesce(started_at, p_now),
		version = version + 1,
		updated_at = p_now
	WHERE id = p_job_id
		AND status IN ('queued', 'running')
		AND deadline_at > p_now
		AND (lease_owner IS NULL OR lease_expires_at <= p_now OR lease_owner = p_lease_owner)
	RETURNING * INTO v_job;

	IF NOT FOUND THEN RETURN NULL; END IF;
	RETURN jsonb_build_object(
		'id', v_job.id,
		'owner', v_job.lease_owner,
		'version', v_job.version,
		'expires_at', v_job.lease_expires_at
	);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;--> statement-breakpoint
CREATE FUNCTION "reserve_how_it_wins_call"(
	p_job_id uuid,
	p_lease_owner text,
	p_lease_version bigint,
	p_logical_call_id text,
	p_input_hash text,
	p_stage text,
	p_reserved_microdollars bigint,
	p_attempt_json jsonb,
	p_now timestamp with time zone
) RETURNS jsonb AS $$
DECLARE
	v_root_id uuid;
	v_root how_it_wins_jobs%ROWTYPE;
	v_job how_it_wins_jobs%ROWTYPE;
	v_existing jsonb;
	v_attempt jsonb;
BEGIN
	SELECT root_job_id INTO v_root_id FROM how_it_wins_jobs WHERE id = p_job_id;
	IF NOT FOUND THEN RETURN jsonb_build_object('state', 'not_found'); END IF;
	PERFORM pg_advisory_xact_lock(hashtextextended(v_root_id::text, 821));
	SELECT * INTO v_root FROM how_it_wins_jobs WHERE id = v_root_id FOR UPDATE;
	IF p_job_id = v_root_id THEN v_job := v_root;
	ELSE SELECT * INTO v_job FROM how_it_wins_jobs WHERE id = p_job_id FOR UPDATE;
	END IF;

	IF v_job.status <> 'running'
		OR v_job.lease_owner IS DISTINCT FROM p_lease_owner
		OR v_job.version <> p_lease_version
		OR v_job.lease_expires_at <= p_now
		OR v_job.deadline_at <= p_now THEN
		RETURN jsonb_build_object('state', 'lease_lost');
	END IF;

	SELECT value INTO v_existing
	FROM jsonb_array_elements(v_job.attempts_json) AS entry(value)
	WHERE value->>'logicalCallId' = p_logical_call_id
	LIMIT 1;
	IF FOUND THEN
		IF v_existing->>'inputHash' <> p_input_hash THEN
			RETURN jsonb_build_object('state', 'call_conflict', 'attempt', v_existing);
		END IF;
		RETURN jsonb_build_object('state', 'existing', 'attempt', v_existing);
	END IF;
	IF p_stage IN ('judge_initial', 'judge_recovery') AND (
		SELECT count(*) FROM jsonb_array_elements(v_job.attempts_json) entry
		WHERE entry->>'stage' IN ('judge_initial', 'judge_recovery')
	) >= 2 THEN
		RETURN jsonb_build_object('state', 'attempt_limit');
	END IF;

	IF v_root.reserved_microdollars + v_root.settled_microdollars + p_reserved_microdollars > v_root.configured_cap_microdollars THEN
		RETURN jsonb_build_object('state', 'budget_exhausted');
	END IF;

	v_attempt := p_attempt_json || jsonb_build_object(
		'logicalCallId', p_logical_call_id,
		'inputHash', p_input_hash,
		'stage', p_stage,
		'status', 'reserved',
		'reservedMicrodollars', p_reserved_microdollars,
		'reservedAt', p_now
	);

	UPDATE how_it_wins_jobs
	SET reserved_microdollars = reserved_microdollars + p_reserved_microdollars,
		version = version + CASE WHEN id = p_job_id THEN 1 ELSE 0 END,
		updated_at = p_now
	WHERE id = v_root_id;
	IF p_job_id = v_root_id THEN
		v_job.version := v_job.version + 1;
	END IF;
	UPDATE how_it_wins_jobs
	SET attempts_json = attempts_json || jsonb_build_array(v_attempt),
		version = version + CASE WHEN id = v_root_id THEN 0 ELSE 1 END,
		updated_at = p_now
	WHERE id = p_job_id;

	RETURN jsonb_build_object(
		'state', 'reserved',
		'attempt', v_attempt,
		'lease_version', v_job.version + CASE WHEN p_job_id = v_root_id THEN 0 ELSE 1 END
	);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;--> statement-breakpoint
CREATE FUNCTION "settle_how_it_wins_call"(
	p_job_id uuid,
	p_lease_owner text,
	p_lease_version bigint,
	p_logical_call_id text,
	p_status text,
	p_actual_microdollars bigint,
	p_settlement_json jsonb,
	p_now timestamp with time zone
) RETURNS jsonb AS $$
DECLARE
	v_root_id uuid;
	v_root how_it_wins_jobs%ROWTYPE;
	v_job how_it_wins_jobs%ROWTYPE;
	v_attempt jsonb;
	v_index integer;
	v_reserved bigint;
	v_settled bigint;
	v_next_attempt jsonb;
	v_next_attempts jsonb;
BEGIN
	SELECT root_job_id INTO v_root_id FROM how_it_wins_jobs WHERE id = p_job_id;
	IF NOT FOUND THEN RETURN jsonb_build_object('state', 'not_found'); END IF;
	PERFORM pg_advisory_xact_lock(hashtextextended(v_root_id::text, 821));
	SELECT * INTO v_root FROM how_it_wins_jobs WHERE id = v_root_id FOR UPDATE;
	IF p_job_id = v_root_id THEN v_job := v_root;
	ELSE SELECT * INTO v_job FROM how_it_wins_jobs WHERE id = p_job_id FOR UPDATE;
	END IF;

	IF v_job.status <> 'running'
		OR v_job.lease_owner IS DISTINCT FROM p_lease_owner
		OR v_job.version <> p_lease_version
		OR v_job.lease_expires_at <= p_now THEN
		RETURN jsonb_build_object('state', 'lease_lost');
	END IF;

	SELECT value, ordinality::integer - 1 INTO v_attempt, v_index
	FROM jsonb_array_elements(v_job.attempts_json) WITH ORDINALITY AS entry(value, ordinality)
	WHERE value->>'logicalCallId' = p_logical_call_id
	LIMIT 1;
	IF NOT FOUND THEN RETURN jsonb_build_object('state', 'not_found'); END IF;
	IF v_attempt->>'status' <> 'reserved' THEN
		RETURN jsonb_build_object('state', 'existing', 'attempt', v_attempt);
	END IF;

	v_reserved := (v_attempt->>'reservedMicrodollars')::bigint;
	v_settled := coalesce(p_actual_microdollars, v_reserved);
	IF v_settled < 0 OR v_settled > v_reserved THEN
		RETURN jsonb_build_object('state', 'invalid_cost');
	END IF;

	v_next_attempt := v_attempt || p_settlement_json || jsonb_build_object(
		'status', p_status,
		'settledMicrodollars', v_settled,
		'costBasis', CASE WHEN p_actual_microdollars IS NULL THEN 'unknown_reserved' ELSE 'known' END,
		'settledAt', p_now
	);
	v_next_attempts := jsonb_set(v_job.attempts_json, ARRAY[v_index::text], v_next_attempt, false);

	UPDATE how_it_wins_jobs
	SET reserved_microdollars = reserved_microdollars - v_reserved,
		settled_microdollars = settled_microdollars + v_settled,
		version = version + CASE WHEN id = p_job_id THEN 1 ELSE 0 END,
		updated_at = p_now
	WHERE id = v_root_id;
	UPDATE how_it_wins_jobs
	SET attempts_json = v_next_attempts,
		version = version + CASE WHEN id = v_root_id THEN 0 ELSE 1 END,
		updated_at = p_now
	WHERE id = p_job_id;

	RETURN jsonb_build_object(
		'state', 'settled',
		'attempt', v_next_attempt,
		'lease_version', p_lease_version + 1
	);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;--> statement-breakpoint
CREATE FUNCTION "finish_how_it_wins_job"(
	p_job_id uuid,
	p_lease_owner text,
	p_lease_version bigint,
	p_status how_it_wins_job_status,
	p_reason_code text,
	p_retry_eligible boolean,
	p_now timestamp with time zone
) RETURNS boolean AS $$
DECLARE
	v_root_id uuid;
	v_root how_it_wins_jobs%ROWTYPE;
	v_job how_it_wins_jobs%ROWTYPE;
	v_abandoned bigint;
	v_attempts jsonb;
BEGIN
	IF p_status NOT IN ('failed', 'cancelled', 'superseded') THEN RETURN false; END IF;
	SELECT root_job_id INTO v_root_id FROM how_it_wins_jobs WHERE id = p_job_id;
	IF NOT FOUND THEN RETURN false; END IF;
	PERFORM pg_advisory_xact_lock(hashtextextended(v_root_id::text, 821));
	SELECT * INTO v_root FROM how_it_wins_jobs WHERE id = v_root_id FOR UPDATE;
	IF p_job_id = v_root_id THEN v_job := v_root;
	ELSE SELECT * INTO v_job FROM how_it_wins_jobs WHERE id = p_job_id FOR UPDATE;
	END IF;
	IF v_job.status NOT IN ('queued', 'running')
		OR (v_job.status = 'running' AND (
			v_job.lease_owner IS DISTINCT FROM p_lease_owner OR v_job.version <> p_lease_version
		)) THEN RETURN false; END IF;

	SELECT coalesce(sum(
		CASE WHEN value->>'status' = 'reserved'
		THEN (value->>'reservedMicrodollars')::bigint ELSE 0 END
	), 0),
		coalesce(jsonb_agg(
			CASE WHEN value->>'status' = 'reserved'
			THEN value || jsonb_build_object(
				'status', 'unknown',
				'settledMicrodollars', (value->>'reservedMicrodollars')::bigint,
				'costBasis', 'unknown_reserved',
				'settledAt', p_now
			)
			ELSE value END ORDER BY ordinality
		), '[]'::jsonb)
	INTO v_abandoned, v_attempts
	FROM jsonb_array_elements(v_job.attempts_json) WITH ORDINALITY AS entry(value, ordinality);

	UPDATE how_it_wins_jobs
	SET reserved_microdollars = reserved_microdollars - v_abandoned,
		settled_microdollars = settled_microdollars + v_abandoned,
		version = version + CASE WHEN id = p_job_id THEN 1 ELSE 0 END,
		updated_at = p_now
	WHERE id = v_root_id;
	UPDATE how_it_wins_jobs
	SET status = p_status,
		current_stage = 'complete',
		terminal_reason_code = p_reason_code,
		retry_eligible = p_retry_eligible AND retry_of_job_id IS NULL AND NOT v_root.manual_retry_used,
		attempts_json = v_attempts,
		recovery_payload_json = '{}'::jsonb,
		recovery_payload_expires_at = NULL,
		lease_owner = NULL,
		lease_expires_at = NULL,
		completed_at = p_now,
		version = version + CASE WHEN id = v_root_id THEN 0 ELSE 1 END,
		updated_at = p_now
	WHERE id = p_job_id;
	RETURN true;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;--> statement-breakpoint
CREATE FUNCTION "expire_how_it_wins_job"(
	p_job_id uuid,
	p_now timestamp with time zone
) RETURNS boolean AS $$
DECLARE
	v_job how_it_wins_jobs%ROWTYPE;
	v_reason text;
BEGIN
	SELECT * INTO v_job FROM how_it_wins_jobs WHERE id = p_job_id;
	IF NOT FOUND OR v_job.status NOT IN ('queued', 'running') THEN
		RETURN false;
	END IF;
	IF v_job.deadline_at <= p_now THEN
		v_reason := 'deadline_expired';
	ELSIF v_job.status = 'running' AND v_job.lease_expires_at <= p_now THEN
		v_reason := 'lease_lost';
	ELSE
		RETURN false;
	END IF;
	RETURN finish_how_it_wins_job(
		p_job_id,
		v_job.lease_owner,
		v_job.version,
		'failed',
		v_reason,
		true,
		p_now
	);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;--> statement-breakpoint
CREATE FUNCTION "complete_how_it_wins_job_with_card"(
	p_job_id uuid,
	p_lease_owner text,
	p_lease_version bigint,
	p_expected_card_version bigint,
	p_evidence_hash text,
	p_evaluator_signature text,
	p_card_json jsonb,
	p_cache_status cache_status,
	p_generation_cost_usd numeric,
	p_generated_at timestamp with time zone,
	p_outcome how_it_wins_job_outcome,
	p_judgment_id uuid,
	p_now timestamp with time zone
) RETURNS text AS $$
DECLARE
	v_job how_it_wins_jobs%ROWTYPE;
	v_card cards%ROWTYPE;
BEGIN
	SELECT * INTO v_job FROM how_it_wins_jobs WHERE id = p_job_id FOR UPDATE;
	IF NOT FOUND THEN RETURN 'not_found'; END IF;
	IF v_job.status <> 'running'
		OR v_job.lease_owner IS DISTINCT FROM p_lease_owner
		OR v_job.version <> p_lease_version
		OR v_job.lease_expires_at <= p_now
		OR v_job.deadline_at <= p_now THEN RETURN 'lease_lost'; END IF;
	IF v_job.evidence_hash <> p_evidence_hash THEN RETURN 'stale_evidence'; END IF;
	IF v_job.evaluator_signature <> p_evaluator_signature THEN RETURN 'stale_evaluator'; END IF;
	IF EXISTS (
		SELECT 1 FROM jsonb_array_elements(v_job.attempts_json) entry
		WHERE entry->>'status' = 'reserved'
	) THEN RETURN 'unsettled_calls'; END IF;

	SELECT * INTO v_card FROM cards WHERE slug = v_job.slug FOR UPDATE;
	IF NOT FOUND THEN RETURN 'card_not_found'; END IF;
	IF v_card.version <> p_expected_card_version THEN RETURN 'card_changed'; END IF;
	IF p_card_json->>'slug' IS DISTINCT FROM v_card.slug
		OR p_card_json->>'domain' IS DISTINCT FROM v_card.domain THEN RETURN 'card_identity_changed'; END IF;

	UPDATE cards SET
		card_json = p_card_json,
		cache_status = p_cache_status,
		generation_cost_usd = p_generation_cost_usd,
		generated_at = p_generated_at,
		version = version + 1,
		updated_at = p_now
	WHERE id = v_card.id;

	UPDATE how_it_wins_jobs SET
		status = 'succeeded',
		current_stage = 'complete',
		terminal_reason_code = NULL,
		outcome = p_outcome,
		judgment_id = p_judgment_id,
		retry_eligible = false,
		recovery_payload_json = '{}'::jsonb,
		recovery_payload_expires_at = NULL,
		lease_owner = NULL,
		lease_expires_at = NULL,
		completed_at = p_now,
		version = version + 1,
		updated_at = p_now
	WHERE id = p_job_id;

	RETURN 'succeeded';
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;--> statement-breakpoint
CREATE FUNCTION "protect_terminal_how_it_wins_job"() RETURNS trigger AS $$
BEGIN
	IF OLD.status IN ('succeeded', 'failed', 'cancelled', 'superseded') AND (
		NEW.id IS DISTINCT FROM OLD.id
		OR NEW.root_job_id IS DISTINCT FROM OLD.root_job_id
		OR NEW.retry_of_job_id IS DISTINCT FROM OLD.retry_of_job_id
		OR NEW.source_analysis_run_id IS DISTINCT FROM OLD.source_analysis_run_id
		OR NEW.slug IS DISTINCT FROM OLD.slug
		OR NEW.evidence_hash IS DISTINCT FROM OLD.evidence_hash
		OR NEW.evaluator_signature IS DISTINCT FROM OLD.evaluator_signature
		OR NEW.execution_contract_version IS DISTINCT FROM OLD.execution_contract_version
		OR NEW.inngest_event_id IS DISTINCT FROM OLD.inngest_event_id
		OR NEW.inngest_run_id IS DISTINCT FROM OLD.inngest_run_id
		OR NEW.dispatch_attempts IS DISTINCT FROM OLD.dispatch_attempts
		OR NEW.dispatch_last_attempt_at IS DISTINCT FROM OLD.dispatch_last_attempt_at
		OR NEW.dispatch_confirmed_at IS DISTINCT FROM OLD.dispatch_confirmed_at
		OR NEW.status IS DISTINCT FROM OLD.status
		OR NEW.current_stage IS DISTINCT FROM OLD.current_stage
		OR NEW.terminal_reason_code IS DISTINCT FROM OLD.terminal_reason_code
		OR NEW.outcome IS DISTINCT FROM OLD.outcome
		OR (NEW.judgment_id IS DISTINCT FROM OLD.judgment_id
			AND NOT (OLD.judgment_id IS NOT NULL AND NEW.judgment_id IS NULL))
		OR NEW.attempts_json IS DISTINCT FROM OLD.attempts_json
		OR NEW.checkpoints_json IS DISTINCT FROM OLD.checkpoints_json
		OR NEW.recovery_payload_json IS DISTINCT FROM OLD.recovery_payload_json
		OR NEW.recovery_payload_expires_at IS DISTINCT FROM OLD.recovery_payload_expires_at
		OR NEW.lease_owner IS DISTINCT FROM OLD.lease_owner
		OR NEW.lease_expires_at IS DISTINCT FROM OLD.lease_expires_at
		OR NEW.deadline_at IS DISTINCT FROM OLD.deadline_at
		OR NEW.started_at IS DISTINCT FROM OLD.started_at
		OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	) THEN
		RAISE EXCEPTION 'terminal how_it_wins_jobs rows are immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;--> statement-breakpoint
CREATE TRIGGER "how_it_wins_jobs_terminal_immutable"
	BEFORE UPDATE ON "how_it_wins_jobs"
	FOR EACH ROW EXECUTE FUNCTION "protect_terminal_how_it_wins_job"();--> statement-breakpoint
CREATE FUNCTION "delete_alpha_how_it_wins_jobs"() RETURNS trigger AS $$
BEGIN
	IF OLD.generation_run_id IS NOT NULL THEN
		DELETE FROM how_it_wins_jobs WHERE source_analysis_run_id = OLD.generation_run_id;
	END IF;
	RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;--> statement-breakpoint
CREATE TRIGGER "alpha_run_requests_delete_how_it_wins_jobs"
	BEFORE DELETE ON "alpha_run_requests"
	FOR EACH ROW EXECUTE FUNCTION "delete_alpha_how_it_wins_jobs"();
