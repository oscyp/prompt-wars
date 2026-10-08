-- Apple credentials never enter an exposed schema. Edge Functions encrypt with
-- APPLE_SIGN_IN_ENCRYPTION_KEY before storage; the database never sees plaintext.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.apple_authorizations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  apple_subject text NOT NULL CHECK (length(apple_subject) BETWEEN 1 AND 512),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 512),
  code_hash text NOT NULL UNIQUE,
  encrypted_refresh_token text NOT NULL CHECK (length(encrypted_refresh_token) BETWEEN 1 AND 32768),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No auth/profile FK: deletion must not destroy outstanding revocation work.
CREATE TABLE IF NOT EXISTS private.apple_revocation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  apple_subject text,
  client_id text NOT NULL,
  code_hash text NOT NULL UNIQUE,
  encrypted_refresh_token text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text CHECK (last_error_code ~ '^[a-z_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((status = 'succeeded' AND encrypted_refresh_token IS NULL AND apple_subject IS NULL)
    OR (status <> 'succeeded' AND encrypted_refresh_token IS NOT NULL AND apple_subject IS NOT NULL)),
  CHECK ((status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS apple_revocations_due ON private.apple_revocation_jobs(next_attempt_at)
  WHERE status <> 'succeeded';
CREATE INDEX IF NOT EXISTS apple_revocations_user ON private.apple_revocation_jobs(user_id);
ALTER TABLE private.apple_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.apple_revocation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.apple_authorizations, private.apple_revocation_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_apple_authorization_code(p_user_id uuid, p_code_hash text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM private.apple_authorizations WHERE user_id=p_user_id AND code_hash=p_code_hash)
    OR EXISTS(SELECT 1 FROM private.apple_revocation_jobs WHERE user_id=p_user_id AND code_hash=p_code_hash);
$$;

CREATE OR REPLACE FUNCTION public.store_apple_authorization(
  p_user_id uuid, p_apple_subject text, p_client_id text, p_code_hash text, p_encrypted_refresh_token text
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_exists boolean;
BEGIN
  IF p_user_id IS NULL OR coalesce(length(p_apple_subject),0)=0 OR coalesce(length(p_client_id),0)=0
    OR coalesce(length(p_code_hash),0)=0 OR coalesce(length(p_encrypted_refresh_token),0)=0 THEN
    RAISE EXCEPTION 'Invalid Apple credential';
  END IF;
  -- Serialize credential rotation with deletion preparation and auth.users DELETE.
  PERFORM id FROM auth.users WHERE id=p_user_id FOR UPDATE;
  v_user_exists := FOUND;
  IF EXISTS(SELECT 1 FROM private.apple_revocation_jobs WHERE user_id=p_user_id AND code_hash=p_code_hash) THEN
    RETURN 'queued';
  END IF;
  IF EXISTS(SELECT 1 FROM private.apple_authorizations WHERE user_id=p_user_id AND code_hash=p_code_hash) THEN
    RETURN 'stored';
  END IF;
  IF NOT v_user_exists
    OR EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND deleted_at IS NOT NULL)
    OR EXISTS(SELECT 1 FROM private.apple_revocation_jobs WHERE user_id=p_user_id) THEN
    -- An in-flight exchange can finish after deletion. Keep that token for revoke.
    INSERT INTO private.apple_revocation_jobs(user_id,apple_subject,client_id,code_hash,encrypted_refresh_token)
    VALUES(p_user_id,p_apple_subject,p_client_id,p_code_hash,p_encrypted_refresh_token)
    ON CONFLICT(code_hash) DO NOTHING;
    RETURN 'queued';
  END IF;
  INSERT INTO private.apple_authorizations(user_id,apple_subject,client_id,code_hash,encrypted_refresh_token)
  VALUES(p_user_id,p_apple_subject,p_client_id,p_code_hash,p_encrypted_refresh_token)
  ON CONFLICT(user_id) DO UPDATE SET
    apple_subject=excluded.apple_subject, client_id=excluded.client_id,
    code_hash=excluded.code_hash, encrypted_refresh_token=excluded.encrypted_refresh_token, updated_at=now();
  RETURN 'stored';
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_apple_revocation(p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_job uuid;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'User required'; END IF;
  PERFORM id FROM auth.users WHERE id=p_user_id FOR UPDATE;
  INSERT INTO private.apple_revocation_jobs(user_id,apple_subject,client_id,code_hash,encrypted_refresh_token)
  SELECT user_id,apple_subject,client_id,code_hash,encrypted_refresh_token
  FROM private.apple_authorizations WHERE user_id=p_user_id
  ON CONFLICT(code_hash) DO NOTHING RETURNING id INTO v_job;
  DELETE FROM private.apple_authorizations WHERE user_id=p_user_id;
  IF v_job IS NULL THEN
    SELECT id INTO v_job FROM private.apple_revocation_jobs WHERE user_id=p_user_id ORDER BY created_at DESC LIMIT 1;
  END IF;
  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_account_deletion(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_job uuid; v_result jsonb;
BEGIN
  -- Any failure rolls back both personal-data erasure and the durable capture.
  v_job := public.enqueue_apple_revocation(p_user_id);
  IF to_regprocedure('public.erase_registration_data(uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.erase_registration_data($1)' USING p_user_id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN
    v_result := public.delete_my_account(p_user_id);
  ELSE
    v_result := jsonb_build_object('already_deleted', false, 'profile_missing', true);
  END IF;
  RETURN v_result || jsonb_build_object('revocation_job_id', v_job);
END;
$$;

CREATE OR REPLACE FUNCTION private.capture_apple_revocation_before_auth_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.enqueue_apple_revocation(OLD.id);
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.capture_apple_revocation_before_auth_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS capture_apple_revocation_before_auth_delete ON auth.users;
CREATE TRIGGER capture_apple_revocation_before_auth_delete BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.capture_apple_revocation_before_auth_delete();

CREATE OR REPLACE FUNCTION public.claim_apple_revocations(p_user_id uuid DEFAULT NULL, p_limit integer DEFAULT 10)
RETURNS TABLE(id uuid, user_id uuid, apple_subject text, client_id text, encrypted_refresh_token text, lease_token uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH due AS (
    SELECT j.id FROM private.apple_revocation_jobs j
    WHERE (p_user_id IS NULL OR j.user_id=p_user_id)
      AND ((j.status='pending' AND j.next_attempt_at<=now())
        OR (j.status='processing' AND j.lease_expires_at<=now()))
    ORDER BY j.next_attempt_at,j.created_at
    LIMIT greatest(1,least(coalesce(p_limit,10),10)) FOR UPDATE SKIP LOCKED
  )
  UPDATE private.apple_revocation_jobs j SET status='processing', attempts=j.attempts+1,
    lease_token=gen_random_uuid(), lease_expires_at=now()+interval '2 minutes'
  FROM due WHERE j.id=due.id
  RETURNING j.id,j.user_id,j.apple_subject,j.client_id,j.encrypted_refresh_token,j.lease_token;
$$;

CREATE OR REPLACE FUNCTION public.finish_apple_revocation(p_job_id uuid, p_lease_token uuid, p_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE private.apple_revocation_jobs SET
    status=CASE WHEN p_error_code IS NULL THEN 'succeeded' ELSE 'pending' END,
    encrypted_refresh_token=CASE WHEN p_error_code IS NULL THEN NULL ELSE encrypted_refresh_token END,
    apple_subject=CASE WHEN p_error_code IS NULL THEN NULL ELSE apple_subject END,
    completed_at=CASE WHEN p_error_code IS NULL THEN now() ELSE NULL END,
    next_attempt_at=now()+make_interval(secs=>least(86400,60*power(2,least(attempts,10)))::integer),
    last_error_code=p_error_code, lease_token=NULL, lease_expires_at=NULL
  WHERE id=p_job_id AND status='processing' AND lease_token=p_lease_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.has_apple_authorization_code(uuid,text),
  public.store_apple_authorization(uuid,text,text,text,text),
  public.enqueue_apple_revocation(uuid), public.prepare_account_deletion(uuid),
  public.claim_apple_revocations(uuid,integer), public.finish_apple_revocation(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_apple_authorization_code(uuid,text),
  public.store_apple_authorization(uuid,text,text,text,text),
  public.enqueue_apple_revocation(uuid), public.prepare_account_deletion(uuid),
  public.claim_apple_revocations(uuid,integer), public.finish_apple_revocation(uuid,uuid,text)
  TO service_role;

-- Uses the same Vault URL/service secret as the existing battle/video workers.
SELECT internal.schedule_edge_function(
  'process-apple-revocations-every-five-minutes', '*/5 * * * *', 'process-apple-revocations', '{}'::jsonb
);
