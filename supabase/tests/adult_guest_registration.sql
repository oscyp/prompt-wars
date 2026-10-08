-- Behavioral signup security tests; the local runner rolls back all changes.
BEGIN;

CREATE FUNCTION pg_temp.adult_guest_event(p_token text, p_anonymous boolean DEFAULT true, p_provider text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('user',jsonb_build_object('is_anonymous',p_anonymous,
   'app_metadata',CASE WHEN p_provider IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('provider',p_provider) END,
   'user_metadata',jsonb_build_object('adult_guest_authorization',p_token,'age_confirmed',true,'terms_accepted',true)))
$$;

CREATE FUNCTION pg_temp.reject_adult_guest(p_event jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE candidate uuid:=gen_random_uuid();
BEGIN
 IF public.before_user_created_hook(p_event)->'error'->>'message' IS DISTINCT FROM 'registration_required' THEN
   RAISE EXCEPTION 'hook accepted invalid adult guest';
 END IF;
 BEGIN
   INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
   VALUES(candidate,(p_event->'user'->>'is_anonymous')::boolean,
     p_event->'user'->'app_metadata',p_event->'user'->'user_metadata');
   RAISE EXCEPTION 'profile trigger accepted invalid adult guest';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT IN ('registration_required','guest_accounts_disabled') THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=candidate) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=candidate) THEN
   RAISE EXCEPTION 'rejected adult signup left account state';
 END IF;
END $$;

DO $$
DECLARE permit jsonb; token text; u uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid(); bad jsonb; event jsonb;
BEGIN
 IF public.auth_release_configuration()->'adult_guest_signup_enabled' IS DISTINCT FROM 'false'::jsonb THEN
   RAISE EXCEPTION 'adult guest intake must default off';
 END IF;
 UPDATE private.auth_release SET enabled=false,adult_guest_signup_enabled=false WHERE singleton;
 BEGIN
   PERFORM public.authorize_adult_guest(repeat('a',64),'true','true');
   RAISE EXCEPTION 'disabled adult guest intake issued permit';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'registration_unavailable' THEN RAISE; END IF; END;
 PERFORM pg_temp.reject_adult_guest(pg_temp.adult_guest_event(NULL));
 UPDATE private.auth_release SET adult_guest_signup_enabled=true WHERE singleton;
 IF public.auth_release_configuration()->'adult_guest_signup_enabled' IS DISTINCT FROM 'true'::jsonb
   OR public.auth_release_configuration()->'guest_signup_enabled' IS DISTINCT FROM 'false'::jsonb THEN
   RAISE EXCEPTION 'adult and combined intake configuration crossed'; END IF;
 FOREACH bad IN ARRAY ARRAY['null'::jsonb,'false'::jsonb,'"true"'::jsonb,'"false"'::jsonb,'1'::jsonb] LOOP
   BEGIN
     PERFORM public.authorize_adult_guest(repeat('a',64),bad,'true');
     RAISE EXCEPTION 'invalid adult attestation issued permit';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'adult_attestation_required' THEN RAISE; END IF; END;
   BEGIN
     PERFORM public.authorize_adult_guest(repeat('a',64),'true',bad);
     RAISE EXCEPTION 'invalid terms attestation issued permit';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'adult_attestation_required' THEN RAISE; END IF; END;
 END LOOP;
 permit:=public.authorize_adult_guest(repeat('a',64),'true','true'); token:=permit->>'authorization_token';
 IF permit->'authorized' IS DISTINCT FROM 'true'::jsonb OR token !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'adult guest permit missing 256-bit secret'; END IF;
 IF (permit->>'permit_expires_at')::timestamptz NOT BETWEEN clock_timestamp()+interval '4 minutes 50 seconds'
   AND clock_timestamp()+interval '5 minutes 1 second' THEN RAISE EXCEPTION 'invalid adult permit TTL'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.adult_guest_authorizations a
   WHERE authorization_token_hash=encode(extensions.digest(token,'sha256'),'hex')
     AND age_confirmed_at IS NOT NULL AND terms_accepted_at IS NOT NULL AND terms_version='2026-10-08'
     AND to_jsonb(a)::text NOT LIKE '%'||token||'%') THEN
   RAISE EXCEPTION 'adult permit must audit attestations with hash-only secret'; END IF;
 PERFORM pg_temp.reject_adult_guest(pg_temp.adult_guest_event(NULL));
 PERFORM pg_temp.reject_adult_guest(pg_temp.adult_guest_event(repeat('0',64)));
 PERFORM pg_temp.reject_adult_guest(pg_temp.adult_guest_event(token,true,'google'));
 PERFORM pg_temp.reject_adult_guest(pg_temp.adult_guest_event(token,false,'anonymous'));
 PERFORM pg_temp.reject_adult_guest(pg_temp.adult_guest_event(token,false,'email'));
 -- The Auth flag must be an actual boolean, never a string or user metadata claim.
 event:=jsonb_set(pg_temp.adult_guest_event(token),'{user,is_anonymous}','"true"');
 IF public.before_user_created_hook(event)->'error'->>'message' IS DISTINCT FROM 'registration_required' THEN
   RAISE EXCEPTION 'string anonymous claim bypassed hook'; END IF;
 event:=pg_temp.adult_guest_event(token);
 IF public.before_user_created_hook(event)<>'{}' OR public.before_user_created_hook(event)<>'{}' THEN
   RAISE EXCEPTION 'valid adult permit rejected by hook'; END IF;
 -- Client metadata is not the age evidence: a valid permit supplies it.
 INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
 VALUES(u,true,'{}',jsonb_build_object('adult_guest_authorization',token,'client_marker','preserved'));
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=u AND raw_user_meta_data ? 'adult_guest_authorization')
   OR (SELECT raw_user_meta_data->>'client_marker' FROM auth.users WHERE id=u) IS DISTINCT FROM 'preserved' THEN
   RAISE EXCEPTION 'successful adult signup must erase consumed bearer metadata only'; END IF;
 PERFORM set_config('test.adult_guest_user',u::text,true);
 PERFORM pg_temp.reject_adult_guest(event);
 IF NOT EXISTS(SELECT 1 FROM private.adult_guest_authorizations a JOIN public.profiles p ON p.id=a.profile_id
   WHERE a.profile_id=u AND a.consumed_at IS NOT NULL AND p.age_confirmed_at=a.age_confirmed_at) THEN
   RAISE EXCEPTION 'adult permit consumption lost authoritative attestation'; END IF;
 IF EXISTS(SELECT 1 FROM private.account_eligibility WHERE profile_id=u) THEN RAISE EXCEPTION 'adult guest fabricated regional eligibility'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_abuse_signals WHERE profile_id=u) THEN RAISE EXCEPTION 'adult guest missing normal abuse signals'; END IF;
 IF (SELECT count(*) FROM public.wallet_transactions WHERE profile_id=u AND reason='welcome_grant' AND amount=10)<>1 THEN
   RAISE EXCEPTION 'adult guest welcome grant missing or duplicated'; END IF;
 PERFORM public.grant_credits(u,10,'welcome_grant','welcome_'||u::text);
 IF (SELECT count(*) FROM public.wallet_transactions WHERE profile_id=u AND reason='welcome_grant')<>1 THEN RAISE EXCEPTION 'welcome replay duplicated'; END IF;
 IF NOT private.account_capability(u,'play') OR NOT private.account_capability(u,'generate')
   OR NOT private.account_capability(u,'purchase') OR NOT private.account_capability(u,'grant') THEN RAISE EXCEPTION 'adult guest restricted'; END IF;
 UPDATE private.auth_release SET adult_guest_signup_enabled=false WHERE singleton;
 IF NOT private.account_capability(u,'play') OR NOT private.account_capability(u,'purchase') THEN
   RAISE EXCEPTION 'adult intake rollback blocked existing guest'; END IF;
 -- Legacy email signup needs only its existing strict 18+ metadata gate.
 INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
 VALUES(legacy,false,'{"provider":"email"}','{"age_confirmed":true}');
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=legacy AND age_confirmed_at IS NOT NULL)
   OR (SELECT count(*) FROM public.wallet_transactions WHERE profile_id=legacy AND reason='welcome_grant')<>1 THEN
   RAISE EXCEPTION 'legacy email signup changed'; END IF;
 BEGIN
   INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
   VALUES(gen_random_uuid(),false,'{"provider":"email"}','{"age_confirmed":"true"}');
   RAISE EXCEPTION 'legacy email accepted string age claim';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'age_gate_failed:%' THEN RAISE; END IF; END;
END $$;

DO $$
DECLARE permit jsonb; token text; i integer;
BEGIN
 UPDATE private.auth_release SET enabled=false,adult_guest_signup_enabled=true WHERE singleton;
 permit:=public.authorize_adult_guest(repeat('b',64),'true','true'); token:=permit->>'authorization_token';
 UPDATE private.adult_guest_authorizations SET expires_at=clock_timestamp()-interval '1 second'
 WHERE authorization_token_hash=encode(extensions.digest(token,'sha256'),'hex');
 PERFORM pg_temp.reject_adult_guest(pg_temp.adult_guest_event(token));
 permit:=public.authorize_adult_guest(repeat('b',64),'true','true'); token:=permit->>'authorization_token';
 UPDATE private.auth_release SET adult_guest_signup_enabled=false WHERE singleton;
 PERFORM pg_temp.reject_adult_guest(pg_temp.adult_guest_event(token));
 UPDATE private.auth_release SET adult_guest_signup_enabled=true,enabled=true WHERE singleton;
 IF public.auth_release_configuration()->'adult_guest_signup_enabled' IS DISTINCT FROM 'false'::jsonb THEN
   RAISE EXCEPTION 'combined release exposed adult intake'; END IF;
 PERFORM pg_temp.reject_adult_guest(pg_temp.adult_guest_event(token));
 BEGIN
   PERFORM public.authorize_adult_guest(repeat('b',64),'true','true');
   RAISE EXCEPTION 'combined release issued adult permit';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'registration_unavailable' THEN RAISE; END IF; END;
 IF NOT private.account_capability(current_setting('test.adult_guest_user')::uuid,'play') THEN
   RAISE EXCEPTION 'adult attestation not preserved during combined transition'; END IF;
 UPDATE private.auth_release SET enabled=false WHERE singleton;
 FOR i IN 1..10 LOOP PERFORM public.authorize_adult_guest(repeat('c',64),'true','true'); END LOOP;
 UPDATE private.adult_guest_authorizations SET expires_at=clock_timestamp()-interval '1 second' WHERE network_hash=repeat('c',64);
 PERFORM private.purge_expired_registration_data();
 BEGIN
   PERFORM public.authorize_adult_guest(repeat('c',64),'true','true');
   RAISE EXCEPTION 'expired permits or purge bypassed 24-hour reservation cap';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'registration_rate_limited' THEN RAISE; END IF; END;
 UPDATE private.adult_guest_authorizations SET created_at=now()-interval '25 hours' WHERE network_hash=repeat('c',64);
 UPDATE private.adult_guest_network_reservations SET created_at=now()-interval '25 hours' WHERE network_hash=repeat('c',64);
 PERFORM private.purge_expired_registration_data();
 IF EXISTS(SELECT 1 FROM private.adult_guest_authorizations WHERE network_hash=repeat('c',64)) THEN
   RAISE EXCEPTION 'expired unconsumed adult permits not purged'; END IF;
 IF EXISTS(SELECT 1 FROM private.adult_guest_network_reservations WHERE network_hash=repeat('c',64)) THEN
   RAISE EXCEPTION 'expired adult network reservations not purged'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=current_setting('test.adult_guest_user')::uuid)
   OR NOT EXISTS(SELECT 1 FROM private.adult_guest_authorizations WHERE profile_id=current_setting('test.adult_guest_user')::uuid) THEN
   RAISE EXCEPTION 'permit purge removed guest or its audit record'; END IF;
 PERFORM public.authorize_adult_guest(repeat('c',64),'true','true');
 UPDATE private.adult_guest_authorizations SET created_at=now()-interval '25 hours'
 WHERE profile_id=current_setting('test.adult_guest_user')::uuid;
 PERFORM private.purge_expired_registration_data();
 IF NOT EXISTS(SELECT 1 FROM private.adult_guest_authorizations
   WHERE profile_id=current_setting('test.adult_guest_user')::uuid AND authorization_token_hash IS NULL
     AND network_hash IS NULL AND age_confirmed_at IS NOT NULL AND terms_accepted_at IS NOT NULL AND terms_version='2026-10-08') THEN
   RAISE EXCEPTION 'purge failed to retain adult/Terms evidence while removing expired linkage'; END IF;
END $$;

CREATE FUNCTION pg_temp.reject_adult_guest_grant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.profile_id=current_setting('test.adult_guest_rollback_user')::uuid AND NEW.reason='welcome_grant' THEN
   RAISE EXCEPTION 'test_adult_grant_failure'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER adult_guest_grant_failure BEFORE INSERT ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_adult_guest_grant();
DO $$
DECLARE permit jsonb; u uuid:=gen_random_uuid(); token text;
BEGIN
 PERFORM set_config('test.adult_guest_rollback_user',u::text,true);
 permit:=public.authorize_adult_guest(repeat('d',64),'true','true'); token:=permit->>'authorization_token';
 BEGIN
   INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
   VALUES(u,true,'{}',jsonb_build_object('adult_guest_authorization',token));
   RAISE EXCEPTION 'failed adult grant allowed partial signup';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'test_adult_grant_failure' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=u) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=u)
   OR EXISTS(SELECT 1 FROM private.adult_guest_authorizations WHERE authorization_token_hash=encode(extensions.digest(token,'sha256'),'hex')
     AND (consumed_at IS NOT NULL OR profile_id IS NOT NULL)) THEN RAISE EXCEPTION 'adult signup rollback left state'; END IF;
 PERFORM set_config('test.adult_guest_rollback_user',gen_random_uuid()::text,true);
 INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
 VALUES(u,true,'{}',jsonb_build_object('adult_guest_authorization',token));
END $$;
DROP TRIGGER adult_guest_grant_failure ON public.wallet_transactions;

DO $$
DECLARE permit jsonb; u uuid:=gen_random_uuid(); i integer;
BEGIN
 permit:=public.authorize_adult_guest(repeat('f',64),'true','true');
 INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
 VALUES(u,true,'{}',jsonb_build_object('adult_guest_authorization',permit->>'authorization_token'));
 FOR i IN 1..9 LOOP PERFORM public.authorize_adult_guest(repeat('f',64),'true','true'); END LOOP;
 DELETE FROM auth.users WHERE id=u;
 IF EXISTS(SELECT 1 FROM private.adult_guest_authorizations WHERE profile_id=u) THEN RAISE EXCEPTION 'deleted account retained attestation'; END IF;
 BEGIN
   PERFORM public.authorize_adult_guest(repeat('f',64),'true','true');
   RAISE EXCEPTION 'account deletion bypassed daily guest reservation cap';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'registration_rate_limited' THEN RAISE; END IF; END;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.adult_guest_user'),true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=current_setting('test.adult_guest_user')::uuid) THEN
   RAISE EXCEPTION 'adult guest cannot read own profile'; END IF;
 BEGIN
   PERFORM authorization_token_hash FROM private.adult_guest_authorizations;
   RAISE EXCEPTION 'guest can read adult permits';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.authorize_adult_guest(repeat('e',64),'true','true');
   RAISE EXCEPTION 'guest can issue adult permits';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
 IF has_table_privilege('authenticated','private.adult_guest_authorizations','SELECT')
   OR has_table_privilege('authenticated','private.adult_guest_network_reservations','SELECT')
   OR has_table_privilege('anon','private.adult_guest_network_reservations','SELECT')
   OR has_function_privilege('authenticated','public.authorize_adult_guest(text,jsonb,jsonb)','EXECUTE')
   OR has_function_privilege('anon','public.authorize_adult_guest(text,jsonb,jsonb)','EXECUTE')
   OR has_function_privilege('anon','private.find_adult_guest_authorization(jsonb)','EXECUTE')
   OR NOT has_function_privilege('service_role','public.authorize_adult_guest(text,jsonb,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'adult authorization permission boundary wrong'; END IF;
 UPDATE private.auth_release SET enabled=false,adult_guest_signup_enabled=false WHERE singleton;
END $$;
ROLLBACK;
