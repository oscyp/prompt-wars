BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(10);
SELECT has_column('battles', 'prompt_experience_version', 'battle experience is pinned separately from combat');
SELECT has_column('battle_rounds', 'situation_snapshot', 'round has shared situation');
SELECT is((SELECT count(*)::integer FROM prompt_situation_catalog WHERE catalog_version=1), 15, 'fifteen authored situations');
SELECT is((SELECT count(DISTINCT theme)::integer FROM prompt_situation_catalog WHERE catalog_version=1), 5, 'five existing themes');
SELECT is((SELECT count(DISTINCT select_prompt_situation('00000000-0000-4000-8000-000000000001','Precision over power',r,1)->>'id')::integer FROM generate_series(1,3) r),3,'no repeated situation within series');
SELECT is(select_prompt_situation('00000000-0000-4000-8000-000000000001','Precision over power',2,1),select_prompt_situation('00000000-0000-4000-8000-000000000001','Precision over power',2,1),'snapshot selection is stable');
SELECT ok(NOT has_table_privilege('authenticated','prompt_situation_catalog','INSERT'),'clients cannot publish scenes');
SELECT ok(NOT has_function_privilege('authenticated','open_next_prompt_round(uuid,integer,timestamp with time zone)','EXECUTE'),'client cannot open a round');
SELECT ok(NOT has_function_privilege('anon','select_prompt_situation(uuid,text,integer,integer)','EXECUTE'),'anonymous caller cannot invoke scene publication');
SELECT throws_ok($$SELECT select_prompt_situation('00000000-0000-4000-8000-000000000001','unknown',1,1)$$,'22023','Unsupported situation theme, round or catalogue','unknown context fails closed');
SELECT * FROM finish();
CREATE FUNCTION pg_temp.composer_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
DO $$
DECLARE u1 uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();u3 uuid:=gen_random_uuid();c1 uuid;c2 uuid;b uuid; old_queue uuid; request_key uuid:=gen_random_uuid(); r jsonb; again jsonb; first_scene jsonb;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (u1,u1||'@composer.invalid',jsonb_build_object('age_confirmed',true,'username','compose_'||replace(u1::text,'-',''))),
 (u2,u2||'@composer.invalid',jsonb_build_object('age_confirmed',true,'username','compose_'||replace(u2::text,'-',''))),
 (u3,u3||'@composer.invalid',jsonb_build_object('age_confirmed',true,'username','compose_'||replace(u3::text,'-','')));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u1,'Composer one','strategist','Ready') RETURNING id INTO c1;
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u2,'Composer two','titan','Ready') RETURNING id INTO c2;
 SELECT battle_id INTO old_queue FROM create_matchmaking_battle_versioned(u1,c1,'unranked',gen_random_uuid(),2::smallint,NULL,NULL);
 SELECT battle_id INTO b FROM create_matchmaking_battle_composer(u1,c1,'unranked',gen_random_uuid(),2::smallint,NULL,NULL,2::smallint,3);
 PERFORM pg_temp.composer_assert(b=old_queue,'activation resumes old queue');
 PERFORM pg_temp.composer_assert((SELECT prompt_experience_version=1 FROM battles WHERE id=b),'legacy queue never upgraded');
 UPDATE battles SET status='canceled' WHERE id=b;
 BEGIN
  PERFORM * FROM create_matchmaking_battle_composer(u1,c1,'unranked',gen_random_uuid(),2::smallint,NULL,NULL,2::smallint,2);
  RAISE EXCEPTION 'old client created composer battle';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'client_update_required' THEN RAISE; END IF; END;
 SELECT battle_id INTO b FROM create_matchmaking_battle_composer(u1,c1,'unranked',request_key,2::smallint,NULL,NULL,2::smallint,3);
 PERFORM pg_temp.composer_assert((SELECT judge_policy_version='v2.0.0-ideas' AND situation_catalog_version=1 FROM battles WHERE id=b),'new series freezes policy and catalogue');
 BEGIN
  PERFORM * FROM create_matchmaking_battle_composer(u1,c1,'unranked',gen_random_uuid(),2::smallint,NULL,NULL,1::smallint,2);
  RAISE EXCEPTION 'old client replayed actual composer queue through legacy request';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'client_update_required' THEN RAISE; END IF; END;
 BEGIN
  PERFORM * FROM create_matchmaking_battle_composer(u1,c1,'unranked',request_key,2::smallint,NULL,NULL,1::smallint,2);
  RAISE EXCEPTION 'old client replayed mapped composer request';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'client_update_required' THEN RAISE; END IF; END;
 DELETE FROM matchmaking_requests WHERE profile_id=u1 AND request_id=request_key;
 BEGIN
  PERFORM * FROM create_matchmaking_battle_composer(u1,c1,'unranked',request_key,2::smallint,NULL,NULL,1::smallint,2);
  RAISE EXCEPTION 'old client replayed compatibility composer request';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'client_update_required' THEN RAISE; END IF; END;
 PERFORM pg_temp.composer_assert(NOT EXISTS(SELECT 1 FROM matchmaking_requests WHERE profile_id=u1 AND request_id=request_key),'rejected replay writes no mapping');
 BEGIN
  PERFORM match_battle_request_composer(b,u2,c2,'Precision over power',gen_random_uuid(),NULL,2,1::smallint);
  RAISE EXCEPTION 'old client hid actual composer target behind legacy request';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'client_update_required' THEN RAISE; END IF; END;
 BEGIN
  PERFORM match_battle_request_composer(b,u2,c2,'Precision over power',gen_random_uuid(),NULL,2,2::smallint);
  RAISE EXCEPTION 'old client accepted composer battle';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'client_update_required' THEN RAISE; END IF; END;
 PERFORM pg_temp.composer_assert(match_battle_request_composer(b,u2,c2,'Precision over power',gen_random_uuid(),NULL,3,2::smallint),'compatible client matches');
 PERFORM pg_temp.composer_assert(start_battle_face_off(b,'{}','{}','{}',100,100,NOW()+interval '24 hours'),'face off opens');
 SELECT situation_snapshot INTO first_scene FROM battle_rounds WHERE battle_id=b AND round_number=1;
 PERFORM pg_temp.composer_assert(first_scene->>'text' IS NOT NULL,'round published with scene');
 PERFORM pg_temp.composer_assert(NOT start_battle_face_off(b,'{}','{}','{}',100,100,NOW()+interval '48 hours'),'face-off retry cannot change deadline');
 UPDATE battle_rounds SET status='result_ready' WHERE battle_id=b AND round_number=1;
 r:=open_next_prompt_round(b,1,NOW()+interval '24 hours');
 again:=open_next_prompt_round(b,1,NOW()+interval '48 hours');
 PERFORM pg_temp.composer_assert(r->'situation_snapshot'=again->'situation_snapshot' AND r->>'lock_in_deadline'=again->>'lock_in_deadline','round retry returns original snapshot and deadline');
 PERFORM pg_temp.composer_assert(r->'situation_snapshot'->>'id'<>first_scene->>'id','next round uses distinct situation');
 BEGIN UPDATE battle_rounds SET situation_snapshot='{}' WHERE battle_id=b AND round_number=2;
  RAISE EXCEPTION 'scene mutation accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Published situation is immutable' THEN RAISE; END IF; END;
 BEGIN UPDATE battles SET prompt_experience_version=1 WHERE id=b;
  RAISE EXCEPTION 'series policy mutation accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Prompt experience is immutable' THEN RAISE; END IF; END;
 PERFORM set_config('test.composer_battle',b::text,true);
 PERFORM set_config('test.composer_player',u1::text,true);
 PERFORM set_config('test.composer_opponent',u2::text,true);
 PERFORM set_config('test.composer_outsider',u3::text,true);
 INSERT INTO composer_events(profile_id,battle_id,round_number,session_id,event,duration_ms)
 VALUES(u1,b,1,'00000000-0000-4000-8000-000000000001','composer_session_ended',1000);
 UPDATE composer_events SET duration_ms=200 WHERE profile_id=u1 AND battle_id=b;
 PERFORM pg_temp.composer_assert((SELECT duration_ms=1000 FROM composer_events WHERE profile_id=u1 AND battle_id=b),'late telemetry cannot reduce active duration');
END $$;
SELECT pg_temp.composer_assert(NOT has_table_privilege('anon','composer_events','SELECT'),'anonymous role has no telemetry read grant');
SELECT pg_temp.composer_assert(NOT has_table_privilege('authenticated','composer_events','INSERT,UPDATE,DELETE'),'clients have no telemetry write grant');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.composer_player'),true);
SELECT pg_temp.composer_assert((SELECT count(*)=2 FROM battle_rounds WHERE battle_id=current_setting('test.composer_battle')::uuid),'participant reads both public round situations');
SELECT pg_temp.composer_assert((SELECT count(*)=1 FROM composer_events WHERE battle_id=current_setting('test.composer_battle')::uuid),'player reads own telemetry');
DO $$ BEGIN
 BEGIN
  INSERT INTO composer_events(profile_id,battle_id,round_number,session_id,event,duration_ms)
  VALUES(current_setting('test.composer_player')::uuid,current_setting('test.composer_battle')::uuid,1,gen_random_uuid(),'composer_submitted',1);
  RAISE EXCEPTION 'client inserted server telemetry';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.composer_opponent'),true);
SELECT pg_temp.composer_assert((SELECT count(*)=0 FROM composer_events WHERE battle_id=current_setting('test.composer_battle')::uuid),'opponent cannot inspect private authoring telemetry');
SELECT set_config('request.jwt.claim.sub',current_setting('test.composer_outsider'),true);
SELECT pg_temp.composer_assert((SELECT count(*)=0 FROM battle_rounds WHERE battle_id=current_setting('test.composer_battle')::uuid),'outsider cannot read situations or rounds');
SELECT pg_temp.composer_assert((SELECT count(*)=0 FROM composer_events WHERE battle_id=current_setting('test.composer_battle')::uuid),'outsider cannot inspect authoring telemetry');
RESET ROLE;
ROLLBACK;
