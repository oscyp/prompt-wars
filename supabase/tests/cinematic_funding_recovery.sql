BEGIN;
CREATE FUNCTION pg_temp.recovery_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
SELECT pg_temp.recovery_assert(to_regprocedure('public.recover_orphan_cinematic_funding(integer,integer)') IS NOT NULL,'durable orphan funding recovery exists');
DO $$
DECLARE u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); c1 uuid; c2 uuid; b uuid; r1 uuid; r2 uuid;
 tx uuid; linked_tx uuid; result jsonb; baseline bigint;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (u1,u1||'@recovery.invalid',jsonb_build_object('age_confirmed',true,'username','reco_'||replace(u1::text,'-',''))),
 (u2,u2||'@recovery.invalid',jsonb_build_object('age_confirmed',true,'username','reco_'||replace(u2::text,'-','')));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u1,'One','strategist','Ready') RETURNING id INTO c1;
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u2,'Two','titan','Ready') RETURNING id INTO c2;
 INSERT INTO battles(player_one_id,player_two_id,player_one_character_id,player_two_character_id,format,best_of,mode,status)
 VALUES(u1,u2,c1,c2,'bo3',3,'unranked','completed') RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status) VALUES(b,1,'result_ready') RETURNING id INTO r1;
 INSERT INTO battle_rounds(battle_id,round_number,status) VALUES(b,2,'result_ready') RETURNING id INTO r2;
 INSERT INTO battle_rounds(battle_id,round_number,status) VALUES(b,3,'result_ready');
 INSERT INTO wallet_transactions(profile_id,amount,balance_after,reason) VALUES(u1,5,5,'recovery_credit_grant');
 SELECT sum(amount) INTO baseline FROM wallet_transactions WHERE profile_id=u1;
 tx:=reserve_round_upgrade_credit(u1,b,1::smallint,'orphan-'||b);
 PERFORM recover_orphan_cinematic_funding(1000,900);
 PERFORM pg_temp.recovery_assert((SELECT status='held' FROM wallet_transactions WHERE id=tx),'fresh hold is not reclaimed');
 UPDATE wallet_transactions SET created_at=now()-interval '16 minutes' WHERE id=tx;
 PERFORM recover_orphan_cinematic_funding(1000,900);
 PERFORM pg_temp.recovery_assert((SELECT status='refunded' FROM wallet_transactions WHERE id=tx),'old orphan hold refunded durably');
 PERFORM pg_temp.recovery_assert((SELECT credits_balance=baseline FROM entitlements_v2 WHERE profile_id=u1),'orphan recovery restores exact credit');
 PERFORM recover_orphan_cinematic_funding(1000,900);
 PERFORM pg_temp.recovery_assert((SELECT count(*)=1 FROM wallet_transactions WHERE idempotency_key='refund:'||tx),'orphan recovery is idempotent');
 BEGIN
  PERFORM insert_cinematic_video_job(jsonb_build_object('battle_id',b,'battle_round_id',r1,'round_number',1,'requester_profile_id',u1,
   'entitlement_source','credit','spend_transaction_id',tx,'request_payload_hash','reclaimed-funding'),resolve_cinematic_policy(b));
  RAISE EXCEPTION 'reclaimed reservation funded job';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_funding_reservation_invalid' THEN RAISE; END IF; END;
 linked_tx:=reserve_round_upgrade_credit(u1,b,2::smallint,'linked-'||b);
 result:=insert_cinematic_video_job(jsonb_build_object('battle_id',b,'battle_round_id',r2,'round_number',2,'requester_profile_id',u1,
  'entitlement_source','credit','spend_transaction_id',linked_tx,'request_payload_hash','linked-funding'),resolve_cinematic_policy(b));
 UPDATE wallet_transactions SET created_at=now()-interval '16 minutes' WHERE id=linked_tx;
 PERFORM recover_orphan_cinematic_funding(1000,900);
 PERFORM pg_temp.recovery_assert((SELECT status='held' FROM wallet_transactions WHERE id=linked_tx),'linked provider job retains its funding');
 PERFORM pg_temp.recovery_assert(NOT has_function_privilege('authenticated','recover_orphan_cinematic_funding(integer,integer)','EXECUTE'),'orphan recovery is service-only');
 PERFORM set_config('test.recovery_player',u1::text,true);
 PERFORM set_config('test.recovery_battle',b::text,true);
END $$;
SET LOCAL ROLE service_role;
SELECT pg_temp.recovery_assert(reserve_round_upgrade_credit(current_setting('test.recovery_player')::uuid,current_setting('test.recovery_battle')::uuid,3::smallint,'service-recovery-'||current_setting('test.recovery_battle')) IS NOT NULL,'service role reserves funded retry');
SELECT recover_orphan_cinematic_funding(100,900);
RESET ROLE;
SELECT 'PASS: durable orphan hold recovery, exact refund, idempotency, freshness and insert fencing';
ROLLBACK;
