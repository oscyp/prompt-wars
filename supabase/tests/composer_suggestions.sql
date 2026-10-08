-- Behavioral finance/lease/RLS suite. Run with pending migrations in a rolled-back transaction.
BEGIN;
CREATE FUNCTION pg_temp.suggestion_assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'suggestions: %',message; END IF; END $$;
DO $$
DECLARE u uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); c uuid; b uuid;
  first jsonb; replay jsonb; paid jsonb; successor jsonb; finished jsonb; before_balance integer;
  key1 text:=gen_random_uuid()::text; key2 text:=gen_random_uuid()::text;
  result jsonb:='[{"title":"Opening","body":"I step around the wave to make room for a counter."}]';
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (u,u||'@suggestion.invalid',jsonb_build_object('age_confirmed',true,'username','sg_'||left(replace(u::text,'-',''),12))),
 (other_user,other_user||'@suggestion.invalid',jsonb_build_object('age_confirmed',true,'username','sg_'||left(replace(other_user::text,'-',''),12)));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Tester','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of)
 VALUES(u,c,true,'waiting_for_prompts','ranked','bo3',1,3) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES(b,1,'waiting_for_prompts',now()+interval '1 hour');
 PERFORM grant_credits(u,10,'suggestion_test',gen_random_uuid()::text);
 SELECT coalesce(sum(amount),0) INTO before_balance FROM wallet_transactions WHERE profile_id=u AND currency_type='credits';
 UPDATE character_edit_prices SET credits=1 WHERE edit_kind='prompt_suggestions_reroll';
 first:=reserve_suggestion_operation(u,b,1,'attack','ensure_free',NULL,NULL,'prefetch',true,true);
 PERFORM pg_temp.suggestion_assert(first->>'status'='claimed','first free request owns lease');
 replay:=reserve_suggestion_operation(u,b,1,'attack','ensure_free',NULL,NULL,'player',true,true);
 PERFORM pg_temp.suggestion_assert(replay->>'status'='pending' AND replay->>'operation_id'=first->>'operation_id','foreground sees pending prefetch without spending');
 PERFORM pg_temp.suggestion_assert((SELECT sum(amount) FROM wallet_transactions WHERE profile_id=u AND currency_type='credits')=before_balance,'free read never charges');
 finished:=finish_suggestion_operation((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,result,'{}',NULL);
 PERFORM pg_temp.suggestion_assert(finished->>'status'='ready','free completion ready');
 replay:=reserve_suggestion_operation(u,b,1,'attack','ensure_free',NULL,NULL,'player',true,true);
 PERFORM pg_temp.suggestion_assert(replay->>'status'='ready','reentry returns first free set');
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',key1,9,'player',true,true);
 PERFORM pg_temp.suggestion_assert(replay->>'error'='price_changed','stale price rejects before debit');
 paid:=reserve_suggestion_operation(u,b,1,'attack','reroll',key1,1,'player',true,true);
 PERFORM pg_temp.suggestion_assert(paid->>'status'='claimed' AND (paid->>'credits_spent')::integer=1,'paid operation reserved');
 UPDATE character_edit_prices SET credits=2 WHERE edit_kind='prompt_suggestions_reroll';
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',key1,1,'player',false,false);
 PERFORM pg_temp.suggestion_assert(replay->>'status'='pending' AND (replay->>'credits_spent')::integer=1,'retry recovers original price even after flag/price change');
 PERFORM pg_temp.suggestion_assert((SELECT sum(amount) FROM wallet_transactions WHERE profile_id=u AND currency_type='credits')=before_balance-1,'retries debit once');
 replay:=reserve_suggestion_operation(u,b,1,'defense','reroll',key1,2,'player',true,true);
 PERFORM pg_temp.suggestion_assert(replay->>'error'='idempotency_conflict','operation key cannot be rebound');
 UPDATE private.suggestion_operations SET lease_expires_at=now()-interval '1 second' WHERE id=(paid->>'operation_id')::uuid;
 successor:=reserve_suggestion_operation(u,b,1,'attack','reroll',key1,1,'player',true,true);
 PERFORM pg_temp.suggestion_assert(successor->>'status'='claimed' AND successor->>'lease_token'<>paid->>'lease_token','expired lease is fenced');
 finished:=finish_suggestion_operation((successor->>'operation_id')::uuid,(successor->>'lease_token')::uuid,result,'{}',NULL);
 PERFORM pg_temp.suggestion_assert(finished->>'status'='ready','successor succeeds');
 finished:=finish_suggestion_operation((paid->>'operation_id')::uuid,(paid->>'lease_token')::uuid,NULL,'{}','generation_failed');
 PERFORM pg_temp.suggestion_assert(finished->>'status'='stale','late failure cannot refund success');
 PERFORM pg_temp.suggestion_assert((SELECT sum(amount) FROM wallet_transactions WHERE profile_id=u AND currency_type='credits')=before_balance-1,'late failure leaves debit intact');
 paid:=reserve_suggestion_operation(u,b,1,'attack','reroll',key2,2,'player',true,true);
 finished:=finish_suggestion_operation((paid->>'operation_id')::uuid,(paid->>'lease_token')::uuid,NULL,'{}','moderation_rejected');
 PERFORM pg_temp.suggestion_assert(finished->>'status'='failed','rejection is terminal');
 PERFORM finish_suggestion_operation((paid->>'operation_id')::uuid,(paid->>'lease_token')::uuid,NULL,'{}','moderation_rejected');
 PERFORM pg_temp.suggestion_assert((SELECT sum(amount) FROM wallet_transactions WHERE profile_id=u AND currency_type='credits')=before_balance-1,'failure refunds exactly once');
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',key2,2,'player',true,true);
 PERFORM pg_temp.suggestion_assert(replay->>'status'='failed','same failed operation never recharges');
 replay:=reserve_suggestion_operation(other_user,b,1,'attack','ensure_free',NULL,NULL,'player',true,true);
 PERFORM pg_temp.suggestion_assert(replay->>'error'='forbidden','outsider cannot reserve');
 replay:=reserve_suggestion_operation(u,b,2,'attack','ensure_free',NULL,NULL,'player',true,true);
 PERFORM pg_temp.suggestion_assert(replay->>'error'='round_not_open','future round cannot reserve');
 -- Free failures release their row, but retries retain the same audited operation.
 first:=reserve_suggestion_operation(u,b,1,'defense','ensure_free',NULL,NULL,'player',true,true);
 PERFORM finish_suggestion_operation((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,NULL,'{}','generation_failed');
 successor:=reserve_suggestion_operation(u,b,1,'defense','ensure_free',NULL,NULL,'player',true,true);
 PERFORM pg_temp.suggestion_assert(successor->>'status'='claimed' AND successor->>'operation_id'=first->>'operation_id','free failure can retry without burning slot');
 PERFORM finish_suggestion_operation((successor->>'operation_id')::uuid,(successor->>'lease_token')::uuid,result,'{}',NULL);
 INSERT INTO move_prompt_suggestions(battle_id,profile_id,character_id,round_number,move_type,suggestions,moderation_status)
 VALUES(b,u,c,1,'finisher',result,'approved');
 replay:=reserve_suggestion_operation(u,b,1,'finisher','ensure_free',NULL,NULL,'player',false,false);
 PERFORM pg_temp.suggestion_assert(replay->>'status'='ready' AND replay->>'operation_id' IS NULL,'legacy cache remains readable without a second free generation');
 UPDATE character_edit_prices SET credits=0 WHERE edit_kind='prompt_suggestions_reroll';
 paid:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,0,'player',true,true);
 PERFORM pg_temp.suggestion_assert(paid->>'status'='claimed' AND (paid->>'credits_spent')::integer=0,'zero price reroll does not collide with free index');
 PERFORM finish_suggestion_operation((paid->>'operation_id')::uuid,(paid->>'lease_token')::uuid,result,'{}',NULL);
 UPDATE character_edit_prices SET credits=1000 WHERE edit_kind='prompt_suggestions_reroll';
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,1000,'player',true,true);
 PERFORM pg_temp.suggestion_assert(replay->>'error'='insufficient_credits','insufficient wallet cannot reserve a paid set');
 UPDATE character_edit_prices SET credits=2 WHERE edit_kind='prompt_suggestions_reroll';
 paid:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,2,'player',true,true);
 UPDATE private.suggestion_operations SET lease_expires_at=clock_timestamp()-interval '5 minutes' WHERE id=(paid->>'operation_id')::uuid;
 PERFORM pg_temp.suggestion_assert(NOT renew_suggestion_operation((paid->>'operation_id')::uuid,(paid->>'lease_token')::uuid),'expired heartbeat cannot regain ownership');
 PERFORM expire_suggestion_operations();
 PERFORM expire_suggestion_operations();
 PERFORM pg_temp.suggestion_assert((SELECT sum(amount) FROM wallet_transactions WHERE profile_id=u AND currency_type='credits')=before_balance-1,'sweeper refunds abandoned purchase once');
 -- Legacy combined calls count as generations, not one request per result row.
 INSERT INTO move_prompt_suggestions(battle_id,profile_id,character_id,round_number,move_type,suggestions,moderation_status,is_paid,credits_spent,generation_id)
 SELECT b,u,c,1,'attack',result,'approved',true,1,'11111111-2222-3333-4444-555555555555'::uuid FROM generate_series(1,30);
 paid:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,2,'player',true,true);
 PERFORM pg_temp.suggestion_assert(paid->>'status'='claimed','legacy combined generation must not exhaust the request cap');
 PERFORM finish_suggestion_operation((paid->>'operation_id')::uuid,(paid->>'lease_token')::uuid,NULL,'{}','generation_failed');
 -- Delivery checks happen after parent locks, not merely at reservation.
 paid:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,2,'player',true,true);
 UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()-interval '1 second' WHERE battle_id=b AND round_number=1;
 finished:=finish_suggestion_operation((paid->>'operation_id')::uuid,(paid->>'lease_token')::uuid,result,'{}',NULL);
 PERFORM pg_temp.suggestion_assert(finished->>'status'='failed' AND finished->>'error'='round_closed_before_delivery' AND (finished->>'refunded')::boolean,'late paid delivery refunds after deadline');
 PERFORM finish_suggestion_operation((paid->>'operation_id')::uuid,(paid->>'lease_token')::uuid,result,'{}',NULL);
 PERFORM pg_temp.suggestion_assert((SELECT sum(amount) FROM wallet_transactions WHERE profile_id=u AND currency_type='credits')=before_balance-1,'late paid replay refunds once');
 UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()+interval '1 hour' WHERE battle_id=b AND round_number=1;
 paid:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,2,'player',true,true);
 PERFORM lock_prompt(b,u,NULL,'I step around the wave to make room for a counter.','attack','approved',1);
 finished:=finish_suggestion_operation((paid->>'operation_id')::uuid,(paid->>'lease_token')::uuid,result,'{}',NULL);
 PERFORM pg_temp.suggestion_assert(finished->>'status'='failed' AND finished->>'error'='prompt_locked_before_delivery' AND (finished->>'refunded')::boolean,'locked owner cannot receive paid set');
 PERFORM pg_temp.suggestion_assert((SELECT sum(amount) FROM wallet_transactions WHERE profile_id=u AND currency_type='credits')=before_balance-1,'locked owner refunded');
 -- Closing a round forbids new claims, but cannot erase an already purchased result.
 UPDATE battles SET status='completed' WHERE id=b;
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',key1,1,'player',false,false);
 PERFORM pg_temp.suggestion_assert(replay->>'status'='ready','completed operation can be replayed after battle ends');
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,2,'player',true,true);
 PERFORM pg_temp.suggestion_assert(replay->>'error'='round_not_open','terminal battle never purchases');
 PERFORM set_config('test.suggestion_owner',u::text,true);
 PERFORM set_config('test.suggestion_outsider',other_user::text,true);
END $$;
-- Fresh grouped banks consume one attempt each. Cache and pending reads consume none.
DO $$
DECLARE u uuid:=gen_random_uuid(); c uuid; b uuid; bank text; out jsonb; n integer;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,u||'@suggestion-rate.invalid',jsonb_build_object('age_confirmed',true,'username','rate_'||left(replace(u::text,'-',''),12)));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Rate tester','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of)
 VALUES(u,c,true,'waiting_for_prompts','ranked','bo3',1,3) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES(b,1,'waiting_for_prompts',clock_timestamp()+interval '1 hour');
 FOREACH bank IN ARRAY ARRAY['attack','defense','finisher'] LOOP
  out:=reserve_suggestion_operation(u,b,1,bank::move_type,'ensure_free',NULL,NULL,'player',true,true);
  PERFORM pg_temp.suggestion_assert(out->>'status'='claimed','each fresh bank claimed');
  out:=reserve_suggestion_operation(u,b,1,bank::move_type,'ensure_free',NULL,NULL,'player',true,true);
  PERFORM pg_temp.suggestion_assert(out->>'status'='pending','pending bank is replayed');
 END LOOP;
 PERFORM pg_temp.suggestion_assert((SELECT sum(attempts) FROM private.suggestion_operations WHERE profile_id=u)=3,'three banks consume three attempts, replays zero');
 UPDATE character_edit_prices SET credits=0 WHERE edit_kind='prompt_suggestions_reroll';
 FOR n IN 4..30 LOOP
  out:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,0,'player',true,true);
  PERFORM pg_temp.suggestion_assert(out->>'status'='claimed','hour permits thirty attempt units');
 END LOOP;
 out:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,0,'player',true,true);
 PERFORM pg_temp.suggestion_assert(out->>'error'='rate_limited','thirty-first hourly attempt blocked');
 out:=reserve_suggestion_operation(u,b,1,'attack','ensure_free',NULL,NULL,'player',true,true);
 PERFORM pg_temp.suggestion_assert(out->>'status'='pending','pending recovery remains free at cap');
 UPDATE private.suggestion_operations SET created_at=clock_timestamp()-interval '2 hours' WHERE profile_id=u;
 UPDATE private.suggestion_operation_attempts SET attempted_at=clock_timestamp()-interval '2 hours' WHERE profile_id=u;
 FOR n IN 31..90 LOOP
  out:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,0,'player',true,true);
  PERFORM pg_temp.suggestion_assert(out->>'status'='claimed','day permits ninety attempt units');
  UPDATE private.suggestion_operations SET created_at=clock_timestamp()-interval '2 hours' WHERE id=(out->>'operation_id')::uuid;
  UPDATE private.suggestion_operation_attempts SET attempted_at=clock_timestamp()-interval '2 hours' WHERE operation_id=(out->>'operation_id')::uuid;
 END LOOP;
 out:=reserve_suggestion_operation(u,b,1,'attack','reroll',gen_random_uuid()::text,0,'player',true,true);
 PERFORM pg_temp.suggestion_assert(out->>'error'='rate_limited','ninety-first daily attempt blocked');
END $$;
-- Legacy single format still works with nullable Bo3 metadata; a published closed
-- round is nevertheless closed even when the battle status has not caught up.
DO $$
DECLARE u uuid:=gen_random_uuid(); c uuid; b uuid; first jsonb; delivered jsonb;
 result jsonb:='[{"title":"Side step","body":"I move around the support to gain room for a counter."}]';
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,u||'@single-suggestion.invalid',jsonb_build_object('age_confirmed',true,'username','single_'||left(replace(u::text,'-',''),12)));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Single tester','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of)
 VALUES(u,c,true,'waiting_for_prompts','ranked','single',1,1) RETURNING id INTO b;
 first:=reserve_suggestion_operation(u,b,1,'attack','ensure_free',NULL,NULL,'player',true,true);
 PERFORM pg_temp.suggestion_assert(first->>'status'='claimed','legacy single can reserve without Bo3 metadata');
 delivered:=finish_suggestion_operation((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,result,'{}',NULL);
 PERFORM pg_temp.suggestion_assert(delivered->>'status'='ready','legacy single can publish');
 first:=reserve_suggestion_operation(u,b,1,'defense','ensure_free',NULL,NULL,'player',true,true);
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES(b,1,'result_ready',clock_timestamp()-interval '1 second')
 ON CONFLICT(battle_id,round_number) DO UPDATE SET status='result_ready';
 delivered:=finish_suggestion_operation((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,result,'{}',NULL);
 PERFORM pg_temp.suggestion_assert(delivered->>'error'='round_closed_before_delivery','closed single round rejects late delivery');
END $$;
-- Retrying an old operation consumes a current-window attempt, not its old bucket.
DO $$
DECLARE u uuid:=gen_random_uuid(); c uuid; b uuid; out jsonb; bank text; n integer;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,u||'@retry-rate.invalid',jsonb_build_object('age_confirmed',true,'username','retry_'||left(replace(u::text,'-',''),12)));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Retry tester','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of)
 VALUES(u,c,true,'waiting_for_prompts','ranked','bo3',1,3) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES(b,1,'waiting_for_prompts',clock_timestamp()+interval '1 hour');
 FOREACH bank IN ARRAY ARRAY['attack','defense'] LOOP
  out:=reserve_suggestion_operation(u,b,1,bank::move_type,'ensure_free',NULL,NULL,'player',true,true);
  PERFORM finish_suggestion_operation((out->>'operation_id')::uuid,(out->>'lease_token')::uuid,NULL,'{}','generation_failed');
 END LOOP;
 UPDATE private.suggestion_operations SET created_at=clock_timestamp()-interval '2 hours' WHERE profile_id=u;
 IF to_regclass('private.suggestion_operation_attempts') IS NOT NULL THEN
   EXECUTE 'UPDATE private.suggestion_operation_attempts SET attempted_at=clock_timestamp()-interval ''2 hours'' WHERE profile_id=$1' USING u;
 END IF;
 UPDATE character_edit_prices SET credits=0 WHERE edit_kind='prompt_suggestions_reroll';
 FOR n IN 1..29 LOOP
  out:=reserve_suggestion_operation(u,b,1,'finisher','reroll',gen_random_uuid()::text,0,'player',true,true);
  PERFORM pg_temp.suggestion_assert(out->>'status'='claimed','twenty nine new attempts fit');
 END LOOP;
 out:=reserve_suggestion_operation(u,b,1,'attack','ensure_free',NULL,NULL,'player',true,true);
 PERFORM pg_temp.suggestion_assert(out->>'status'='claimed','old free retry uses thirtieth current attempt');
 out:=reserve_suggestion_operation(u,b,1,'defense','ensure_free',NULL,NULL,'player',true,true);
 PERFORM pg_temp.suggestion_assert(out->>'error'='rate_limited','second old free retry cannot bypass hourly cap');
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.suggestion_owner'),true);
SELECT pg_temp.suggestion_assert((SELECT count(*) FROM move_prompt_suggestions)>0,'owner reads own suggestions');
SELECT set_config('request.jwt.claim.sub',current_setting('test.suggestion_outsider'),true);
SELECT pg_temp.suggestion_assert((SELECT count(*) FROM move_prompt_suggestions)=0,'outsider reads no suggestions');
RESET ROLE;
SELECT pg_temp.suggestion_assert(NOT has_function_privilege('authenticated','public.reserve_suggestion_operation(uuid,uuid,integer,public.move_type,text,text,integer,text,boolean,boolean)','EXECUTE'),'client cannot invoke money RPC');
SELECT pg_temp.suggestion_assert(NOT has_table_privilege('authenticated','private.suggestion_operations','SELECT'),'lease tokens are not exposed to clients');
SELECT pg_temp.suggestion_assert(NOT has_table_privilege('authenticated','private.suggestion_operation_attempts','SELECT,INSERT,UPDATE,DELETE'),'attempt ledger stays private');
SELECT pg_temp.suggestion_assert(NOT has_table_privilege('authenticated','public.move_prompt_suggestions','INSERT'),'client cannot forge suggestion rows');
ROLLBACK;
