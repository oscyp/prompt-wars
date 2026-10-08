-- Composer is independent of combat. Existing rows retain their policy forever.
ALTER TABLE public.battles
 ADD COLUMN IF NOT EXISTS prompt_experience_version smallint NOT NULL DEFAULT 1 CHECK (prompt_experience_version IN (1,2)),
 ADD COLUMN IF NOT EXISTS judge_policy_version text NOT NULL DEFAULT 'v1.0.0-mvp' CHECK (judge_policy_version IN ('v1.0.0-mvp','v2.0.0-ideas')),
 ADD COLUMN IF NOT EXISTS situation_catalog_version integer;
ALTER TABLE public.battle_rounds ADD COLUMN IF NOT EXISTS situation_snapshot jsonb;

CREATE TABLE IF NOT EXISTS public.prompt_situation_catalog (
 catalog_version integer NOT NULL,
 id text NOT NULL,
 theme text NOT NULL,
 position smallint NOT NULL CHECK (position BETWEEN 0 AND 2),
 environment_id text NOT NULL,
 body text NOT NULL CHECK (char_length(body) BETWEEN 40 AND 400),
 PRIMARY KEY(catalog_version,id), UNIQUE(catalog_version,theme,position)
);
ALTER TABLE public.prompt_situation_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prompt_situation_catalog FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.prompt_situation_catalog TO service_role;

CREATE OR REPLACE FUNCTION public.select_prompt_situation(p_battle_id uuid,p_theme text,p_round integer,p_catalog integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h bigint:=0; i integer; chosen record;
BEGIN
 IF p_catalog IS DISTINCT FROM 1 OR p_round IS NULL OR p_round NOT BETWEEN 1 AND 3 THEN
   RAISE EXCEPTION 'Unsupported situation theme, round or catalogue' USING ERRCODE='22023';
 END IF;
 FOR i IN 1..length(p_battle_id::text) LOOP h:=(h*31+ascii(substr(p_battle_id::text,i,1)))%2147483647; END LOOP;
 SELECT * INTO chosen FROM prompt_situation_catalog WHERE catalog_version=p_catalog AND theme=p_theme AND position=(h%3+p_round-1)%3;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unsupported situation theme, round or catalogue' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('id',chosen.id,'catalogVersion',chosen.catalog_version,'environmentId',chosen.environment_id,'text',chosen.body);
END $$;
REVOKE ALL ON FUNCTION public.select_prompt_situation(uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.select_prompt_situation(uuid,text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.freeze_prompt_experience()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.prompt_experience_version IS DISTINCT FROM OLD.prompt_experience_version
    OR NEW.judge_policy_version IS DISTINCT FROM OLD.judge_policy_version
    OR NEW.situation_catalog_version IS DISTINCT FROM OLD.situation_catalog_version) THEN
   RAISE EXCEPTION 'Prompt experience is immutable';
 END IF;
 IF NEW.prompt_experience_version=2 AND (NEW.format<>'bo3' OR NEW.situation_catalog_version IS DISTINCT FROM 1 OR NEW.judge_policy_version<>'v2.0.0-ideas') THEN
   RAISE EXCEPTION 'Invalid composer policy';
 END IF;
 IF NEW.prompt_experience_version=1 AND (NEW.situation_catalog_version IS NOT NULL OR NEW.judge_policy_version<>'v1.0.0-mvp') THEN
   RAISE EXCEPTION 'Invalid legacy policy';
 END IF;
 IF TG_OP='UPDATE' AND OLD.face_off_revealed_at IS NOT NULL AND NEW.prompt_experience_version=2 AND NEW.theme IS DISTINCT FROM OLD.theme THEN
   RAISE EXCEPTION 'Published theme is immutable';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS freeze_prompt_experience ON public.battles;
CREATE TRIGGER freeze_prompt_experience BEFORE INSERT OR UPDATE ON public.battles FOR EACH ROW EXECUTE FUNCTION public.freeze_prompt_experience();

CREATE OR REPLACE FUNCTION public.publish_prompt_situation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b battles%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NEW.situation_snapshot IS DISTINCT FROM OLD.situation_snapshot THEN RAISE EXCEPTION 'Published situation is immutable'; END IF;
   RETURN NEW;
 END IF;
 SELECT * INTO b FROM battles WHERE id=NEW.battle_id FOR UPDATE;
 IF b.prompt_experience_version=2 THEN
   NEW.situation_snapshot:=select_prompt_situation(b.id,b.theme,NEW.round_number,b.situation_catalog_version);
 ELSE NEW.situation_snapshot:=NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS publish_prompt_situation ON public.battle_rounds;
CREATE TRIGGER publish_prompt_situation BEFORE INSERT OR UPDATE ON public.battle_rounds FOR EACH ROW EXECUTE FUNCTION public.publish_prompt_situation();
REVOKE ALL ON FUNCTION public.freeze_prompt_experience(), public.publish_prompt_situation() FROM PUBLIC,anon,authenticated;

-- Parent lock serializes opening with leave, submission and recovery. The trigger
-- publishes the scene in the same transaction as deadline/current_round.
CREATE OR REPLACE FUNCTION public.open_next_prompt_round(p_battle_id uuid,p_previous_round integer,p_deadline timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b battles%ROWTYPE; previous battle_rounds%ROWTYPE; opened battle_rounds%ROWTYPE;
BEGIN
 SELECT * INTO b FROM battles WHERE id=p_battle_id FOR UPDATE;
 IF NOT FOUND OR b.format<>'bo3' OR b.status NOT IN ('waiting_for_prompts','resolving') THEN RETURN NULL; END IF;
 IF p_previous_round<1 OR p_previous_round>=COALESCE(b.best_of,3) THEN RETURN NULL; END IF;
 IF b.current_round=p_previous_round+1 THEN
   SELECT * INTO opened FROM battle_rounds WHERE battle_id=b.id AND round_number=b.current_round;
   RETURN to_jsonb(opened);
 END IF;
 IF b.current_round IS DISTINCT FROM p_previous_round THEN RETURN NULL; END IF;
 SELECT * INTO previous FROM battle_rounds WHERE battle_id=b.id AND round_number=p_previous_round FOR UPDATE;
 IF NOT FOUND OR previous.status NOT IN ('result_ready','expired') OR previous.is_ko
   OR COALESCE(b.player_one_rounds_won,0)>=2 OR COALESCE(b.player_two_rounds_won,0)>=2 THEN RETURN NULL; END IF;
 IF p_deadline IS NULL OR p_deadline<=NOW() THEN RAISE EXCEPTION 'Future round deadline required'; END IF;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline)
 VALUES(b.id,p_previous_round+1,'waiting_for_prompts',p_deadline)
 ON CONFLICT(battle_id,round_number) DO NOTHING;
 SELECT * INTO opened FROM battle_rounds WHERE battle_id=b.id AND round_number=p_previous_round+1;
 UPDATE battles SET current_round=opened.round_number,status='waiting_for_prompts',updated_at=NOW() WHERE id=b.id;
 RETURN to_jsonb(opened);
END $$;
REVOKE ALL ON FUNCTION public.open_next_prompt_round(uuid,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_next_prompt_round(uuid,integer,timestamptz) TO service_role;

-- Matching is checked again while holding the target row. Old queues/invites
-- remain legacy; a new client may finish them without migrating their policy.
CREATE OR REPLACE FUNCTION public.match_battle_request_composer(
 p_battle_id uuid,p_player_two_id uuid,p_player_two_character_id uuid,p_theme text,p_request_id uuid,
 p_previous_battle_id uuid DEFAULT NULL,p_client_contract integer DEFAULT NULL,p_experience smallint DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b battles%ROWTYPE; prior battles%ROWTYPE;
BEGIN
 SELECT * INTO b FROM battles WHERE id=p_battle_id FOR UPDATE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 IF b.prompt_experience_version=2 AND COALESCE(p_client_contract,0)<3 THEN RAISE EXCEPTION 'client_update_required'; END IF;
 IF b.prompt_experience_version<>p_experience THEN RETURN FALSE; END IF;
 IF p_previous_battle_id IS NOT NULL THEN
   SELECT * INTO prior FROM battles WHERE id=p_previous_battle_id;
   IF NOT FOUND OR prior.prompt_experience_version<>b.prompt_experience_version OR prior.rules_version<>b.rules_version THEN RETURN FALSE; END IF;
 END IF;
 RETURN match_battle_request(p_battle_id,p_player_two_id,p_player_two_character_id,p_theme,p_request_id,p_previous_battle_id);
END $$;
REVOKE ALL ON FUNCTION public.match_battle_request_composer(uuid,uuid,uuid,text,uuid,uuid,integer,smallint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.match_battle_request_composer(uuid,uuid,uuid,text,uuid,uuid,integer,smallint) TO service_role;

INSERT INTO public.prompt_situation_catalog(catalog_version,id,theme,position,environment_id,body) VALUES
(1,'frozen-1','Overcome an impossible challenge',0,'frozen-void','A narrow ice bridge spans the chasm. Low stone posts interrupt its edges, while loose snow drifts across the smooth surface in uneven gusts.'),
(1,'frozen-2','Overcome an impossible challenge',1,'frozen-void','Tall ice pillars divide the frozen courtyard. A shallow ridge crosses the centre, and wind lifts powder from the open ground between the pillars.'),
(1,'frozen-3','Overcome an impossible challenge',2,'frozen-void','Frost covers a circular stone platform. One side lies in deep shadow, while a low wall and scattered snow mark the opposite edge.'),
(1,'ember-1','Turn weakness into strength',0,'ember-forge','Warm light spills between the forge pillars. An empty metal trough stands beside the open floor, and fine ash shifts whenever someone moves nearby.'),
(1,'ember-2','Turn weakness into strength',1,'ember-forge','A broad workbench divides the forge floor. Hanging chains sway gently overhead, while orange light makes long moving shadows across the stone beneath them.'),
(1,'ember-3','Turn weakness into strength',2,'ember-forge','A shallow channel runs across the cooled foundry floor. A stone ledge borders one side, and a thin layer of soot records passing footsteps.'),
(1,'storm-1','The calm before the storm',0,'storm-citadel','Rain taps the citadel terrace. A torn banner hangs beside a stone pillar, while shallow puddles reflect the light from an open archway.'),
(1,'storm-2','The calm before the storm',1,'storm-citadel','Two low stairways meet on the exposed battlement. Gusts carry mist through the gap between them, briefly hiding the markings on the wet stone.'),
(1,'storm-3','The calm before the storm',2,'storm-citadel','A broken parapet opens onto a sheltered courtyard. Loose cloth flutters across the opening, and distant lightning briefly brightens the otherwise dim floor.'),
(1,'verdant-1','Victory from the jaws of defeat',0,'verdant-reactor','Thick roots cross the abandoned reactor floor. A low railing surrounds an empty pit, and pale light filters through leaves above the open space.'),
(1,'verdant-2','Victory from the jaws of defeat',1,'verdant-reactor','A fallen column rests across the garden walkway. Hanging vines brush its surface, while a narrow strip of clear ground runs along either side.'),
(1,'verdant-3','Victory from the jaws of defeat',2,'verdant-reactor','Moss softens the edges of a raised platform. An open metal frame casts a grid of shadows, and scattered leaves slide across the stone.'),
(1,'neon-1','Precision over power',0,'neon-nexus','Lights flicker above the platform. A loose cable hangs between two supports, and a thin sheet of water covers part of the floor below.'),
(1,'neon-2','Precision over power',1,'neon-nexus','A reflective panel stands beside the neon walkway. Two waist-high barriers leave a narrow opening, while passing light repeatedly changes the shadows between them.'),
(1,'neon-3','Precision over power',2,'neon-nexus','Painted lines cross the dark arena floor. A shallow step interrupts one edge, and overhead signs cast alternating pools of bright light and shadow.')
ON CONFLICT(catalog_version,id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_matchmaking_battle_composer(
  p_player_one_id UUID,
  p_character_id UUID,
  p_mode battle_mode,
  p_request_id UUID,
  p_rules_version SMALLINT,
  p_bot_persona_id UUID DEFAULT NULL,
  p_theme TEXT DEFAULT NULL,
  p_prompt_experience SMALLINT DEFAULT 1,
  p_client_contract INTEGER DEFAULT NULL
)
RETURNS TABLE (
  battle_id UUID,
  replayed_request BOOLEAN,
  matched BOOLEAN,
  theme TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_battle public.battles%ROWTYPE;
  v_mapped_battle_id UUID;
  v_timeout_hours INTEGER;
BEGIN
  IF p_rules_version NOT IN (1,2) OR p_rules_version IS NULL THEN RAISE EXCEPTION 'Unsupported rules version'; END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id required' USING ERRCODE = '22023';
  END IF;

  -- Serialise a literal request replay first. hashtextextended is stable inside
  -- Postgres and avoids a separate lock table.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_player_one_id::TEXT || ':' || p_request_id::TEXT, 0)
  );

  SELECT mr.battle_id
  INTO v_mapped_battle_id
  FROM public.matchmaking_requests AS mr
  WHERE mr.profile_id = p_player_one_id
    AND mr.request_id = p_request_id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_battle
    FROM public.battles
    WHERE id = v_mapped_battle_id;

    IF v_battle.prompt_experience_version=2 AND COALESCE(p_client_contract,0)<3 THEN RAISE EXCEPTION 'client_update_required'; END IF;
    RETURN QUERY SELECT
      v_battle.id,
      TRUE,
      v_battle.status <> 'created'::battle_status,
      v_battle.theme;
    RETURN;
  END IF;

  -- Compatibility lookup for a deployment upgraded from the short-lived
  -- single-column implementation.
  SELECT *
  INTO v_battle
  FROM public.battles
  WHERE player_one_id = p_player_one_id
    AND matchmaking_request_id = p_request_id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    INSERT INTO public.matchmaking_requests (profile_id, request_id, battle_id)
    VALUES (p_player_one_id, p_request_id, v_battle.id)
    ON CONFLICT (profile_id, request_id) DO NOTHING;
    IF v_battle.prompt_experience_version=2 AND COALESCE(p_client_contract,0)<3 THEN RAISE EXCEPTION 'client_update_required'; END IF;
    RETURN QUERY SELECT
      v_battle.id,
      TRUE,
      v_battle.status <> 'created'::battle_status,
      v_battle.theme;
    RETURN;
  END IF;

  IF p_prompt_experience IS NULL OR p_prompt_experience NOT IN (1,2) THEN RAISE EXCEPTION 'Unsupported prompt experience'; END IF;
  IF p_prompt_experience=2 AND COALESCE(p_client_contract,0)<3 THEN RAISE EXCEPTION 'client_update_required'; END IF;

  v_timeout_hours := CASE
    WHEN p_mode = 'ranked' THEN 2
    WHEN p_mode IN ('friend_challenge', 'unranked', 'bot') THEN 8
    ELSE 2
  END;

  IF p_mode <> 'bot'::battle_mode THEN
    -- A different tap/request for an already-open search resumes that search.
    -- Lock the natural queue key so concurrent first calls cannot both insert.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        p_player_one_id::TEXT || ':' || p_mode::TEXT || ':' || p_character_id::TEXT,
        1
      )
    );

    SELECT *
    INTO v_battle
    FROM public.battles
    WHERE player_one_id = p_player_one_id
      AND player_one_character_id = p_character_id
      AND mode = p_mode
      AND status = 'created'::battle_status
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      INSERT INTO public.matchmaking_requests (profile_id, request_id, battle_id)
      VALUES (p_player_one_id, p_request_id, v_battle.id)
      ON CONFLICT (profile_id, request_id) DO NOTHING;
      IF v_battle.prompt_experience_version=2 AND COALESCE(p_client_contract,0)<3 THEN RAISE EXCEPTION 'client_update_required'; END IF;
    RETURN QUERY SELECT v_battle.id, TRUE, FALSE, v_battle.theme;
      RETURN;
    END IF;

    INSERT INTO public.battles (
      prompt_experience_version,judge_policy_version,situation_catalog_version,
      rules_version,
      player_one_id,
      player_one_character_id,
      mode,
      status,
      format,
      best_of,
      matchmaking_request_id,
      player_one_prompt_deadline
    ) VALUES (
      p_prompt_experience,CASE WHEN p_prompt_experience=2 THEN 'v2.0.0-ideas' ELSE 'v1.0.0-mvp' END,CASE WHEN p_prompt_experience=2 THEN 1 ELSE NULL END,
      p_rules_version,
      p_player_one_id,
      p_character_id,
      p_mode,
      'created'::battle_status,
      'bo3',
      3,
      p_request_id,
      NOW() + (v_timeout_hours || ' hours')::INTERVAL
    )
    RETURNING * INTO v_battle;
  ELSE
    IF p_bot_persona_id IS NULL THEN
      RAISE EXCEPTION 'bot_persona_id required for bot matchmaking'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.battles (
      prompt_experience_version,judge_policy_version,situation_catalog_version,
      rules_version,
      player_one_id,
      player_one_character_id,
      is_player_two_bot,
      bot_persona_id,
      mode,
      status,
      format,
      best_of,
      theme,
      theme_revealed_at,
      matched_at,
      matchmaking_request_id,
      player_one_prompt_deadline
    ) VALUES (
      p_prompt_experience,CASE WHEN p_prompt_experience=2 THEN 'v2.0.0-ideas' ELSE 'v1.0.0-mvp' END,CASE WHEN p_prompt_experience=2 THEN 1 ELSE NULL END,
      p_rules_version,
      p_player_one_id,
      p_character_id,
      TRUE,
      p_bot_persona_id,
      p_mode,
      'matched'::battle_status,
      'bo3',
      3,
      p_theme,
      NOW(),
      NOW(),
      p_request_id,
      NOW() + (v_timeout_hours || ' hours')::INTERVAL
    )
    RETURNING * INTO v_battle;
  END IF;

  INSERT INTO public.matchmaking_requests (profile_id, request_id, battle_id)
  VALUES (p_player_one_id, p_request_id, v_battle.id);

  RETURN QUERY SELECT
    v_battle.id,
    FALSE,
    v_battle.status <> 'created'::battle_status,
    v_battle.theme;
END;
$$;

REVOKE ALL ON FUNCTION public.create_matchmaking_battle_composer(
  UUID, UUID, battle_mode, UUID, SMALLINT, UUID, TEXT, SMALLINT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_matchmaking_battle_composer(
  UUID, UUID, battle_mode, UUID, SMALLINT, UUID, TEXT, SMALLINT, INTEGER
) TO service_role;


