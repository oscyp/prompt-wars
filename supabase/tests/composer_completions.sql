-- Real behavior, rolled back by scripts/test-composition-db.py.
BEGIN;
CREATE FUNCTION pg_temp.composition_assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'composition: %',message; END IF; END $$;
-- Produces literal valid choices; assertions below never derive expected results from production helpers.
CREATE FUNCTION pg_temp.approaches(prefix text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_array(jsonb_build_object('id',prefix||'-1','text','by waiting until their footing shifts'),
 jsonb_build_object('id',prefix||'-2','text','by keeping the cable low and taut'),
 jsonb_build_object('id',prefix||'-3','text','by stepping behind the nearer support'))
$$;
DO $$
DECLARE u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); c uuid; b uuid; op jsonb; replay jsonb;
 result jsonb:=jsonb_build_object('approachHints',pg_temp.approaches('custom')); first jsonb; bank jsonb; upgraded jsonb;
 paid jsonb; complete jsonb; key text:=gen_random_uuid()::text; n integer; count_before bigint;
BEGIN
 PERFORM pg_temp.composition_assert(to_regprocedure('public.reserve_suggestion_completion(uuid,uuid,integer,public.move_type,text,text,text,uuid,integer,boolean)') IS NOT NULL,'completion reservation is available');
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (u,u||'@composition.invalid',jsonb_build_object('age_confirmed',true,'username','cmp_'||left(replace(u::text,'-',''),12))),
 (outsider,outsider||'@composition.invalid',jsonb_build_object('age_confirmed',true,'username','cmp_'||left(replace(outsider::text,'-',''),12)));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Tester','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of)
 VALUES(u,c,true,'waiting_for_prompts','ranked','bo3',1,3) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES(b,1,'waiting_for_prompts',clock_timestamp()+interval '1 hour');
 replay:=reserve_suggestion_completion(outsider,b,1,'attack','approach','I pull the cable','to interrupt their charge',NULL,3,true);
 PERFORM pg_temp.composition_assert(replay->>'error'='forbidden','nonparticipant cannot claim');
 first:=reserve_suggestion_completion(u,b,1,'attack','approach','I pull the cable','to interrupt their charge',NULL,3,true);
 PERFORM pg_temp.composition_assert(first->>'status'='claimed' AND (first->>'remaining_adaptations')::int=5,'first claim reserves one of six slots');
 replay:=reserve_suggestion_completion(u,b,1,'attack','approach',' I pull the cable ','to interrupt their charge',NULL,3,true);
 PERFORM pg_temp.composition_assert(replay->>'status'='pending' AND replay->>'context_key'=first->>'context_key','exact trimmed context replays pending');
 PERFORM pg_temp.composition_assert((SELECT count(*) FROM private.suggestion_completion_attempts WHERE profile_id=u)=1,'pending read consumes no attempt');
 complete:=finish_suggestion_completion((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,result);
 PERFORM pg_temp.composition_assert(complete->>'status'='ready' AND complete->'result'=result,'completed choice is preserved');
 FOR n IN 2..6 LOOP
   op:=reserve_suggestion_completion(u,b,1,'defense','approach','I pull the cable '||n,'to interrupt their charge',NULL,3,true);
   PERFORM pg_temp.composition_assert(op->>'status'='claimed','six distinct contexts admitted');
   PERFORM finish_suggestion_completion((op->>'operation_id')::uuid,(op->>'lease_token')::uuid,result);
 END LOOP;
 replay:=reserve_suggestion_completion(u,b,1,'finisher','intent','I sweep around the pillar',NULL,NULL,3,true);
 PERFORM pg_temp.composition_assert(replay->>'error'='adaptation_limit_reached','quota spans target and move type');
 replay:=reserve_suggestion_completion(u,b,1,'attack','approach','I pull the cable','to interrupt their charge',NULL,3,false);
 PERFORM pg_temp.composition_assert(replay->>'status'='ready' AND replay->'result'=result,'completed replay works at quota and disabled generation');
 -- A successful older purchase must not change status/price/text during enrichment.
 SELECT jsonb_agg(jsonb_build_object('id','action-'||a,'structureVersion',2,'title','Cable move '||a,
 'body','I pull the cable to interrupt their charge.','action','I pull the cable '||a,
 'intentHints',(SELECT jsonb_agg(jsonb_build_object('id','intent-'||a||'-'||i,'text','to interrupt their charge '||i)) FROM generate_series(1,3)i)))
 INTO bank FROM generate_series(1,3)a;
 SELECT jsonb_agg(a||jsonb_build_object('compositionVersion',3,'intentHints',
 (SELECT jsonb_agg(i||jsonb_build_object('approachHints',pg_temp.approaches(i->>'id'))) FROM jsonb_array_elements(a->'intentHints')i)))
 INTO upgraded FROM jsonb_array_elements(bank)a;
 PERFORM grant_credits(u,10,'composition_test',gen_random_uuid()::text);
 UPDATE character_edit_prices SET credits=1 WHERE edit_kind='prompt_suggestions_reroll';
 paid:=reserve_suggestion_operation(u,b,1,'attack','reroll',key,1,'player',true,true);
 complete:=finish_suggestion_operation((paid->>'operation_id')::uuid,(paid->>'lease_token')::uuid,bank,'{"structure_version":2}');
 SELECT count(*) INTO count_before FROM wallet_transactions WHERE profile_id=u;
 op:=reserve_suggestion_completion(u,b,1,'attack','upgrade_v3',NULL,NULL,(paid->>'id')::uuid,3,true);
 PERFORM pg_temp.composition_assert(op->>'status'='claimed','upgrade is available after six custom adaptations');
 complete:=finish_suggestion_completion((op->>'operation_id')::uuid,(op->>'lease_token')::uuid,jsonb_set(upgraded,'{0,action}','"I replace the purchased action completely"'));
 PERFORM pg_temp.composition_assert(complete->>'error'='upgrade_changed_existing_content','upgrade cannot rewrite purchased action');
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',key,1,'player',false,false);
 PERFORM pg_temp.composition_assert(replay->>'status'='ready' AND replay->'suggestions'=bank,'failed upgrade preserves successful purchase');
 op:=reserve_suggestion_completion(u,b,1,'attack','upgrade_v3',NULL,NULL,(paid->>'id')::uuid,3,true);
 complete:=finish_suggestion_completion((op->>'operation_id')::uuid,(op->>'lease_token')::uuid,upgraded);
 PERFORM pg_temp.composition_assert(complete->>'status'='ready','enrichment delivered');
 replay:=reserve_suggestion_operation(u,b,1,'attack','reroll',key,900,'player',false,false,3);
 PERFORM pg_temp.composition_assert(replay->>'status'='ready' AND (replay->>'credits_spent')::int=1 AND replay->'suggestions'=upgraded,'purchase retry returns enriched text and original price');
 PERFORM pg_temp.composition_assert((SELECT count(*) FROM wallet_transactions WHERE profile_id=u)=count_before,'enrichment never changes wallet');
 first:=reserve_suggestion_operation(u,b,1,'finisher','ensure_free',NULL,NULL,'player',true,true,3);
 PERFORM pg_temp.composition_assert((first->>'composition_version')::int=3,'new bank remembers composition version');
 replay:=reserve_suggestion_operation(u,b,1,'finisher','ensure_free',NULL,NULL,'player',true,true);
 PERFORM pg_temp.composition_assert((replay->>'composition_version')::int=3 AND replay->>'operation_id'=first->>'operation_id','old request cannot downgrade an existing claim');
 complete:=finish_suggestion_operation((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,bank,'{"structure_version":2}');
 PERFORM pg_temp.composition_assert(complete->>'error'='invalid_completion','v3 claim rejects incomplete v2 tree');
 first:=reserve_suggestion_operation(u,b,1,'finisher','ensure_free',NULL,NULL,'player',true,true,3);
 complete:=finish_suggestion_operation((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,upgraded,'{"structure_version":2}');
 PERFORM pg_temp.composition_assert(complete->>'status'='ready' AND (complete->>'composition_version')::int=3,'v3 bank is delivered atomically');
 PERFORM set_config('test.completion_owner',u::text,true);
 PERFORM set_config('test.completion_battle',b::text,true);
END $$;
DO $$
DECLARE u uuid:=gen_random_uuid(); c uuid; b uuid; first jsonb; next_owner jsonb; out jsonb;
 result jsonb:=jsonb_build_object('approachHints',pg_temp.approaches('lease')); n integer;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,u||'@completion-lease.invalid',jsonb_build_object('age_confirmed',true,'username','lease_'||left(replace(u::text,'-',''),12)));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Lease tester','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of)
 VALUES(u,c,true,'waiting_for_prompts','ranked','bo3',1,3) RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES(b,1,'waiting_for_prompts',clock_timestamp()+interval '1 hour');
 first:=reserve_suggestion_completion(u,b,1,'attack','approach','I pull the cable','to interrupt their charge',NULL,3,true);
 UPDATE private.suggestion_completions SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=(first->>'operation_id')::uuid;
 PERFORM pg_temp.composition_assert(NOT renew_suggestion_completion((first->>'operation_id')::uuid,(first->>'lease_token')::uuid),'expired heartbeat cannot reclaim');
 next_owner:=reserve_suggestion_completion(u,b,1,'attack','approach','I pull the cable','to interrupt their charge',NULL,3,true);
 PERFORM pg_temp.composition_assert(next_owner->>'status'='claimed' AND next_owner->>'lease_token'<>first->>'lease_token','expired work has a new fence');
 out:=finish_suggestion_completion((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,NULL,'{}','generation_failed');
 PERFORM pg_temp.composition_assert(out->>'status'='stale','old worker cannot finalize');
 out:=finish_suggestion_completion((next_owner->>'operation_id')::uuid,(next_owner->>'lease_token')::uuid,result);
 PERFORM pg_temp.composition_assert(out->>'status'='ready','successor succeeds');
 FOR n IN 1..3 LOOP
   first:=reserve_suggestion_completion(u,b,1,'attack','approach','I pull the second cable','to hold the crossing',NULL,3,true);
   PERFORM pg_temp.composition_assert(first->>'status'='claimed','three provider attempts permitted');
   PERFORM finish_suggestion_completion((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,NULL,'{}','generation_failed');
 END LOOP;
 out:=reserve_suggestion_completion(u,b,1,'attack','approach','I pull the second cable','to hold the crossing',NULL,3,true);
 PERFORM pg_temp.composition_assert(out->>'error'='attempts_exhausted','fourth attempt denied');
 -- Malformed provider output fails closed and does not consume a success slot.
 first:=reserve_suggestion_completion(u,b,1,'attack','approach','I pull the third cable','to hold the crossing',NULL,3,true);
 out:=finish_suggestion_completion((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,'{"approachHints":[]}');
 PERFORM pg_temp.composition_assert(out->>'status'='failed' AND out->>'error'='invalid_completion','partial output fails closed');
 first:=reserve_suggestion_completion(u,b,1,'attack','approach','I pull the fourth cable','to hold the crossing',NULL,3,true);
 UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()-interval '1 second' WHERE battle_id=b;
 out:=finish_suggestion_completion((first->>'operation_id')::uuid,(first->>'lease_token')::uuid,result);
 PERFORM pg_temp.composition_assert(out->>'error'='round_closed_before_delivery','late result is not delivered');
 PERFORM pg_temp.composition_assert((SELECT count(*) FROM private.suggestion_completions WHERE profile_id=u AND status='succeeded')=1,'only delivered success consumes quota');
 PERFORM pg_temp.composition_assert(NOT EXISTS(SELECT 1 FROM wallet_transactions WHERE profile_id=u AND reason LIKE 'prompt_suggestions%'),'completions have no financial side effects');
END $$;
-- Defense in depth: no client grants or policies; only service RPCs.
SELECT pg_temp.composition_assert(NOT has_table_privilege('authenticated','private.suggestion_completions','SELECT,INSERT,UPDATE,DELETE'),'completion content private');
SELECT pg_temp.composition_assert(NOT has_table_privilege('anon','private.suggestion_completion_attempts','SELECT,INSERT,UPDATE,DELETE'),'attempt ledger private');
SELECT pg_temp.composition_assert((SELECT relrowsecurity FROM pg_class WHERE oid='private.suggestion_completions'::regclass),'completion table RLS enabled');
SELECT pg_temp.composition_assert(NOT has_function_privilege('authenticated','public.reserve_suggestion_completion(uuid,uuid,integer,public.move_type,text,text,text,uuid,integer,boolean)','EXECUTE'),'client cannot invoke service claim');
SELECT pg_temp.composition_assert(NOT has_function_privilege('anon','public.finish_suggestion_completion(uuid,uuid,jsonb,jsonb,text)','EXECUTE'),'anonymous cannot finalize');
-- Both legacy and new telemetry retain idempotency, while new sequences count occurrences.
DO $$
DECLARE u uuid:=current_setting('test.completion_owner')::uuid; b uuid:=current_setting('test.completion_battle')::uuid; session uuid:=gen_random_uuid();
BEGIN
 INSERT INTO composer_event_occurrences(profile_id,battle_id,round_number,session_id,event,sequence_number,duration_ms)
 VALUES(u,b,1,session,'composer_step_next',1,100),(u,b,1,session,'composer_step_next',2,200);
 INSERT INTO composer_event_occurrences(profile_id,battle_id,round_number,session_id,event,sequence_number,duration_ms)
 VALUES(u,b,1,session,'composer_step_next',1,50)
 ON CONFLICT(profile_id,battle_id,round_number,session_id,event,sequence_number) DO UPDATE SET duration_ms=excluded.duration_ms;
 PERFORM pg_temp.composition_assert((SELECT count(*) FROM composer_event_occurrences WHERE session_id=session)=2,'repeated next events count separately, retry deduplicates');
 PERFORM pg_temp.composition_assert((SELECT duration_ms FROM composer_event_occurrences WHERE session_id=session AND sequence_number=1)=100,'out of order occurrence cannot lower duration');
 INSERT INTO composer_events(profile_id,battle_id,round_number,session_id,event,duration_ms) VALUES(u,b,1,session,'composer_opened',10)
 ON CONFLICT(profile_id,battle_id,round_number,session_id,event) DO UPDATE SET duration_ms=excluded.duration_ms;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.completion_owner'),true);
SELECT pg_temp.composition_assert((SELECT count(*) FROM composer_event_occurrences)=2,'owner reads own occurrences');
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
SELECT pg_temp.composition_assert((SELECT count(*) FROM composer_event_occurrences)=0,'outsider reads no occurrences');
RESET ROLE;
SELECT pg_temp.composition_assert(NOT has_table_privilege('authenticated','public.composer_event_occurrences','INSERT,UPDATE,DELETE'),'client cannot forge occurrences');
-- Even if grants drift later, private completion RLS denies all client rows.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT ON private.suggestion_completions,private.suggestion_completion_attempts TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.composition_assert((SELECT count(*) FROM private.suggestion_completions)=0,'private RLS denies completions even with accidental read grant');
SELECT pg_temp.composition_assert((SELECT count(*) FROM private.suggestion_completion_attempts)=0,'private RLS denies attempts even with accidental read grant');
RESET ROLE;
REVOKE SELECT ON private.suggestion_completions,private.suggestion_completion_attempts FROM authenticated;
ROLLBACK;
