-- Server-owned starter, tutorial, portrait reservations and one-time v2 respec.
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS starter_asset_key TEXT
  CHECK (starter_asset_key IS NULL OR starter_asset_key = 'bundled:strategist');
CREATE TABLE public.character_respecs (
 character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
 profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 request_id UUID, allocation JSONB, used_at TIMESTAMPTZ
);
INSERT INTO character_respecs(character_id,profile_id)
 SELECT id,profile_id FROM characters WHERE finalized_at IS NOT NULL ON CONFLICT DO NOTHING;
CREATE TABLE public.tutorial_progress (
 profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
 battle_id UUID REFERENCES battles(id), request_id UUID NOT NULL DEFAULT gen_random_uuid(),
 dismissed_hints TEXT[] NOT NULL DEFAULT '{}', completed_at TIMESTAMPTZ,
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (dismissed_hints <@ ARRAY['theme','move','write','lock','result']::TEXT[])
);
CREATE TABLE public.initial_portrait_requests (
 character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
 request_id UUID NOT NULL, profile_id UUID NOT NULL REFERENCES profiles(id),
 status TEXT NOT NULL CHECK(status IN ('reserved','succeeded','failed')),
 free BOOLEAN NOT NULL, response JSONB, job_id UUID REFERENCES portrait_jobs(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(character_id,request_id)
);
CREATE UNIQUE INDEX initial_portrait_one_running ON initial_portrait_requests(character_id) WHERE status='reserved';
CREATE TABLE public.funnel_events (
 profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 event TEXT NOT NULL CHECK(event IN ('tutorial_started','tutorial_completed','first_prompt_submitted','result_next_battle','draft_recovered')),
 battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
 duration_ms INTEGER CHECK(duration_ms BETWEEN 0 AND 86400000), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id,event,battle_id)
);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['character_respecs','tutorial_progress','initial_portrait_requests','funnel_events'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 EXECUTE format('CREATE POLICY own_read ON public.%I FOR SELECT TO authenticated USING (profile_id = (SELECT auth.uid()))',t);
 END LOOP;
END $$;
-- All creation paths serialize on the profile. Existing clients can still make
-- their first draft, but cannot create another row after obtaining a fighter.
CREATE FUNCTION public.guard_first_character() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM profiles WHERE id=NEW.profile_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM characters WHERE profile_id=NEW.profile_id) THEN
  RAISE EXCEPTION 'fighter already exists; resume it' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_first_character BEFORE INSERT ON characters FOR EACH ROW EXECUTE FUNCTION guard_first_character();
REVOKE ALL ON FUNCTION guard_first_character() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.create_starter_fighter(p_profile_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c characters%ROWTYPE;
BEGIN
 PERFORM 1 FROM profiles WHERE id=p_profile_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile required'; END IF;
 SELECT * INTO c FROM characters WHERE profile_id=p_profile_id ORDER BY finalized_at NULLS LAST,created_at LIMIT 1 FOR UPDATE;
 IF c.id IS NOT NULL AND c.finalized_at IS NOT NULL THEN RETURN to_jsonb(c); END IF;
 IF c.id IS NULL THEN
  INSERT INTO characters(profile_id,name,archetype,battle_cry,signature_color,stat_strength,stat_stamina,stat_agility,stat_focus,finalized_at,starter_asset_key)
  VALUES(p_profile_id,'Arena Strategist','strategist','Every word counts!','#6366F1',5,5,5,5,now(),'bundled:strategist') RETURNING * INTO c;
 ELSE
  -- Existing draft art is already moderated; never expose unmoderated draft identity.
  UPDATE characters SET name='Arena Strategist',archetype='strategist',battle_cry='Every word counts!',signature_color='#6366F1',
   stat_strength=5,stat_stamina=5,stat_agility=5,stat_focus=5,finalized_at=now(),starter_asset_key='bundled:strategist'
   WHERE id=c.id AND finalized_at IS NULL RETURNING * INTO c;
 END IF;
 RETURN to_jsonb(c);
END $$;
CREATE FUNCTION public.apply_character_respec(p_profile_id UUID,p_character_id UUID,p_request_id UUID,p_stats JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c characters%ROWTYPE; r character_respecs%ROWTYPE; k TEXT; v NUMERIC; total INTEGER:=0;
BEGIN
 SELECT * INTO c FROM characters WHERE id=p_character_id AND profile_id=p_profile_id FOR UPDATE;
 IF NOT FOUND OR c.finalized_at IS NULL THEN RAISE EXCEPTION 'fighter not found'; END IF;
 SELECT * INTO r FROM character_respecs WHERE character_id=c.id AND profile_id=p_profile_id FOR UPDATE;
 IF NOT FOUND OR p_request_id IS NULL THEN RAISE EXCEPTION 'respec not eligible'; END IF;
 IF r.used_at IS NOT NULL THEN
  IF r.request_id=p_request_id THEN RETURN r.allocation; END IF;
  RAISE EXCEPTION 'free respec already used';
 END IF;
 FOREACH k IN ARRAY ARRAY['strength','stamina','agility','focus'] LOOP
  IF jsonb_typeof(p_stats->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'integer stats required'; END IF;
  v:=(p_stats->>k)::numeric;
  IF v<>trunc(v) OR v<1 OR v>10 THEN RAISE EXCEPTION 'stats must be integers 1–10'; END IF;
  total:=total+v::integer;
 END LOOP;
 IF total<>c.stat_strength+c.stat_stamina+c.stat_agility+c.stat_focus THEN RAISE EXCEPTION 'preserve current point total'; END IF;
 UPDATE characters SET stat_strength=(p_stats->>'strength')::integer,stat_stamina=(p_stats->>'stamina')::integer,
 stat_agility=(p_stats->>'agility')::integer,stat_focus=(p_stats->>'focus')::integer WHERE id=c.id;
 UPDATE character_respecs SET request_id=p_request_id,allocation=p_stats,used_at=now() WHERE character_id=c.id;
 RETURN p_stats;
END $$;
CREATE FUNCTION public.prepare_tutorial(p_profile_id UUID,p_replay BOOLEAN DEFAULT false) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t tutorial_progress%ROWTYPE; b battles%ROWTYPE;
BEGIN
 PERFORM 1 FROM profiles WHERE id=p_profile_id FOR UPDATE;
 INSERT INTO tutorial_progress(profile_id) VALUES(p_profile_id) ON CONFLICT DO NOTHING;
 SELECT * INTO t FROM tutorial_progress WHERE profile_id=p_profile_id FOR UPDATE;
 SELECT * INTO b FROM battles WHERE id=t.battle_id;
 IF t.battle_id IS NOT NULL AND (b.status='canceled' OR (p_replay AND b.completed_at IS NOT NULL)) THEN
  UPDATE tutorial_progress SET battle_id=NULL,request_id=gen_random_uuid(),dismissed_hints='{}',completed_at=NULL,started_at=now() WHERE profile_id=p_profile_id RETURNING * INTO t;
 END IF;
 RETURN to_jsonb(t);
END $$;
CREATE FUNCTION public.update_tutorial(p_profile_id UUID,p_battle_id UUID,p_hint TEXT DEFAULT NULL,p_complete BOOLEAN DEFAULT false,p_request_id UUID DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t tutorial_progress%ROWTYPE;
BEGIN
 SELECT * INTO t FROM tutorial_progress WHERE profile_id=p_profile_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'tutorial not started'; END IF;
 IF NOT EXISTS(SELECT 1 FROM battles WHERE id=p_battle_id AND player_one_id=p_profile_id AND mode='bot' AND format='bo3') THEN RAISE EXCEPTION 'invalid tutorial battle'; END IF;
 IF t.battle_id IS NULL AND p_request_id=t.request_id THEN
  IF NOT EXISTS(SELECT 1 FROM matchmaking_requests WHERE profile_id=p_profile_id AND request_id=t.request_id AND battle_id=p_battle_id) THEN RAISE EXCEPTION 'invalid request'; END IF;
  UPDATE tutorial_progress SET battle_id=p_battle_id WHERE profile_id=p_profile_id;
 ELSIF t.battle_id IS DISTINCT FROM p_battle_id THEN RAISE EXCEPTION 'wrong tutorial battle'; END IF;
 IF p_hint IS NOT NULL THEN
  IF p_hint<>ALL(ARRAY['theme','move','write','lock','result']) THEN RAISE EXCEPTION 'invalid hint'; END IF;
  UPDATE tutorial_progress SET dismissed_hints=ARRAY(SELECT DISTINCT unnest(dismissed_hints||p_hint)) WHERE profile_id=p_profile_id;
 END IF;
 IF p_complete THEN
  IF NOT EXISTS(SELECT 1 FROM battles WHERE id=p_battle_id AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'battle not completed'; END IF;
  UPDATE tutorial_progress SET completed_at=COALESCE(completed_at,now()) WHERE profile_id=p_profile_id;
 END IF;
 SELECT * INTO t FROM tutorial_progress WHERE profile_id=p_profile_id;
 RETURN to_jsonb(t);
END $$;
CREATE FUNCTION public.reserve_initial_portrait(p_profile_id UUID,p_character_id UUID,p_request_id UUID,p_free_only BOOLEAN DEFAULT false) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c characters%ROWTYPE; r initial_portrait_requests%ROWTYPE; f BOOLEAN;
BEGIN
 SELECT * INTO c FROM characters WHERE id=p_character_id AND profile_id=p_profile_id FOR UPDATE;
 IF NOT FOUND OR p_request_id IS NULL THEN RAISE EXCEPTION 'fighter not found'; END IF;
 SELECT * INTO r FROM initial_portrait_requests WHERE character_id=c.id AND request_id=p_request_id;
 IF FOUND THEN RETURN to_jsonb(r)||jsonb_build_object('replayed',true); END IF;
 IF c.finalized_at IS NOT NULL AND c.starter_asset_key IS NULL AND c.portrait_seed IS NOT NULL THEN RAISE EXCEPTION 'use paid portrait editing'; END IF;
 IF c.finalized_at IS NOT NULL AND NOT COALESCE((SELECT is_test_user FROM profiles WHERE id=p_profile_id),false)
  AND EXISTS(SELECT 1 FROM battles WHERE (player_one_character_id=c.id OR player_two_character_id=c.id)
    AND status NOT IN ('completed','expired','canceled','moderation_failed','generation_failed')) THEN RAISE EXCEPTION 'fighter in active battle'; END IF;
 f:=CASE WHEN c.finalized_at IS NOT NULL AND c.starter_asset_key IS NULL THEN c.draft_portrait_renders<1 ELSE c.draft_portrait_renders<3 END;
 IF NOT f AND (p_free_only OR c.finalized_at IS NOT NULL) THEN RAISE EXCEPTION 'initial portraits exhausted'; END IF;
 IF EXISTS(SELECT 1 FROM initial_portrait_requests WHERE character_id=c.id AND status='reserved') THEN RAISE EXCEPTION 'portrait already processing'; END IF;
 INSERT INTO initial_portrait_requests(character_id,request_id,profile_id,status,free) VALUES(c.id,p_request_id,p_profile_id,'reserved',f) RETURNING * INTO r;
 IF f THEN UPDATE characters SET draft_portrait_renders=draft_portrait_renders+1 WHERE id=c.id; END IF;
 RETURN to_jsonb(r)||jsonb_build_object('replayed',false);
END $$;
CREATE FUNCTION public.finish_initial_portrait(p_profile_id UUID,p_character_id UUID,p_request_id UUID,p_response JSONB DEFAULT NULL) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r initial_portrait_requests%ROWTYPE; tx wallet_transactions%ROWTYPE;
BEGIN
 PERFORM 1 FROM characters WHERE id=p_character_id AND profile_id=p_profile_id FOR UPDATE;
 SELECT * INTO r FROM initial_portrait_requests WHERE character_id=p_character_id AND profile_id=p_profile_id AND request_id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'reserved' THEN RETURN; END IF;
 UPDATE initial_portrait_requests SET status=CASE WHEN p_response IS NULL THEN 'failed' ELSE 'succeeded' END,response=p_response WHERE character_id=p_character_id AND request_id=p_request_id;
 IF r.free AND p_response IS NULL THEN UPDATE characters SET draft_portrait_renders=greatest(0,draft_portrait_renders-1) WHERE id=p_character_id; END IF;
 IF NOT r.free AND p_response IS NULL THEN
  SELECT * INTO tx FROM wallet_transactions WHERE profile_id=p_profile_id AND idempotency_key='draft_render_'||p_character_id::text||'_'||p_request_id::text AND amount<0;
  IF FOUND THEN PERFORM grant_credits(p_profile_id,-tx.amount,'draft_render_refund:failed','refund_'||tx.id::text,NULL,NULL,jsonb_build_object('character_id',p_character_id)); END IF;
 END IF;
END $$;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('create_starter_fighter','apply_character_respec','prepare_tutorial','update_tutorial','reserve_initial_portrait','finish_initial_portrait') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $$;
