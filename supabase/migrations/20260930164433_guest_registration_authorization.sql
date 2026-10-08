-- Guest intake ships with the reviewed eligibility release and defaults off.
-- Ongoing capability checks deliberately do not depend on the intake switch.
ALTER TABLE private.auth_release ADD COLUMN IF NOT EXISTS guest_signup_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN private.auth_release.guest_signup_enabled IS
 'Allows new anonymous accounts only while the combined eligibility release is enabled. Does not restrict existing guests.';

ALTER TABLE private.registration_authorizations
 ADD COLUMN IF NOT EXISTS authorization_token_hash text;
ALTER TABLE private.registration_authorizations DROP CONSTRAINT IF EXISTS registration_authorizations_provider_check;
ALTER TABLE private.registration_authorizations ADD CONSTRAINT registration_authorizations_provider_check
 CHECK(provider IN ('email','apple','google','anonymous'));
ALTER TABLE private.registration_authorizations DROP CONSTRAINT IF EXISTS registration_authorizations_guest_secret_check;
ALTER TABLE private.registration_authorizations ADD CONSTRAINT registration_authorizations_guest_secret_check
 CHECK((provider='anonymous' AND authorization_token_hash IS NOT NULL AND authorization_token_hash ~ '^[a-f0-9]{64}$')
   OR (provider<>'anonymous' AND authorization_token_hash IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS registration_guest_token_hash
 ON private.registration_authorizations(authorization_token_hash) WHERE authorization_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.auth_release_configuration()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',enabled,'minimum_client_version',minimum_client_version,
   'guest_signup_enabled',enabled AND guest_signup_enabled)
 FROM private.auth_release WHERE singleton
$$;

CREATE OR REPLACE FUNCTION public.authorize_registration(p_token_hash text,p_provider text,p_subject text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.registration_sessions; p private.jurisdiction_policies; a private.registration_authorizations;
 guest_token text; guest_hash text;
BEGIN
 IF (SELECT enabled FROM private.auth_release WHERE singleton) IS DISTINCT FROM true THEN RAISE EXCEPTION 'registration_unavailable'; END IF;
 IF p_provider='anonymous' AND (SELECT guest_signup_enabled FROM private.auth_release WHERE singleton) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'registration_unavailable';
 END IF;
 SELECT * INTO r FROM private.registration_sessions WHERE token_hash=p_token_hash FOR UPDATE;
 SELECT * INTO p FROM private.jurisdiction_policies WHERE id=r.policy_id;
 IF r.id IS NULL OR r.expires_at<=clock_timestamp() OR r.status NOT IN ('eligible','approved') THEN RAISE EXCEPTION 'registration_required'; END IF;
 IF p.approved_at IS NULL OR NOT p.processing_allowed OR p.assurance<>'declared' THEN RAISE EXCEPTION 'region_unavailable'; END IF;
 IF r.age_at_assessment<GREATEST(13,p.minimum_age) THEN RAISE EXCEPTION 'age_ineligible'; END IF;
 IF r.age_at_assessment<p.independent_consent_age AND (r.status<>'approved'
   OR r.consent_evidence->>'kind' IS DISTINCT FROM 'guardian_consent'
   OR r.consent_evidence->>'policy_version' IS DISTINCT FROM p.version) THEN RAISE EXCEPTION 'consent_required'; END IF;
 IF p_provider IS NULL OR p_provider NOT IN ('email','apple','google','anonymous') OR p_subject IS NULL
   OR length(p_subject) NOT BETWEEN 1 AND 320 OR (p_provider='anonymous' AND p_subject<>'anonymous') THEN
   RAISE EXCEPTION 'invalid_identity';
 END IF;
 -- Reauthorization rotates a guest bearer secret; it cannot bind another identity.
 IF EXISTS(SELECT 1 FROM private.registration_authorizations WHERE registration_id=r.id
   AND (provider<>p_provider OR subject<>p_subject OR consumed_at IS NOT NULL)) THEN RAISE EXCEPTION 'registration_already_bound'; END IF;
 IF p_provider='anonymous' THEN
   guest_token:=encode(extensions.gen_random_bytes(32),'hex');
   guest_hash:=encode(extensions.digest(guest_token,'sha256'),'hex');
 END IF;
 INSERT INTO private.registration_authorizations(registration_id,provider,subject,expires_at,authorization_token_hash)
 VALUES(r.id,p_provider,p_subject,clock_timestamp()+interval '5 minutes',guest_hash)
 ON CONFLICT(registration_id,provider,subject) DO UPDATE SET
   expires_at=clock_timestamp()+interval '5 minutes',authorization_token_hash=EXCLUDED.authorization_token_hash
 WHERE registration_authorizations.consumed_at IS NULL
 RETURNING * INTO a;
 RETURN jsonb_build_object('authorized',true,'authorization_id',a.id,'permit_expires_at',a.expires_at)
   || CASE WHEN guest_token IS NOT NULL THEN jsonb_build_object('authorization_token',guest_token) ELSE '{}'::jsonb END;
END $$;

CREATE OR REPLACE FUNCTION private.find_registration_authorization(p_user jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_provider text:=p_user->'app_metadata'->>'provider'; v_subject text; permit uuid; guest_hash text;
 supplied_token text:=p_user->'user_metadata'->>'registration_authorization';
BEGIN
 IF p_user->'is_anonymous'='true'::jsonb THEN
   -- Auth sets the top-level flag. Anonymous sign-ins have empty app metadata.
   -- A user_metadata is_anonymous/provider claim never selects this branch.
   IF (v_provider IS NOT NULL AND v_provider<>'anonymous')
     OR (SELECT enabled AND guest_signup_enabled FROM private.auth_release WHERE singleton) IS DISTINCT FROM true
     OR supplied_token IS NULL OR supplied_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
   v_provider:='anonymous'; v_subject:='anonymous';
   guest_hash:=encode(extensions.digest(supplied_token,'sha256'),'hex');
 ELSIF v_provider='anonymous' THEN
   RETURN NULL;
 ELSIF v_provider='email' THEN
   v_subject:=lower(btrim(p_user->>'email'));
   IF supplied_token IS NULL OR supplied_token !~ '^[a-fA-F0-9-]{36}$' THEN RETURN NULL; END IF;
 ELSE
   v_subject:=p_user->'user_metadata'->>'sub';
 END IF;
 SELECT a.id INTO permit FROM private.registration_authorizations a
 JOIN private.registration_sessions r ON r.id=a.registration_id
 JOIN private.jurisdiction_policies p ON p.id=r.policy_id
 WHERE a.provider=v_provider AND a.subject=v_subject AND a.expires_at>clock_timestamp() AND a.consumed_at IS NULL
   AND r.expires_at>clock_timestamp() AND r.status IN ('eligible','approved')
   AND p.approved_at IS NOT NULL AND p.processing_allowed AND p.assurance='declared'
   AND r.age_at_assessment>=GREATEST(13,p.minimum_age)
   AND (r.age_at_assessment>=p.independent_consent_age OR (r.status='approved'
     AND r.consent_evidence->>'kind'='guardian_consent' AND r.consent_evidence->>'policy_version'=p.version))
   AND (v_provider<>'email' OR a.id::text=supplied_token)
   AND (v_provider<>'anonymous' OR a.authorization_token_hash=guest_hash)
 ORDER BY a.expires_at DESC LIMIT 1;
 RETURN permit;
END $$;

CREATE OR REPLACE FUNCTION public.before_user_created_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE release_enabled boolean;
BEGIN
 SELECT enabled INTO release_enabled FROM private.auth_release WHERE singleton;
 -- Guest intake never falls through to the legacy adult metadata gate.
 IF release_enabled IS FALSE AND event->'user'->'is_anonymous' IS DISTINCT FROM 'true'::jsonb THEN RETURN '{}'::jsonb; END IF;
 IF release_enabled IS DISTINCT FROM true OR private.find_registration_authorization(event->'user') IS NULL THEN
   RETURN jsonb_build_object('error',jsonb_build_object('http_code',403,'message','registration_required'));
 END IF;
 RETURN '{}'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE enabled boolean; a private.registration_authorizations; r private.registration_sessions; confirmed timestamptz;
 auth_user jsonb; permit uuid;
BEGIN
 SELECT ar.enabled INTO enabled FROM private.auth_release ar WHERE singleton;
 IF enabled IS NULL THEN RAISE EXCEPTION 'registration_unavailable'; END IF;
 IF NEW.is_anonymous IS TRUE AND (NOT enabled OR
   (SELECT guest_signup_enabled FROM private.auth_release WHERE singleton) IS DISTINCT FROM true) THEN
   RAISE EXCEPTION 'guest_accounts_disabled';
 END IF;
 IF enabled THEN
   auth_user:=jsonb_build_object('email',NEW.email,'is_anonymous',NEW.is_anonymous,
     'app_metadata',NEW.raw_app_meta_data,'user_metadata',NEW.raw_user_meta_data);
   permit:=private.find_registration_authorization(auth_user);
   -- Match authorize_registration's lock order: session, then permit. Two hooks
   -- can pass, but only one insertion can consume the registration under lock.
   SELECT * INTO r FROM private.registration_sessions WHERE id=(
     SELECT registration_id FROM private.registration_authorizations WHERE id=permit) FOR UPDATE;
   SELECT * INTO a FROM private.registration_authorizations WHERE id=permit FOR UPDATE;
   IF a.id IS NULL OR a.consumed_at IS NOT NULL OR r.status NOT IN ('eligible','approved')
     OR r.expires_at<=clock_timestamp() OR private.find_registration_authorization(auth_user) IS DISTINCT FROM a.id THEN
     RAISE EXCEPTION 'registration_required';
   END IF;
   UPDATE private.registration_authorizations SET consumed_at=clock_timestamp(),profile_id=NEW.id WHERE id=a.id;
 ELSE
   -- Preserve legacy 18+ compatibility until the combined release is activated.
   IF NEW.raw_user_meta_data->'age_confirmed' IS DISTINCT FROM 'true'::jsonb THEN
     RAISE EXCEPTION 'age_gate_failed: account creation requires 18+ confirmation';
   END IF;
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
     -- Guest permit, profile, eligibility and the welcome ledger entry commit
     -- together. A failed grant leaves a retryable, unconsumed permit.
     PERFORM public.grant_credits(NEW.id,10,'welcome_grant','welcome_'||NEW.id::text,NULL,NULL,
       jsonb_build_object('source','signup'));
   ELSE
     BEGIN
       PERFORM public.grant_credits(NEW.id,10,'welcome_grant','welcome_'||NEW.id::text,NULL,NULL,
         jsonb_build_object('source','signup'));
     EXCEPTION WHEN OTHERS THEN RAISE WARNING 'welcome grant deferred for account'; END;
   END IF;
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.auth_release_configuration(),public.authorize_registration(text,text,text),
 private.find_registration_authorization(jsonb),public.before_user_created_hook(jsonb),public.handle_new_user()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.auth_release_configuration(),public.authorize_registration(text,text,text),
 private.find_registration_authorization(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.before_user_created_hook(jsonb) TO supabase_auth_admin,service_role;
