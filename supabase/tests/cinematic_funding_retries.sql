BEGIN;
CREATE FUNCTION pg_temp.funding_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
DO $$
DECLARE u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); c1 uuid; c2 uuid; b uuid; tx uuid; retry_tx uuid; grant_tx uuid; baseline_one bigint; baseline_two bigint;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 (u1,u1||'@funding.invalid',jsonb_build_object('age_confirmed',true,'username','fund_'||replace(u1::text,'-',''))),
 (u2,u2||'@funding.invalid',jsonb_build_object('age_confirmed',true,'username','fund_'||replace(u2::text,'-','')));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u1,'One','strategist','Ready') RETURNING id INTO c1;
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u2,'Two','titan','Ready') RETURNING id INTO c2;
 INSERT INTO battles(player_one_id,player_two_id,player_one_character_id,player_two_character_id,format,best_of,mode,status)
 VALUES(u1,u2,c1,c2,'bo3',3,'unranked','completed') RETURNING id INTO b;
 INSERT INTO battle_rounds(battle_id,round_number,status) VALUES(b,1,'result_ready'),(b,2,'result_ready'),(b,3,'result_ready');
 UPDATE profiles SET new_user_round_grants_remaining=3,new_user_round_grants_granted_at=now(),new_user_grant_per_battle_limit=1 WHERE id IN(u1,u2);
 INSERT INTO wallet_transactions(profile_id,amount,balance_after,reason) VALUES(u1,5,5,'test_credit_grant'),(u2,5,5,'test_credit_grant');
 SELECT sum(amount) INTO baseline_one FROM wallet_transactions WHERE profile_id=u1 AND currency_type='credits';
 SELECT sum(amount) INTO baseline_two FROM wallet_transactions WHERE profile_id=u2 AND currency_type='credits';
 tx:=reserve_round_upgrade_credit(u1,b,1::smallint,'credit-first-'||b);
 PERFORM pg_temp.funding_assert(reserve_round_upgrade_credit(u1,b,1::smallint,'credit-first-'||b)=tx,'same active request reuses one credit hold');
 PERFORM finalize_round_upgrade(tx,'failed');
 BEGIN PERFORM reserve_round_upgrade_credit(u1,b,1::smallint,'credit-first-'||b); RAISE EXCEPTION 'released reservation reused as funding';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'round_upgrade_reservation_terminal' THEN RAISE; END IF; END;
 PERFORM pg_temp.funding_assert((SELECT credits_balance=baseline_one FROM entitlements_v2 WHERE profile_id=u1),'failed credit hold restores exact original balance');
 PERFORM finalize_round_upgrade(tx,'failed');
 PERFORM pg_temp.funding_assert((SELECT credits_balance=baseline_one FROM entitlements_v2 WHERE profile_id=u1),'repeated refund does not mint a credit');
 retry_tx:=reserve_round_upgrade_credit(u1,b,1::smallint,'credit-retry-'||b);
 PERFORM pg_temp.funding_assert(retry_tx<>tx,'fresh attempt gets fresh funded hold');
 PERFORM pg_temp.funding_assert((SELECT credits_balance=baseline_one-1 FROM entitlements_v2 WHERE profile_id=u1),'retry debits exactly one credit');
 BEGIN PERFORM reserve_round_upgrade_credit(u1,b,1::smallint,'credit-competitor-'||b); RAISE EXCEPTION 'different attempt shares winner hold';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'round_upgrade_already_reserved' THEN RAISE; END IF; END;
 BEGIN PERFORM reserve_round_upgrade_grant(u2,b,1::smallint,'grant-competitor-'||b); RAISE EXCEPTION 'other player funds same round';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'round_upgrade_already_reserved' THEN RAISE; END IF; END;
 PERFORM finalize_round_upgrade(retry_tx,'succeeded');
 PERFORM pg_temp.funding_assert(reserve_round_upgrade_credit(u1,b,1::smallint,'credit-retry-'||b)=retry_tx,'same spent request stays idempotent');
 BEGIN PERFORM reserve_round_upgrade_credit(u1,b,1::smallint,'credit-after-success-'||b); RAISE EXCEPTION 'successful round debited again';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'round_upgrade_already_spent' THEN RAISE; END IF; END;
 grant_tx:=reserve_round_upgrade_grant(u1,b,2::smallint,'grant-first-'||b);
 PERFORM pg_temp.funding_assert((SELECT new_user_round_grants_remaining=2 FROM profiles WHERE id=u1),'grant reserves exactly one token');
 PERFORM finalize_round_upgrade(grant_tx,'failed');
 BEGIN PERFORM reserve_round_upgrade_grant(u1,b,2::smallint,'grant-first-'||b); RAISE EXCEPTION 'released grant reused as funding';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'round_upgrade_reservation_terminal' THEN RAISE; END IF; END;
 retry_tx:=reserve_round_upgrade_grant(u1,b,2::smallint,'grant-retry-'||b);
 PERFORM pg_temp.funding_assert(retry_tx<>grant_tx AND (SELECT new_user_round_grants_remaining=2 FROM profiles WHERE id=u1),'grant retry reserves restored token');
 PERFORM finalize_round_upgrade(retry_tx,'succeeded');
 BEGIN PERFORM reserve_round_upgrade_grant(u1,b,3::smallint,'grant-over-limit-'||b); RAISE EXCEPTION 'grant cap bypassed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'per_battle_grant_limit_reached' THEN RAISE; END IF; END;
 -- Historical released credit holds retain their negative amount; the view
 -- must count the original debit and its positive reversal together.
 INSERT INTO wallet_transactions(profile_id,amount,balance_after,currency_type,reason,status,source,battle_id,round_number,idempotency_key)
 VALUES(u2,-1,4,'credits','round_upgrade_hold','released','credit',b,3,'historical-hold-'||b),
 (u2,1,5,'credits','round_upgrade_refund','refunded','credit',b,3,'historical-refund-'||b);
 PERFORM pg_temp.funding_assert((SELECT credits_balance=baseline_two FROM entitlements_v2 WHERE profile_id=u2),'historical release plus reversal nets zero');
 PERFORM pg_temp.funding_assert(NOT has_function_privilege('authenticated','reserve_round_upgrade_credit(uuid,uuid,smallint,text)','EXECUTE'),'credit reserve remains service-only');
 PERFORM pg_temp.funding_assert(NOT has_function_privilege('authenticated','reserve_round_upgrade_grant(uuid,uuid,smallint,text)','EXECUTE'),'grant reserve remains service-only');
END $$;
SELECT 'PASS: funded retries, terminal key rejection, shared funding fence, exact refunds and grant caps';
ROLLBACK;
