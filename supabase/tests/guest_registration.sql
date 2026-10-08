-- Local behavioral coverage. The runner wraps migrations and suites in ROLLBACK.
BEGIN;

CREATE FUNCTION pg_temp.guest_event(p_token text, p_anonymous boolean DEFAULT true, p_provider text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('user',jsonb_build_object('is_anonymous',p_anonymous,
   'app_metadata',CASE WHEN p_provider IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('provider',p_provider) END,
   'user_metadata',jsonb_build_object('registration_authorization',p_token,'is_anonymous',true,'age_confirmed',true)))
$$;

CREATE FUNCTION pg_temp.reject_guest(p_event jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE candidate uuid:=gen_random_uuid();
BEGIN
 IF public.before_user_created_hook(p_event)->'error'->>'message' IS DISTINCT FROM 'registration_required' THEN
   RAISE EXCEPTION 'hook accepted invalid guest';
 END IF;
 BEGIN
   INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
   VALUES(candidate,(p_event->'user'->>'is_anonymous')::boolean,
     p_event->'user'->'app_metadata',p_event->'user'->'user_metadata');
   RAISE EXCEPTION 'profile trigger accepted invalid guest';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE '%registration_required%' AND SQLERRM<>'guest_accounts_disabled' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=candidate) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=candidate) THEN
   RAISE EXCEPTION 'rejected signup left account state';
 END IF;
END $$;

DO $$
DECLARE p uuid; r uuid; permit jsonb; rotated jsonb; token text; u uuid:=gen_random_uuid(); event jsonb;
BEGIN
 IF public.auth_release_configuration()->'guest_signup_enabled' IS DISTINCT FROM 'false'::jsonb THEN
   RAISE EXCEPTION 'guest intake must default off';
 END IF;
 UPDATE private.auth_release SET enabled=true WHERE singleton;
 INSERT INTO private.jurisdiction_policies(country,version,minimum_age,independent_consent_age,
   approved_at,review_reference,processing_allowed,teen_purchases)
 VALUES('ZG','guest-test-only',13,16,now(),'test fixture; never deploy',true,true) RETURNING id INTO p;
 PERFORM set_config('test.guest_policy',p::text,true);
 r:=public.create_registration_session('guest-registration','guest-network',p,17,current_date+100,'eligible',true);
 BEGIN
   PERFORM public.authorize_registration('guest-registration','anonymous','anonymous');
   RAISE EXCEPTION 'disabled guest intake issued permit';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_unavailable%' THEN RAISE; END IF; END;
 UPDATE private.auth_release SET guest_signup_enabled=true WHERE singleton;
 UPDATE private.auth_release SET enabled=false WHERE singleton;
 IF public.auth_release_configuration()->'guest_signup_enabled' IS DISTINCT FROM 'false'::jsonb THEN
   RAISE EXCEPTION 'guest intake ignored combined release';
 END IF;
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(repeat('a',64)));
 BEGIN
   PERFORM public.authorize_registration('guest-registration','anonymous','anonymous');
   RAISE EXCEPTION 'disabled release issued guest permit';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_unavailable%' THEN RAISE; END IF; END;
 UPDATE private.auth_release SET enabled=true WHERE singleton;
 permit:=public.authorize_registration('guest-registration','anonymous','anonymous');
 token:=permit->>'authorization_token';
 IF token IS NULL OR token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'missing 256-bit bearer permit'; END IF;
 IF (permit->>'permit_expires_at')::timestamptz NOT BETWEEN clock_timestamp()+interval '4 minutes 50 seconds'
   AND clock_timestamp()+interval '5 minutes 1 second' THEN RAISE EXCEPTION 'invalid guest permit TTL'; END IF;
 IF EXISTS(SELECT 1 FROM private.registration_authorizations a WHERE a.id=(permit->>'authorization_id')::uuid
   AND (to_jsonb(a)::text LIKE '%'||token||'%' OR a.authorization_token_hash IS DISTINCT FROM encode(extensions.digest(token,'sha256'),'hex'))) THEN
   RAISE EXCEPTION 'bearer token not stored as hash only';
 END IF;
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(NULL));
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(repeat('0',64)));
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(permit->>'authorization_id'));
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(token,false));
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(token,false,'email'));
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(token,true,'google'));
 -- Refresh rotates the bearer secret and invalidates the old one.
 rotated:=public.authorize_registration('guest-registration','anonymous','anonymous');
 IF rotated->>'authorization_token'=token THEN RAISE EXCEPTION 'guest permit did not rotate'; END IF;
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(token));
 token:=rotated->>'authorization_token'; event:=pg_temp.guest_event(token);
 -- Both callers may pass the non-consuming hook; the atomic trigger still fences replay.
 IF public.before_user_created_hook(event)<>'{}'::jsonb OR public.before_user_created_hook(event)<>'{}'::jsonb THEN
   RAISE EXCEPTION 'eligible guest hook failed';
 END IF;
 INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
 VALUES(u,true,'{}',event->'user'->'user_metadata');
 PERFORM set_config('test.guest_user',u::text,true);
 PERFORM pg_temp.reject_guest(event);
 IF NOT EXISTS(SELECT 1 FROM private.registration_authorizations WHERE id=(permit->>'authorization_id')::uuid
   AND consumed_at IS NOT NULL AND profile_id=u) THEN RAISE EXCEPTION 'guest permit not consumed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.registration_sessions WHERE id=r AND status='consumed' AND profile_id=u) THEN
   RAISE EXCEPTION 'guest registration not consumed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.account_eligibility WHERE profile_id=u AND age_at_assessment=17) THEN
   RAISE EXCEPTION 'guest eligibility missing'; END IF;
 IF (SELECT age_confirmed_at IS NOT NULL FROM public.profiles WHERE id=u) THEN RAISE EXCEPTION 'guest fabricated adult confirmation'; END IF;
 IF (SELECT count(*) FROM public.wallet_transactions WHERE profile_id=u AND reason='welcome_grant')<>1 THEN
   RAISE EXCEPTION 'guest welcome grant missing or duplicated'; END IF;
 IF NOT private.account_capability(u,'play') OR NOT private.account_capability(u,'generate')
   OR NOT private.account_capability(u,'purchase') OR NOT private.account_capability(u,'grant') THEN
   RAISE EXCEPTION 'guest capability restricted despite reviewed policy'; END IF;
 UPDATE private.auth_release SET guest_signup_enabled=false WHERE singleton;
 IF NOT private.account_capability(u,'play') OR NOT private.account_capability(u,'purchase') THEN
   RAISE EXCEPTION 'intake flag blocked existing guest'; END IF;
 UPDATE private.auth_release SET guest_signup_enabled=true WHERE singleton;
 UPDATE private.account_eligibility SET consent_status='revoked' WHERE profile_id=u;
 IF private.account_capability(u,'play') OR private.account_capability(u,'purchase') THEN
   RAISE EXCEPTION 'guest ignored revoked eligibility'; END IF;
END $$;

DO $$
DECLARE p uuid:=current_setting('test.guest_policy')::uuid; permit jsonb; token text; r uuid; u uuid:=gen_random_uuid();
 consent_user uuid:=gen_random_uuid(); i integer;
BEGIN
 r:=public.create_registration_session('guest-expiry','guest-expiry-network',p,20,current_date+100,'eligible',true);
 permit:=public.authorize_registration('guest-expiry','anonymous','anonymous'); token:=permit->>'authorization_token';
 UPDATE private.registration_authorizations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=(permit->>'authorization_id')::uuid;
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(token));
 permit:=public.authorize_registration('guest-expiry','anonymous','anonymous'); token:=permit->>'authorization_token';
 UPDATE private.auth_release SET guest_signup_enabled=false WHERE singleton;
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(token));
 UPDATE private.auth_release SET guest_signup_enabled=true WHERE singleton;
 UPDATE private.jurisdiction_policies SET processing_allowed=false WHERE id=p;
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(token));
 UPDATE private.jurisdiction_policies SET processing_allowed=true WHERE id=p;
 UPDATE private.jurisdiction_policies SET assurance='verified' WHERE id=p;
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(token));
 UPDATE private.jurisdiction_policies SET assurance='declared' WHERE id=p;
 UPDATE private.registration_sessions SET status='revoked' WHERE id=r;
 PERFORM pg_temp.reject_guest(pg_temp.guest_event(token));
 r:=public.create_registration_session('guest-pending','guest-consent-network',p,14,current_date+100,'pending',true);
 BEGIN
   PERFORM public.authorize_registration('guest-pending','anonymous','anonymous');
   RAISE EXCEPTION 'pending consent authorized guest';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_required%' THEN RAISE; END IF; END;
 PERFORM public.apply_guardian_consent(r,'guest-approved-consent','approved',now(),'guest-consent-reference',
   jsonb_build_object('kind','guardian_consent','source','kws_consent_management','policy_version','guest-test-only',
     'evidence_reference','reviewed-test-evidence'));
 permit:=public.authorize_registration('guest-pending','anonymous','anonymous');
 BEGIN
   PERFORM public.authorize_registration('guest-pending','email','different-identity@example.test');
   RAISE EXCEPTION 'guest registration rebound to email';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_already_bound%' THEN RAISE; END IF; END;
 INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
 VALUES(consent_user,true,'{}',jsonb_build_object('registration_authorization',permit->>'authorization_token'));
 IF NOT private.account_capability(consent_user,'play') OR NOT private.account_capability(consent_user,'purchase') THEN
   RAISE EXCEPTION 'reviewed guardian consent did not grant normal guest capabilities'; END IF;
 UPDATE private.jurisdiction_policies SET teen_purchases=false WHERE id=p;
 IF private.account_capability(consent_user,'purchase') THEN RAISE EXCEPTION 'guest bypassed teen purchase policy'; END IF;
 UPDATE private.jurisdiction_policies SET teen_purchases=true WHERE id=p;
 -- Registration anti-farm rules apply identically to guest grants and FTUO.
 FOR i IN 1..4 LOOP
   r:=public.create_registration_session('guest-farm-'||i,'guest-farm-network',p,20,current_date+100,'eligible',true);
 END LOOP;
 permit:=public.authorize_registration('guest-farm-4','anonymous','anonymous');
 INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
 VALUES(u,true,'{}',jsonb_build_object('registration_authorization',permit->>'authorization_token'));
 IF EXISTS(SELECT 1 FROM public.wallet_transactions WHERE profile_id=u AND reason='welcome_grant')
   OR (SELECT ftuo_eligible FROM public.account_abuse_signals WHERE profile_id=u) THEN
   RAISE EXCEPTION 'guest bypassed anti-farm grants'; END IF;
 IF NOT private.account_capability(u,'play') THEN RAISE EXCEPTION 'farm signal unexpectedly blocked gameplay'; END IF;
 PERFORM set_config('test.guest_rls_user',u::text,true);
END $$;

CREATE FUNCTION pg_temp.reject_guest_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.profile_id=current_setting('test.guest_rollback_user')::uuid AND NEW.reason='welcome_grant' THEN
   RAISE EXCEPTION 'test_grant_failure';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guest_grant_failure BEFORE INSERT ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_guest_grant();
DO $$
DECLARE p uuid:=current_setting('test.guest_policy')::uuid; r uuid; permit jsonb; u uuid:=gen_random_uuid();
BEGIN
 PERFORM set_config('test.guest_rollback_user',u::text,true);
 r:=public.create_registration_session('guest-rollback','guest-rollback-network',p,20,current_date+100,'eligible',true);
 permit:=public.authorize_registration('guest-rollback','anonymous','anonymous');
 BEGIN
   INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
   VALUES(u,true,'{}',jsonb_build_object('registration_authorization',permit->>'authorization_token'));
   RAISE EXCEPTION 'grant failure did not roll back guest';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'test_grant_failure' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=u) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=u)
   OR EXISTS(SELECT 1 FROM private.account_eligibility WHERE profile_id=u)
   OR EXISTS(SELECT 1 FROM private.registration_authorizations WHERE registration_id=r AND consumed_at IS NOT NULL)
   OR EXISTS(SELECT 1 FROM private.registration_sessions WHERE id=r AND status='consumed') THEN
   RAISE EXCEPTION 'failed guest transaction left partial state'; END IF;
 PERFORM set_config('test.guest_rollback_user',gen_random_uuid()::text,true);
 INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
 VALUES(u,true,'{}',jsonb_build_object('registration_authorization',permit->>'authorization_token'));
END $$;
DROP TRIGGER guest_grant_failure ON public.wallet_transactions;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.guest_rls_user'),true);
DO $$
DECLARE u uuid:=current_setting('test.guest_rls_user')::uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u) THEN RAISE EXCEPTION 'eligible guest cannot read own profile'; END IF;
 IF EXISTS(SELECT 1 FROM public.wallet_transactions WHERE profile_id=current_setting('test.guest_user')::uuid) THEN
   RAISE EXCEPTION 'guest can read another wallet'; END IF;
 BEGIN
   PERFORM age_confirmed_at FROM public.profiles WHERE id=current_setting('test.guest_user')::uuid;
   RAISE EXCEPTION 'guest can read private profile fields';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM authorization_token_hash FROM private.registration_authorizations;
   RAISE EXCEPTION 'guest can read private permits';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.authorize_registration('guest-token','anonymous','anonymous');
   RAISE EXCEPTION 'guest can issue permits directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);

DO $$ BEGIN
 IF has_table_privilege('authenticated','private.registration_authorizations','SELECT')
   OR has_function_privilege('authenticated','public.authorize_registration(text,text,text)','EXECUTE')
   OR has_function_privilege('anon','public.authorize_registration(text,text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'guest secret store or issuance is client accessible'; END IF;
 UPDATE private.auth_release SET guest_signup_enabled=false WHERE singleton;
END $$;
ROLLBACK;
