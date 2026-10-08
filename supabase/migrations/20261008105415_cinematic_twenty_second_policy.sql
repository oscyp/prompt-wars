-- New requests adopt v3; frozen v2 fifteen-second and null-policy jobs survive.
ALTER TABLE public.video_jobs
 DROP CONSTRAINT video_jobs_target_duration_seconds_check,
 DROP CONSTRAINT video_jobs_duration_policy_version_check,
 DROP CONSTRAINT video_jobs_cinematic_policy_consistent;
ALTER TABLE public.video_jobs
 ADD CONSTRAINT video_jobs_target_duration_seconds_check CHECK(target_duration_seconds IN(8,12,15,20)),
 ADD CONSTRAINT video_jobs_duration_policy_version_check CHECK(duration_policy_version IN('cinematics-v2','cinematics-v3')),
 ADD CONSTRAINT video_jobs_cinematic_policy_consistent CHECK(
  duration_policy_version IS NULL OR (cinematic_profile IS NOT NULL AND target_duration_seconds IS NOT NULL AND
   ((cinematic_profile='standard' AND target_duration_seconds IN(8,12)) OR
    (cinematic_profile='plus' AND ((duration_policy_version='cinematics-v2' AND target_duration_seconds=15) OR
                                 (duration_policy_version='cinematics-v3' AND target_duration_seconds=20))))));
DROP INDEX public.uniq_cinematic_v2_round_job;
CREATE UNIQUE INDEX uniq_cinematic_policy_round_job ON public.video_jobs(battle_round_id)
 WHERE duration_policy_version IN('cinematics-v2','cinematics-v3') AND tier=1 AND battle_round_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_cinematic_capabilities()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',coalesce((SELECT enabled FROM public.cinematic_generation_config WHERE singleton),false),'plus_duration_seconds',20)
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
  'target_duration_seconds',CASE WHEN plus THEN 20 WHEN b.format::text='bo3' THEN 8 ELSE 12 END,
  'duration_policy_version',CASE WHEN enabled THEN 'cinematics-v3' ELSE NULL END);
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
  IF NEW.duration_policy_version IN('cinematics-v2','cinematics-v3') AND NEW.tier=1 THEN
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
 IF j.duration_policy_version IS NULL OR j.duration_policy_version NOT IN('cinematics-v2','cinematics-v3') THEN RAISE EXCEPTION 'cinematic_legacy_input_not_supported'; END IF;
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


-- Operational phase data remains separate from the immutable input snapshot.
-- Only private Storage paths are kept; base media has no client signing route.
ALTER TABLE public.video_jobs
 ADD COLUMN execution_stage text NOT NULL DEFAULT 'base'
  CHECK(execution_stage IN('base','base_submitting','extension_ready','extension_submitting','extension')),
 ADD COLUMN execution_started_at timestamptz,
 ADD COLUMN base_provider_job_id text,
 ADD COLUMN base_video_path text CHECK(base_video_path=id::text||'/base.mp4'),
 ADD COLUMN base_cost_usd numeric CHECK(base_cost_usd>=0),
 ADD COLUMN base_provider_model text,
 ADD COLUMN base_submitted_duration_seconds numeric CHECK(base_submitted_duration_seconds>0);

CREATE OR REPLACE FUNCTION private.guard_cinematic_execution()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE extended boolean;
BEGIN
 extended:=NEW.duration_policy_version='cinematics-v3' AND NEW.cinematic_profile='plus' AND NEW.target_duration_seconds=20;
 IF TG_OP='INSERT' THEN
  IF NEW.execution_stage<>'base' OR NEW.execution_started_at IS NOT NULL OR
   ROW(NEW.base_provider_job_id,NEW.base_video_path,NEW.base_cost_usd,NEW.base_provider_model,NEW.base_submitted_duration_seconds)
   IS DISTINCT FROM ROW(NULL::text,NULL::text,NULL::numeric,NULL::text,NULL::numeric) THEN
   RAISE EXCEPTION 'cinematic_execution_transition_invalid';
  END IF;
  RETURN NEW;
 END IF;
 IF NOT coalesce(extended,false) THEN RETURN NEW; END IF;
 -- Lease claim/renew/release changes alone remain valid. Advancing an execution
 -- phase or recording its paid-call result requires the already-held lease.
 IF ROW(NEW.execution_stage,NEW.execution_started_at,NEW.base_provider_job_id,NEW.base_video_path,NEW.base_cost_usd,NEW.base_provider_model,NEW.base_submitted_duration_seconds,NEW.provider_job_id)
  IS DISTINCT FROM ROW(OLD.execution_stage,OLD.execution_started_at,OLD.base_provider_job_id,OLD.base_video_path,OLD.base_cost_usd,OLD.base_provider_model,OLD.base_submitted_duration_seconds,OLD.provider_job_id) THEN
  IF OLD.lease_token IS NULL OR NEW.lease_token IS DISTINCT FROM OLD.lease_token OR
   OLD.lease_expires_at IS NULL OR OLD.lease_expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'cinematic_lease_lost';
  END IF;
 END IF;
 IF (OLD.execution_started_at IS NOT NULL AND NEW.execution_started_at IS DISTINCT FROM OLD.execution_started_at)
  OR (OLD.base_provider_job_id IS NOT NULL AND NEW.base_provider_job_id IS DISTINCT FROM OLD.base_provider_job_id)
  OR (OLD.base_video_path IS NOT NULL AND NEW.base_video_path IS DISTINCT FROM OLD.base_video_path)
  OR (OLD.base_cost_usd IS NOT NULL AND NEW.base_cost_usd IS DISTINCT FROM OLD.base_cost_usd)
  OR (OLD.base_provider_model IS NOT NULL AND NEW.base_provider_model IS DISTINCT FROM OLD.base_provider_model)
  OR (OLD.base_submitted_duration_seconds IS NOT NULL AND NEW.base_submitted_duration_seconds IS DISTINCT FROM OLD.base_submitted_duration_seconds) THEN
  RAISE EXCEPTION 'cinematic_execution_immutable';
 END IF;
 IF NEW.execution_stage IS DISTINCT FROM OLD.execution_stage THEN
  IF OLD.status::text NOT IN('queued','submitted','processing') OR NOT coalesce((
   (OLD.execution_stage='base' AND NEW.execution_stage='base_submitting' AND OLD.provider_job_id IS NULL AND
    OLD.execution_started_at IS NULL AND NEW.execution_started_at IS NOT NULL AND NEW.status::text='submitted' AND NEW.submitted_at IS NOT NULL) OR
   (OLD.execution_stage='base_submitting' AND NEW.execution_stage='base' AND NEW.provider_job_id IS NOT NULL AND
    NEW.submitted_duration_seconds=15 AND NEW.status::text='submitted') OR
   (OLD.execution_stage='base' AND NEW.execution_stage='extension_ready' AND OLD.provider_job_id IS NOT NULL AND
    NEW.base_provider_job_id=OLD.provider_job_id AND NEW.base_video_path IS NOT NULL AND NEW.status::text='processing') OR
   (OLD.execution_stage='extension_ready' AND NEW.execution_stage='extension_submitting' AND
    NEW.status::text='submitted' AND NEW.submitted_at IS NOT NULL) OR
   (OLD.execution_stage='extension_submitting' AND NEW.execution_stage='extension' AND NEW.provider_job_id IS NOT NULL AND
    NEW.provider_job_id IS DISTINCT FROM OLD.provider_job_id AND NEW.submitted_duration_seconds=5 AND NEW.status::text='submitted')
  ),false) THEN RAISE EXCEPTION 'cinematic_execution_transition_invalid'; END IF;
 ELSE
  IF (OLD.execution_started_at IS NULL AND NEW.execution_started_at IS NOT NULL) OR
   ROW(NEW.base_provider_job_id,NEW.base_video_path,NEW.base_cost_usd,NEW.base_provider_model,NEW.base_submitted_duration_seconds,NEW.provider_job_id)
   IS DISTINCT FROM ROW(OLD.base_provider_job_id,OLD.base_video_path,OLD.base_cost_usd,OLD.base_provider_model,OLD.base_submitted_duration_seconds,OLD.provider_job_id) THEN
   RAISE EXCEPTION 'cinematic_execution_transition_invalid';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_cinematic_execution() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_cinematic_execution BEFORE INSERT OR UPDATE ON public.video_jobs
 FOR EACH ROW EXECUTE FUNCTION private.guard_cinematic_execution();
INSERT INTO storage.buckets(id,name,public,file_size_limit)
 VALUES('cinematic-work','cinematic-work',false,52428800)
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit;
COMMENT ON COLUMN public.video_jobs.execution_stage IS 'V3 Plus uses a fifteen-second moderated private base, then a five-second extension. Submitting markers prevent paid-call replay on lost responses.';
COMMENT ON COLUMN public.video_jobs.base_video_path IS 'Approved base object in private cinematic-work, exactly <job UUID>/base.mp4; never a provider URL or a client-playable final video.';
