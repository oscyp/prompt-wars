-- Isolated migrated database only. No provider calls. All changes roll back.
BEGIN;
CREATE FUNCTION pg_temp.require(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
DO $$
DECLARE u uuid:=gen_random_uuid(); c uuid; request uuid:=gen_random_uuid(); newer uuid:=gen_random_uuid(); a jsonb; b jsonb; started jsonb; portrait uuid:=gen_random_uuid(); old_token uuid; paid_user uuid:=gen_random_uuid(); paid_char uuid; balance_before numeric;
BEGIN
 BEGIN INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(gen_random_uuid(),'underage@recovery.invalid','{}'); RAISE EXCEPTION 'missing attestation accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='missing attestation accepted' THEN RAISE; END IF; END;
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,u||'@recovery.invalid',jsonb_build_object('age_confirmed',true,'username','recovery_'||replace(u::text,'-','')));
 c:=(create_starter_fighter(u)->>'id')::uuid;
 a:=claim_initial_portrait(u,c,request,true); old_token:=(a->>'lease_token')::uuid;
 PERFORM pg_temp.require((a->>'worker')::boolean,'fresh request claims worker');
 b:=claim_initial_portrait(u,c,request,true);
 PERFORM pg_temp.require(NOT (b->>'worker')::boolean AND (SELECT draft_portrait_renders=1 FROM characters WHERE id=c),'duplicate cannot work or consume quota');
 -- Killed before creating/linking a job.
 UPDATE initial_portrait_requests SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE character_id=c AND request_id=request;
 b:=check_initial_portrait(u,c,request);
 PERFORM pg_temp.require(b->>'status'='failed' AND (SELECT draft_portrait_renders=0 FROM characters WHERE id=c),'no-job death refunds exactly once');
 PERFORM check_initial_portrait(u,c,request);
 PERFORM pg_temp.require((SELECT draft_portrait_renders=0 FROM characters WHERE id=c),'repeat expiry does not double refund');
 BEGIN PERFORM start_initial_portrait_work(u,c,request,old_token,'','painterly',42,0); RAISE EXCEPTION 'stale start accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale start accepted' THEN RAISE; END IF; END;
 a:=claim_initial_portrait(u,c,newer,true);
 started:=start_initial_portrait_work(u,c,newer,(a->>'lease_token')::uuid,'','painterly',42,0);
 PERFORM pg_temp.require(started->>'job_id' IS NOT NULL,'job linkage committed atomically');
 INSERT INTO character_portraits(id,character_id,profile_id,image_path,kind,seed,provider,provider_model,prompt_snapshot,generation_job_id,initial_portrait_request_id,is_current,moderation_status)
 VALUES(portrait,c,u,'fixture/staged.png','fighter',42,'fallback','fixture','{}',(started->>'job_id')::uuid,newer,false,'approved');
 -- Killed during running work; a late provider result cannot publish afterward.
 UPDATE initial_portrait_requests SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE character_id=c AND request_id=newer;
 PERFORM check_initial_portrait(u,c,newer);
 PERFORM pg_temp.require(NOT commit_initial_portrait(u,c,newer,(a->>'lease_token')::uuid,portrait,NULL,'{}'),'late completion fenced');
 PERFORM pg_temp.require((SELECT portrait_id IS NULL AND draft_portrait_renders=0 FROM characters WHERE id=c) AND (SELECT NOT is_current FROM character_portraits WHERE id=portrait),'stale worker cannot replace current art');
 BEGIN UPDATE character_portraits SET is_current=true WHERE id=portrait; RAISE EXCEPTION 'staged portrait published'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='staged portrait published' THEN RAISE; END IF; END;
 BEGIN UPDATE characters SET portrait_id=portrait WHERE id=c; RAISE EXCEPTION 'staged pointer published'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='staged pointer published' THEN RAISE; END IF; END;
 PERFORM set_config('test.initial_owner',u::text,true);PERFORM set_config('test.initial_staged',portrait::text,true);
 -- A new explicit attempt succeeds once; old cleanup cannot release its quota.
 request:=gen_random_uuid(); a:=claim_initial_portrait(u,c,request,true);
 started:=start_initial_portrait_work(u,c,request,(a->>'lease_token')::uuid,'','painterly',42,0);
 portrait:=gen_random_uuid();
 INSERT INTO character_portraits(id,character_id,profile_id,image_path,kind,seed,provider,provider_model,prompt_snapshot,generation_job_id,initial_portrait_request_id,is_current,moderation_status)
 VALUES(portrait,c,u,'fixture/current.png','fighter',42,'fallback','fixture','{}',(started->>'job_id')::uuid,request,false,'approved');
 PERFORM pg_temp.require(commit_initial_portrait(u,c,request,(a->>'lease_token')::uuid,portrait,NULL,jsonb_build_object('portrait_id',portrait)),'current attempt commits');
 PERFORM pg_temp.require(NOT commit_initial_portrait(u,c,request,(a->>'lease_token')::uuid,portrait,NULL,'{}'),'duplicate commit denied');
 PERFORM fail_initial_portrait(u,c,newer,old_token);
 PERFORM pg_temp.require((SELECT portrait_id=portrait AND draft_portrait_renders=1 FROM characters WHERE id=c),'old cleanup preserves new attempt');
 -- Paid draft failure returns the original spend exactly once, including a killed worker.
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(paid_user,paid_user||'@recovery.invalid','{"age_confirmed":true}');
 INSERT INTO characters(profile_id,name,archetype,battle_cry,draft_portrait_renders) VALUES(paid_user,'Draft','strategist',chr(8230),3) RETURNING id INTO paid_char;
 SELECT sum(amount) INTO balance_before FROM wallet_transactions WHERE profile_id=paid_user;
 request:=gen_random_uuid();a:=claim_initial_portrait(paid_user,paid_char,request,false);
 started:=start_initial_portrait_work(paid_user,paid_char,request,(a->>'lease_token')::uuid,'','painterly',44,3);
 PERFORM start_initial_portrait_work(paid_user,paid_char,request,(a->>'lease_token')::uuid,'','painterly',44,3);
 PERFORM pg_temp.require((SELECT sum(amount)=balance_before-3 FROM wallet_transactions WHERE profile_id=paid_user),'duplicate start charges once');
 UPDATE initial_portrait_requests SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE character_id=paid_char AND request_id=request;
 PERFORM check_initial_portrait(paid_user,paid_char,request);PERFORM check_initial_portrait(paid_user,paid_char,request);
 PERFORM fail_initial_portrait(paid_user,paid_char,request,(a->>'lease_token')::uuid);
 PERFORM pg_temp.require((SELECT sum(amount)=balance_before FROM wallet_transactions WHERE profile_id=paid_user) AND (SELECT draft_portrait_renders=3 FROM characters WHERE id=paid_char),'expiry refunds paid work once without granting a free slot');
 PERFORM pg_temp.require(NOT has_function_privilege('authenticated' ,'claim_initial_portrait(uuid,uuid,uuid,boolean)','EXECUTE'),'client cannot claim worker');
 PERFORM pg_temp.require(NOT has_function_privilege('service_role','finish_initial_portrait(uuid,uuid,uuid,jsonb)','EXECUTE'),'unfenced completion RPC revoked');
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.initial_owner'),true);
SELECT pg_temp.require((SELECT count(*)=0 FROM character_portraits WHERE id=current_setting('test.initial_staged')::uuid),'staged portrait hidden from history');
RESET ROLE;
ROLLBACK;
