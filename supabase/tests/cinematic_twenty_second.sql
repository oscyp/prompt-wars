BEGIN;
CREATE FUNCTION pg_temp.stage_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
SELECT pg_temp.stage_assert(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='video_jobs' AND column_name='execution_stage'),'execution stages persisted');
SELECT pg_temp.stage_assert((SELECT NOT public FROM storage.buckets WHERE id='cinematic-work'),'base work bucket private');
DO $$
DECLARE u uuid:=gen_random_uuid(); c uuid; b uuid; old_b uuid; j uuid; old_j uuid; token uuid:=gen_random_uuid(); started timestamptz; p jsonb;
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,u||'@stages.invalid',jsonb_build_object('age_confirmed',true,'username','stage_'||replace(u::text,'-','')));
 INSERT INTO characters(profile_id,name,archetype,battle_cry) VALUES(u,'One','strategist','Ready') RETURNING id INTO c;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,format,mode,status) VALUES(u,c,true,'single','bot','completed') RETURNING id INTO b;
 INSERT INTO battles(player_one_id,player_one_character_id,is_player_two_bot,format,mode,status) VALUES(u,c,true,'single','bot','completed') RETURNING id INTO old_b;
 UPDATE cinematic_generation_config SET enabled=true;
 INSERT INTO subscriptions(profile_id,revenuecat_subscription_id,product_id,status,allowance_reset_at,starts_at,expires_at)
 VALUES(u,'stage-'||u,'promptwars_plus_monthly','active',now()+interval '30 days',now(),now()+interval '30 days');
 -- Simulate an already-existing v2 row: inserting new v2 quotes correctly fails.
 ALTER TABLE video_jobs DISABLE TRIGGER freeze_cinematic_policy;
 INSERT INTO video_jobs(battle_id,request_payload_hash,cinematic_profile,target_duration_seconds,duration_policy_version,lease_token,lease_expires_at)
 VALUES(old_b,'historic-v2','plus',15,'cinematics-v2',token,now()+interval '2 minutes') RETURNING id INTO old_j;
 ALTER TABLE video_jobs ENABLE TRIGGER freeze_cinematic_policy;
 p:=jsonb_build_object('version',2,'battleId',old_b,'roundId',NULL,'roundNumber',NULL,'policy',jsonb_build_object('cinematic_profile','plus','target_duration_seconds',15,'duration_policy_version','cinematics-v2'));
 PERFORM pg_temp.stage_assert(persist_cinematic_input(old_j,token,p,repeat('a',64))=p,'historical v2 fifteen-second snapshot accepted unchanged');
 UPDATE video_jobs SET actual_duration_seconds=15 WHERE id=old_j;
 PERFORM pg_temp.stage_assert((SELECT target_duration_seconds=15 AND duration_policy_version='cinematics-v2' FROM video_jobs WHERE id=old_j),'historical v2 fifteen-second policy preserved');
 BEGIN INSERT INTO video_jobs(battle_id,request_payload_hash,cinematic_profile,target_duration_seconds,duration_policy_version) VALUES(b,'stale-v2','plus',15,'cinematics-v2'); RAISE EXCEPTION 'old policy quote accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_quote_changed' THEN RAISE; END IF; END;
 INSERT INTO video_jobs(battle_id,request_payload_hash) VALUES(b,'new-v3') RETURNING id INTO j;
 PERFORM pg_temp.stage_assert((SELECT target_duration_seconds=20 AND duration_policy_version='cinematics-v3' AND execution_stage='base' FROM video_jobs WHERE id=j),'new Plus job is v3 twenty seconds');
 BEGIN UPDATE video_jobs SET execution_stage='base_submitting',execution_started_at=now(),submitted_at=now(),status='submitted' WHERE id=j; RAISE EXCEPTION 'stage without lease accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_lease_lost' THEN RAISE; END IF; END;
 UPDATE video_jobs SET lease_token=token,lease_expires_at=now()-interval '1 second' WHERE id=j;
 BEGIN UPDATE video_jobs SET execution_stage='base_submitting',execution_started_at=now(),submitted_at=now(),status='submitted' WHERE id=j; RAISE EXCEPTION 'expired stage lease accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_lease_lost' THEN RAISE; END IF; END;
 UPDATE video_jobs SET lease_expires_at=now()+interval '2 minutes' WHERE id=j;
 BEGIN UPDATE video_jobs SET execution_stage='extension' WHERE id=j; RAISE EXCEPTION 'stage skip accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_execution_transition_invalid' THEN RAISE; END IF; END;
 UPDATE video_jobs SET execution_stage='base_submitting',execution_started_at=now(),submitted_at=now(),status='submitted' WHERE id=j RETURNING execution_started_at INTO started;
 BEGIN UPDATE video_jobs SET execution_started_at=now()+interval '1 second' WHERE id=j; RAISE EXCEPTION 'execution clock reset accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_execution_immutable' THEN RAISE; END IF; END;
 BEGIN UPDATE video_jobs SET execution_stage='base' WHERE id=j; RAISE EXCEPTION 'ambiguous base replay accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_execution_transition_invalid' THEN RAISE; END IF; END;
 BEGIN UPDATE video_jobs SET execution_stage='base',provider_job_id='base-provider',submitted_duration_seconds=NULL WHERE id=j; RAISE EXCEPTION 'null billed base duration accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_execution_transition_invalid' THEN RAISE; END IF; END;
 UPDATE video_jobs SET execution_stage='base',provider_job_id='base-provider',provider_model='grok-imagine-video-1.5',submitted_duration_seconds=15 WHERE id=j;
 BEGIN UPDATE video_jobs SET execution_stage='base_submitting' WHERE id=j; RAISE EXCEPTION 'second base paidcall accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_execution_transition_invalid' THEN RAISE; END IF; END;
 BEGIN UPDATE video_jobs SET execution_stage='extension_ready',base_provider_job_id='base-provider',base_video_path='https://provider.invalid/raw.mp4',status='processing' WHERE id=j; RAISE EXCEPTION 'provider URL persisted'; EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE video_jobs SET execution_stage='extension_ready',base_provider_job_id='base-provider',base_video_path=j||'/base.mp4',base_cost_usd=0.9,base_provider_model='grok-imagine-video-1.5',base_submitted_duration_seconds=15,status='processing',submitted_at=now() WHERE id=j;
 BEGIN UPDATE video_jobs SET base_video_path=j||'/different.mp4' WHERE id=j; RAISE EXCEPTION 'base path changed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_execution_immutable' THEN RAISE; END IF; END;
 BEGIN UPDATE video_jobs SET base_cost_usd=1.1 WHERE id=j; RAISE EXCEPTION 'base cost changed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_execution_immutable' THEN RAISE; END IF; END;
 BEGIN UPDATE video_jobs SET base_provider_job_id='different-provider' WHERE id=j; RAISE EXCEPTION 'base provider changed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_execution_immutable' THEN RAISE; END IF; END;
 UPDATE video_jobs SET execution_stage='extension_submitting',status='submitted',submitted_at=now() WHERE id=j;
 BEGIN UPDATE video_jobs SET execution_stage='extension_ready' WHERE id=j; RAISE EXCEPTION 'ambiguous extension replay accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_execution_transition_invalid' THEN RAISE; END IF; END;
 BEGIN UPDATE video_jobs SET execution_stage='extension' WHERE id=j; RAISE EXCEPTION 'base provider reused for extension'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'cinematic_execution_transition_invalid' THEN RAISE; END IF; END;
 UPDATE video_jobs SET execution_stage='extension',provider_job_id='extension-provider',provider_model='grok-imagine-video',submitted_duration_seconds=5,provider_cost_usd=1.15 WHERE id=j;
 UPDATE video_jobs SET actual_duration_seconds=20,status='succeeded' WHERE id=j;
 PERFORM pg_temp.stage_assert((SELECT execution_started_at=started AND base_cost_usd=0.9 AND provider_cost_usd=1.15 AND submitted_duration_seconds=5 AND actual_duration_seconds=20 FROM video_jobs WHERE id=j),'per-stage accounting preserved with final duration');
 INSERT INTO storage.objects(bucket_id,name) VALUES('cinematic-work',j||'/base.mp4');
 PERFORM set_config('test.stage_player',u::text,true); PERFORM set_config('test.stage_job',j::text,true);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.stage_player'),true);
SELECT pg_temp.stage_assert(NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='cinematic-work'),'participant cannot read approved base work object');
DO $$ BEGIN BEGIN UPDATE video_jobs SET execution_stage='base' WHERE id=current_setting('test.stage_job')::uuid; RAISE EXCEPTION 'client resets stage'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SELECT 'PASS: v3 twenty-second policy; old v2 snapshots; execution leases, stage graph, replay prevention, immutable base accounting, private work storage';
ROLLBACK;
