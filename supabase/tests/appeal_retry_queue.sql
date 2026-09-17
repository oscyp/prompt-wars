-- Run against an isolated migrated local stack; no provider calls. Rolls back.
BEGIN;
CREATE FUNCTION pg_temp.check_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label;END IF;END $$;
DO $$
DECLARE u uuid:=gen_random_uuid();c uuid;b uuid;a uuid;pending uuid;expired uuid;t uuid:=gen_random_uuid();i integer;ids uuid[];
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,u||'@queue.invalid',jsonb_build_object('age_confirmed',true,'username','queue_'||left(replace(u::text,'-',''),12)));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Queue fighter','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(mode,status,player_one_id,player_one_character_id) VALUES('ranked','completed',u,c) RETURNING id INTO b;
 INSERT INTO appeals(battle_id,profile_id,created_at,review_status) VALUES(b,u,now()-interval '30 days','upheld');
 FOR i IN 1..10 LOOP
  INSERT INTO appeals(battle_id,profile_id,created_at) VALUES(b,u,now()-interval '20 days');
 END LOOP;
 FOR i IN 1..10 LOOP
  INSERT INTO battles(mode,status,player_one_id,player_one_character_id) VALUES('ranked','completed',u,c) RETURNING id INTO b;
  INSERT INTO appeals(battle_id,profile_id,created_at,review_status,retry_after,attempts)
   VALUES(b,u,now()-interval '15 days','retryable_failure',now()+interval '1 hour',4);
 END LOOP;
 INSERT INTO battles(mode,status,player_one_id,player_one_character_id) VALUES('ranked','completed',u,c) RETURNING id INTO b;
 INSERT INTO appeals(battle_id,profile_id,created_at) VALUES(b,u,now()-interval '1 hour') RETURNING id INTO pending;
 INSERT INTO battles(mode,status,player_one_id,player_one_character_id) VALUES('ranked','completed',u,c) RETURNING id INTO b;
 INSERT INTO appeals(battle_id,profile_id,created_at,review_status,lease_expires_at)
  VALUES(b,u,now()-interval '1 day','processing',now()-interval '1 minute') RETURNING id INTO expired;
 SELECT array_agg(id) INTO ids FROM list_due_independent_appeals(10);
 PERFORM pg_temp.check_true(pending=ANY(ids) AND expired=ANY(ids),'old duplicates and deferred failures cannot starve pending or expired leases');
 PERFORM pg_temp.check_true(claim_independent_appeal(pending,t) IS NOT NULL,'selected pending appeal progresses');
 PERFORM fail_independent_appeal(pending,t,'permanent missing input');
 PERFORM pg_temp.check_true(claim_independent_appeal(pending,t) IS NULL,'direct retry respects due time');
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM list_due_independent_appeals(10) WHERE id=pending),'failed item leaves due queue');
 -- Old repeated failures initially due may fill one batch, then move behind waiting work.
 UPDATE appeals SET retry_after=now()-interval '2 days' WHERE profile_id=u AND attempts=4;
 FOR a IN SELECT id FROM list_due_independent_appeals(10) LOOP
  PERFORM pg_temp.check_true(claim_independent_appeal(a,t) IS NOT NULL,'candidate is claimable');
  PERFORM fail_independent_appeal(a,t,'permanent failure');
 END LOOP;
 PERFORM pg_temp.check_true(EXISTS(SELECT 1 FROM list_due_independent_appeals(10) WHERE id=expired),'later expired lease selected after one failed batch');
 PERFORM pg_temp.check_true(claim_independent_appeal(expired,t) IS NOT NULL,'expired lease progresses');
 UPDATE appeals SET attempts=8 WHERE id=expired;
 PERFORM fail_independent_appeal_classified(expired,t,'Missing frozen data',NULL);
 PERFORM pg_temp.check_true((SELECT retry_after=now()+interval '320 minutes' AND provider_unavailable_until IS NULL AND lease_expires_at IS NULL FROM appeals WHERE id=expired),'long item retry does not mark provider down');
 UPDATE appeals SET retry_after=now()-interval '1 second' WHERE id=expired;
 PERFORM claim_independent_appeal(expired,t);
 PERFORM fail_independent_appeal_classified(expired,t,'provider offline','independent-model');
 PERFORM pg_temp.check_true((SELECT retry_after=now()+interval '320 minutes' AND provider_unavailable_until=now()+interval '10 minutes' AND failed_provider_model='independent-model' FROM appeals WHERE id=expired),'provider cooldown is separately bounded and model scoped');
 PERFORM fail_independent_appeal_classified(expired,gen_random_uuid(),'stale failure','other-model');
 PERFORM pg_temp.check_true((SELECT failed_provider_model='independent-model' FROM appeals WHERE id=expired),'stale failure cannot rewrite health');
 PERFORM pg_temp.check_true(NOT has_function_privilege('authenticated','public.fail_independent_appeal_classified(uuid,uuid,text,text)','EXECUTE'),'failure classification is service only');
 PERFORM pg_temp.check_true(NOT has_function_privilege('authenticated','public.list_due_independent_appeals(integer)','EXECUTE'),'queue is service only');
END $$;
ROLLBACK;
