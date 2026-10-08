-- Additive, server-controlled rollout. Existing null-policy jobs remain legacy.
ALTER TABLE public.video_jobs
 ADD COLUMN IF NOT EXISTS cinematic_profile text CHECK(cinematic_profile IN ('standard','plus')),
 ADD COLUMN IF NOT EXISTS target_duration_seconds integer CHECK(target_duration_seconds IN (8,12,15)),
 ADD COLUMN IF NOT EXISTS duration_policy_version text CHECK(duration_policy_version='cinematics-v2'),
 ADD COLUMN IF NOT EXISTS submitted_duration_seconds numeric CHECK(submitted_duration_seconds>0),
 ADD COLUMN IF NOT EXISTS actual_duration_seconds numeric CHECK(actual_duration_seconds>0);
ALTER TABLE public.video_jobs ADD CONSTRAINT video_jobs_cinematic_policy_consistent CHECK(
 duration_policy_version IS NULL OR
 (cinematic_profile IS NOT NULL AND target_duration_seconds IS NOT NULL AND
  ((cinematic_profile='plus' AND target_duration_seconds=15) OR
   (cinematic_profile='standard' AND target_duration_seconds IN(8,12)))));

CREATE TABLE public.cinematic_generation_config(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cinematic_generation_config(singleton,enabled) VALUES(true,false);
ALTER TABLE public.cinematic_generation_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cinematic_generation_config FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.cinematic_generation_config TO service_role;

CREATE TABLE public.video_job_inputs(
 video_job_id uuid PRIMARY KEY REFERENCES public.video_jobs(id) ON DELETE CASCADE,
 input_version integer NOT NULL CHECK(input_version=2),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.video_job_inputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_job_inputs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.video_job_inputs TO service_role;

-- A safe capability read exposes no participant, prompt, or internal asset data.
CREATE OR REPLACE FUNCTION public.get_cinematic_capabilities()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',coalesce((SELECT enabled FROM public.cinematic_generation_config WHERE singleton),false),'plus_duration_seconds',15)
$$;
REVOKE ALL ON FUNCTION public.get_cinematic_capabilities() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_cinematic_capabilities() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.resolve_cinematic_policy(p_battle_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b public.battles%ROWTYPE; enabled boolean; plus boolean:=false;
BEGIN
 SELECT * INTO b FROM public.battles WHERE id=p_battle_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'cinematic_battle_not_found'; END IF;
 SELECT c.enabled INTO STRICT enabled FROM public.cinematic_generation_config c WHERE singleton;
 IF enabled THEN
  -- Use the derived view, including its paid-through cancellation/expiry rules.
  -- Missing expected human rows and lookup errors fail creation for retry.
  IF NOT EXISTS(SELECT 1 FROM public.entitlements_v2 WHERE profile_id=b.player_one_id)
   OR (NOT coalesce(b.is_player_two_bot,false) AND b.player_two_id IS NOT NULL AND
       NOT EXISTS(SELECT 1 FROM public.entitlements_v2 WHERE profile_id=b.player_two_id)) THEN
   RAISE EXCEPTION 'cinematic_entitlements_unavailable';
  END IF;
  SELECT coalesce(bool_or(e.is_subscriber),false) INTO plus
  FROM public.entitlements_v2 e
  WHERE e.profile_id=b.player_one_id OR
   (NOT coalesce(b.is_player_two_bot,false) AND e.profile_id=b.player_two_id);
 END IF;
 RETURN jsonb_build_object(
  'cinematic_profile',CASE WHEN plus THEN 'plus' ELSE 'standard' END,
  'target_duration_seconds',CASE WHEN plus THEN 15 WHEN b.format::text='bo3' THEN 8 ELSE 12 END,
  'duration_policy_version',CASE WHEN enabled THEN 'cinematics-v2' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.resolve_cinematic_policy(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_cinematic_policy(uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.freeze_cinematic_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p jsonb;
BEGIN
 IF TG_OP='INSERT' THEN
  p:=public.resolve_cinematic_policy(NEW.battle_id);
  IF (NEW.cinematic_profile IS NOT NULL AND NEW.cinematic_profile IS DISTINCT FROM p->>'cinematic_profile')
   OR (NEW.target_duration_seconds IS NOT NULL AND NEW.target_duration_seconds IS DISTINCT FROM (p->>'target_duration_seconds')::integer)
   OR (NEW.duration_policy_version IS NOT NULL AND NEW.duration_policy_version IS DISTINCT FROM p->>'duration_policy_version') THEN
   RAISE EXCEPTION 'cinematic_quote_changed';
  END IF;
  NEW.cinematic_profile:=p->>'cinematic_profile';
  NEW.target_duration_seconds:=(p->>'target_duration_seconds')::integer;
  NEW.duration_policy_version:=p->>'duration_policy_version';
  IF NEW.battle_round_id IS NULL AND EXISTS(SELECT 1 FROM public.battles b WHERE b.id=NEW.battle_id AND b.format::text='bo3') THEN
   RAISE EXCEPTION 'cinematic_round_required';
  END IF;
  IF NEW.battle_round_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.battle_rounds r WHERE r.id=NEW.battle_round_id AND r.battle_id=NEW.battle_id AND r.round_number=NEW.round_number
  ) THEN RAISE EXCEPTION 'cinematic_round_mismatch'; END IF;
  IF NEW.duration_policy_version='cinematics-v2' AND NEW.tier=1 THEN
   -- Serializes competing creation routes, including differently funded jobs.
   PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cinematic-job:'||NEW.battle_id::text,0));
   IF EXISTS(SELECT 1 FROM public.video_jobs j WHERE j.battle_id=NEW.battle_id AND j.tier=1
    AND j.battle_round_id IS NOT DISTINCT FROM NEW.battle_round_id) THEN
    RAISE EXCEPTION 'cinematic_shared_job_exists' USING ERRCODE='23505';
   END IF;
  END IF;
 ELSE
  IF ROW(NEW.cinematic_profile,NEW.target_duration_seconds,NEW.duration_policy_version)
     IS DISTINCT FROM ROW(OLD.cinematic_profile,OLD.target_duration_seconds,OLD.duration_policy_version) THEN
   RAISE EXCEPTION 'cinematic_policy_immutable';
  END IF;
  IF OLD.duration_policy_version IS NOT NULL AND
   ROW(NEW.battle_id,NEW.battle_round_id,NEW.round_number) IS DISTINCT FROM ROW(OLD.battle_id,OLD.battle_round_id,OLD.round_number) THEN
   RAISE EXCEPTION 'cinematic_policy_immutable';
  END IF;
  IF EXISTS(SELECT 1 FROM public.video_job_inputs i WHERE i.video_job_id=OLD.id AND i.payload_hash IS DISTINCT FROM NEW.input_payload_hash) THEN
   RAISE EXCEPTION 'cinematic_input_hash_immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.freeze_cinematic_policy() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER freeze_cinematic_policy BEFORE INSERT OR UPDATE ON public.video_jobs
 FOR EACH ROW EXECUTE FUNCTION private.freeze_cinematic_policy();
-- Index also protects a simultaneous insertion's MVCC snapshot after waiting.
CREATE UNIQUE INDEX uniq_cinematic_v2_round_job ON public.video_jobs(battle_round_id)
 WHERE duration_policy_version='cinematics-v2' AND tier=1 AND battle_round_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.freeze_cinematic_input()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'cinematic_input_immutable'; END $$;
REVOKE ALL ON FUNCTION private.freeze_cinematic_input() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER freeze_cinematic_input BEFORE UPDATE ON public.video_job_inputs
 FOR EACH ROW EXECUTE FUNCTION private.freeze_cinematic_input();
CREATE TRIGGER freeze_cinematic_input_truncate BEFORE TRUNCATE ON public.video_job_inputs
 FOR EACH STATEMENT EXECUTE FUNCTION private.freeze_cinematic_input();

CREATE OR REPLACE FUNCTION public.persist_cinematic_input(p_job_id uuid,p_lease_token uuid,p_payload jsonb,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.video_jobs%ROWTYPE; stored public.video_job_inputs%ROWTYPE;
BEGIN
 SELECT * INTO j FROM public.video_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR p_lease_token IS NULL OR j.lease_token IS DISTINCT FROM p_lease_token
  OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp()
  OR j.status::text NOT IN('queued','submitted','processing') THEN
  RAISE EXCEPTION 'cinematic_lease_lost';
 END IF;
 SELECT * INTO stored FROM public.video_job_inputs WHERE video_job_id=p_job_id;
 IF FOUND THEN
  IF j.input_payload_hash IS DISTINCT FROM stored.payload_hash THEN RAISE EXCEPTION 'cinematic_input_hash_mismatch'; END IF;
  RETURN stored.payload;
 END IF;
 IF j.duration_policy_version IS DISTINCT FROM 'cinematics-v2' THEN RAISE EXCEPTION 'cinematic_legacy_input_not_supported'; END IF;
 -- Do not overwrite already-submitted historical provider hashes.
 IF j.provider_job_id IS NOT NULL OR j.status::text<>'queued' THEN RAISE EXCEPTION 'cinematic_input_already_submitted'; END IF;
 IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  OR p_payload->'version' IS DISTINCT FROM '2'::jsonb
  OR p_payload->>'battleId' IS DISTINCT FROM j.battle_id::text
  OR p_payload->>'roundId' IS DISTINCT FROM j.battle_round_id::text
  OR p_payload->'roundNumber' IS DISTINCT FROM coalesce(to_jsonb(j.round_number),'null'::jsonb)
  OR p_payload->'policy' IS DISTINCT FROM jsonb_build_object('cinematic_profile',j.cinematic_profile,'target_duration_seconds',j.target_duration_seconds,'duration_policy_version',j.duration_policy_version) THEN
  RAISE EXCEPTION 'cinematic_input_invalid';
 END IF;
 INSERT INTO public.video_job_inputs(video_job_id,input_version,payload,payload_hash)
 VALUES(p_job_id,2,p_payload,p_hash);
 UPDATE public.video_jobs SET input_payload_hash=p_hash WHERE id=p_job_id;
 RETURN p_payload;
END $$;
REVOKE ALL ON FUNCTION public.persist_cinematic_input(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_cinematic_input(uuid,uuid,jsonb,text) TO service_role;

-- The explicit expected object distinguishes a disabled null version from an
-- omitted insert field. Lock rollout configuration throughout this transaction.
CREATE OR REPLACE FUNCTION public.insert_cinematic_video_job(p_job jsonb,p_expected_policy jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p jsonb; j public.video_jobs%ROWTYPE;
BEGIN
 IF jsonb_typeof(p_job) IS DISTINCT FROM 'object' OR jsonb_typeof(p_expected_policy) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'cinematic_quote_changed';
 END IF;
 PERFORM 1 FROM public.cinematic_generation_config WHERE singleton FOR SHARE;
 p:=public.resolve_cinematic_policy((p_job->>'battle_id')::uuid);
 IF p IS DISTINCT FROM p_expected_policy THEN RAISE EXCEPTION 'cinematic_quote_changed'; END IF;
 INSERT INTO public.video_jobs(
  battle_id,battle_round_id,round_number,tier,trigger,provider,status,request_payload_hash,input_payload_hash,
  requester_profile_id,entitlement_source,spend_transaction_id,credits_charged,cost_units,
  cinematic_profile,target_duration_seconds,duration_policy_version
 ) VALUES(
  (p_job->>'battle_id')::uuid,(p_job->>'battle_round_id')::uuid,(p_job->>'round_number')::smallint,
  coalesce((p_job->>'tier')::smallint,1),p_job->>'trigger',coalesce(p_job->>'provider','xai'),
  coalesce(p_job->>'status','queued')::public.video_job_status,p_job->>'request_payload_hash',p_job->>'input_payload_hash',
  (p_job->>'requester_profile_id')::uuid,p_job->>'entitlement_source',(p_job->>'spend_transaction_id')::uuid,
  (p_job->>'credits_charged')::integer,coalesce((p_job->>'cost_units')::integer,0),
  p->>'cinematic_profile',(p->>'target_duration_seconds')::integer,p->>'duration_policy_version'
 ) RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.insert_cinematic_video_job(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.insert_cinematic_video_job(jsonb,jsonb) TO service_role;

COMMENT ON TABLE public.video_job_inputs IS 'Immutable canonical cinematic v2 inputs. Service reads and lease-fenced RPC inserts only; excluded from client/realtime payloads.';
COMMENT ON TABLE public.cinematic_generation_config IS 'Server-owned singleton rollout; enabled defaults false. Capability RPC exposes only the switch and Plus duration.';
