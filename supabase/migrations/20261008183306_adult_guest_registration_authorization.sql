-- Independent, disabled-by-default intake for the current 18+ release.
-- No jurisdiction, guardian-consent, or 13+ eligibility evidence is invented.
ALTER TABLE private.auth_release ADD COLUMN IF NOT EXISTS adult_guest_signup_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN private.auth_release.adult_guest_signup_enabled IS
 'Allows attested adult guest signup only while enabled=false. Turning intake off preserves existing accounts.';

CREATE TABLE IF NOT EXISTS private.adult_guest_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 authorization_token_hash text UNIQUE,
 network_hash text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 age_confirmed_at timestamptz NOT NULL,
 terms_accepted_at timestamptz NOT NULL,
 terms_version text NOT NULL CHECK(length(btrim(terms_version))>0),
 consumed_at timestamptz,
 profile_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 CHECK(authorization_token_hash IS NULL OR authorization_token_hash ~ '^[a-f0-9]{64}$'),
 CHECK(network_hash IS NULL OR network_hash ~ '^[a-f0-9]{64}$'),
 CHECK((consumed_at IS NULL AND profile_id IS NULL AND authorization_token_hash IS NOT NULL AND network_hash IS NOT NULL)
   OR (consumed_at IS NOT NULL AND profile_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS adult_guest_network_velocity ON private.adult_guest_authorizations(network_hash,created_at);
ALTER TABLE private.adult_guest_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.adult_guest_authorizations FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE private.adult_guest_authorizations IS
 'Single-use adult guest permits and consumed attestation audit. Expired unused permits retain their network reservation for 24 hours; active accounts are never purged.';

-- No account or permit reference: explicit account deletion must not reopen the
-- daily intake allowance. This minimal abuse reservation expires after 24 hours.
CREATE TABLE IF NOT EXISTS private.adult_guest_network_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 network_hash text NOT NULL CHECK(network_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS adult_guest_reservation_velocity ON private.adult_guest_network_reservations(network_hash,created_at);
ALTER TABLE private.adult_guest_network_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.adult_guest_network_reservations FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.auth_release_configuration()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',enabled,'minimum_client_version',minimum_client_version,
   'guest_signup_enabled',enabled AND guest_signup_enabled,
   'adult_guest_signup_enabled',enabled IS FALSE AND adult_guest_signup_enabled)
 FROM private.auth_release WHERE singleton
$$;

CREATE OR REPLACE FUNCTION public.authorize_adult_guest(p_network_hash text,p_age_confirmed jsonb,p_terms_accepted jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE intake_enabled boolean; token text; expires timestamptz; attested timestamptz; velocity integer;
BEGIN
 -- Hold the release row until issuance commits, serializing switch revocation.
 SELECT enabled IS FALSE AND adult_guest_signup_enabled INTO intake_enabled FROM private.auth_release WHERE singleton FOR SHARE;
 IF intake_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'registration_unavailable'; END IF;
 IF p_age_confirmed IS DISTINCT FROM 'true'::jsonb OR p_terms_accepted IS DISTINCT FROM 'true'::jsonb THEN
   RAISE EXCEPTION 'adult_attestation_required'; END IF;
 IF p_network_hash IS NULL OR p_network_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'registration_unavailable'; END IF;
 -- Same 10-per-24-hour reservation limit and network lock as combined intake.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_network_hash,401));
 SELECT count(*) INTO velocity FROM private.adult_guest_network_reservations
 WHERE network_hash=p_network_hash AND created_at>clock_timestamp()-interval '24 hours';
 IF velocity>=10 THEN RAISE EXCEPTION 'registration_rate_limited'; END IF;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 attested:=clock_timestamp(); expires:=attested+interval '5 minutes';
 INSERT INTO private.adult_guest_authorizations(authorization_token_hash,network_hash,expires_at,age_confirmed_at,terms_accepted_at,terms_version)
 VALUES(encode(extensions.digest(token,'sha256'),'hex'),p_network_hash,expires,attested,attested,'2026-10-08');
 INSERT INTO private.adult_guest_network_reservations(network_hash) VALUES(p_network_hash);
 RETURN jsonb_build_object('authorized',true,'authorization_token',token,'permit_expires_at',expires);
END $$;

CREATE OR REPLACE FUNCTION private.find_adult_guest_authorization(p_user jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_provider text:=p_user->'app_metadata'->>'provider';
 supplied_token text:=p_user->'user_metadata'->>'adult_guest_authorization'; permit uuid;
BEGIN
 IF p_user->'is_anonymous' IS DISTINCT FROM 'true'::jsonb
   OR (v_provider IS NOT NULL AND v_provider<>'anonymous')
   OR (SELECT enabled IS FALSE AND adult_guest_signup_enabled FROM private.auth_release WHERE singleton) IS DISTINCT FROM true
   OR supplied_token IS NULL OR supplied_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 SELECT id INTO permit FROM private.adult_guest_authorizations
 WHERE authorization_token_hash=encode(extensions.digest(supplied_token,'sha256'),'hex')
   AND expires_at>clock_timestamp() AND consumed_at IS NULL;
 RETURN permit;
END $$;

CREATE OR REPLACE FUNCTION public.before_user_created_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE release_enabled boolean; valid_permit boolean:=false;
BEGIN
 SELECT enabled INTO release_enabled FROM private.auth_release WHERE singleton;
 IF release_enabled IS FALSE THEN
   IF event->'user'->'is_anonymous'='true'::jsonb THEN
     valid_permit:=private.find_adult_guest_authorization(event->'user') IS NOT NULL;
   ELSIF (event->'user'->'is_anonymous' IS NULL OR event->'user'->'is_anonymous' IN ('false'::jsonb,'null'::jsonb))
     AND event->'user'->'app_metadata'->>'provider' IS DISTINCT FROM 'anonymous'
     AND NOT coalesce(event->'user'->'user_metadata' ? 'adult_guest_authorization',false) THEN
     -- Preserve the legacy email path and its profile-trigger age gate.
     RETURN '{}'::jsonb;
   END IF;
 ELSIF release_enabled IS TRUE THEN
   valid_permit:=private.find_registration_authorization(event->'user') IS NOT NULL;
 END IF;
 IF NOT valid_permit THEN
   RETURN jsonb_build_object('error',jsonb_build_object('http_code',403,'message','registration_required'));
 END IF;
 RETURN '{}'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE enabled boolean; a private.registration_authorizations; r private.registration_sessions; confirmed timestamptz;
 auth_user jsonb; permit uuid; adult private.adult_guest_authorizations; welcome uuid;
BEGIN
 -- Lock rollout state through consumption/profile/grant commit. A concurrent
 -- rollback either precedes this signup and blocks it, or follows its commit.
 SELECT ar.enabled INTO enabled FROM private.auth_release ar WHERE singleton FOR SHARE;
 IF enabled IS NULL THEN RAISE EXCEPTION 'registration_unavailable'; END IF;
 auth_user:=jsonb_build_object('email',NEW.email,'is_anonymous',NEW.is_anonymous,
   'app_metadata',NEW.raw_app_meta_data,'user_metadata',NEW.raw_user_meta_data);
 IF NEW.is_anonymous IS TRUE AND enabled IS FALSE THEN
   IF (SELECT adult_guest_signup_enabled FROM private.auth_release WHERE singleton) IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'guest_accounts_disabled'; END IF;
   permit:=private.find_adult_guest_authorization(auth_user);
   SELECT * INTO adult FROM private.adult_guest_authorizations WHERE id=permit FOR UPDATE;
   IF adult.id IS NULL OR adult.consumed_at IS NOT NULL
     OR private.find_adult_guest_authorization(auth_user) IS DISTINCT FROM adult.id THEN
     RAISE EXCEPTION 'registration_required'; END IF;
   confirmed:=adult.age_confirmed_at;
   UPDATE private.adult_guest_authorizations SET consumed_at=clock_timestamp(),profile_id=NEW.id WHERE id=adult.id;
 ELSIF enabled THEN
   IF NEW.is_anonymous IS TRUE AND (SELECT guest_signup_enabled FROM private.auth_release WHERE singleton) IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'guest_accounts_disabled'; END IF;
   permit:=private.find_registration_authorization(auth_user);
   -- Preserve the combined release's session-then-permit lock order.
   SELECT * INTO r FROM private.registration_sessions WHERE id=(
     SELECT registration_id FROM private.registration_authorizations WHERE id=permit) FOR UPDATE;
   SELECT * INTO a FROM private.registration_authorizations WHERE id=permit FOR UPDATE;
   IF a.id IS NULL OR a.consumed_at IS NOT NULL OR r.status NOT IN ('eligible','approved')
     OR r.expires_at<=clock_timestamp() OR private.find_registration_authorization(auth_user) IS DISTINCT FROM a.id THEN
     RAISE EXCEPTION 'registration_required'; END IF;
   UPDATE private.registration_authorizations SET consumed_at=clock_timestamp(),profile_id=NEW.id WHERE id=a.id;
 ELSE
   IF NEW.raw_app_meta_data->>'provider'='anonymous' OR NEW.raw_user_meta_data ? 'adult_guest_authorization' THEN
     RAISE EXCEPTION 'registration_required'; END IF;
   IF NEW.raw_user_meta_data->'age_confirmed' IS DISTINCT FROM 'true'::jsonb THEN
     RAISE EXCEPTION 'age_gate_failed: account creation requires 18+ confirmation'; END IF;
   confirmed:=now();
 END IF;
 INSERT INTO public.profiles(id,username,display_name,age_confirmed_at)
 VALUES(NEW.id,'user_'||substr(replace(NEW.id::text,'-',''),1,15),'Player',confirmed) ON CONFLICT(id) DO NOTHING;
 IF enabled THEN
   INSERT INTO private.account_eligibility(profile_id,policy_id,age_at_assessment,next_birthday,consent_status,consent_reference,consent_evidence,signup_grant_eligible)
   VALUES(NEW.id,r.policy_id,r.age_at_assessment,r.next_birthday,
     CASE WHEN r.status='approved' THEN 'approved' ELSE 'not_required' END,r.consent_reference,r.consent_evidence,r.grant_eligible);
   UPDATE private.registration_sessions SET status='consumed',profile_id=NEW.id WHERE id=r.id;
   UPDATE public.account_abuse_signals SET ftuo_eligible=r.grant_eligible WHERE profile_id=NEW.id;
 END IF;
 IF NOT enabled OR r.grant_eligible THEN
   IF NEW.is_anonymous IS TRUE THEN
     -- Permit consumption, profile, abuse signals and welcome ledger are atomic.
     welcome:=public.grant_credits(NEW.id,10,'welcome_grant','welcome_'||NEW.id::text,NULL,NULL,
       jsonb_build_object('source','signup'));
     IF NOT enabled AND welcome IS NULL THEN RAISE EXCEPTION 'welcome_grant_unavailable'; END IF;
   ELSE
     BEGIN
       PERFORM public.grant_credits(NEW.id,10,'welcome_grant','welcome_'||NEW.id::text,NULL,NULL,
         jsonb_build_object('source','signup'));
     EXCEPTION WHEN OTHERS THEN RAISE WARNING 'welcome grant deferred for account'; END;
   END IF;
 END IF;
 IF adult.id IS NOT NULL THEN
   -- This trigger runs only AFTER INSERT. Remove the redeemed bearer from Auth
   -- metadata atomically without changing unrelated client metadata or invoking
   -- the signup trigger recursively.
   UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data-'adult_guest_authorization' WHERE id=NEW.id;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.purge_expired_registration_data()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE removed integer; unused_adult integer; expired_reservations integer;
BEGIN
 DELETE FROM private.registration_sessions WHERE profile_id IS NULL AND expires_at<=now();
 GET DIAGNOSTICS removed = ROW_COUNT;
 -- Retain reservations for their full abuse-control window, even after expiry.
 DELETE FROM private.adult_guest_authorizations
 WHERE consumed_at IS NULL AND expires_at<=now() AND created_at<=now()-interval '24 hours';
 GET DIAGNOSTICS unused_adult = ROW_COUNT;
 DELETE FROM private.adult_guest_network_reservations WHERE created_at<=now()-interval '24 hours';
 GET DIAGNOSTICS expired_reservations = ROW_COUNT;
 -- Keep consumed age/Terms evidence for the account; discard linkage secrets
 -- after the velocity window. Explicit Auth account deletion cascades its audit.
 UPDATE private.adult_guest_authorizations SET authorization_token_hash=NULL,network_hash=NULL
 WHERE consumed_at IS NOT NULL AND created_at<=now()-interval '24 hours'
   AND (authorization_token_hash IS NOT NULL OR network_hash IS NOT NULL);
 RETURN removed+unused_adult+expired_reservations;
END $$;

REVOKE ALL ON FUNCTION public.auth_release_configuration(),public.authorize_adult_guest(text,jsonb,jsonb),
 private.find_adult_guest_authorization(jsonb),public.before_user_created_hook(jsonb),public.handle_new_user(),
 private.purge_expired_registration_data() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auth_release_configuration(),public.authorize_adult_guest(text,jsonb,jsonb),
 private.find_adult_guest_authorization(jsonb),private.purge_expired_registration_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.before_user_created_hook(jsonb) TO supabase_auth_admin,service_role;
