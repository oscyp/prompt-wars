-- Durable reservation leases. Staged rows never become current outside the fenced commit.
ALTER TABLE public.initial_portrait_requests ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.initial_portrait_requests ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE public.initial_portrait_requests ADD COLUMN IF NOT EXISTS appearance_version integer;
ALTER TABLE public.character_portraits ADD COLUMN IF NOT EXISTS initial_portrait_request_id uuid;
CREATE INDEX IF NOT EXISTS initial_portrait_expiry ON public.initial_portrait_requests(lease_expires_at) WHERE status='reserved';

CREATE OR REPLACE FUNCTION public.check_initial_portrait(p_profile_id uuid,p_character_id uuid,p_request_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r initial_portrait_requests%ROWTYPE; j portrait_jobs%ROWTYPE;
BEGIN
 PERFORM 1 FROM profiles WHERE id=p_profile_id FOR UPDATE;
 PERFORM 1 FROM characters WHERE id=p_character_id AND profile_id=p_profile_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'fighter not found'; END IF;
 SELECT * INTO r FROM initial_portrait_requests WHERE character_id=p_character_id AND profile_id=p_profile_id
  AND (request_id=p_request_id OR (p_request_id IS NULL AND status='reserved')) ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.status='reserved' THEN
  SELECT * INTO j FROM portrait_jobs WHERE id=r.job_id;
  IF coalesce(r.lease_expires_at,r.created_at+interval '15 minutes')<=clock_timestamp()
     OR j.status IN ('failed','moderation_rejected') THEN
   -- The old finalizer is an internal idempotent quota/refund helper only.
   PERFORM finish_initial_portrait(p_profile_id,p_character_id,r.request_id,NULL);
   UPDATE initial_portrait_requests SET lease_token=NULL,lease_expires_at=NULL WHERE character_id=p_character_id AND request_id=r.request_id RETURNING * INTO r;
  END IF;
 END IF;
 RETURN to_jsonb(r)-'lease_token';
END; $$;

CREATE OR REPLACE FUNCTION public.claim_initial_portrait(p_profile_id uuid,p_character_id uuid,p_request_id uuid,p_free_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old jsonb; r initial_portrait_requests%ROWTYPE;
BEGIN
 PERFORM 1 FROM profiles WHERE id=p_profile_id FOR UPDATE;
 PERFORM 1 FROM characters WHERE id=p_character_id AND profile_id=p_profile_id FOR UPDATE;
 IF NOT FOUND OR p_request_id IS NULL THEN RAISE EXCEPTION 'fighter not found'; END IF;
 PERFORM check_initial_portrait(p_profile_id,p_character_id,NULL);
 old:=check_initial_portrait(p_profile_id,p_character_id,p_request_id);
 IF old IS NOT NULL THEN RETURN old||jsonb_build_object('worker',false); END IF;
 PERFORM reserve_initial_portrait(p_profile_id,p_character_id,p_request_id,p_free_only);
 UPDATE initial_portrait_requests SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '15 minutes'
 WHERE character_id=p_character_id AND request_id=p_request_id RETURNING * INTO r;
 RETURN to_jsonb(r)||jsonb_build_object('worker',true);
END; $$;

CREATE OR REPLACE FUNCTION public.start_initial_portrait_work(p_profile_id uuid,p_character_id uuid,p_request_id uuid,p_token uuid,p_prompt text,p_style text,p_seed bigint,p_price integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c characters%ROWTYPE; r initial_portrait_requests%ROWTYPE; job uuid; seed bigint;
BEGIN
 PERFORM 1 FROM profiles WHERE id=p_profile_id FOR UPDATE;
 SELECT * INTO c FROM characters WHERE id=p_character_id AND profile_id=p_profile_id FOR UPDATE;
 SELECT * INTO r FROM initial_portrait_requests WHERE character_id=p_character_id AND profile_id=p_profile_id AND request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR c.id IS NULL OR r.status<>'reserved' OR r.lease_token IS DISTINCT FROM p_token OR r.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'portrait lease lost'; END IF;
 IF r.job_id IS NOT NULL THEN RETURN jsonb_build_object('character',to_jsonb(c),'job_id',r.job_id,'seed',(SELECT pj.seed FROM portrait_jobs pj WHERE pj.id=r.job_id)); END IF;
 IF c.finalized_at IS NOT NULL AND (p_prompt IS DISTINCT FROM coalesce(c.portrait_prompt_raw,'') OR p_style IS DISTINCT FROM coalesce(c.art_style,'painterly')) THEN RAISE EXCEPTION 'saved appearance changed; retry'; END IF;
 IF NOT r.free THEN
  IF p_price IS NULL OR p_price<0 THEN RAISE EXCEPTION 'invalid price'; END IF;
  IF p_price>0 THEN PERFORM spend_credits(p_profile_id,p_price,'draft_render','draft_render_'||c.id::text||'_'||p_request_id::text,NULL,NULL,jsonb_build_object('character_id',c.id)); END IF;
 END IF;
 seed:=CASE WHEN c.finalized_at IS NOT NULL AND c.portrait_seed IS NOT NULL THEN c.portrait_seed ELSE p_seed END;
 INSERT INTO portrait_jobs(character_id,profile_id,kind,portrait_kind,status,seed,prompt_payload,attempt)
 VALUES(c.id,p_profile_id,'initial','fighter','running',seed,jsonb_build_object('raw',p_prompt,'art_style',p_style),1) RETURNING id INTO job;
 UPDATE initial_portrait_requests SET job_id=job,appearance_version=coalesce(c.appearance_version,0) WHERE character_id=c.id AND request_id=p_request_id;
 RETURN jsonb_build_object('character',to_jsonb(c),'job_id',job,'seed',seed);
END; $$;

CREATE OR REPLACE FUNCTION public.fail_initial_portrait(p_profile_id uuid,p_character_id uuid,p_request_id uuid,p_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM profiles WHERE id=p_profile_id FOR UPDATE;
 PERFORM 1 FROM characters WHERE id=p_character_id AND profile_id=p_profile_id FOR UPDATE;
 PERFORM 1 FROM initial_portrait_requests WHERE character_id=p_character_id AND profile_id=p_profile_id AND request_id=p_request_id AND status='reserved' AND lease_token=p_token FOR UPDATE;
 IF FOUND THEN PERFORM finish_initial_portrait(p_profile_id,p_character_id,p_request_id,NULL); END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.commit_initial_portrait(p_profile_id uuid,p_character_id uuid,p_request_id uuid,p_token uuid,p_fighter_id uuid,p_avatar_id uuid,p_response jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c characters%ROWTYPE; r initial_portrait_requests%ROWTYPE; j portrait_jobs%ROWTYPE; f character_portraits%ROWTYPE; a character_portraits%ROWTYPE; v integer;
BEGIN
 PERFORM 1 FROM profiles WHERE id=p_profile_id FOR UPDATE;
 SELECT * INTO c FROM characters WHERE id=p_character_id AND profile_id=p_profile_id FOR UPDATE;
 SELECT * INTO r FROM initial_portrait_requests WHERE character_id=p_character_id AND profile_id=p_profile_id AND request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR c.id IS NULL OR r.status<>'reserved' OR r.lease_token IS DISTINCT FROM p_token OR r.lease_expires_at<=clock_timestamp() OR coalesce(c.appearance_version,0) IS DISTINCT FROM r.appearance_version THEN RETURN false; END IF;
 SELECT * INTO j FROM portrait_jobs WHERE id=r.job_id AND character_id=c.id;
 SELECT * INTO f FROM character_portraits WHERE id=p_fighter_id AND character_id=c.id AND profile_id=p_profile_id AND kind='fighter' AND moderation_status='approved' AND generation_job_id=r.job_id AND initial_portrait_request_id=p_request_id;
 IF NOT FOUND OR j.id IS NULL OR p_response IS NULL THEN RAISE EXCEPTION 'invalid staged fighter'; END IF;
 IF p_avatar_id IS NOT NULL THEN
  SELECT * INTO a FROM character_portraits WHERE id=p_avatar_id AND character_id=c.id AND profile_id=p_profile_id AND kind='avatar' AND moderation_status='approved' AND initial_portrait_request_id=p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid staged avatar'; END IF;
 END IF;
 PERFORM finish_initial_portrait(p_profile_id,p_character_id,p_request_id,p_response);
 UPDATE character_portraits SET is_current=false WHERE character_id=c.id AND (kind='fighter' OR (p_avatar_id IS NOT NULL AND kind='avatar')) AND is_current;
 UPDATE characters SET portrait_id=f.id,avatar_portrait_id=coalesce(a.id,avatar_portrait_id),portrait_seed=j.seed,
  portrait_prompt_raw=nullif(j.prompt_payload->>'raw',''),art_style=j.prompt_payload->>'art_style',portrait_prompt_resolved=f.prompt_snapshot->>'resolved'
 WHERE id=c.id RETURNING appearance_version INTO v;
 UPDATE character_portraits SET is_current=true,appearance_version=v WHERE id IN(f.id,a.id);
 UPDATE initial_portrait_requests SET lease_token=NULL,lease_expires_at=NULL WHERE character_id=c.id AND request_id=p_request_id;
 RETURN true;
END; $$;

-- Remove bypasses: the original functions remain callable by owner functions/fixtures only.
REVOKE ALL ON FUNCTION public.reserve_initial_portrait(uuid,uuid,uuid,boolean),public.finish_initial_portrait(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('check_initial_portrait','claim_initial_portrait','start_initial_portrait_work','fail_initial_portrait','commit_initial_portrait') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $$;

-- Restore the age attestation lost when the welcome-grant trigger replaced its predecessor.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  generated_username TEXT;
  generated_display_name TEXT;
BEGIN
  IF NEW.raw_user_meta_data->'age_confirmed' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'age_gate_failed: account creation requires 18+ confirmation';
  END IF;
  generated_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 15);
  generated_display_name := left(
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), ''), 'Player'),
    40
  );

  INSERT INTO public.profiles (id, username, display_name, age_confirmed_at)
  VALUES (NEW.id, generated_username, generated_display_name, now())
  ON CONFLICT (id) DO NOTHING;

  -- Never let a credit grant block account creation. This trigger fires on
  -- auth.users INSERT, so an exception here fails the signup itself -- the one
  -- outcome strictly worse than starting with no credits.
  BEGIN
    PERFORM public.grant_credits(
      NEW.id,
      10,
      'welcome_grant',
      'welcome_' || NEW.id::text,
      NULL,
      NULL,
      jsonb_build_object('source', 'signup')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'welcome grant failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;


-- Staged artifacts cannot be surfaced via history/restore while a request is unfinished or failed.
DROP POLICY IF EXISTS initial_portrait_published_read ON public.character_portraits;
CREATE POLICY initial_portrait_published_read ON public.character_portraits AS RESTRICTIVE FOR SELECT TO authenticated
USING (initial_portrait_request_id IS NULL OR EXISTS(SELECT 1 FROM public.initial_portrait_requests r
 WHERE r.character_id=character_portraits.character_id AND r.request_id=initial_portrait_request_id AND r.status='succeeded'));
CREATE OR REPLACE FUNCTION public.guard_initial_portrait_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE req uuid; cid uuid;
BEGIN
 IF TG_TABLE_NAME='character_portraits' THEN
  IF NOT NEW.is_current OR NEW.initial_portrait_request_id IS NULL THEN RETURN NEW; END IF;
  req:=NEW.initial_portrait_request_id;cid:=NEW.character_id;
 ELSE
  FOR req,cid IN SELECT initial_portrait_request_id,character_id FROM character_portraits
   WHERE id IN(NEW.portrait_id,NEW.avatar_portrait_id) AND initial_portrait_request_id IS NOT NULL LOOP
   IF NOT EXISTS(SELECT 1 FROM initial_portrait_requests WHERE character_id=cid AND request_id=req AND status='succeeded') THEN RAISE EXCEPTION 'initial portrait has not been committed'; END IF;
  END LOOP;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM initial_portrait_requests WHERE character_id=cid AND request_id=req AND status='succeeded') THEN RAISE EXCEPTION 'initial portrait has not been committed'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS initial_portrait_publication ON public.character_portraits;
CREATE TRIGGER initial_portrait_publication BEFORE INSERT OR UPDATE OF is_current ON public.character_portraits FOR EACH ROW EXECUTE FUNCTION public.guard_initial_portrait_publication();
DROP TRIGGER IF EXISTS initial_portrait_character_pointer ON public.characters;
CREATE TRIGGER initial_portrait_character_pointer BEFORE UPDATE OF portrait_id,avatar_portrait_id ON public.characters FOR EACH ROW EXECUTE FUNCTION public.guard_initial_portrait_publication();
REVOKE ALL ON FUNCTION public.guard_initial_portrait_publication() FROM PUBLIC,anon,authenticated;
