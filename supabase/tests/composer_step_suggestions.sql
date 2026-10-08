-- Paid step delivery and recovery regressions; always rolled back.
BEGIN;
CREATE FUNCTION pg_temp.step_assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'paid step: %',message; END IF; END $$;
SELECT pg_temp.step_assert(to_regprocedure('public.reserve_suggestion_step_operation(uuid,uuid,integer,public.move_type,text,text,text,text,integer,boolean,boolean)') IS NOT NULL,'paid step reservation is available');
CREATE FUNCTION pg_temp.approaches(prefix text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_array(jsonb_build_object('id',prefix||'-1','text','by waiting until their footing shifts'),
 jsonb_build_object('id',prefix||'-2','text','by keeping the cable low and taut'),
 jsonb_build_object('id',prefix||'-3','text','by stepping behind the nearer support'))
$$;
DO $$
DECLARE u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); c uuid; c2 uuid; b uuid; legacy uuid;
 first jsonb; replay jsonb; op jsonb; done jsonb; result jsonb; key text:=gen_random_uuid()::text;
 n integer; balance bigint;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (u,u||'@step.invalid',jsonb_build_object('age_confirmed',true,'username','step_'||left(u::text,8))),
 (outsider,outsider||'@step.invalid',jsonb_build_object('age_confirmed',true,'username','step_'||left(outsider::text,8)));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Tester','strategist','Ready') RETURNING id INTO c;
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(outsider,'Other tester','strategist','Ready') RETURNING id INTO c2;
 PERFORM set_config('test.step_altcharacter',c2::text,true);
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of,
 theme,prompt_experience_version,judge_policy_version,situation_catalog_version)
 VALUES(u,c,true,'waiting_for_prompts','ranked','bo3',1,3,'Precision over power',2,'v2.0.0-ideas',1) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES(b,1,'waiting_for_prompts',clock_timestamp()+interval '1 hour');
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of)
 VALUES(u,c,true,'waiting_for_prompts','ranked','bo3',1,3) RETURNING id INTO legacy;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES(legacy,1,'waiting_for_prompts',clock_timestamp()+interval '1 hour');
 replay:=reserve_suggestion_step_operation(u,legacy,1,'attack','intent','I pull the cable',NULL,gen_random_uuid()::text,1,true,true);
 PERFORM pg_temp.step_assert(replay->>'error'='bad_request','legacy battle cannot create a new structured-step purchase');
 -- The real catalogue is used by the publication trigger; this does not fabricate a snapshot.
 UPDATE character_edit_prices SET credits=1 WHERE edit_kind='prompt_suggestions_reroll';
 DELETE FROM wallet_transactions WHERE profile_id=u; -- synthetic account, transaction rolls back
 result:=jsonb_build_object('approachHints',pg_temp.approaches('test'));
 replay:=reserve_suggestion_step_operation(outsider,b,1,'attack','approach','I pull the cable','to hold the crossing',key,1,true,true);
 PERFORM pg_temp.step_assert(replay->>'error'='forbidden','nonparticipant denied');
 replay:=reserve_suggestion_step_operation(u,b,1,'attack','intent','I pull the cable','unexpected intent',key,1,true,true);
 PERFORM pg_temp.step_assert(replay->>'error'='bad_request','intent target rejects supplied parent intent');
 replay:=reserve_suggestion_step_operation(u,b,1,'attack','approach','I pull the cable','to hold the crossing',key,0,true,true);
 PERFORM pg_temp.step_assert(replay->>'error'='price_changed' AND (replay->>'current_credits')::int=1,'server price controls purchase');
 replay:=reserve_suggestion_step_operation(u,b,1,'attack','approach','I pull the cable','to hold the crossing',key,1,true,true);
 PERFORM pg_temp.step_assert(replay->>'error'='insufficient_credits','no balance is charged');
 PERFORM grant_credits(u,100,'step_test',gen_random_uuid()::text);
 first:=reserve_suggestion_step_operation(u,b,1,'attack','approach','I pull the cable','to hold the crossing',key,1,true,true);
 PERFORM pg_temp.step_assert(first->>'status'='claimed' AND (first->>'credits_spent')::int=1 AND (first->>'is_paid')::boolean,'first purchase reserves and spends one credit');
 replay:=reserve_suggestion_step_operation(u,b,1,'attack','approach','I pull the cable','to hold the crossing',key,1,true,true);
 PERFORM pg_temp.step_assert(replay->>'status'='pending' AND replay->>'operation_id'=first->>'operation_id','double request reuses active operation');
 PERFORM pg_temp.step_assert((SELECT count(*) FROM wallet_transactions WHERE profile_id=u AND amount=-1)=1,'double request debits once');
 replay:=reserve_suggestion_step_operation(u,b,1,'attack','approach','I pull another cable','to hold the crossing',key,1,true,true);
 PERFORM pg_temp.step_assert(replay->>'error'='idempotency_conflict','same key cannot change parents');
 done:=finish_suggestion_step_operation((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,result);
 PERFORM pg_temp.step_assert(done->>'status'='ready' AND done->'result'=result,'successful exact hints persisted');
 UPDATE character_edit_prices SET credits=2 WHERE edit_kind='prompt_suggestions_reroll';
 UPDATE battles SET status='result_ready' WHERE id=b;
 replay:=reserve_suggestion_step_operation(u,b,1,'attack','approach','I pull the cable','to hold the crossing',key,1,false,false);
 PERFORM pg_temp.step_assert(replay->>'status'='ready' AND (replay->>'credits_spent')::int=1 AND replay->'result'=result,'closed disabled replay preserves original paid result and price');
 UPDATE battles SET player_one_character_id=current_setting('test.step_altcharacter')::uuid WHERE id=b;
 replay:=reserve_suggestion_step_operation(u,b,1,'attack','approach','I pull the cable','to hold the crossing',key,1,false,false);
 PERFORM pg_temp.step_assert(replay->>'status'='ready' AND replay->'result'=result,'delivered purchase survives changed current character reference');
 UPDATE battles SET player_one_character_id=c WHERE id=b;
 UPDATE battles SET status='waiting_for_prompts' WHERE id=b;
 UPDATE character_edit_prices SET credits=1 WHERE edit_kind='prompt_suggestions_reroll';
 op:=reserve_suggestion_step_operation(u,b,1,'defense','approach','I pull the cable','to hold the crossing',gen_random_uuid()::text,1,true,true);
 done:=finish_suggestion_step_operation((op->>'operation_id')::uuid,(op->>'lease_token')::uuid,'{"approachHints":[]}');
 PERFORM pg_temp.step_assert(done->>'status'='failed' AND done->>'error'='invalid_completion' AND (done->>'refunded')::boolean,'malformed paid result refunded');
 PERFORM finish_suggestion_step_operation((op->>'operation_id')::uuid,(op->>'lease_token')::uuid,NULL,'{}','generation_failed');
 PERFORM pg_temp.step_assert((SELECT count(*) FROM wallet_transactions WHERE profile_id=u AND reason LIKE 'prompt_suggestions_refund:%')=1,'refund occurs once');
 SELECT jsonb_build_object('intentHints',jsonb_agg(jsonb_build_object('id','i-'||i,'text','to hold the crossing '||i,'approachHints',pg_temp.approaches('i-'||i)))) INTO result FROM generate_series(1,3)i;
 op:=reserve_suggestion_step_operation(u,b,1,'finisher','intent','I pull the cable',NULL,gen_random_uuid()::text,1,true,true);
 done:=finish_suggestion_step_operation((op->>'operation_id')::uuid,(op->>'lease_token')::uuid,result);
 PERFORM pg_temp.step_assert(done->>'status'='ready' AND done->'result'=result,'intention purchase contains all nine paths');
 -- A blocked recovery is still a purchased operation, never a declined new request.
 key:=gen_random_uuid()::text;
 op:=reserve_suggestion_step_operation(u,b,1,'attack','approach','I pull the cable','to hold the crossing',key,1,true,true);
 UPDATE private.suggestion_step_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=(op->>'operation_id')::uuid;
 replay:=reserve_suggestion_step_operation(u,b,1,'attack','approach','I pull the cable','to hold the crossing',key,1,false,false);
 PERFORM pg_temp.step_assert(replay->>'status'='pending' AND replay->>'operation_id'=op->>'operation_id' AND replay->>'error'='generation_disabled' AND (replay->>'credits_spent')::int=1,'kill switch does not erase durable recovery identity');
 -- Fill the remaining attempt budget without starting providers.
 FOR n IN 1..30 LOOP
  done:=reserve_suggestion_step_operation(u,b,1,'defense','intent','I hold the cable',NULL,gen_random_uuid()::text,1,true,true);
  EXIT WHEN done->>'error'='rate_limited';
 END LOOP;
 replay:=reserve_suggestion_step_operation(u,b,1,'attack','approach','I pull the cable','to hold the crossing',key,1,true,true);
 PERFORM pg_temp.step_assert(replay->>'status'='pending' AND replay->>'operation_id'=op->>'operation_id' AND replay->>'error'='rate_limited','rate limit preserves purchased recovery identity');
 UPDATE private.suggestion_step_attempts SET attempted_at=clock_timestamp()-interval '25 hours' WHERE profile_id=u;
 -- Test users send and see the actual waived price, for both new steps and action rerolls.
 UPDATE profiles SET is_test_user=true WHERE id=u;
 SELECT sum(amount) INTO balance FROM wallet_transactions WHERE profile_id=u AND currency_type='credits';
 op:=reserve_suggestion_step_operation(u,b,1,'attack','intent','I pull the cable',NULL,gen_random_uuid()::text,0,true,true);
 PERFORM pg_temp.step_assert(op->>'status'='claimed' AND (op->>'credits_spent')::int=0,'step waiver accepts actual confirmed zero price');
 PERFORM finish_suggestion_step_operation((op->>'operation_id')::uuid,(op->>'lease_token')::uuid,NULL,'{}','generation_failed');
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,0,'player',true,true,3);
 PERFORM pg_temp.step_assert(replay->>'status'='claimed' AND (replay->>'credits_spent')::int=0,'action waiver accepts actual confirmed zero price');
 PERFORM pg_temp.step_assert((SELECT sum(amount) FROM wallet_transactions WHERE profile_id=u AND currency_type='credits')=balance,'waived failure creates neither debit nor refund');
 PERFORM set_config('test.step_owner',u::text,true);
 PERFORM set_config('test.step_battle',b::text,true);
END $$;
DO $$
DECLARE u uuid:=current_setting('test.step_owner')::uuid; b uuid:=current_setting('test.step_battle')::uuid;
 key text:=gen_random_uuid()::text; first jsonb; claim jsonb; done jsonb; n integer; refunds bigint;
BEGIN
 UPDATE profiles SET is_test_user=false WHERE id=u;
 SELECT count(*) INTO refunds FROM wallet_transactions WHERE profile_id=u AND reason LIKE 'prompt_suggestions_refund:%';
 FOR n IN 1..3 LOOP
  claim:=reserve_suggestion_step_operation(u,b,1,'defense','approach','I pull the cable','to hold the crossing',key,1,true,true);
  PERFORM pg_temp.step_assert(claim->>'status'='claimed','three lease generations permitted');
  IF n=1 THEN first:=claim; END IF;
  UPDATE private.suggestion_step_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=(claim->>'operation_id')::uuid;
 END LOOP;
 done:=reserve_suggestion_step_operation(u,b,1,'defense','approach','I pull the cable','to hold the crossing',key,1,false,false);
 PERFORM pg_temp.step_assert(done->>'status'='failed' AND done->>'error'='attempts_exhausted' AND (done->>'refunded')::boolean,'exhausted reclaim refunds without another purchase even with generation disabled');
 PERFORM pg_temp.step_assert((SELECT count(*) FROM private.suggestion_step_attempts WHERE operation_id=(first->>'operation_id')::uuid)=3,'exactly three attempts persist');
 PERFORM pg_temp.step_assert((SELECT count(*) FROM wallet_transactions WHERE profile_id=u AND reason LIKE 'prompt_suggestions_refund:%')=refunds+1,'exhausted operation refunded once');
 PERFORM pg_temp.step_assert(NOT EXISTS(SELECT 1 FROM private.suggestion_completions WHERE profile_id=u),'paid step purchases do not consume free adaptation slots');
 key:=gen_random_uuid()::text;
 claim:=reserve_suggestion_step_operation(u,b,1,'defense','approach','I pull the cable','to hold the crossing',key,1,true,true);
 UPDATE private.suggestion_step_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=(claim->>'operation_id')::uuid;
 UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()-interval '1 second' WHERE battle_id=b;
 done:=reserve_suggestion_step_operation(u,b,1,'defense','approach','I pull the cable','to hold the crossing',key,1,false,false);
 PERFORM pg_temp.step_assert(done->>'error'='round_closed_before_delivery' AND (done->>'refunded')::boolean,'expired purchase can be recovered and refunded after deadline');
 PERFORM set_config('test.step_operation',claim->>'operation_id',true);
 UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()+interval '1 hour' WHERE battle_id=b;
 key:=gen_random_uuid()::text;
 claim:=reserve_suggestion_step_operation(u,b,1,'defense','approach','I pull the cable','to hold the crossing',key,1,true,true);
 UPDATE private.suggestion_step_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=(claim->>'operation_id')::uuid;
 UPDATE battles SET player_one_character_id=current_setting('test.step_altcharacter')::uuid WHERE id=b;
 done:=reserve_suggestion_step_operation(u,b,1,'defense','approach','I pull the cable','to hold the crossing',key,1,false,false);
 PERFORM pg_temp.step_assert(done->>'status'='failed' AND done->>'error'='context_changed_before_delivery' AND (done->>'refunded')::boolean,'expired purchase refunds when authoritative context has changed');
END $$;
-- The original paid action-bank API must preserve the same recovery guarantees.
DO $$
DECLARE u uuid:=gen_random_uuid(); c uuid; b uuid; key text; op jsonb; replay jsonb; done jsonb;
 n integer; terminal text; expected text; refunds bigint; old_token uuid;
 bank jsonb:='[{"title":"Hold the crossing","body":"I pull the cable across the crossing to interrupt their charge."}]';
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (u,u||'@action-recovery.invalid',jsonb_build_object('age_confirmed',true,'username','act_'||left(u::text,8)));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Action tester','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of,
 theme,prompt_experience_version,judge_policy_version,situation_catalog_version)
 VALUES(u,c,true,'waiting_for_prompts','ranked','bo3',1,3,'Precision over power',2,'v2.0.0-ideas',1) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES(b,1,'waiting_for_prompts',clock_timestamp()+interval '1 hour');
 PERFORM grant_credits(u,200,'action_recovery_test',gen_random_uuid()::text);
 key:=gen_random_uuid()::text;
 op:=reserve_suggestion_operation(u,b,1,'attack','reroll',key,1,'player',true,true,2);
 PERFORM pg_temp.step_assert(op->>'status'='claimed' AND (op->>'credits_spent')::int=1,'action purchase reserved before recovery checks');
 old_token:=(op->>'lease_token')::uuid;
 UPDATE private.suggestion_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=(op->>'operation_id')::uuid;
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',key,1,'player',false,false,2);
 PERFORM pg_temp.step_assert(replay->>'status'='pending' AND replay->>'operation_id'=op->>'operation_id' AND replay->>'error'='generation_disabled' AND (replay->>'credits_spent')::int=1 AND NOT (replay->>'refunded')::boolean,'action kill switch retains charged recovery identity');
 FOR n IN 1..30 LOOP
  done:=reserve_suggestion_operation(u,b,1,'defense','reroll',gen_random_uuid()::text,1,'player',true,true,2);
  EXIT WHEN done->>'error'='rate_limited';
 END LOOP;
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',key,1,'player',true,true,2);
 PERFORM pg_temp.step_assert(replay->>'status'='pending' AND replay->>'operation_id'=op->>'operation_id' AND replay->>'error'='rate_limited' AND (replay->>'credits_spent')::int=1,'action rate limit retains charged recovery identity');
 PERFORM pg_temp.step_assert((SELECT attempts FROM private.suggestion_operations WHERE id=(op->>'operation_id')::uuid)=1,'blocked action recovery neither regenerates nor consumes an attempt');
 UPDATE private.suggestion_operation_attempts SET attempted_at=clock_timestamp()-interval '25 hours' WHERE profile_id=u;
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',key,1,'player',true,false,2);
 PERFORM pg_temp.step_assert(replay->>'status'='claimed' AND replay->>'operation_id'=op->>'operation_id','existing action purchase resumes without a new purchase');
 done:=finish_suggestion_operation((replay->>'operation_id')::uuid,(replay->>'lease_token')::uuid,bank);
 PERFORM pg_temp.step_assert(done->>'status'='ready','resumed action purchase can deliver');
 UPDATE battles SET status='result_ready',player_one_character_id=current_setting('test.step_altcharacter')::uuid WHERE id=b;
 UPDATE character_edit_prices SET credits=2 WHERE edit_kind='prompt_suggestions_reroll';
 done:=reserve_suggestion_operation(u,b,1,'attack','reroll',key,1,'player',false,false,2);
 PERFORM pg_temp.step_assert(done->>'status'='ready' AND done->'suggestions'=bank AND (done->>'credits_spent')::int=1,'delivered action replay survives closure, price, switch and character changes');
 done:=finish_suggestion_operation((op->>'operation_id')::uuid,old_token,NULL,'{}','generation_failed');
 PERFORM pg_temp.step_assert(done->>'status'='stale','old action worker cannot refund delivered successor');
 UPDATE character_edit_prices SET credits=1 WHERE edit_kind='prompt_suggestions_reroll';
 FOREACH terminal IN ARRAY ARRAY['round_closed','deadline','prompt_locked','character_unavailable','attempts_exhausted'] LOOP
  DELETE FROM battle_prompts WHERE battle_id=b;
  UPDATE battles SET status='waiting_for_prompts',player_one_character_id=c WHERE id=b;
  UPDATE battle_rounds SET status='waiting_for_prompts',lock_in_deadline=clock_timestamp()+interval '1 hour' WHERE battle_id=b;
  key:=gen_random_uuid()::text;
  op:=reserve_suggestion_operation(u,b,1,'finisher','reroll',key,1,'player',true,true,2);
  old_token:=(op->>'lease_token')::uuid;
  UPDATE private.suggestion_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=(op->>'operation_id')::uuid;
  SELECT count(*) INTO refunds FROM wallet_transactions WHERE profile_id=u AND reason LIKE 'prompt_suggestions_refund:%';
  IF terminal='round_closed' THEN UPDATE battles SET status='result_ready' WHERE id=b;
  ELSIF terminal='deadline' THEN UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()-interval '1 second' WHERE battle_id=b;
  ELSIF terminal='prompt_locked' THEN PERFORM lock_prompt(b,u,NULL,'I move behind the support to regain space for a counter.','attack','approved',1);
  ELSIF terminal='character_unavailable' THEN UPDATE battles SET player_one_character_id=current_setting('test.step_altcharacter')::uuid WHERE id=b;
  ELSE UPDATE private.suggestion_operations SET attempts=3 WHERE id=(op->>'operation_id')::uuid;
  END IF;
  expected:=CASE terminal WHEN 'round_closed' THEN 'round_closed_before_delivery' WHEN 'deadline' THEN 'round_closed_before_delivery' WHEN 'prompt_locked' THEN 'prompt_locked_before_delivery' ELSE terminal END;
  done:=reserve_suggestion_operation(u,b,1,'finisher','reroll',key,1,'player',false,false,2);
  PERFORM pg_temp.step_assert(done->>'status'='failed' AND done->>'operation_id'=op->>'operation_id' AND done->>'error'=expected AND (done->>'refunded')::boolean,'expired action recovery terminalizes and refunds: '||terminal);
  replay:=reserve_suggestion_operation(u,b,1,'finisher','reroll',key,1,'player',false,false,2);
  PERFORM pg_temp.step_assert(replay=done,'failed action purchase replays without another refund: '||terminal);
  replay:=finish_suggestion_operation((op->>'operation_id')::uuid,old_token,bank);
  PERFORM pg_temp.step_assert(replay->>'status'='stale','expired old action worker is fenced: '||terminal);
  PERFORM pg_temp.step_assert((SELECT count(*) FROM wallet_transactions WHERE profile_id=u AND reason LIKE 'prompt_suggestions_refund:%')=refunds+1,'one action refund only: '||terminal);
 END LOOP;
END $$;
SELECT pg_temp.step_assert(NOT has_table_privilege('authenticated','private.suggestion_step_operations','SELECT,INSERT,UPDATE,DELETE'),'step content private');
SELECT pg_temp.step_assert(NOT has_table_privilege('anon','private.suggestion_step_attempts','SELECT,INSERT,UPDATE,DELETE'),'step attempts private');
SELECT pg_temp.step_assert((SELECT relrowsecurity FROM pg_class WHERE oid='private.suggestion_step_operations'::regclass),'step table RLS enabled');
SELECT pg_temp.step_assert(NOT has_function_privilege('authenticated','public.reserve_suggestion_step_operation(uuid,uuid,integer,public.move_type,text,text,text,text,integer,boolean,boolean)','EXECUTE'),'client cannot reserve directly');
SELECT pg_temp.step_assert(NOT has_function_privilege('anon','public.finish_suggestion_step_operation(uuid,uuid,jsonb,jsonb,text)','EXECUTE'),'anonymous cannot finalize');
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private.suggestion_step_operations,private.suggestion_step_attempts TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.step_owner'),true);
SELECT pg_temp.step_assert((SELECT count(*) FROM private.suggestion_step_operations)=0,'RLS denies even owner with accidental grant');
SELECT pg_temp.step_assert((SELECT count(*) FROM private.suggestion_step_attempts)=0,'RLS denies attempts with accidental grant');
DO $$
DECLARE affected integer;
BEGIN
 BEGIN
  INSERT INTO private.suggestion_step_attempts(operation_id,attempt_number,profile_id)
  VALUES(current_setting('test.step_operation')::uuid,2,current_setting('test.step_owner')::uuid);
  RAISE EXCEPTION 'RLS allowed forged attempt';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE private.suggestion_step_operations SET credits_spent=0;
 GET DIAGNOSTICS affected=ROW_COUNT;
 PERFORM pg_temp.step_assert(affected=0,'RLS blocks updates even after accidental write grants');
 DELETE FROM private.suggestion_step_operations;
 GET DIAGNOSTICS affected=ROW_COUNT;
 PERFORM pg_temp.step_assert(affected=0,'RLS blocks deletes even after accidental write grants');
END $$;
RESET ROLE;
SELECT pg_temp.step_assert(NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE schemaname='private' AND tablename IN ('suggestion_step_operations','suggestion_step_attempts')),'private purchase data is not in a Realtime publication');
ROLLBACK;
