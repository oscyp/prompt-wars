-- Run as postgres against an isolated migrated local stack. Entire fixture rolls back.
BEGIN;
CREATE FUNCTION pg_temp.check_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label;END IF;END $$;
DO $$
DECLARE u1 uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();u3 uuid:=gen_random_uuid();c1 uuid;c2 uuid;b uuid;later uuid;a uuid;t uuid:=gen_random_uuid();t2 uuid:=gen_random_uuid();snapshot jsonb;rd numeric;vol numeric;rated timestamptz;review jsonb;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u1,u1||'@appeal.invalid',jsonb_build_object('age_confirmed',true,'username','appeal_'||left(replace(u1::text,'-',''),12))),(u2,u2||'@appeal.invalid',jsonb_build_object('age_confirmed',true,'username','appeal_'||left(replace(u2::text,'-',''),12))),(u3,u3||'@appeal.invalid',jsonb_build_object('age_confirmed',true,'username','appeal_'||left(replace(u3::text,'-',''),12)));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u1,'One','strategist','Ready') RETURNING id INTO c1;
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u2,'Two','titan','Ready') RETURNING id INTO c2;
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('ranked','resolving','single',1,u1,u2,c1,c2) RETURNING id INTO b;
 PERFORM resolve_battle(b,u1,false,'{}',jsonb_build_object(u1::text,jsonb_build_object('delta',20),u2::text,jsonb_build_object('delta',-20)),'v','primary',1);
 a:=submit_independent_appeal(b,u2);PERFORM pg_temp.check_true(a=submit_independent_appeal(b,u2),'duplicate submission same ID');
 PERFORM pg_temp.check_true(a=submit_independent_appeal(b,u1),'opposite side cannot submit second appeal');
 PERFORM pg_temp.check_true((SELECT count(*)=1 FROM appeals WHERE profile_id=u2),'duplicate consumes one daily allowance');
 SELECT original_resolution INTO snapshot FROM appeals WHERE id=a;
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_two_id,player_one_character_id,player_two_character_id)
 VALUES('ranked','resolving','single',1,u1,u2,c1,c2) RETURNING id INTO later;
 PERFORM resolve_battle(later,u1,false,'{}',jsonb_build_object(u1::text,jsonb_build_object('delta',7,'rd',70,'vol',0.08),u2::text,jsonb_build_object('delta',-7)),'v','primary',1);
 UPDATE battles SET completed_at=(SELECT completed_at+interval '1 second' FROM battles WHERE id=b) WHERE id=later;
 SELECT rating_deviation,rating_volatility,last_rated_at INTO rd,vol,rated FROM profiles WHERE id=u1;
 PERFORM pg_temp.check_true(claim_independent_appeal(a,t) IS NOT NULL,'first worker claimed');
 PERFORM pg_temp.check_true(claim_independent_appeal(a,t2) IS NULL,'duplicate worker denied');
 UPDATE appeals SET lease_expires_at=now()-interval '1 second' WHERE id=a;
 PERFORM pg_temp.check_true(claim_independent_appeal(a,t2) IS NOT NULL,'expired worker lease recovered');
 PERFORM fail_independent_appeal(a,t2,'provider unavailable');
 PERFORM pg_temp.check_true((SELECT review_status='retryable_failure' FROM appeals WHERE id=a),'provider failure durable');
 PERFORM pg_temp.check_true(claim_independent_appeal(a,t2) IS NULL,'failed worker respects backoff');
 UPDATE appeals SET retry_after=now()-interval '1 second' WHERE id=a;
 PERFORM pg_temp.check_true(claim_independent_appeal(a,t2) IS NOT NULL,'due failed worker retry');
 review:='{"status":"overturned","winner":2,"isDraw":false,"rounds":[]}'::jsonb;
 PERFORM pg_temp.check_true(NOT finalize_independent_appeal(a,t,review),'stale lease denied');
 PERFORM pg_temp.check_true(finalize_independent_appeal(a,t2,review),'first finalization');
 PERFORM pg_temp.check_true(NOT finalize_independent_appeal(a,t2,review),'repeat finalization denied');
 PERFORM pg_temp.check_true((SELECT rating=1507 AND rating_deviation=rd AND rating_volatility=vol AND last_rated_at=rated AND wins=1 AND losses=1 AND current_streak=1 AND best_streak=1 FROM profiles WHERE id=u1),'later rating and streak preserved, old points reversed only');
 PERFORM pg_temp.check_true((SELECT count(*)=2 FROM appeal_rating_corrections WHERE appeal_id=a),'unique player ledger');
 PERFORM pg_temp.check_true((SELECT original_resolution=snapshot AND review_status='overturned' FROM appeals WHERE id=a),'original resolution immutable');
 PERFORM pg_temp.check_true((SELECT adjudication_revision=1 AND winner_id=u2 FROM battles WHERE id=b),'one adjudication revision');
 -- New-day eligible no contest excludes outcome records, leaves participation intact.
 UPDATE appeals SET created_at=now()-interval '2 days' WHERE id=a;
 a:=submit_independent_appeal(later,u2);PERFORM claim_independent_appeal(a,t);
 PERFORM pg_temp.check_true(finalize_independent_appeal(a,t,'{"status":"no_contest","winner":null,"isDraw":false,"rounds":[]}'),'no contest finalized');
 PERFORM pg_temp.check_true((SELECT rating=1500 AND wins=0 AND losses=1 AND draws=0 AND total_battles=2 FROM profiles WHERE id=u1),'no contest excludes records not participation');
 PERFORM pg_temp.check_true(NOT has_function_privilege('authenticated','public.finalize_independent_appeal(uuid,uuid,jsonb)','EXECUTE'),'client cannot finalize');
 PERFORM pg_temp.check_true(NOT has_function_privilege('service_role','public.resolve_appeal(uuid,uuid,uuid)','EXECUTE'),'unsafe old finalizer disabled');
 PERFORM set_config('test.appeal_id',a::text,true);PERFORM set_config('test.participant',u1::text,true);PERFORM set_config('test.outsider',u3::text,true);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.participant'),true);
SELECT pg_temp.check_true((SELECT count(*)=1 FROM appeals WHERE id=current_setting('test.appeal_id')::uuid),'opposing participant reads status');
SELECT set_config('request.jwt.claim.sub',current_setting('test.outsider'),true);
SELECT pg_temp.check_true((SELECT count(*)=0 FROM appeals WHERE id=current_setting('test.appeal_id')::uuid),'outsider denied');
RESET ROLE;
ROLLBACK;
