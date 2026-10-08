BEGIN;
DO $$
DECLARE u uuid:=gen_random_uuid(); c uuid; b uuid; prompt_id uuid;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,u||'@origin.invalid',jsonb_build_object('age_confirmed',true,'username','origin_'||replace(u::text,'-','')));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Origin test','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(player_one_id,player_one_character_id,format,mode,status,is_player_two_bot) VALUES(u,c,'single','bot','matched',true) RETURNING id INTO b;
 prompt_id:=lock_prompt_with_origin(b,u,NULL,'I brace against the wall to keep my guard steady.','defense','approved',1,'mixed');
 IF NOT EXISTS(SELECT 1 FROM battle_prompts WHERE id=prompt_id AND authoring_origin='mixed') THEN RAISE EXCEPTION 'Origin missing on accepted prompt'; END IF;
 IF lock_prompt_with_origin(b,u,NULL,'Different retry text must not replace the accepted prompt.','attack','approved',1,'manual')<>prompt_id THEN RAISE EXCEPTION 'Retry changed prompt'; END IF;
 IF NOT EXISTS(SELECT 1 FROM battle_prompts WHERE id=prompt_id AND authoring_origin='mixed' AND move_type='defense') THEN RAISE EXCEPTION 'Retry overwrote origin or type'; END IF;
 INSERT INTO battles(player_one_id,player_one_character_id,format,mode,status,is_player_two_bot) VALUES(u,c,'single','bot','matched',true) RETURNING id INTO b;
 prompt_id:=lock_prompt(b,u,NULL,'I circle the platform to approach from the open side.','attack','approved',1);
 IF NOT EXISTS(SELECT 1 FROM battle_prompts WHERE id=prompt_id AND authoring_origin='unknown') THEN RAISE EXCEPTION 'Legacy origin must be unknown'; END IF;
 IF has_function_privilege('authenticated','public.lock_prompt_with_origin(uuid,uuid,uuid,text,move_type,moderation_status,integer,text)','EXECUTE') THEN RAISE EXCEPTION 'Client can write origin'; END IF;
 BEGIN
   PERFORM lock_prompt_with_origin(b,u,NULL,'This invalid origin should never be accepted.','attack','approved',1,'paid');
   RAISE EXCEPTION 'Invalid origin accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT 'PASS: atomic authoring origin, retry preservation, legacy and service-only grants';
ROLLBACK;
