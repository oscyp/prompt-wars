-- Keep the insertion implementation private; the public entry point now also
-- owns funding validation/atomic single-format charging.
ALTER FUNCTION public.insert_cinematic_video_job(jsonb,jsonb) SET SCHEMA private;
ALTER FUNCTION private.insert_cinematic_video_job(jsonb,jsonb) RENAME TO insert_cinematic_job_row;
REVOKE ALL ON FUNCTION private.insert_cinematic_job_row(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.insert_cinematic_job_row(jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.insert_cinematic_video_job(p_job jsonb,p_expected_policy jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE job jsonb:=p_job; result jsonb; b public.battles%ROWTYPE; p public.profiles%ROWTYPE;
 ent record; funding public.wallet_transactions%ROWTYPE; source text; cost integer; balance integer;
 tx uuid; job_id uuid; subscription_id uuid; expected_quote jsonb;
BEGIN
 SELECT * INTO b FROM public.battles WHERE id=(job->>'battle_id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'cinematic_battle_not_found'; END IF;
 PERFORM 1 FROM public.cinematic_generation_config WHERE singleton FOR SHARE;
 IF public.resolve_cinematic_policy(b.id) IS DISTINCT FROM p_expected_policy THEN RAISE EXCEPTION 'cinematic_quote_changed'; END IF;
 IF job->>'battle_round_id' IS NOT NULL THEN
  -- Orphan reclamation and job insertion must agree which transaction wins.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('round-funding:'||b.id::text||':'||(job->>'round_number'),0));
  IF job->>'entitlement_source' IN('credit','new_user_grant') THEN
   SELECT * INTO funding FROM public.wallet_transactions WHERE id=(job->>'spend_transaction_id')::uuid;
   IF NOT FOUND OR funding.status<>'held' OR
    ROW(funding.profile_id,funding.battle_id,funding.round_number,funding.source)
    IS DISTINCT FROM ROW((job->>'requester_profile_id')::uuid,b.id,(job->>'round_number')::smallint,job->>'entitlement_source')
    OR funding.reason NOT IN('round_upgrade_hold','round_upgrade_grant_hold') THEN
    RAISE EXCEPTION 'cinematic_funding_reservation_invalid';
   END IF;
  END IF;
  RETURN private.insert_cinematic_job_row(job,p_expected_policy);
 END IF;
 -- Legacy single-format mutations are committed with the job, never beforehand.
 IF b.format::text IS DISTINCT FROM 'single' THEN RAISE EXCEPTION 'cinematic_round_required'; END IF;
 IF job->>'requester_profile_id' IS NULL OR NOT(
  b.player_one_id=(job->>'requester_profile_id')::uuid OR
  (NOT coalesce(b.is_player_two_bot,false) AND b.player_two_id=(job->>'requester_profile_id')::uuid)
 ) THEN RAISE EXCEPTION 'cinematic_requester_not_participant'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=(job->>'requester_profile_id')::uuid FOR UPDATE;
 SELECT * INTO ent FROM public.entitlements WHERE profile_id=p.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'cinematic_entitlements_unavailable'; END IF;
 IF p.free_tier1_reveals_remaining>0 AND now()-p.created_at<=interval '7 days' THEN source:='free_grant';
 ELSIF ent.is_subscriber AND ent.monthly_video_allowance_remaining>0 THEN source:='subscription_allowance';
 ELSIF ent.credits_balance>=1 THEN source:='credits';
 ELSE RAISE EXCEPTION 'cinematic_quote_changed'; END IF;
 cost:=CASE WHEN source='credits' THEN 1 ELSE 0 END;
 expected_quote:=jsonb_build_object('method',source,'cost_credits',cost);
 IF job->'expected_funding_quote' IS DISTINCT FROM expected_quote OR job->>'entitlement_source' IS DISTINCT FROM source THEN
  RAISE EXCEPTION 'cinematic_quote_changed';
 END IF;
 IF source='subscription_allowance' THEN
  SELECT s.id INTO subscription_id FROM public.subscriptions s
  WHERE s.profile_id=p.id AND s.status IN('active','canceled') AND s.expires_at>now()
  ORDER BY (s.status='active') DESC,s.expires_at DESC LIMIT 1 FOR UPDATE;
  IF subscription_id IS NULL THEN RAISE EXCEPTION 'cinematic_quote_changed'; END IF;
 END IF;
 -- Caller-supplied old debit IDs are never reused after refund.
 job:=job||jsonb_build_object('spend_transaction_id',NULL,'credits_charged',cost,'entitlement_source',source);
 result:=private.insert_cinematic_job_row(job,p_expected_policy);
 job_id:=(result->>'id')::uuid;
 IF source='credits' THEN
  tx:=public.spend_credits(p.id,1,'video_upgrade','cinematic-job:'||job_id::text||':credits',b.id,job_id,
   jsonb_build_object('tier','tier1','funding_version','cinematic-atomic-v1'));
 ELSIF source='free_grant' THEN
  tx:=public.consume_free_tier1_reveal(p.id,b.id,'cinematic-job:'||job_id::text||':grant');
  IF tx IS NULL THEN RAISE EXCEPTION 'cinematic_quote_changed'; END IF;
  UPDATE public.wallet_transactions SET video_job_id=job_id WHERE id=tx;
 ELSE
  UPDATE public.subscriptions SET monthly_video_allowance_used=monthly_video_allowance_used+1,updated_at=now()
  WHERE id=subscription_id AND monthly_video_allowance_used<monthly_video_allowance;
  IF NOT FOUND THEN RAISE EXCEPTION 'cinematic_quote_changed'; END IF;
  SELECT coalesce(sum(amount),0) INTO balance FROM public.wallet_transactions WHERE profile_id=p.id AND currency_type='credits';
  INSERT INTO public.wallet_transactions(profile_id,amount,balance_after,currency_type,reason,source,status,battle_id,video_job_id,idempotency_key,metadata)
  VALUES(p.id,0,balance,'credits','video_upgrade_subscription','subscription_allowance','spent',b.id,job_id,
   'cinematic-job:'||job_id::text||':allowance',jsonb_build_object('subscription_id',subscription_id,'funding_version','cinematic-atomic-v1')) RETURNING id INTO tx;
 END IF;
 UPDATE public.video_jobs SET spend_transaction_id=tx WHERE id=job_id;
 SELECT to_jsonb(j) INTO result FROM public.video_jobs j WHERE id=job_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.insert_cinematic_video_job(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.insert_cinematic_video_job(jsonb,jsonb) TO service_role;

CREATE INDEX IF NOT EXISTS idx_cinematic_orphan_round_holds ON public.wallet_transactions(created_at)
 WHERE status='held' AND reason IN('round_upgrade_hold','round_upgrade_grant_hold');
CREATE INDEX IF NOT EXISTS idx_video_jobs_spend_transaction ON public.video_jobs(spend_transaction_id)
 WHERE spend_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.recover_orphan_cinematic_funding(p_limit integer DEFAULT 100,p_min_age_seconds integer DEFAULT 900)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE candidate record; recovered integer:=0; age_seconds integer:=greatest(coalesce(p_min_age_seconds,900),900);
BEGIN
 FOR candidate IN
  SELECT w.id,w.battle_id,w.round_number FROM public.wallet_transactions w
  WHERE w.status='held' AND w.reason IN('round_upgrade_hold','round_upgrade_grant_hold')
   AND w.created_at<=clock_timestamp()-make_interval(secs=>age_seconds)
   AND NOT EXISTS(SELECT 1 FROM public.video_jobs j WHERE j.spend_transaction_id=w.id)
  ORDER BY w.created_at LIMIT least(greatest(coalesce(p_limit,100),1),500)
 LOOP
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('round-funding:'||candidate.battle_id::text||':'||candidate.round_number::text,0)) THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.wallet_transactions w WHERE w.id=candidate.id AND w.status='held'
   AND w.created_at<=clock_timestamp()-make_interval(secs=>age_seconds)
   AND NOT EXISTS(SELECT 1 FROM public.video_jobs j WHERE j.spend_transaction_id=w.id)) THEN
   PERFORM public.finalize_round_upgrade(candidate.id,'failed');
   recovered:=recovered+1;
  END IF;
 END LOOP;
 RETURN recovered;
END $$;
REVOKE ALL ON FUNCTION public.recover_orphan_cinematic_funding(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_orphan_cinematic_funding(integer,integer) TO service_role;

-- New atomic allowance debits record their exact subscription; later expiry or
-- cancellation cannot prevent refunding the original charged counter.
CREATE OR REPLACE FUNCTION public.restore_subscription_allowance(p_profile_id uuid,p_video_job_id uuid,p_idempotency_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE subscription_id uuid; recorded boolean; balance integer;
BEGIN
 PERFORM 1 FROM public.profiles WHERE id=p_profile_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.wallet_transactions WHERE idempotency_key=p_idempotency_key) THEN RETURN true; END IF;
 SELECT (wt.metadata->>'subscription_id')::uuid INTO subscription_id
 FROM public.video_jobs j JOIN public.wallet_transactions wt ON wt.id=j.spend_transaction_id
 WHERE j.id=p_video_job_id AND j.requester_profile_id=p_profile_id AND wt.source='subscription_allowance';
 recorded:=FOUND;
 IF NOT recorded THEN
  -- Compatibility for old jobs that predate the funding audit.
  SELECT s.id INTO subscription_id FROM public.subscriptions s
  WHERE s.profile_id=p_profile_id AND s.status IN('active','canceled') AND s.expires_at>now()
  ORDER BY (s.status='active') DESC,s.expires_at DESC LIMIT 1;
 END IF;
 IF subscription_id IS NULL THEN RAISE EXCEPTION 'subscription_allowance_refund_unavailable'; END IF;
 UPDATE public.subscriptions SET monthly_video_allowance_used=greatest(monthly_video_allowance_used-1,0),updated_at=now()
 WHERE id=subscription_id AND profile_id=p_profile_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'subscription_allowance_refund_unavailable'; END IF;
 SELECT coalesce(sum(amount),0) INTO balance FROM public.wallet_transactions WHERE profile_id=p_profile_id AND currency_type='credits';
 INSERT INTO public.wallet_transactions(profile_id,amount,balance_after,currency_type,reason,video_job_id,idempotency_key,metadata)
 VALUES(p_profile_id,0,balance,'credits','subscription_allowance_restored',p_video_job_id,p_idempotency_key,
  jsonb_build_object('restored',true,'subscription_id',subscription_id,'recorded_funding',recorded));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.restore_subscription_allowance(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_subscription_allowance(uuid,uuid,text) TO service_role;
