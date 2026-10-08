BEGIN;
CREATE FUNCTION pg_temp.cinematic_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
SELECT pg_temp.cinematic_assert(to_regprocedure('public.resolve_cinematic_policy(uuid)') IS NOT NULL,'cinematic policy resolver exists');
SELECT pg_temp.cinematic_assert(to_regprocedure('public.persist_cinematic_input(uuid,uuid,jsonb,text)') IS NOT NULL,'lease-fenced input persistence exists');
SELECT pg_temp.cinematic_assert(to_regprocedure('public.insert_cinematic_video_job(jsonb,jsonb)') IS NOT NULL,'exact quote insertion RPC exists');
SELECT pg_temp.cinematic_assert((SELECT relrowsecurity FROM pg_class WHERE oid='public.video_job_inputs'::regclass),'snapshot RLS enabled');
DO $$
DECLARE
 u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); c1 uuid; c2 uuid; b uuid; single_b uuid; bot_b uuid; r uuid;
 j uuid; legacy_j uuid; single_j uuid; token uuid:=gen_random_uuid(); policy jsonb; stored jsonb; source text;
 before_wallet bigint; before_allowance bigint;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (u1,u1||'@cinematic.invalid',jsonb_build_object('age_confirmed',true,'username','cine_'||replace(u1::text,'-',''))),
 (u2,u2||'@cinematic.invalid',jsonb_build_object('age_confirmed',true,'username','cine_'||replace(u2::text,'-','')));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u1,'One','strategist','Ready') RETURNING id INTO c1;
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u2,'Two','titan','Ready') RETURNING id INTO c2;
 INSERT INTO battles(player_one_id,player_two_id,player_one_character_id,player_two_character_id,format,best_of,mode,status)
 VALUES(u1,u2,c1,c2,'bo3',3,'unranked','completed') RETURNING id INTO b;
 INSERT INTO battles(player_one_id,player_two_id,player_one_character_id,player_two_character_id,format,mode,status)
 VALUES(u1,u2,c1,c2,'single','unranked','completed') RETURNING id INTO single_b;
 INSERT INTO battles(player_one_id,player_two_id,player_one_character_id,is_player_two_bot,format,best_of,mode,status)
 VALUES(u1,u2,c1,true,'bo3',3,'bot','completed') RETURNING id INTO bot_b;
 PERFORM pg_temp.cinematic_assert(get_cinematic_capabilities()='{"enabled":false,"plus_duration_seconds":20}'::jsonb,'rollout disabled by default');
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(b)='{"cinematic_profile":"standard","target_duration_seconds":8,"duration_policy_version":null}'::jsonb,'disabled Bo3 stays legacy eight seconds');
 INSERT INTO video_jobs(battle_id,request_payload_hash) VALUES(single_b,'legacy-request-hash') RETURNING id INTO legacy_j;
 policy:=resolve_cinematic_policy(b);
 UPDATE cinematic_generation_config SET enabled=true WHERE singleton;
 BEGIN PERFORM insert_cinematic_video_job(jsonb_build_object('battle_id',b,'request_payload_hash','rollout-flip'),policy); RAISE EXCEPTION 'null-version stale quote accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_quote_changed' THEN RAISE; END IF; END;
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(b)='{"cinematic_profile":"standard","target_duration_seconds":8,"duration_policy_version":"cinematics-v3"}'::jsonb,'standard Bo3 eight seconds');
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(single_b)->>'target_duration_seconds'='12','standard single twelve seconds');
 BEGIN
  ALTER VIEW public.entitlements_v2 RENAME TO cinematic_test_entitlements_unavailable;
  PERFORM resolve_cinematic_policy(b);
  RAISE EXCEPTION 'entitlement query error silently accepted';
 EXCEPTION WHEN undefined_table THEN NULL; END;
 BEGIN INSERT INTO video_jobs(battle_id,request_payload_hash) VALUES(b,'roundless-bo3'); RAISE EXCEPTION 'roundless Bo3 accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_round_required' THEN RAISE; END IF; END;
 INSERT INTO subscriptions(profile_id,revenuecat_subscription_id,product_id,status,allowance_reset_at,starts_at,expires_at,monthly_video_allowance_used,monthly_round_allowance_used)
 VALUES(u2,'cinematic-'||u2,'promptwars_plus_monthly','active',now()+interval '30 days',now(),now()+interval '30 days',30,90);
 SELECT count(*) INTO before_wallet FROM wallet_transactions;
 SELECT sum(monthly_round_allowance_used) INTO before_allowance FROM subscriptions;
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(b)->>'target_duration_seconds'='20','either human Plus despite exhausted allowance');
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(single_b)->>'target_duration_seconds'='20','single Plus twenty seconds');
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(bot_b)->>'target_duration_seconds'='8','bot does not borrow a profile subscription');
 UPDATE subscriptions SET status='canceled' WHERE profile_id=u2;
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(b)->>'cinematic_profile'='plus','canceled paid-through subscription qualifies');
 UPDATE subscriptions SET expires_at=now()-interval '1 second' WHERE profile_id=u2;
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(b)->>'cinematic_profile'='standard','expired subscription fails closed');
 UPDATE subscriptions SET status='active',expires_at=NULL WHERE profile_id=u2;
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(b)->>'cinematic_profile'='standard','missing expiry fails closed');
 UPDATE subscriptions SET expires_at=now()+interval '30 days' WHERE profile_id=u2;
 INSERT INTO subscriptions(profile_id,revenuecat_subscription_id,product_id,status,allowance_reset_at,starts_at,expires_at)
 VALUES(u1,'cinematic-'||u1,'promptwars_plus_monthly','active',now()+interval '30 days',now(),now()+interval '30 days');
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(b)->>'target_duration_seconds'='20','both Plus');
 PERFORM pg_temp.cinematic_assert(resolve_cinematic_policy(bot_b)->>'target_duration_seconds'='20','human Plus against bot');
 PERFORM pg_temp.cinematic_assert((SELECT count(*)=before_wallet FROM wallet_transactions),'resolution never debits wallet');
 PERFORM pg_temp.cinematic_assert((SELECT sum(monthly_round_allowance_used)=before_allowance FROM subscriptions),'resolution never debits allowance');
 INSERT INTO battle_rounds(battle_id,round_number,status) VALUES(b,1,'result_ready') RETURNING id INTO r;
 FOREACH source IN ARRAY ARRAY['auto_free','auto_subscriber','on_demand_credit','on_demand_grant'] LOOP
  INSERT INTO video_jobs(battle_id,battle_round_id,round_number,trigger,request_payload_hash,requester_profile_id)
  VALUES(b,r,1,source,'request-for-'||source,u1) RETURNING id INTO j;
  PERFORM pg_temp.cinematic_assert((SELECT cinematic_profile='plus' AND target_duration_seconds=20 AND duration_policy_version='cinematics-v3' FROM video_jobs WHERE id=j),'funding-independent freeze '||source);
  DELETE FROM video_jobs WHERE id=j;
 END LOOP;
 BEGIN
  INSERT INTO video_jobs(battle_id,battle_round_id,round_number,trigger,request_payload_hash,cinematic_profile,target_duration_seconds,duration_policy_version)
  VALUES(b,r,1,'on_demand_credit','stale-quote','standard',8,'cinematics-v3');
  RAISE EXCEPTION 'stale quote accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_quote_changed' THEN RAISE; END IF; END;
 stored:=insert_cinematic_video_job(jsonb_build_object('battle_id',b,'battle_round_id',r,'round_number',1,'trigger','on_demand_credit','request_payload_hash','fresh-quote'),resolve_cinematic_policy(b));
 j:=(stored->>'id')::uuid;
 PERFORM pg_temp.cinematic_assert(stored->>'target_duration_seconds'='20','exact-quote RPC returns frozen full job');
 BEGIN
  INSERT INTO video_jobs(battle_id,battle_round_id,round_number,trigger,request_payload_hash)
  VALUES(b,r,1,'on_demand_credit','duplicate-quote');
  RAISE EXCEPTION 'duplicate accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 UPDATE subscriptions SET expires_at=now()-interval '1 second' WHERE profile_id IN(u1,u2);
 PERFORM pg_temp.cinematic_assert((SELECT target_duration_seconds=20 FROM video_jobs WHERE id=j),'existing job survives subscription expiration');
 BEGIN UPDATE video_jobs SET target_duration_seconds=8 WHERE id=j; RAISE EXCEPTION 'policy edit accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_policy_immutable' THEN RAISE; END IF; END;
 PERFORM pg_temp.cinematic_assert((SELECT duration_policy_version IS NULL AND target_duration_seconds=12 FROM video_jobs WHERE id=legacy_j),'disabled legacy job stays twelve after activation');
 UPDATE video_jobs SET lease_token=token,lease_expires_at=now()+interval '2 minutes' WHERE id=legacy_j;
 BEGIN PERFORM persist_cinematic_input(legacy_j,token,'{}',repeat('f',64)); RAISE EXCEPTION 'legacy hash overwritten';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_legacy_input_not_supported' THEN RAISE; END IF; END;
 DELETE FROM video_jobs WHERE id=legacy_j;
 INSERT INTO video_jobs(battle_id,request_payload_hash,lease_token,lease_expires_at) VALUES(single_b,'new-single',token,now()+interval '2 minutes') RETURNING id INTO single_j;
 policy:=jsonb_build_object('version',2,'battleId',single_b,'roundId',NULL,'roundNumber',NULL,'policy',resolve_cinematic_policy(single_b));
 stored:=persist_cinematic_input(single_j,token,policy,repeat('e',64));
 PERFORM pg_temp.cinematic_assert(stored->>'roundId' IS NULL,'single null round snapshot persists');
 UPDATE video_jobs SET lease_token=token,lease_expires_at=now()+interval '2 minutes' WHERE id=j;
 policy:=jsonb_build_object('version',2,'battleId',b,'roundId',r,'roundNumber',1,'policy',jsonb_build_object('cinematic_profile','plus','target_duration_seconds',20,'duration_policy_version','cinematics-v3'),'nested',jsonb_build_object('move','first'));
 BEGIN PERFORM persist_cinematic_input(j,token,policy||'{"version":1}',repeat('a',64)); RAISE EXCEPTION 'wrong input version accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_input_invalid' THEN RAISE; END IF; END;
 BEGIN PERFORM persist_cinematic_input(j,token,policy||jsonb_build_object('battleId',single_b),repeat('a',64)); RAISE EXCEPTION 'wrong input battle accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_input_invalid' THEN RAISE; END IF; END;
 BEGIN PERFORM persist_cinematic_input(j,token,policy||'{"roundId":null}',repeat('a',64)); RAISE EXCEPTION 'wrong input round accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_input_invalid' THEN RAISE; END IF; END;
 BEGIN PERFORM persist_cinematic_input(j,token,policy||jsonb_build_object('policy',resolve_cinematic_policy(b)),repeat('a',64)); RAISE EXCEPTION 'current subscription reinterpreted snapshot policy';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_input_invalid' THEN RAISE; END IF; END;
 BEGIN PERFORM persist_cinematic_input(j,token,policy,'not-a-canonical-hash'); RAISE EXCEPTION 'malformed hash accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_input_invalid' THEN RAISE; END IF; END;
 PERFORM pg_temp.cinematic_assert(NOT EXISTS(SELECT 1 FROM video_job_inputs WHERE video_job_id=j),'invalid snapshots cannot partially insert');
 stored:=persist_cinematic_input(j,token,policy,repeat('a',64));
 PERFORM pg_temp.cinematic_assert(stored->'nested'->>'move'='first','first snapshot stored');
 PERFORM pg_temp.cinematic_assert((SELECT input_payload_hash=repeat('a',64) FROM video_jobs WHERE id=j),'hash written atomically');
 stored:=persist_cinematic_input(j,token,'{"inputVersion":"cinematic-input-v2","nested":{"move":"changed"}}'::jsonb,repeat('b',64));
 PERFORM pg_temp.cinematic_assert(stored->'nested'->>'move'='first','retry returns original snapshot');
 PERFORM pg_temp.cinematic_assert((SELECT input_payload_hash=repeat('a',64) FROM video_jobs WHERE id=j),'retry preserves original hash');
 BEGIN PERFORM persist_cinematic_input(j,gen_random_uuid(),'{}',repeat('c',64)); RAISE EXCEPTION 'wrong token accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_lease_lost' THEN RAISE; END IF; END;
 UPDATE video_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=j;
 BEGIN PERFORM persist_cinematic_input(j,token,'{}',repeat('c',64)); RAISE EXCEPTION 'expired token accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_lease_lost' THEN RAISE; END IF; END;
 BEGIN UPDATE video_job_inputs SET payload='{}' WHERE video_job_id=j; RAISE EXCEPTION 'snapshot edit accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_input_immutable' THEN RAISE; END IF; END;
 BEGIN UPDATE video_jobs SET input_payload_hash=repeat('d',64) WHERE id=j; RAISE EXCEPTION 'snapshot hash changed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_input_hash_immutable' THEN RAISE; END IF; END;
 PERFORM set_config('test.cinematic_job',j::text,true);
 PERFORM set_config('test.cinematic_battle',b::text,true);
 PERFORM set_config('test.cinematic_player',u1::text,true);
 -- Existing automatic eligibility hook must survive this additive migration.
 PERFORM pg_temp.cinematic_assert(position('registration_generation_guard' IN pg_get_functiondef('enqueue_auto_battle_video(uuid,uuid,smallint,text)'::regprocedure))>0,'automatic eligibility guard preserved');
END $$;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  PERFORM pg_temp.cinematic_assert(NOT has_table_privilege(role_name,'video_job_inputs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'client snapshot privileges denied '||role_name);
  PERFORM pg_temp.cinematic_assert(NOT has_table_privilege(role_name,'cinematic_generation_config','SELECT,INSERT,UPDATE,DELETE'),'client rollout privileges denied '||role_name);
  PERFORM pg_temp.cinematic_assert(NOT has_function_privilege(role_name,'resolve_cinematic_policy(uuid)','EXECUTE'),'client policy resolver denied '||role_name);
  PERFORM pg_temp.cinematic_assert(NOT has_function_privilege(role_name,'persist_cinematic_input(uuid,uuid,jsonb,text)','EXECUTE'),'client snapshot RPC denied '||role_name);
  PERFORM pg_temp.cinematic_assert(NOT has_function_privilege(role_name,'insert_cinematic_video_job(jsonb,jsonb)','EXECUTE'),'client insertion RPC denied '||role_name);
 END LOOP;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cinematic_player'),true);
SELECT pg_temp.cinematic_assert((get_cinematic_capabilities()->>'enabled')::boolean,'authenticated client reads capability');
SELECT pg_temp.cinematic_assert(EXISTS(SELECT 1 FROM video_jobs WHERE id=current_setting('test.cinematic_job')::uuid),'participant reads safe job policy fields');
DO $$ BEGIN
 BEGIN PERFORM * FROM video_job_inputs; RAISE EXCEPTION 'client read snapshot'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE cinematic_generation_config SET enabled=false; RAISE EXCEPTION 'client disabled rollout'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE video_jobs SET target_duration_seconds=8 WHERE id=current_setting('test.cinematic_job')::uuid; RAISE EXCEPTION 'client forged duration'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.cinematic_assert((resolve_cinematic_policy(current_setting('test.cinematic_battle')::uuid)->>'target_duration_seconds')::int=8,'service resolves expired participants');
SELECT pg_temp.cinematic_assert(EXISTS(SELECT 1 FROM video_job_inputs WHERE video_job_id=current_setting('test.cinematic_job')::uuid),'service reads stored snapshot');
SELECT pg_temp.cinematic_assert(has_function_privilege(current_user,'insert_cinematic_video_job(jsonb,jsonb)','EXECUTE'),'service may insert with exact quote');
UPDATE video_jobs SET lease_expires_at=now()+interval '2 minutes' WHERE id=current_setting('test.cinematic_job')::uuid;
SELECT pg_temp.cinematic_assert(persist_cinematic_input(current_setting('test.cinematic_job')::uuid,(SELECT lease_token FROM video_jobs WHERE id=current_setting('test.cinematic_job')::uuid),'{}',repeat('b',64))->'nested'->>'move'='first','service RPC reuses snapshot without direct insert grants');
DO $$ BEGIN
 BEGIN INSERT INTO video_job_inputs(video_job_id,input_version,payload,payload_hash) VALUES(gen_random_uuid(),2,'{}',repeat('a',64)); RAISE EXCEPTION 'service bypassed snapshot RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: cinematic policy, entitlement lifetime, funding independence, freeze, leases, snapshots and permissions';
ROLLBACK;
