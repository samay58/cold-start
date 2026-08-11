DROP INDEX "alpha_invite_attempts_created_idx";--> statement-breakpoint
ALTER TABLE "alpha_invite_attempts" ADD COLUMN "source_hash" text;--> statement-breakpoint
ALTER TABLE "alpha_invites" ADD COLUMN "presentation_token_hash" text;--> statement-breakpoint
CREATE INDEX "alpha_invite_attempts_source_created_idx" ON "alpha_invite_attempts" USING btree ("source_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alpha_invites_presentation_token_hash_idx" ON "alpha_invites" USING btree ("presentation_token_hash");--> statement-breakpoint
ALTER TABLE "alpha_invite_attempts" ADD CONSTRAINT "alpha_invite_attempts_source_hash_check" CHECK ("alpha_invite_attempts"."source_hash" is null or "alpha_invite_attempts"."source_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "alpha_invites" ADD CONSTRAINT "alpha_invites_presentation_token_hash_check" CHECK ("alpha_invites"."presentation_token_hash" is null or "alpha_invites"."presentation_token_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
CREATE FUNCTION "consume_alpha_invite_attempt"(
	p_source_hash text,
	p_now timestamp with time zone,
	p_limit integer,
	p_window_seconds integer
) RETURNS boolean AS $$
DECLARE
	v_recent integer;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended(p_source_hash, 811));

	SELECT count(*) INTO v_recent
	FROM alpha_invite_attempts attempt
	WHERE attempt.source_hash = p_source_hash
		AND attempt.created_at > p_now - make_interval(secs => p_window_seconds);

	IF v_recent >= p_limit THEN
		RETURN false;
	END IF;

	INSERT INTO alpha_invite_attempts (source_hash, created_at)
	VALUES (p_source_hash, p_now);
	RETURN true;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE FUNCTION "create_access_request"(
	p_name text,
	p_email text,
	p_note text,
	p_ip_hash text,
	p_now timestamp with time zone
) RETURNS text AS $$
DECLARE
	v_ip_lock bigint := hashtextextended('access-ip:' || p_ip_hash, 811);
	v_email_lock bigint := hashtextextended('access-email:' || p_email, 811);
	v_recent_ip integer;
	v_recent_email integer;
BEGIN
	PERFORM pg_advisory_xact_lock(least(v_ip_lock, v_email_lock));
	IF v_ip_lock <> v_email_lock THEN
		PERFORM pg_advisory_xact_lock(greatest(v_ip_lock, v_email_lock));
	END IF;

	SELECT count(*) INTO v_recent_ip
	FROM access_requests request
	WHERE request.ip_hash = p_ip_hash
		AND request.created_at > p_now - interval '1 hour';
	IF v_recent_ip >= 3 THEN
		RETURN 'rate_limited_ip';
	END IF;

	SELECT count(*) INTO v_recent_email
	FROM access_requests request
	WHERE request.email = p_email
		AND request.created_at > p_now - interval '1 day';
	IF v_recent_email >= 1 THEN
		RETURN 'rate_limited_email';
	END IF;

	INSERT INTO access_requests (name, email, note, ip_hash, created_at)
	VALUES (p_name, p_email, p_note, p_ip_hash, p_now);
	RETURN 'created';
END;
$$ LANGUAGE plpgsql;
