BEGIN;
CREATE FUNCTION pg_temp.bot_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
SELECT pg_temp.bot_assert(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='battles' AND column_name='bot_policy_version'),'new series must pin their bot policy');
SELECT pg_temp.bot_assert((SELECT count(*)=45 FROM private.bot_tactic_catalog WHERE catalog_version=1),'45 private authored tactics');
SELECT pg_temp.bot_assert((SELECT count(*)=15 FROM (SELECT situation_id FROM private.bot_tactic_catalog WHERE catalog_version=1 GROUP BY situation_id HAVING count(DISTINCT move_type)=3) t),'every scene covers all move types');
SELECT pg_temp.bot_assert(NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE schemaname='private' AND tablename IN ('bot_tactic_catalog','bot_series','bot_round_choices')),'private bot data never enters realtime');
DO $$
DECLARE u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); c1 uuid;c2 uuid;b uuid; legacy uuid; invitation uuid; req uuid:=gen_random_uuid(); choice jsonb; original jsonb; opened jsonb; r uuid; bad uuid;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (u1,u1||'@bot.invalid',jsonb_build_object('age_confirmed',true,'username','bot_'||replace(u1::text,'-',''))),
 (u2,u2||'@bot.invalid',jsonb_build_object('age_confirmed',true,'username','bot_'||replace(u2::text,'-','')));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u1,'Bot test one','strategist','Ready') RETURNING id INTO c1;
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u2,'Bot test two','titan','Ready') RETURNING id INTO c2;
 -- Simulate additive deployment: queues and invitations created under default1.
 ALTER TABLE battles ALTER COLUMN bot_policy_version SET DEFAULT 1;
 SELECT battle_id INTO legacy FROM create_matchmaking_battle_composer(u1,c1,'unranked',req,2::smallint,NULL,NULL,2::smallint,3);
 SELECT battle_id INTO invitation FROM create_matchmaking_battle_composer(u2,c2,'friend_challenge',gen_random_uuid(),2::smallint,NULL,NULL,2::smallint,3);
 ALTER TABLE battles ALTER COLUMN bot_policy_version SET DEFAULT 2;
 PERFORM pg_temp.bot_assert((SELECT bot_policy_version=1 FROM battles WHERE id=legacy),'activation leaves queued series pinned1');
 PERFORM pg_temp.bot_assert((SELECT bot_policy_version=1 FROM battles WHERE id=invitation),'activation leaves invitations pinned1');
 SELECT battle_id INTO b FROM create_matchmaking_battle_composer(u1,c1,'unranked',req,2::smallint,NULL,NULL,2::smallint,3);
 PERFORM pg_temp.bot_assert(b=legacy,'request replay keeps preactivation queue');
 SELECT battle_id INTO b FROM create_matchmaking_battle_composer(u1,c1,'unranked',gen_random_uuid(),2::smallint,NULL,NULL,2::smallint,3);
 PERFORM pg_temp.bot_assert(b=legacy,'new tap resumes preactivation queue');
 UPDATE battles SET status='canceled' WHERE id=legacy;
 SELECT battle_id INTO b FROM create_matchmaking_battle_composer(u1,c1,'unranked',gen_random_uuid(),2::smallint,NULL,NULL,2::smallint,3);
 PERFORM pg_temp.bot_assert((SELECT bot_policy_version=2 FROM battles WHERE id=b),'new series assigned2 after activation');
 PERFORM pg_temp.bot_assert((SELECT octet_length(seed)=32 AND catalog_version=1 FROM private.bot_series WHERE battle_id=b),'private random seed exists while still waiting for humans');
 PERFORM pg_temp.bot_assert(NOT match_battle_request_composer(b,u2,c2,'Precision over power',gen_random_uuid(),invitation,3,2::smallint),'old queued series cannot move into another bot policy');
 PERFORM pg_temp.bot_assert(match_battle_request_composer(b,u2,c2,'Precision over power',gen_random_uuid(),NULL,3,2::smallint),'new human opponent can join pinned series');
 PERFORM pg_temp.bot_assert(start_battle_face_off(b,'{}','{}','{}',100,100,NOW()+interval '24 hours'),'first round opens atomically');
 SELECT id INTO r FROM battle_rounds WHERE battle_id=b AND round_number=1;
 SELECT to_jsonb(c) INTO original FROM private.bot_round_choices c WHERE battle_id=b AND round_number=1;
 PERFORM pg_temp.bot_assert(original IS NOT NULL AND NOT EXISTS(SELECT 1 FROM battle_prompts WHERE battle_id=b),'private choice exists before any human text');
 PERFORM pg_temp.bot_assert(NOT start_battle_face_off(b,'{}','{}','{}',100,100,NOW()+interval '48 hours'),'first-round retry is harmless');
 PERFORM pg_temp.bot_assert((SELECT to_jsonb(c)=original FROM private.bot_round_choices c WHERE battle_id=b AND round_number=1),'first-round retry cannot reroll');
 UPDATE battles SET is_player_two_bot=true,player_two_id=NULL,player_two_character_id=NULL WHERE id=b;
 choice:=get_private_bot_move(b,1);
 PERFORM pg_temp.bot_assert(choice->>'text'=original->>'prompt_text' AND choice->>'moveType'=original->>'move_type','fallback uses preselected copied tactic');
 PERFORM pg_temp.bot_assert(NOT choice ? 'seed' AND NOT choice ? 'catalog_version' AND NOT choice ? 'tactic_id','service resolver receives only frozen scoring input');
 PERFORM lock_prompt(b,u1,NULL,'I take a narrow step beside the barrier. I want to keep a clear path for my retreat.','defense','approved',1);
 PERFORM pg_temp.bot_assert(get_private_bot_move(b,1)=choice,'human text and move do not change the bot');
 UPDATE battle_rounds SET status='result_ready' WHERE id=r;
 opened:=open_next_prompt_round(b,1,NOW()+interval '24 hours');
 choice:=get_private_bot_move(b,2);
 PERFORM pg_temp.bot_assert(open_next_prompt_round(b,1,NOW()+interval '48 hours')=opened,'next-round retry freezes deadline and situation');
 PERFORM pg_temp.bot_assert(get_private_bot_move(b,2)=choice,'next-round retry freezes bot choice');
 PERFORM pg_temp.bot_assert((SELECT count(*)=2 FROM private.bot_round_choices WHERE battle_id=b),'exactly one choice per opened round');
 BEGIN UPDATE battles SET bot_policy_version=1 WHERE id=b; RAISE EXCEPTION 'bot policy changed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Bot policy is immutable' THEN RAISE; END IF; END;
 BEGIN UPDATE private.bot_series SET seed=extensions.gen_random_bytes(32) WHERE battle_id=b; RAISE EXCEPTION 'seed changed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Private bot state is immutable' THEN RAISE; END IF; END;
 BEGIN UPDATE private.bot_round_choices SET prompt_text='Replacement bot prose which must never be accepted.' WHERE battle_id=b; RAISE EXCEPTION 'choice changed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Private bot state is immutable' THEN RAISE; END IF; END;
 BEGIN DELETE FROM private.bot_round_choices WHERE battle_id=b; RAISE EXCEPTION 'choice deleted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Private bot state is immutable' THEN RAISE; END IF; END;
 BEGIN UPDATE private.bot_tactic_catalog SET prompt_text='Replacement bot prose which must never be accepted.' WHERE catalog_version=1; RAISE EXCEPTION 'catalog changed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Private bot state is immutable' THEN RAISE; END IF; END;
 BEGIN DELETE FROM private.bot_tactic_catalog WHERE catalog_version=1; RAISE EXCEPTION 'catalog deleted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Private bot state is immutable' THEN RAISE; END IF; END;
 BEGIN TRUNCATE private.bot_tactic_catalog CASCADE; RAISE EXCEPTION 'catalog truncated'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Private bot state is immutable' THEN RAISE; END IF; END;
 -- Deliberately corrupt only this rolled-back fixture to prove fail-closed behavior.
 ALTER TABLE private.bot_round_choices DISABLE TRIGGER freeze_bot_choice;
 DELETE FROM private.bot_round_choices WHERE battle_id=b AND round_number=2;
 ALTER TABLE private.bot_round_choices ENABLE TRIGGER freeze_bot_choice;
 BEGIN PERFORM get_private_bot_move(b,2); RAISE EXCEPTION 'missing choice accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'bot_choice_integrity_error' THEN RAISE; END IF; END;
 BEGIN PERFORM lock_prompt(b,u1,NULL,'I cross the open ground. I want to move my guard into a new position.','attack','approved',2); RAISE EXCEPTION 'human lock accepted missing bot choice'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'bot_choice_integrity_error' THEN RAISE; END IF; END;
 -- Legacy experience still uses policy1 even after activation.
 INSERT INTO battles(player_one_id,player_one_character_id,format,mode,status) VALUES(u1,c1,'single','bot','matched') RETURNING id INTO bad;
 PERFORM pg_temp.bot_assert((SELECT bot_policy_version=1 FROM battles WHERE id=bad),'single-format legacy remains policy1');
 PERFORM pg_temp.bot_assert(NOT EXISTS(SELECT 1 FROM private.bot_series WHERE battle_id=bad),'legacy does not receive private state');
 PERFORM set_config('test.bot_battle',b::text,true);
END $$;
DO $$ DECLARE role_name text; relation text; fn text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH relation IN ARRAY ARRAY['private.bot_series','private.bot_tactic_catalog','private.bot_round_choices'] LOOP
   PERFORM pg_temp.bot_assert(NOT has_table_privilege(role_name,relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'client denied private table '||role_name||' '||relation);
  END LOOP;
  PERFORM pg_temp.bot_assert(NOT has_function_privilege(role_name,'public.get_private_bot_move(uuid,integer)','EXECUTE'),'client denied private resolver');
 END LOOP;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM * FROM private.bot_round_choices; RAISE EXCEPTION 'client read bot choice'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.get_private_bot_move(current_setting('test.bot_battle')::uuid,1); RAISE EXCEPTION 'client invoked bot resolver'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.bot_assert((get_private_bot_move(current_setting('test.bot_battle')::uuid,1)->>'text') IS NOT NULL,'service role can resolve prepared move');
RESET ROLE;
SELECT 'PASS: private bot lifecycle, activation, precommit, immutability, fallback, retry and secrecy';
ROLLBACK;
