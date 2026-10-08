BEGIN;
CREATE FUNCTION pg_temp.single_funding_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject_single_funding_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.idempotency_key LIKE 'cinematic-job:%' AND current_setting('test.reject_single_funding',true)='true' THEN
  RAISE EXCEPTION 'test_funding_audit_unavailable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER test_reject_single_funding_audit BEFORE INSERT ON wallet_transactions
 FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_single_funding_audit();
DO $$
DECLARE u uuid:=gen_random_uuid(); c uuid; b uuid; grant_b uuid; allowance_b uuid; expired_b uuid; job jsonb; retry_job jsonb; old_job uuid; baseline bigint; sub uuid;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,u||'@single-funding.invalid',jsonb_build_object('age_confirmed',true,'username','sing_'||replace(u::text,'-','')));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'One','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,format,mode,status) VALUES(u,c,true,'single','bot','completed') RETURNING id INTO b;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,format,mode,status) VALUES(u,c,true,'single','bot','completed') RETURNING id INTO grant_b;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,format,mode,status) VALUES(u,c,true,'single','bot','completed') RETURNING id INTO allowance_b;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,format,mode,status) VALUES(u,c,true,'single','bot','completed') RETURNING id INTO expired_b;
 UPDATE profiles SET free_tier1_reveals_remaining=0 WHERE id=u;
 INSERT INTO wallet_transactions(profile_id,amount,balance_after,reason) VALUES(u,5,5,'single_credit_grant');
 SELECT sum(amount) INTO baseline FROM wallet_transactions WHERE profile_id=u;
 PERFORM set_config('test.reject_single_funding','true',true);
 BEGIN PERFORM insert_cinematic_video_job(jsonb_build_object('battle_id',b,'requester_profile_id',u,'request_payload_hash','single-credit-failure','entitlement_source','credits','expected_funding_quote',jsonb_build_object('method','credits','cost_credits',1)),resolve_cinematic_policy(b));
  RAISE EXCEPTION 'credit audit failure ignored';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'test_funding_audit_unavailable' THEN RAISE; END IF; END;
 PERFORM pg_temp.single_funding_assert(NOT EXISTS(SELECT 1 FROM video_jobs WHERE battle_id=b) AND (SELECT sum(amount)=baseline FROM wallet_transactions WHERE profile_id=u),'failed credit creation rolls back job and payment');
 PERFORM set_config('test.reject_single_funding','false',true);
 BEGIN PERFORM insert_cinematic_video_job(jsonb_build_object('battle_id',b,'requester_profile_id',u,'request_payload_hash','stale-funding','entitlement_source','free_grant','expected_funding_quote',jsonb_build_object('method','free_grant','cost_credits',0)),resolve_cinematic_policy(b));
  RAISE EXCEPTION 'stale single funding quote accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_quote_changed' THEN RAISE; END IF; END;
 PERFORM pg_temp.single_funding_assert(NOT EXISTS(SELECT 1 FROM video_jobs WHERE battle_id=b),'stale funding creates no job');
 job:=insert_cinematic_video_job(jsonb_build_object('battle_id',b,'requester_profile_id',u,'request_payload_hash','single-credit','entitlement_source','credits','expected_funding_quote',jsonb_build_object('method','credits','cost_credits',1)),resolve_cinematic_policy(b));
 PERFORM pg_temp.single_funding_assert((SELECT sum(amount)=baseline-1 FROM wallet_transactions WHERE profile_id=u),'atomic single creation debits one credit');
 PERFORM pg_temp.single_funding_assert(job->>'spend_transaction_id' IS NOT NULL AND job->>'credits_charged'='1','single job records its actual debit');
 BEGIN PERFORM insert_cinematic_video_job(jsonb_build_object('battle_id',b,'requester_profile_id',u,'request_payload_hash','single-duplicate','entitlement_source','credits','expected_funding_quote',jsonb_build_object('method','credits','cost_credits',1)),resolve_cinematic_policy(b));
  RAISE EXCEPTION 'duplicate single accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM pg_temp.single_funding_assert((SELECT sum(amount)=baseline-1 FROM wallet_transactions WHERE profile_id=u),'duplicate insertion cannot precharge');
 old_job:=(job->>'id')::uuid;
 PERFORM grant_credits(u,1,'video_refund','single-refund-'||b,b,NULL,'{}');
 UPDATE video_jobs SET status='failed',refunded=true WHERE id=old_job;
 DELETE FROM video_jobs WHERE id=old_job;
 retry_job:=insert_cinematic_video_job(jsonb_build_object('battle_id',b,'requester_profile_id',u,'request_payload_hash','single-retry','entitlement_source','credits','expected_funding_quote',jsonb_build_object('method','credits','cost_credits',1)),resolve_cinematic_policy(b));
 PERFORM pg_temp.single_funding_assert(retry_job->>'spend_transaction_id'<>job->>'spend_transaction_id','single retry gets fresh debit key');
 PERFORM pg_temp.single_funding_assert((SELECT sum(amount)=baseline-1 FROM wallet_transactions WHERE profile_id=u),'refunded single retry charges exactly once');
 UPDATE profiles SET free_tier1_reveals_remaining=3 WHERE id=u;
 PERFORM set_config('test.reject_single_funding','true',true);
 BEGIN PERFORM insert_cinematic_video_job(jsonb_build_object('battle_id',grant_b,'requester_profile_id',u,'request_payload_hash','single-grant-failure','entitlement_source','free_grant','expected_funding_quote',jsonb_build_object('method','free_grant','cost_credits',0)),resolve_cinematic_policy(grant_b));
  RAISE EXCEPTION 'grant audit failure ignored';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'test_funding_audit_unavailable' THEN RAISE; END IF; END;
 PERFORM pg_temp.single_funding_assert((SELECT free_tier1_reveals_remaining=3 FROM profiles WHERE id=u) AND NOT EXISTS(SELECT 1 FROM video_jobs WHERE battle_id=grant_b),'failed grant creation rolls back counter and job');
 PERFORM set_config('test.reject_single_funding','false',true);
 job:=insert_cinematic_video_job(jsonb_build_object('battle_id',grant_b,'requester_profile_id',u,'request_payload_hash','single-grant','entitlement_source','free_grant','expected_funding_quote',jsonb_build_object('method','free_grant','cost_credits',0)),resolve_cinematic_policy(grant_b));
 PERFORM pg_temp.single_funding_assert((SELECT free_tier1_reveals_remaining=2 FROM profiles WHERE id=u),'single grant consumed atomically');
 UPDATE profiles SET free_tier1_reveals_remaining=0 WHERE id=u;
 INSERT INTO subscriptions(profile_id,revenuecat_subscription_id,product_id,status,allowance_reset_at,starts_at,expires_at)
 VALUES(u,'single-sub-'||u,'promptwars_plus_monthly','canceled',now()+interval '30 days',now(),now()+interval '30 days') RETURNING id INTO sub;
 PERFORM set_config('test.reject_single_funding','true',true);
 BEGIN PERFORM insert_cinematic_video_job(jsonb_build_object('battle_id',allowance_b,'requester_profile_id',u,'request_payload_hash','single-allowance-failure','entitlement_source','subscription_allowance','expected_funding_quote',jsonb_build_object('method','subscription_allowance','cost_credits',0)),resolve_cinematic_policy(allowance_b));
  RAISE EXCEPTION 'allowance audit failure ignored';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'test_funding_audit_unavailable' THEN RAISE; END IF; END;
 PERFORM pg_temp.single_funding_assert((SELECT monthly_video_allowance_used=0 FROM subscriptions WHERE id=sub) AND NOT EXISTS(SELECT 1 FROM video_jobs WHERE battle_id=allowance_b),'failed allowance creation rolls back counter and job');
 PERFORM set_config('test.reject_single_funding','false',true);
 job:=insert_cinematic_video_job(jsonb_build_object('battle_id',allowance_b,'requester_profile_id',u,'request_payload_hash','single-allowance','entitlement_source','subscription_allowance','expected_funding_quote',jsonb_build_object('method','subscription_allowance','cost_credits',0)),resolve_cinematic_policy(allowance_b));
 PERFORM pg_temp.single_funding_assert((SELECT monthly_video_allowance_used=1 FROM subscriptions WHERE id=sub),'canceled paid-through allowance consumed atomically');
 PERFORM pg_temp.single_funding_assert((SELECT metadata->>'subscription_id'=sub::text FROM wallet_transactions WHERE id=(job->>'spend_transaction_id')::uuid),'charged subscription frozen in audit');
 UPDATE subscriptions SET status='active',expires_at=now()-interval '1 second' WHERE id=sub;
 BEGIN PERFORM insert_cinematic_video_job(jsonb_build_object('battle_id',expired_b,'requester_profile_id',u,'request_payload_hash','expired-allowance','entitlement_source','subscription_allowance','expected_funding_quote',jsonb_build_object('method','subscription_allowance','cost_credits',0)),resolve_cinematic_policy(expired_b));
  RAISE EXCEPTION 'expired active subscription consumed allowance';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_quote_changed' THEN RAISE; END IF; END;
 PERFORM pg_temp.single_funding_assert((SELECT monthly_video_allowance_used=1 FROM subscriptions WHERE id=sub) AND NOT EXISTS(SELECT 1 FROM video_jobs WHERE battle_id=expired_b),'expired active allowance fails without spend or job');
 UPDATE subscriptions SET status='canceled' WHERE id=sub;
 BEGIN PERFORM insert_cinematic_video_job(jsonb_build_object('battle_id',expired_b,'requester_profile_id',u,'request_payload_hash','expired-canceled-allowance','entitlement_source','subscription_allowance','expected_funding_quote',jsonb_build_object('method','subscription_allowance','cost_credits',0)),resolve_cinematic_policy(expired_b));
  RAISE EXCEPTION 'expired canceled subscription consumed allowance';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_quote_changed' THEN RAISE; END IF; END;
 PERFORM restore_subscription_allowance(u,(job->>'id')::uuid,'allowance-refund-'||b);
 PERFORM restore_subscription_allowance(u,(job->>'id')::uuid,'allowance-refund-'||b);
 PERFORM pg_temp.single_funding_assert((SELECT monthly_video_allowance_used=0 FROM subscriptions WHERE id=sub),'original expired subscription refunded exactly once');
 PERFORM set_config('test.single_funding_user',u::text,true);
 PERFORM set_config('test.single_funding_battle',expired_b::text,true);
END $$;
DROP TRIGGER test_reject_single_funding_audit ON wallet_transactions;
SET LOCAL ROLE service_role;
SELECT pg_temp.single_funding_assert(insert_cinematic_video_job(jsonb_build_object(
 'battle_id',current_setting('test.single_funding_battle'),'requester_profile_id',current_setting('test.single_funding_user'),
 'request_payload_hash','service-single','entitlement_source','credits','expected_funding_quote',jsonb_build_object('method','credits','cost_credits',1)),
 resolve_cinematic_policy(current_setting('test.single_funding_battle')::uuid))->>'spend_transaction_id' IS NOT NULL,'service role executes atomic funding with preserved grants');
RESET ROLE;
SELECT 'PASS: atomic single credit/grant/allowance funding, stale quotes, duplicate rollback and fresh retry debit';
ROLLBACK;
