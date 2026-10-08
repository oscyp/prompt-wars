-- Phase 1: additive schema. Deploy compatible resolvers before applying activation.
-- Existing battles include queues/invitations and deliberately remain policy 1.
ALTER TABLE public.battles ADD COLUMN IF NOT EXISTS bot_policy_version smallint NOT NULL DEFAULT 1
 CHECK (bot_policy_version IN (1,2));

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.bot_tactic_catalog (
 catalog_version integer NOT NULL,
 situation_catalog_version integer NOT NULL,
 situation_id text NOT NULL,
 move_type public.move_type NOT NULL,
 prompt_text text NOT NULL CHECK (char_length(prompt_text) BETWEEN 20 AND 800),
 PRIMARY KEY(catalog_version,situation_catalog_version,situation_id,move_type),
 FOREIGN KEY(situation_catalog_version,situation_id) REFERENCES public.prompt_situation_catalog(catalog_version,id)
);
CREATE TABLE IF NOT EXISTS private.bot_series (
 battle_id uuid PRIMARY KEY REFERENCES public.battles(id) ON DELETE CASCADE,
 seed bytea NOT NULL CHECK (octet_length(seed)=32),
 catalog_version integer NOT NULL CHECK (catalog_version=1),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS private.bot_round_choices (
 battle_id uuid NOT NULL REFERENCES private.bot_series(battle_id) ON DELETE CASCADE,
 round_number smallint NOT NULL CHECK(round_number BETWEEN 1 AND 3),
 catalog_version integer NOT NULL,
 situation_snapshot jsonb NOT NULL,
 move_type public.move_type NOT NULL,
 prompt_text text NOT NULL CHECK (char_length(prompt_text) BETWEEN 20 AND 800),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(battle_id,round_number),
 FOREIGN KEY(battle_id,round_number) REFERENCES public.battle_rounds(battle_id,round_number) ON DELETE CASCADE
);
ALTER TABLE private.bot_tactic_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bot_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bot_round_choices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.bot_tactic_catalog,private.bot_series,private.bot_round_choices FROM PUBLIC,anon,authenticated,service_role;
-- Workers can inspect immutable audit data. Only owned DB functions insert state.
GRANT SELECT ON private.bot_tactic_catalog,private.bot_series,private.bot_round_choices TO service_role;

-- This is server-only content; never import or copy it into the app catalogue.
-- One independently authored tactic per scene and type, frozen as catalogue 1.
INSERT INTO private.bot_tactic_catalog(catalog_version,situation_catalog_version,situation_id,move_type,prompt_text) VALUES
(1,1,'frozen-1','attack','I tap the snow beside a bridge post, then advance along its sheltered edge. I want the gust to disguise my first step while the post narrows the reply.'),
(1,1,'frozen-1','defense','I plant a hand against a low post and shorten my stance on the ice bridge. I want a stable pivot that lets me turn aside without sliding toward the chasm.'),
(1,1,'frozen-1','finisher','I draw back along the bridge, then pivot tightly around the nearest stone post into a committed strike. I want a wide pursuit to leave the inside route open.'),
(1,1,'frozen-2','attack','I trace a shallow curve around an ice pillar before crossing the courtyard ridge. I want the pillar to hide the direction of my approach until I reach firmer footing.'),
(1,1,'frozen-2','defense','I back toward the shallow ridge with a pillar beside my shoulder. I want to limit the available approach while keeping my next step out of the drifting powder.'),
(1,1,'frozen-2','finisher','I pause behind an ice pillar, then drive a short final advance along the ridge. I want the change from concealment to clear ground to compress the time for a response.'),
(1,1,'frozen-3','attack','I skim loose snow toward the lit edge and enter from the darker side of the platform. I want the visible movement to pull attention away from my compact approach.'),
(1,1,'frozen-3','defense','I keep the low wall at my side and move in small steps across the frost. I want to preserve a reliable boundary without needing a sudden stop on the slippery stone.'),
(1,1,'frozen-3','finisher','I show a retreat toward the snowy edge, then turn inward from the shadow into one close strike. I want the expected retreat to open a brief line through the guard.'),
(1,1,'ember-1','attack','I step toward the empty trough, brush ash across its edge, and change my approach around the end. I want that visible disturbance to mask which side I will use.'),
(1,1,'ember-1','defense','I hold the metal trough between us and track the shifting ash along its far side. I want an obstacle in the direct path and an early sign of movement around it.'),
(1,1,'ember-1','finisher','I feint around a forge pillar before closing past the near end of the trough. I want the longer route to draw a response while I commit through the shorter opening.'),
(1,1,'ember-2','attack','I nudge a hanging chain as I step along the workbench, then attack around its opposite corner. I want the moving shadow to suggest an approach different from my own.'),
(1,1,'ember-2','defense','I keep the broad workbench across the centre line and move only when its corner stays in view. I want room to reset my guard without losing track of either way around it.'),
(1,1,'ember-2','finisher','I show my stance above the workbench, lower it, and commit around the nearest corner. I want the bench to conceal the short final step after a high guard responds.'),
(1,1,'ember-3','attack','I leave two clear steps in the soot beside the channel and break sideways toward the ledge. I want the footprints to suggest a straight approach before I change the angle.'),
(1,1,'ember-3','defense','I take a compact stance beside the stone ledge with the shallow channel in front of me. I want an approaching step to be deliberate enough that I can yield ground safely.'),
(1,1,'ember-3','finisher','I drift along the channel, then cross at a narrow point into a committed close attack. I want the steady sideways rhythm to make my sudden change in distance harder to read.'),
(1,1,'storm-1','attack','I let the torn banner hide my lead shoulder, then step out past the pillar with my weight low. I want to reveal my attack line only after my feet are settled on the wet stone.'),
(1,1,'storm-1','defense','I circle toward the archway with the terrace pillar shielding one side. I want the puddle reflections to help me follow movement while I keep a clear retreat in view.'),
(1,1,'storm-1','finisher','I show a step in a puddle beside the pillar, then close from the banner side. I want the reflected movement to draw a response before my short decisive approach becomes clear.'),
(1,1,'storm-2','attack','I move down one low stair and angle toward the gap as a gust carries mist across it. I want the height change to shift the line of my attack while my footing stays controlled.'),
(1,1,'storm-2','defense','I hold the lower stair with one foot close to its back edge and keep my guard narrow. I want a known step behind me when the mist hides the wet floor markings.'),
(1,1,'storm-2','finisher','I repeat a measured step along the stair, then descend into a close attack as the mist clears. I want the change in height and rhythm to create one brief opening.'),
(1,1,'storm-3','attack','I brush the fluttering cloth aside and approach along the broken parapet. I want the cloth to keep moving after I change direction into the sheltered courtyard.'),
(1,1,'storm-3','defense','I move deeper into the sheltered courtyard and keep the parapet opening in front of my guard. I want one readable approach instead of turning beneath the loose cloth.'),
(1,1,'storm-3','finisher','I wait for a flash to show the courtyard floor, then commit through its clear centre. I want a measured final approach that uses known footing before the light fades again.'),
(1,1,'verdant-1','attack','I step over one thick root, then angle along the railing rather than continuing straight. I want the root to slow a direct response while I attack from the clearer strip.'),
(1,1,'verdant-1','defense','I keep a light hand on the low railing and shift along its curve away from the roots. I want a stable reference beside the empty pit while preserving space for my guard.'),
(1,1,'verdant-1','finisher','I invite a pursuit around the railing, then stop short of a root and turn inward into a committed attack. I want the longer outside step to create a momentary gap.'),
(1,1,'verdant-2','attack','I lift a hanging vine from the fallen column and let it sway as I change sides. I want the moving leaves to distract from the clear strip I choose for my approach.'),
(1,1,'verdant-2','defense','I retreat beside the column with my shoulders clear of the vines. I want its solid edge to block a direct line without entangling my own escape route.'),
(1,1,'verdant-2','finisher','I feint down one side of the fallen column, then commit around its end through the other clear strip. I want the narrow routes to make a late change of guard costly.'),
(1,1,'verdant-3','attack','I brush leaves across a shadow line and step toward the open metal frame. I want the small disturbance to hide the timing of my change into an angled attack.'),
(1,1,'verdant-3','defense','I keep to the bare centre of the platform and turn within a single square of shadow. I want enough traction and room to redirect a strike without stepping onto the moss.'),
(1,1,'verdant-3','finisher','I show a slow crossing beneath the metal frame, then shorten the last step into a decisive strike. I want the regular shadow pattern to conceal the change in my rhythm.'),
(1,1,'neon-1','attack','I push the hanging cable into a small swing and approach beside one support. I want its moving outline to distract from the dry route I use to change my attack angle.'),
(1,1,'neon-1','defense','I stay on the dry edge of the thin water sheet with a support beside my guard. I want a dependable pivot and a clear view of movement reflected across the wet floor.'),
(1,1,'neon-1','finisher','I feint toward the water, then close tightly around the support into one committed strike. I want the apparent slippery route to draw attention away from my stable final step.'),
(1,1,'neon-2','attack','I turn a shoulder toward the reflective panel, then approach the barrier gap from a lower stance. I want the reflection to advertise a line different from the one my attack follows.'),
(1,1,'neon-2','defense','I keep a waist-high barrier across my centre and watch the panel while I sidestep. I want to track the far approach without exposing myself through the narrow opening.'),
(1,1,'neon-2','finisher','I draw the exchange toward the narrow opening, pause behind its edge, then commit as the passing light shifts. I want the barrier to conceal the start of my final step.'),
(1,1,'neon-3','attack','I follow a painted line for two short steps and angle away when the sign dims. I want the repeated path to suggest a direction my real attack will leave behind.'),
(1,1,'neon-3','defense','I keep the shallow step beside me and move along a painted line in a compact stance. I want a fixed guide for my footing when the bright pools of light change.'),
(1,1,'neon-3','finisher','I hold at the edge of a bright pool, then commit along the painted line as the sign changes. I want the sudden change in my visible outline to mask one short decisive advance.')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private.freeze_bot_state()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 -- Account/battle erasure can cascade. No live series may lose or rewrite state.
 IF TG_OP='DELETE' AND TG_TABLE_NAME<>'bot_tactic_catalog' THEN
   IF NOT EXISTS(SELECT 1 FROM public.battles WHERE id=OLD.battle_id) THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Private bot state is immutable';
END $$;
DROP TRIGGER IF EXISTS freeze_bot_catalog ON private.bot_tactic_catalog;
CREATE TRIGGER freeze_bot_catalog BEFORE UPDATE OR DELETE ON private.bot_tactic_catalog FOR EACH ROW EXECUTE FUNCTION private.freeze_bot_state();
DROP TRIGGER IF EXISTS freeze_bot_catalog_truncate ON private.bot_tactic_catalog;
CREATE TRIGGER freeze_bot_catalog_truncate BEFORE TRUNCATE ON private.bot_tactic_catalog FOR EACH STATEMENT EXECUTE FUNCTION private.freeze_bot_state();
DROP TRIGGER IF EXISTS freeze_bot_series ON private.bot_series;
CREATE TRIGGER freeze_bot_series BEFORE UPDATE OR DELETE ON private.bot_series FOR EACH ROW EXECUTE FUNCTION private.freeze_bot_state();
DROP TRIGGER IF EXISTS freeze_bot_choice ON private.bot_round_choices;
CREATE TRIGGER freeze_bot_choice BEFORE UPDATE OR DELETE ON private.bot_round_choices FOR EACH ROW EXECUTE FUNCTION private.freeze_bot_state();

CREATE OR REPLACE FUNCTION private.pin_bot_policy()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NEW.bot_policy_version IS DISTINCT FROM OLD.bot_policy_version THEN RAISE EXCEPTION 'Bot policy is immutable'; END IF;
 ELSIF NEW.prompt_experience_version<>2 OR NEW.format<>'bo3' THEN
   NEW.bot_policy_version:=1;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pin_bot_policy ON public.battles;
CREATE TRIGGER pin_bot_policy BEFORE INSERT OR UPDATE ON public.battles FOR EACH ROW EXECUTE FUNCTION private.pin_bot_policy();

CREATE OR REPLACE FUNCTION private.create_bot_series()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.bot_policy_version=2 THEN
   INSERT INTO private.bot_series(battle_id,seed,catalog_version) VALUES(NEW.id,extensions.gen_random_bytes(32),1);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS create_bot_series ON public.battles;
CREATE TRIGGER create_bot_series AFTER INSERT ON public.battles FOR EACH ROW EXECUTE FUNCTION private.create_bot_series();

CREATE OR REPLACE FUNCTION private.prepare_bot_round()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b battles%ROWTYPE; s private.bot_series%ROWTYPE; tactic private.bot_tactic_catalog%ROWTYPE;
 digest bytea; pick integer; counter integer:=0; selected_move public.move_type;
BEGIN
 -- Round openers already lock battle then round; this covers every insertion path.
 SELECT * INTO b FROM public.battles WHERE id=NEW.battle_id FOR UPDATE;
 IF b.bot_policy_version<>2 THEN RETURN NEW; END IF;
 SELECT * INTO s FROM private.bot_series WHERE battle_id=b.id;
 IF NOT FOUND OR NEW.situation_snapshot IS NULL THEN RAISE EXCEPTION 'bot_choice_integrity_error'; END IF;
 -- Private randomness, domain separated by round. No human prompt/type/profile
 -- or public UUID hash participates. Rejection avoids modulo bias.
 LOOP
   digest:=extensions.hmac(convert_to('bot-policy-2:'||NEW.round_number||':'||counter,'UTF8'),s.seed,'sha256');
   pick:=get_byte(digest,0);
   EXIT WHEN pick<255;
   counter:=counter+1;
 END LOOP;
 selected_move:=(ARRAY['attack','defense','finisher']::public.move_type[])[1+pick%3];
 SELECT * INTO tactic FROM private.bot_tactic_catalog
 WHERE catalog_version=s.catalog_version AND situation_catalog_version=(NEW.situation_snapshot->>'catalogVersion')::integer
 AND situation_id=NEW.situation_snapshot->>'id' AND move_type=selected_move;
 IF NOT FOUND THEN RAISE EXCEPTION 'bot_choice_integrity_error'; END IF;
 INSERT INTO private.bot_round_choices(battle_id,round_number,catalog_version,situation_snapshot,move_type,prompt_text)
 VALUES(b.id,NEW.round_number,s.catalog_version,NEW.situation_snapshot,tactic.move_type,tactic.prompt_text);
 RETURN NEW;
END $$;
-- AFTER INSERT sees the published scene and runs in the round-opening transaction.
DROP TRIGGER IF EXISTS prepare_bot_round ON public.battle_rounds;
CREATE TRIGGER prepare_bot_round AFTER INSERT ON public.battle_rounds FOR EACH ROW EXECUTE FUNCTION private.prepare_bot_round();

CREATE OR REPLACE FUNCTION public.get_private_bot_move(p_battle_id uuid,p_round_number integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c private.bot_round_choices%ROWTYPE;
BEGIN
 SELECT c1.* INTO c FROM private.bot_round_choices c1
 JOIN public.battles b ON b.id=c1.battle_id AND b.bot_policy_version=2
 JOIN public.battle_rounds r ON r.battle_id=c1.battle_id AND r.round_number=c1.round_number
 WHERE c1.battle_id=p_battle_id AND c1.round_number=p_round_number AND c1.situation_snapshot=r.situation_snapshot;
 IF NOT FOUND THEN RAISE EXCEPTION 'bot_choice_integrity_error'; END IF;
 RETURN jsonb_build_object('text',c.prompt_text,'moveType',c.move_type,
   'wordCount',cardinality(regexp_split_to_array(trim(c.prompt_text),'\s+')));
END $$;
REVOKE ALL ON FUNCTION public.get_private_bot_move(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_private_bot_move(uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION private.require_bot_choice_before_prompt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b battles%ROWTYPE;
BEGIN
 SELECT * INTO b FROM public.battles WHERE id=NEW.battle_id FOR UPDATE;
 IF b.bot_policy_version=2 THEN PERFORM public.get_private_bot_move(b.id,NEW.round_number); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS require_bot_choice_before_prompt ON public.battle_prompts;
CREATE TRIGGER require_bot_choice_before_prompt BEFORE INSERT OR UPDATE ON public.battle_prompts FOR EACH ROW EXECUTE FUNCTION private.require_bot_choice_before_prompt();
REVOKE ALL ON FUNCTION private.freeze_bot_state(),private.pin_bot_policy(),private.create_bot_series(),private.prepare_bot_round(),private.require_bot_choice_before_prompt() FROM PUBLIC,anon,authenticated,service_role;

-- Existing queues keep all pinned policies when joining another queued series.
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
   IF NOT FOUND OR prior.prompt_experience_version<>b.prompt_experience_version OR prior.rules_version<>b.rules_version
      OR prior.bot_policy_version<>b.bot_policy_version THEN RETURN FALSE; END IF;
 END IF;
 RETURN match_battle_request(p_battle_id,p_player_two_id,p_player_two_character_id,p_theme,p_request_id,p_previous_battle_id);
END $$;
REVOKE ALL ON FUNCTION public.match_battle_request_composer(uuid,uuid,uuid,text,uuid,uuid,integer,smallint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.match_battle_request_composer(uuid,uuid,uuid,text,uuid,uuid,integer,smallint) TO service_role;
