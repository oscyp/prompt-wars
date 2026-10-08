-- Execute with scripts/test-social-auth-db.py; all fixtures and schema changes roll back.
BEGIN;
DO $$
DECLARE
  u uuid := gen_random_uuid();
  u_missing uuid := gen_random_uuid();
  u_direct uuid := gen_random_uuid();
  job uuid;
  lease uuid;
  old_lease uuid;
  result jsonb;
BEGIN
  UPDATE private.auth_release SET enabled = false WHERE singleton;
  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
  VALUES (u, 'apple-revocation-test@example.test', '{"provider":"email"}', '{"age_confirmed":true}'),
    (u_missing, 'apple-missing-profile@example.test', '{"provider":"email"}', '{"age_confirmed":true}');

  IF public.store_apple_authorization(u, 'apple-sub', 'native-client', 'code-hash', 'v1.iv.encrypted') <> 'stored' THEN
    RAISE EXCEPTION 'credential not stored';
  END IF;
  PERFORM public.store_apple_authorization(u, 'apple-sub', 'native-client', 'code-hash', 'replacement-must-not-win');
  IF (SELECT encrypted_refresh_token FROM private.apple_authorizations WHERE user_id = u) <> 'v1.iv.encrypted' THEN
    RAISE EXCEPTION 'duplicate exchange overwrote credential';
  END IF;
  IF NOT public.has_apple_authorization_code(u, 'code-hash') THEN RAISE EXCEPTION 'replay was not recognized'; END IF;
  IF public.has_apple_authorization_code(u_missing, 'code-hash') THEN RAISE EXCEPTION 'cross-user replay accepted'; END IF;

  result := public.prepare_account_deletion(u);
  job := (result->>'revocation_job_id')::uuid;
  IF job IS NULL THEN RAISE EXCEPTION 'revocation was not captured'; END IF;
  IF EXISTS(SELECT 1 FROM private.apple_authorizations WHERE user_id=u) THEN RAISE EXCEPTION 'credential was copied instead of moved'; END IF;
  IF (SELECT deleted_at FROM public.profiles WHERE id=u) IS NULL THEN RAISE EXCEPTION 'profile not scrubbed'; END IF;
  IF (public.prepare_account_deletion(u)->>'revocation_job_id')::uuid IS DISTINCT FROM job THEN
    RAISE EXCEPTION 'deletion retry created another job';
  END IF;
  DELETE FROM auth.users WHERE id = u;
  IF NOT EXISTS(SELECT 1 FROM private.apple_revocation_jobs WHERE id=job) THEN RAISE EXCEPTION 'auth deletion lost job'; END IF;

  SELECT lease_token INTO lease FROM public.claim_apple_revocations(u, 1);
  IF lease IS NULL THEN RAISE EXCEPTION 'job was not leased'; END IF;
  IF EXISTS(SELECT 1 FROM public.claim_apple_revocations(u, 1)) THEN RAISE EXCEPTION 'active lease was stolen'; END IF;
  IF public.finish_apple_revocation(job, gen_random_uuid(), NULL) THEN RAISE EXCEPTION 'stale lease completed'; END IF;
  PERFORM public.finish_apple_revocation(job, lease, 'apple_unavailable');
  IF (SELECT encrypted_refresh_token FROM private.apple_revocation_jobs WHERE id=job) IS NULL THEN RAISE EXCEPTION 'retry lost credential'; END IF;
  IF EXISTS(SELECT 1 FROM public.claim_apple_revocations(u, 1)) THEN RAISE EXCEPTION 'backoff ignored'; END IF;
  UPDATE private.apple_revocation_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=job;
  SELECT lease_token INTO lease FROM public.claim_apple_revocations(u, 1);
  old_lease := lease;
  UPDATE private.apple_revocation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=job;
  SELECT lease_token INTO lease FROM public.claim_apple_revocations(u, 1);
  IF lease IS NULL OR lease=old_lease THEN RAISE EXCEPTION 'expired lease did not recover'; END IF;
  IF public.finish_apple_revocation(job, old_lease, NULL) THEN RAISE EXCEPTION 'expired worker completed replacement lease'; END IF;
  PERFORM public.finish_apple_revocation(job, lease, NULL);
  IF EXISTS(SELECT 1 FROM private.apple_revocation_jobs WHERE id=job AND
    (encrypted_refresh_token IS NOT NULL OR apple_subject IS NOT NULL OR status <> 'succeeded')) THEN
    RAISE EXCEPTION 'successful revoke retained secrets';
  END IF;
  IF EXISTS(SELECT 1 FROM public.claim_apple_revocations(u, 1)) THEN RAISE EXCEPTION 'completed job claimed'; END IF;

  -- An exchange can finish after deletion; preserve that credential for revocation too.
  IF public.store_apple_authorization(u, 'apple-sub', 'native-client', 'late-code', 'late-encrypted') <> 'queued' THEN
    RAISE EXCEPTION 'late credential was not queued';
  END IF;

  DELETE FROM public.profiles WHERE id=u_missing;
  result := public.prepare_account_deletion(u_missing);
  IF (result->>'profile_missing')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'missing profile blocks delete'; END IF;
  IF result->>'revocation_job_id' IS NOT NULL THEN RAISE EXCEPTION 'missing Apple credential generated fake job'; END IF;
  DELETE FROM auth.users WHERE id=u_missing;

  INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
  VALUES(u_direct, 'apple-direct-delete@example.test', '{"provider":"email"}', '{"age_confirmed":true}');
  PERFORM public.store_apple_authorization(u_direct,'apple-direct','native-client','direct-code','direct-encrypted');
  -- Other admin delete paths get the same durable capture from the auth trigger.
  DELETE FROM auth.users WHERE id=u_direct;
  IF NOT EXISTS(SELECT 1 FROM private.apple_revocation_jobs WHERE user_id=u_direct AND encrypted_refresh_token='direct-encrypted') THEN
    RAISE EXCEPTION 'direct auth deletion bypassed capture';
  END IF;

  IF has_table_privilege('authenticated', 'private.apple_authorizations', 'SELECT') OR
    has_table_privilege('anon', 'private.apple_revocation_jobs', 'SELECT') THEN RAISE EXCEPTION 'client can read Apple secrets'; END IF;
  IF has_function_privilege('authenticated', 'public.claim_apple_revocations(uuid,integer)', 'EXECUTE') OR
    has_function_privilege('anon', 'public.store_apple_authorization(uuid,text,text,text,text)', 'EXECUTE') OR
    has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'client can invoke Apple service RPC';
  END IF;
  IF NOT has_function_privilege('service_role','public.claim_apple_revocations(uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'worker cannot execute claim';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.claim_apple_revocations(NULL, 10);
    RAISE EXCEPTION 'authenticated role claimed revocation secrets';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM encrypted_refresh_token FROM private.apple_authorizations;
    RAISE EXCEPTION 'authenticated role read credentials';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
