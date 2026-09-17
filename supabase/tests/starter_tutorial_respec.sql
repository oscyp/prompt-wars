-- Local isolated stack only, after migrations. The transaction rolls back.
BEGIN;
CREATE FUNCTION pg_temp.require(ok BOOLEAN,label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
DO $$
DECLARE u UUID:=gen_random_uuid();other UUID:=gen_random_uuid();c UUID;b UUID;r UUID:=gen_random_uuid();j JSONB;again JSONB;before_wallet NUMERIC;before_stats JSONB;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,u||'@starter.invalid',jsonb_build_object('age_confirmed',true,'username','starter_'||replace(u::text,'-',''))),(other,other||'@starter.invalid',jsonb_build_object('age_confirmed',true,'username','starter_'||replace(other::text,'-','')));
 SELECT COALESCE(SUM(amount),0) INTO before_wallet FROM wallet_transactions WHERE profile_id=u;
 j:=create_starter_fighter(u);c:=(j->>'id')::UUID;
 PERFORM pg_temp.require(j->>'starter_asset_key'='bundled:strategist' AND (j->>'stat_strength')::int=5 AND j->>'finalized_at' IS NOT NULL,'safe finalized balanced starter');
 again:=create_starter_fighter(u);
 PERFORM pg_temp.require(again->>'id'=c::text AND (SELECT count(*)=1 FROM characters WHERE profile_id=u),'idempotent starter, one fighter');
 PERFORM pg_temp.require((SELECT COALESCE(SUM(amount),0)=before_wallet FROM wallet_transactions WHERE profile_id=u),'no duplicate signup grant');
 BEGIN INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'Duplicate','titan','Ready'); RAISE EXCEPTION 'duplicate accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN UPDATE characters SET finalized_at=NULL WHERE id=c; RAISE EXCEPTION 'latch cleared'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='latch cleared' THEN RAISE; END IF; END;
 -- Reservation is counted atomically before generation; repeat is a replay.
 j:=reserve_initial_portrait(u,c,r,true);again:=reserve_initial_portrait(u,c,r,true);
 PERFORM pg_temp.require((j->>'free')::boolean AND (again->>'replayed')::boolean AND (SELECT draft_portrait_renders=1 FROM characters WHERE id=c),'retry consumes one slot');
 BEGIN PERFORM reserve_initial_portrait(other,c,gen_random_uuid(),true); RAISE EXCEPTION 'other claimed quota'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='other claimed quota' THEN RAISE; END IF; END;
 BEGIN PERFORM reserve_initial_portrait(u,c,gen_random_uuid(),true); RAISE EXCEPTION 'parallel render accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='parallel render accepted' THEN RAISE; END IF; END;
 PERFORM finish_initial_portrait(u,c,r,NULL);PERFORM finish_initial_portrait(u,c,r,NULL);
 PERFORM pg_temp.require((SELECT draft_portrait_renders=0 FROM characters WHERE id=c),'failure returns free slot exactly once');
 FOR i IN 1..3 LOOP r:=gen_random_uuid();PERFORM reserve_initial_portrait(u,c,r,true);PERFORM finish_initial_portrait(u,c,r,'{"portrait_id":"fixture"}');END LOOP;
 BEGIN PERFORM reserve_initial_portrait(u,c,gen_random_uuid(),true); RAISE EXCEPTION 'fourth free render accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='fourth free render accepted' THEN RAISE; END IF; END;
 PERFORM pg_temp.require((SELECT draft_portrait_renders=3 FROM characters WHERE id=c),'three-free limit');
 -- New starters do not get legacy-only respec. Simulate an existing eligible
 -- progressed player; migration seeds this row only for preexisting fighters.
 PERFORM pg_temp.require(NOT EXISTS(SELECT 1 FROM character_respecs WHERE character_id=c),'no new-player respec grant');
 INSERT INTO character_respecs(character_id,profile_id) VALUES(c,u);
 UPDATE characters SET stat_strength=6,stat_stamina=6,stat_agility=6,stat_focus=6 WHERE id=c;
 INSERT INTO battles(mode,status,format,best_of,player_one_id,player_one_character_id,is_player_two_bot,player_one_stats_snapshot,player_two_stats_snapshot)
 VALUES('bot','matched','bo3',3,u,c,true,'{"strength":6,"stamina":6,"agility":6,"focus":6}','{"strength":5,"stamina":5,"agility":5,"focus":5}') RETURNING id INTO b;
 SELECT jsonb_build_object('one',player_one_stats_snapshot,'two',player_two_stats_snapshot) INTO before_stats FROM battles WHERE id=b;
 BEGIN PERFORM apply_character_respec(u,c,gen_random_uuid(),'{"strength":10,"stamina":10,"agility":10,"focus":10}'); RAISE EXCEPTION 'inflation accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='inflation accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM apply_character_respec(other,c,gen_random_uuid(),'{"strength":6,"stamina":6,"agility":6,"focus":6}'); RAISE EXCEPTION 'foreign respec'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='foreign respec' THEN RAISE; END IF; END;
 r:=gen_random_uuid();j:=apply_character_respec(u,c,r,'{"strength":8,"stamina":6,"agility":5,"focus":5}');again:=apply_character_respec(u,c,r,'{}');
 PERFORM pg_temp.require(j=again AND (SELECT jsonb_build_object('one',player_one_stats_snapshot,'two',player_two_stats_snapshot)=before_stats FROM battles WHERE id=b),'respec retries same operation, active snapshot unchanged');
 BEGIN PERFORM apply_character_respec(u,c,gen_random_uuid(),j); RAISE EXCEPTION 'second respec'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='second respec' THEN RAISE; END IF; END;
 j:=prepare_tutorial(u,false);again:=prepare_tutorial(u,true);
 PERFORM pg_temp.require(j->>'request_id'=again->>'request_id','concurrent starts share pending request');
 INSERT INTO matchmaking_requests(profile_id,request_id,battle_id) VALUES(u,(j->>'request_id')::uuid,b);
 PERFORM update_tutorial(u,b,NULL,false,(j->>'request_id')::uuid);
 PERFORM update_tutorial(u,b,'theme');
 again:=prepare_tutorial(u,false);
 PERFORM pg_temp.require(again->>'battle_id'=b::text AND again->'dismissed_hints' ? 'theme','restart resumes battle and dismissed hints');
 BEGIN PERFORM update_tutorial(u,b,NULL,true); RAISE EXCEPTION 'premature complete'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='premature complete' THEN RAISE; END IF; END;
 UPDATE battles SET status='completed',completed_at=now() WHERE id=b;
 PERFORM update_tutorial(u,b,NULL,true);
 again:=prepare_tutorial(u,false);PERFORM pg_temp.require(again->>'battle_id'=b::text,'ordinary start keeps completed tutorial');
 again:=prepare_tutorial(u,true);PERFORM pg_temp.require(again->>'battle_id' IS NULL AND again->'dismissed_hints'='[]'::jsonb AND again->>'request_id'<>j->>'request_id','explicit replay reserves a new battle with fresh hints');
 PERFORM set_config('test.starter_owner',u::text,true);PERFORM set_config('test.starter_other',other::text,true);PERFORM set_config('test.starter_character',c::text,true);
 PERFORM pg_temp.require(NOT has_function_privilege('authenticated','create_starter_fighter(uuid)','EXECUTE') AND NOT has_function_privilege('anon','apply_character_respec(uuid,uuid,uuid,jsonb)','EXECUTE'),'RPCs service-only');
 PERFORM pg_temp.require(NOT has_table_privilege('authenticated','tutorial_progress','UPDATE') AND NOT has_table_privilege('authenticated','initial_portrait_requests','INSERT'),'client cannot grant tutorial or quota');
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.starter_owner'),true);
SELECT pg_temp.require((SELECT count(*)=1 FROM tutorial_progress),'owner reads tutorial');
SELECT pg_temp.require((SELECT count(*)=1 FROM character_respecs WHERE character_id=current_setting('test.starter_character')::uuid),'owner reads respec');
SELECT set_config('request.jwt.claim.sub',current_setting('test.starter_other'),true);
SELECT pg_temp.require((SELECT count(*)=0 FROM tutorial_progress),'other cannot read tutorial');
SELECT pg_temp.require((SELECT count(*)=0 FROM initial_portrait_requests),'other cannot read reservations');
RESET ROLE;
ROLLBACK;
