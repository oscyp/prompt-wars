-- Run against an isolated local stack after additive migrations, as postgres.
-- No historical rows are changed; generated fixtures and all effects roll back.
BEGIN;
CREATE FUNCTION pg_temp.check_true(ok BOOLEAN, label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
DO $$
DECLARE u1 UUID:=gen_random_uuid();u2 UUID:=gen_random_uuid();u3 UUID:=gen_random_uuid();c1 UUID;c2 UUID;b UUID;r UUID;result JSONB; before_balance NUMERIC;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (u1,u1||'@combat.invalid',jsonb_build_object('age_confirmed',true,'username','combat_'||replace(u1::text,'-',''))),(u2,u2||'@combat.invalid',jsonb_build_object('age_confirmed',true,'username','combat_'||replace(u2::text,'-',''))),(u3,u3||'@combat.invalid',jsonb_build_object('age_confirmed',true,'username','combat_'||replace(u3::text,'-','')));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u1,'Fixture one','strategist','Ready') RETURNING id INTO c1;
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u2,'Fixture two','titan','Ready') RETURNING id INTO c2;
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id,rules_version)
 VALUES('ranked','resolving','bo3',3,u1,u2,c1,c2,2) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,judge_payload) VALUES(b,1,'result_ready','{"mock_assisted":true}');
 -- A forfeit payload which omitted fallback is still gated by the prior scored round.
 PERFORM pg_temp.check_true(resolve_battle(b,u1,FALSE,'{"resolution":"forfeit"}',jsonb_build_object(u1::text,jsonb_build_object('delta',100)),'v1','forfeit',0),'resolve applies once');
 PERFORM pg_temp.check_true(NOT resolve_battle(b,u1,FALSE,'{}',NULL,'v1','forfeit',0),'repeat resolution denied');
 PERFORM apply_post_battle_rewards(b);PERFORM apply_post_battle_rewards(b);
 PERFORM pg_temp.check_true((SELECT rating=1500 AND wins=0 AND losses=0 AND draws=0 AND current_streak=0 AND total_battles=1 FROM profiles WHERE id=u1),'mock exhibition participation only');
 PERFORM pg_temp.check_true((SELECT rating_delta_payload IS NULL AND score_payload->>'competitive_eligible'='false' FROM battles WHERE id=b),'DB strips supplied rating delta');
 PERFORM pg_temp.check_true((SELECT reward_payload->u1::text->>'credits_eligible'='false' AND NOT (reward_payload->u1::text->'quests_advanced' ? 'win_battle') FROM battles WHERE id=b),'mock blocks competitive quest/streak rewards');
 PERFORM set_config('test.combat_battle',b::text,TRUE);PERFORM set_config('test.combat_player',u1::text,TRUE);PERFORM set_config('test.combat_outsider',u3::text,TRUE);
 -- Normal eligible draws retain ratings and draw records, including legacy single.
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('ranked','resolving','single',1,u1,u2,c1,c2) RETURNING id INTO b;
 PERFORM resolve_battle(b,NULL,TRUE,'{}',jsonb_build_object(u1::text,jsonb_build_object('delta',5),'unused','{}'),'v1','real',1);
 PERFORM pg_temp.check_true((SELECT rating=1505 AND draws=1 FROM profiles WHERE id=u1),'eligible legacy draw records and delta');
 -- Free locked forfeit: a compatibility caller supplying a price cannot charge.
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('ranked','waiting_for_prompts','bo3',3,u1,u2,c1,c2) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status) VALUES(b,1,'waiting_for_prompts') RETURNING id INTO r;
 INSERT INTO battle_prompts(battle_id,profile_id,round_number,custom_prompt_text,move_type,is_locked,locked_at,moderation_status)
 VALUES(b,u1,1,'A carefully placed shield absorbs the incoming strike.','defense',TRUE,NOW(),'approved');
 SELECT COALESCE(SUM(amount),0) INTO before_balance FROM wallet_transactions WHERE profile_id=u1;
 result:=claim_leave_battle(b,u1,999,'fixture-fee');
 PERFORM pg_temp.check_true(result->>'action'='forfeited' AND (result->>'charged')::integer=0,'locked free forfeit');
 PERFORM pg_temp.check_true((SELECT COALESCE(SUM(amount),0)=before_balance FROM wallet_transactions WHERE profile_id=u1),'zero wallet mutation');
 PERFORM pg_temp.check_true((SELECT count(*)=0 FROM claim_battle_round(b,1)),'late resolver cannot claim canceled round');
 -- Reverse race order: resolver claim blocks leave atomically.
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('ranked','waiting_for_prompts','bo3',3,u1,u2,c1,c2) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status) VALUES(b,1,'waiting_for_prompts');
 PERFORM * FROM claim_battle_round(b,1);
 result:=claim_leave_battle(b,u1,0,'fixture-free');
 PERFORM pg_temp.check_true(result->>'error'='battle_in_progress','resolver-first leave blocks');
 -- Exhausted recovery ends parent and permits idempotent leave / result reads.
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('ranked','resolving','bo3',3,u1,u2,c1,c2) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,resolve_attempts,updated_at)
 VALUES(b,1,'resolving',3,NOW()-INTERVAL '20 minutes') RETURNING id INTO r;
 PERFORM * FROM reclaim_stuck_rounds(10,3);
 PERFORM pg_temp.check_true((SELECT status='expired' AND resolution_metadata->>'reason'='judge_recovery_exhausted' FROM battles WHERE id=b),'dead letter terminalizes parent');
 result:=claim_leave_battle(b,u1,0,'after-recovery');
 PERFORM pg_temp.check_true(result->>'action'='already_terminal','dead letter allows completed exit');
 PERFORM pg_temp.check_true((SELECT count(*)=0 FROM claim_battle_round(b,1)),'late judge cannot resurrect dead letter');
 -- A retriable stale round releases its parent before the worker re-drives it.
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('ranked','resolving','bo3',3,u1,u2,c1,c2) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,resolve_attempts,updated_at)
 VALUES(b,1,'resolving',0,NOW()-INTERVAL '20 minutes');
 PERFORM * FROM reclaim_stuck_rounds(10,3);
 PERFORM pg_temp.check_true((SELECT status='waiting_for_prompts' FROM battles WHERE id=b),'retry releases parent');
 -- Queue uniqueness survives enable and rollback using the real creator/index.
 SELECT battle_id INTO b FROM create_matchmaking_battle_versioned(u1,c1,'unranked',gen_random_uuid(),1::smallint,NULL,NULL);
 PERFORM pg_temp.check_true((SELECT battle_id=b FROM create_matchmaking_battle_versioned(u1,c1,'unranked',gen_random_uuid(),2::smallint,NULL,NULL)),'enable reuses v1 queue');
 PERFORM pg_temp.check_true((SELECT rules_version=1 FROM battles WHERE id=b),'enable preserves v1 rules');
 UPDATE battles SET status='canceled' WHERE id=b;
 SELECT battle_id INTO b FROM create_matchmaking_battle_versioned(u1,c1,'unranked',gen_random_uuid(),2::smallint,NULL,NULL);
 PERFORM pg_temp.check_true((SELECT battle_id=b FROM create_matchmaking_battle_versioned(u1,c1,'unranked',gen_random_uuid(),1::smallint,NULL,NULL)),'rollback reuses v2 queue');
 PERFORM pg_temp.check_true((SELECT rules_version=2 FROM battles WHERE id=b),'rollback preserves v2 rules');
 -- Sweeps must recheck a deadline candidate after a completed free forfeit.
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('ranked','waiting_for_prompts','bo3',3,u1,u2,c1,c2) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline)
 VALUES(b,1,'waiting_for_prompts',NOW()-INTERVAL '1 minute') RETURNING id INTO r;
 result:=claim_leave_battle(b,u1,0,'timeout-race');
 PERFORM resolve_battle(b,u2,FALSE,'{"resolution":"forfeit"}',NULL,'v1','forfeit',0);
 UPDATE battles SET status='completed' WHERE id=b;
 result:=resolve_round_timeout(r,NULL);
 PERFORM pg_temp.check_true(result->>'action'='stale','stale sweep loses to completed forfeit');
 PERFORM pg_temp.check_true((SELECT status='completed' AND winner_id=u2 FROM battles WHERE id=b),'sweep preserves winner');
 -- Reverse order: expiry completes first, free leave returns terminal success.
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('ranked','waiting_for_prompts','bo3',3,u1,u2,c1,c2) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline)
 VALUES(b,1,'waiting_for_prompts',NOW()-INTERVAL '1 minute') RETURNING id INTO r;
 result:=resolve_round_timeout(r,NULL);
 PERFORM pg_temp.check_true(result->>'action'='expired','tied no-show expires atomically');
 result:=claim_leave_battle(b,u1,0,'after-timeout');
 PERFORM pg_temp.check_true(result->>'action'='already_terminal','leave respects prior timeout');
 -- Leading series finalizes completely in the timeout transaction.
 INSERT INTO battles(mode,status,format,best_of,current_round,player_one_id,player_two_id,player_one_character_id,player_two_character_id,player_one_rounds_won)
 VALUES('ranked','waiting_for_prompts','bo3',3,2,u1,u2,c1,c2,1) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline)
 VALUES(b,2,'waiting_for_prompts',NOW()-INTERVAL '1 minute') RETURNING id INTO r;
 result:=resolve_round_timeout(r,NULL);
 PERFORM pg_temp.check_true(result->>'action'='awarded','leading no-show awards series');
 PERFORM pg_temp.check_true((SELECT status='completed' AND winner_id=u1 AND rewards_applied_at IS NOT NULL FROM battles WHERE id=b),'timeout award fully commits result/rewards');
 result:=resolve_round_timeout(r,NULL);
 PERFORM pg_temp.check_true(result->>'action'='stale','timeout award cannot apply twice');
 -- Committed prompt before its side timestamp prevents stale double-no-show.
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('ranked','waiting_for_prompts','bo3',3,u1,u2,c1,c2) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline)
 VALUES(b,1,'waiting_for_prompts',NOW()-INTERVAL '1 minute') RETURNING id INTO r;
 INSERT INTO battle_prompts(battle_id,profile_id,round_number,custom_prompt_text,move_type,is_locked,locked_at,moderation_status)
 VALUES(b,u1,1,'A committed prompt without the follow-up side stamp.','defense',TRUE,NOW(),'approved');
 result:=resolve_round_timeout(r,NULL);
 PERFORM pg_temp.check_true(result->>'action'='resolve','committed prompt prevents false no-show');
 PERFORM pg_temp.check_true(NOT has_function_privilege('authenticated','public.resolve_battle(uuid,uuid,boolean,jsonb,jsonb,text,text,integer)','EXECUTE'),'client cannot resolve');
 PERFORM pg_temp.check_true(NOT has_function_privilege('authenticated','public.claim_battle_round(uuid,integer)','EXECUTE'),'client cannot claim');
 PERFORM pg_temp.check_true(NOT has_function_privilege('anon','public.claim_leave_battle(uuid,uuid,integer,text)','EXECUTE'),'anonymous cannot leave');
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.combat_player'),TRUE);
SELECT pg_temp.check_true((SELECT count(*)=1 FROM battles WHERE id=current_setting('test.combat_battle')::uuid),'participant can read battle');
SELECT set_config('request.jwt.claim.sub',current_setting('test.combat_outsider'),TRUE);
SELECT pg_temp.check_true((SELECT count(*)=0 FROM battles WHERE id=current_setting('test.combat_battle')::uuid),'outsider cannot read battle');
RESET ROLE;
ROLLBACK;
