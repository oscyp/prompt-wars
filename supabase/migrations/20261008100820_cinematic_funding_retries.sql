-- Terminal reservations are audit history, never funding for a new attempt.
DROP INDEX IF EXISTS public.wallet_transactions_round_charge_unique;
CREATE UNIQUE INDEX wallet_transactions_round_charge_unique
 ON public.wallet_transactions(battle_id,round_number,reason)
 WHERE battle_id IS NOT NULL AND round_number IS NOT NULL
 AND reason IN('round_upgrade_hold','round_upgrade_grant_hold','round_upgrade_subscriber_audit')
 AND status IN('held','spent');

-- Keep the derived subscription predicate and all existing view options/grants.
-- Count historical released credit debits together with their positive reversals.
DO $$ DECLARE definition text; updated text;
BEGIN
 definition:=pg_get_viewdef('public.entitlements_v2'::regclass,true);
 updated:=replace(definition,
  '(wt.status = ANY (ARRAY[''final''::text, ''held''::text, ''spent''::text, ''refunded''::text]))',
  '((wt.status = ANY (ARRAY[''final''::text, ''held''::text, ''spent''::text, ''refunded''::text])) OR (wt.status=''released'' AND wt.reason=''round_upgrade_hold''))');
 IF updated=definition THEN RAISE EXCEPTION 'cinematic_wallet_view_contract_changed'; END IF;
 EXECUTE 'CREATE OR REPLACE VIEW public.entitlements_v2 AS '||updated;
END $$;

CREATE OR REPLACE FUNCTION private.reserve_cinematic_round_funding(
 p_profile_id uuid,p_battle_id uuid,p_round_number smallint,p_idempotency_key text,p_source text
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.wallet_transactions%ROWTYPE; active public.wallet_transactions%ROWTYPE;
 balance integer; remaining integer; granted_at timestamptz; per_battle_limit smallint;
 used integer; tx_id uuid; hold_reason text;
BEGIN
 IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key))=0 OR length(p_idempotency_key)>512 THEN
  RAISE EXCEPTION 'round_upgrade_request_key_required';
 END IF;
 IF p_source NOT IN('credit','new_user_grant') OR p_source IS NULL THEN RAISE EXCEPTION 'invalid_round_upgrade_source'; END IF;
 hold_reason:=CASE WHEN p_source='credit' THEN 'round_upgrade_hold' ELSE 'round_upgrade_grant_hold' END;
 -- Shared across sources and participants; retries cannot release a competitor's hold.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('round-funding:'||p_battle_id::text||':'||p_round_number::text,0));
 PERFORM 1 FROM public.profiles WHERE id=p_profile_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.battles b JOIN public.battle_rounds r ON r.battle_id=b.id
  WHERE b.id=p_battle_id AND b.format::text='bo3' AND r.round_number=p_round_number AND r.status::text='result_ready'
  AND (b.player_one_id=p_profile_id OR (NOT coalesce(b.is_player_two_bot,false) AND b.player_two_id=p_profile_id))) THEN
  RAISE EXCEPTION 'round_upgrade_invalid_battle';
 END IF;
 SELECT * INTO previous FROM public.wallet_transactions WHERE idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF ROW(previous.profile_id,previous.battle_id,previous.round_number,previous.reason,previous.source)
   IS DISTINCT FROM ROW(p_profile_id,p_battle_id,p_round_number,hold_reason,p_source) THEN
   RAISE EXCEPTION 'round_upgrade_idempotency_conflict';
  END IF;
  IF previous.status IN('held','spent') THEN RETURN previous.id; END IF;
  RAISE EXCEPTION 'round_upgrade_reservation_terminal';
 END IF;
 SELECT * INTO active FROM public.wallet_transactions
 WHERE battle_id=p_battle_id AND round_number=p_round_number
 AND reason IN('round_upgrade_hold','round_upgrade_grant_hold','round_upgrade_subscriber_audit')
 AND status IN('held','spent') ORDER BY (status='spent') DESC,created_at LIMIT 1;
 IF FOUND THEN
  IF active.status='spent' THEN RAISE EXCEPTION 'round_upgrade_already_spent'; END IF;
  RAISE EXCEPTION 'round_upgrade_already_reserved';
 END IF;
 IF EXISTS(SELECT 1 FROM public.video_jobs j WHERE j.battle_id=p_battle_id AND j.round_number=p_round_number AND j.tier=1
  AND NOT(j.status::text='failed' AND (j.refunded OR j.trigger='auto_free') AND j.error_code IS DISTINCT FROM 'moderation_rejected')) THEN
  RAISE EXCEPTION 'round_upgrade_already_requested';
 END IF;
 SELECT coalesce(sum(amount),0) INTO balance FROM public.wallet_transactions
 WHERE profile_id=p_profile_id AND currency_type='credits'
 AND (status IN('final','held','spent','refunded') OR (status='released' AND reason='round_upgrade_hold'));
 IF p_source='credit' THEN
  IF balance<1 THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
 ELSE
  SELECT new_user_round_grants_remaining,new_user_round_grants_granted_at,new_user_grant_per_battle_limit
   INTO remaining,granted_at,per_battle_limit FROM public.profiles WHERE id=p_profile_id;
  IF granted_at IS NULL OR now()-granted_at>interval '7 days' THEN RAISE EXCEPTION 'grant_expired'; END IF;
  IF coalesce(remaining,0)<=0 THEN RAISE EXCEPTION 'no_grants_remaining'; END IF;
  SELECT count(*) INTO used FROM public.wallet_transactions WHERE battle_id=p_battle_id AND profile_id=p_profile_id
   AND source='new_user_grant' AND status IN('held','spent');
  IF used>=per_battle_limit THEN RAISE EXCEPTION 'per_battle_grant_limit_reached'; END IF;
  UPDATE public.profiles SET new_user_round_grants_remaining=new_user_round_grants_remaining-1 WHERE id=p_profile_id;
 END IF;
 INSERT INTO public.wallet_transactions(profile_id,amount,balance_after,currency_type,reason,status,source,battle_id,round_number,idempotency_key,metadata)
 VALUES(p_profile_id,CASE WHEN p_source='credit' THEN -1 ELSE 0 END,balance-CASE WHEN p_source='credit' THEN 1 ELSE 0 END,
  'credits',hold_reason,'held',p_source,p_battle_id,p_round_number,p_idempotency_key,
  jsonb_build_object('tier','tier1','unit','round','grant',p_source='new_user_grant')) RETURNING id INTO tx_id;
 RETURN tx_id;
END $$;
REVOKE ALL ON FUNCTION private.reserve_cinematic_round_funding(uuid,uuid,smallint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.reserve_cinematic_round_funding(uuid,uuid,smallint,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_round_upgrade_credit(p_profile_id uuid,p_battle_id uuid,p_round_number smallint,p_idempotency_key text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.reserve_cinematic_round_funding(p_profile_id,p_battle_id,p_round_number,p_idempotency_key,'credit')
$$;
CREATE OR REPLACE FUNCTION public.reserve_round_upgrade_grant(p_profile_id uuid,p_battle_id uuid,p_round_number smallint,p_idempotency_key text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.reserve_cinematic_round_funding(p_profile_id,p_battle_id,p_round_number,p_idempotency_key,'new_user_grant')
$$;
REVOKE ALL ON FUNCTION public.reserve_round_upgrade_credit(uuid,uuid,smallint,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_round_upgrade_grant(uuid,uuid,smallint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_round_upgrade_credit(uuid,uuid,smallint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_round_upgrade_grant(uuid,uuid,smallint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_round_upgrade(p_reservation_id uuid,p_outcome text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE row public.wallet_transactions%ROWTYPE; balance integer;
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN('succeeded','failed','moderation_failed') THEN RAISE EXCEPTION 'invalid_outcome'; END IF;
 SELECT * INTO row FROM public.wallet_transactions WHERE id=p_reservation_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('round-funding:'||row.battle_id::text||':'||row.round_number::text,0));
 PERFORM 1 FROM public.profiles WHERE id=row.profile_id FOR UPDATE;
 SELECT * INTO row FROM public.wallet_transactions WHERE id=p_reservation_id FOR UPDATE;
 IF row.reason NOT IN('round_upgrade_hold','round_upgrade_grant_hold') OR row.source NOT IN('credit','new_user_grant') THEN
  RAISE EXCEPTION 'reservation_not_round_upgrade';
 END IF;
 IF row.status IN('spent','released','refunded') THEN RETURN; END IF;
 IF row.status<>'held' THEN RAISE EXCEPTION 'reservation_not_held'; END IF;
 IF p_outcome='succeeded' THEN
  UPDATE public.wallet_transactions SET status='spent' WHERE id=p_reservation_id;
 ELSE
  IF row.source='credit' THEN
   SELECT coalesce(sum(amount),0) INTO balance FROM public.wallet_transactions WHERE profile_id=row.profile_id AND currency_type='credits'
    AND (status IN('final','held','spent','refunded') OR (status='released' AND reason='round_upgrade_hold'));
   INSERT INTO public.wallet_transactions(profile_id,amount,balance_after,currency_type,reason,status,source,battle_id,round_number,idempotency_key,metadata)
   VALUES(row.profile_id,-row.amount,balance-row.amount,'credits','round_upgrade_refund','refunded','credit',row.battle_id,row.round_number,
    'refund:'||row.id::text,jsonb_build_object('reservation_id',row.id,'outcome',p_outcome));
   -- Both immutable amounts remain counted, giving precisely zero net spend.
   UPDATE public.wallet_transactions SET status='refunded' WHERE id=p_reservation_id;
  ELSE
   UPDATE public.profiles SET new_user_round_grants_remaining=least(new_user_round_grants_remaining+1,3) WHERE id=row.profile_id;
   UPDATE public.wallet_transactions SET status='released' WHERE id=p_reservation_id;
  END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.finalize_round_upgrade(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_round_upgrade(uuid,text) TO service_role;

COMMENT ON FUNCTION public.reserve_round_upgrade_credit(uuid,uuid,smallint,text) IS 'Service-only credit reservation. Same request reuses active funding; terminal keys fail; fresh retry keys fund a new attempt under a shared round lock.';
COMMENT ON FUNCTION public.reserve_round_upgrade_grant(uuid,uuid,smallint,text) IS 'Service-only welcome token reservation with fresh-attempt retry, shared round funding fence, seven-day expiry and per-battle cap.';
