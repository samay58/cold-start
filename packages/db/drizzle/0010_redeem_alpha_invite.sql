CREATE FUNCTION "redeem_alpha_invite"(
	p_token_hash text,
	p_access_token_hash text,
	p_browser alpha_browser,
	p_channel alpha_install_channel,
	p_extension_version text,
	p_now timestamp with time zone
) RETURNS jsonb AS $$
DECLARE
	v_invite alpha_invites%ROWTYPE;
	v_installation alpha_installations%ROWTYPE;
	v_claimed integer;
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended(p_token_hash, 811));

	SELECT * INTO v_invite
	FROM alpha_invites invite
	WHERE invite.token_hash = p_token_hash
		AND invite.status IN ('pending', 'active')
		AND invite.expires_at > p_now
	LIMIT 1;

	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	SELECT count(*) INTO v_claimed
	FROM alpha_installations existing
	WHERE existing.invite_id = v_invite.id;

	IF v_claimed >= v_invite.max_installations THEN
		RETURN NULL;
	END IF;

	INSERT INTO alpha_installations (
		invite_id,
		access_token_hash,
		browser,
		channel,
		extension_version,
		connected_at,
		last_seen_at,
		created_at,
		updated_at
	)
	VALUES (
		v_invite.id,
		p_access_token_hash,
		p_browser,
		p_channel,
		p_extension_version,
		p_now,
		p_now,
		p_now,
		p_now
	)
	ON CONFLICT (access_token_hash) DO NOTHING
	RETURNING * INTO v_installation;

	IF v_installation.id IS NULL THEN
		RETURN NULL;
	END IF;

	UPDATE alpha_invites invite
	SET status = 'active',
		accepted_at = coalesce(invite.accepted_at, p_now),
		updated_at = p_now
	WHERE invite.id = v_invite.id
	RETURNING * INTO v_invite;

	INSERT INTO alpha_allowances (
		invite_id,
		profile_limit,
		lens_limit,
		created_at,
		updated_at
	)
	VALUES (v_invite.id, v_invite.profile_limit, v_invite.lens_limit, p_now, p_now)
	ON CONFLICT (invite_id) DO NOTHING;

	RETURN jsonb_build_object(
		'installation_id', v_installation.id,
		'invite_id', v_invite.id,
		'browser', v_installation.browser,
		'channel', v_installation.channel,
		'extension_version', v_installation.extension_version,
		'connected_at', v_installation.connected_at,
		'last_seen_at', v_installation.last_seen_at,
		'label', v_invite.label,
		'status', v_invite.status,
		'scopes', to_jsonb(v_invite.scopes),
		'expires_at', v_invite.expires_at,
		'profile_limit', v_invite.profile_limit,
		'lens_limit', v_invite.lens_limit
	);
END;
$$ LANGUAGE plpgsql;
