-- Durable operations are private: public suggestion rows remain owner-readable.
-- All money and lease transitions below run atomically, service-role only.
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.suggestion_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 battle_id uuid NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
 round_number integer NOT NULL CHECK(round_number BETWEEN 1 AND 3),
 move_type public.move_type NOT NULL,
 operation text NOT NULL CHECK(operation IN ('ensure_free','reroll')),
 idempotency_key text NOT NULL,
 source text NOT NULL CHECK(source IN ('player','prefetch')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','failed')),
 lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
 lease_expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '60 seconds',
 attempts integer NOT NULL DEFAULT 1,
 suggestion_id uuid,
 credits_spent integer NOT NULL DEFAULT 0 CHECK(credits_spent>=0),
 wallet_transaction_id uuid REFERENCES public.wallet_transactions(id),
 failure_code text,
 provider_metadata jsonb NOT NULL DEFAULT '{}',
 refunded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(profile_id,idempotency_key)
);
ALTER TABLE private.suggestion_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.suggestion_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.suggestion_operations TO service_role;
CREATE INDEX IF NOT EXISTS suggestion_operations_rate_window ON private.suggestion_operations(profile_id,created_at) WHERE source='player';
ALTER TABLE public.move_prompt_suggestions
 ADD COLUMN IF NOT EXISTS operation_id uuid REFERENCES private.suggestion_operations(id),
 ADD COLUMN IF NOT EXISTS operation_kind text NOT NULL DEFAULT 'ensure_free',
 ADD COLUMN IF NOT EXISTS structure_version smallint NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS prompt_version text;
-- A zero-price or staff reroll is still a reroll, not a second initial free set.
DROP INDEX IF EXISTS public.idx_move_prompt_suggestions_free_slot;
CREATE UNIQUE INDEX idx_move_prompt_suggestions_free_slot ON public.move_prompt_suggestions
 (battle_id,profile_id,round_number,move_type) WHERE is_paid=FALSE AND operation_kind='ensure_free';

CREATE OR REPLACE FUNCTION private.suggestion_operation_result(p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
 SELECT jsonb_build_object('status',CASE o.status WHEN 'succeeded' THEN 'ready' ELSE o.status END,
   'operation_id',o.id,'id',s.id,'credits_spent',o.credits_spent,'is_paid',o.credits_spent>0,
   'suggestions',CASE WHEN o.status='succeeded' AND s.moderation_status IN ('approved','flagged_human_review') THEN s.suggestions ELSE NULL END,
   'error',o.failure_code,'refunded',o.refunded_at IS NOT NULL)
 FROM private.suggestion_operations o LEFT JOIN public.move_prompt_suggestions s ON s.id=o.suggestion_id WHERE o.id=p_id
$$;

CREATE OR REPLACE FUNCTION public.reserve_suggestion_operation(
 p_profile_id uuid,p_battle_id uuid,p_round_number integer,p_move_type public.move_type,
 p_operation text DEFAULT 'ensure_free',p_idempotency_key text DEFAULT NULL,p_expected_credits integer DEFAULT NULL,
 p_source text DEFAULT 'player',p_allow_generate boolean DEFAULT false,p_allow_reroll boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE b public.battles%ROWTYPE; r public.battle_rounds%ROWTYPE; o private.suggestion_operations%ROWTYPE;
 s public.move_prompt_suggestions%ROWTYPE; key text; price integer; balance integer; tx uuid; cid uuid;
 hour_count integer; day_count integer; tester boolean; new_operation_id uuid; new_generation_id uuid:=gen_random_uuid();
BEGIN
 IF p_profile_id IS NULL OR p_round_number NOT BETWEEN 1 AND 3 OR p_round_number IS NULL OR p_move_type IS NULL
 OR p_operation NOT IN ('ensure_free','reroll') OR p_operation IS NULL OR p_source NOT IN ('player','prefetch') THEN
   RETURN jsonb_build_object('error','bad_request'); END IF;
 IF p_operation='reroll' AND (p_source<>'player' OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 OR p_expected_credits IS NULL OR p_expected_credits<0) THEN
   RETURN jsonb_build_object('error','purchase_confirmation_required'); END IF;
 SELECT * INTO b FROM public.battles WHERE id=p_battle_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 IF p_profile_id IS DISTINCT FROM b.player_one_id AND p_profile_id IS DISTINCT FROM b.player_two_id THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 -- Per-player reservation serialization also closes the rate-limit check/insert race.
 PERFORM pg_advisory_xact_lock(hashtext('suggestions:'||p_profile_id::text));
 key:=CASE WHEN p_operation='ensure_free' THEN 'free:'||p_battle_id||':'||p_round_number||':'||p_move_type ELSE btrim(p_idempotency_key) END;
 SELECT * INTO o FROM private.suggestion_operations WHERE profile_id=p_profile_id AND idempotency_key=key FOR UPDATE;
 IF FOUND THEN
   IF o.battle_id<>p_battle_id OR o.round_number<>p_round_number OR o.move_type<>p_move_type OR o.operation<>p_operation THEN
     RETURN jsonb_build_object('error','idempotency_conflict'); END IF;
   IF o.status='succeeded' OR (o.status='failed' AND p_operation='reroll') OR (o.status='pending' AND o.lease_expires_at>clock_timestamp()) THEN
     RETURN private.suggestion_operation_result(o.id); END IF;
 END IF;
 IF b.status NOT IN ('matched','waiting_for_prompts') OR
   (coalesce(b.format,'single')='single' AND p_round_number<>1) OR
   (b.format='bo3' AND p_round_number<>coalesce(b.current_round,1)) THEN
   RETURN jsonb_build_object('error','round_not_open'); END IF;
 SELECT * INTO r FROM public.battle_rounds WHERE battle_id=p_battle_id AND round_number=p_round_number;
 IF b.format='bo3' AND (r.id IS NULL OR r.status<>'waiting_for_prompts' OR r.lock_in_deadline<=clock_timestamp()) THEN
   RETURN jsonb_build_object('error','round_not_open'); END IF;
 IF EXISTS(SELECT 1 FROM public.battle_prompts WHERE battle_id=p_battle_id AND profile_id=p_profile_id AND round_number=p_round_number AND is_locked) THEN
   RETURN jsonb_build_object('error','prompt_locked'); END IF;
 cid:=CASE WHEN p_profile_id=b.player_one_id THEN b.player_one_character_id ELSE b.player_two_character_id END;
 IF NOT EXISTS(SELECT 1 FROM public.characters WHERE id=cid AND profile_id=p_profile_id) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 IF p_operation='ensure_free' AND o.id IS NULL THEN
   SELECT * INTO s FROM public.move_prompt_suggestions WHERE battle_id=p_battle_id AND profile_id=p_profile_id
     AND round_number=p_round_number AND move_type=p_move_type AND NOT is_paid AND operation_kind='ensure_free' FOR UPDATE;
   IF FOUND AND s.moderation_status IN ('approved','flagged_human_review') THEN
     RETURN jsonb_build_object('status','ready','id',s.id,'suggestions',s.suggestions,'is_paid',false,'credits_spent',0); END IF;
   IF s.id IS NOT NULL AND s.created_at>clock_timestamp()-interval '60 seconds' THEN
     RETURN jsonb_build_object('status','pending','id',s.id,'is_paid',false,'credits_spent',0); END IF;
 END IF;
 IF NOT coalesce(p_allow_generate,false) THEN RETURN jsonb_build_object('error','generation_disabled'); END IF;
 IF p_operation='reroll' AND o.id IS NULL AND NOT coalesce(p_allow_reroll,false) THEN RETURN jsonb_build_object('error','rerolls_disabled'); END IF;
 SELECT coalesce(is_test_user,false) INTO tester FROM public.profiles WHERE id=p_profile_id;
 IF p_source='player' AND NOT tester THEN
   SELECT coalesce(sum(n) FILTER(WHERE created_at>clock_timestamp()-interval '1 hour'),0),coalesce(sum(n),0)
   INTO hour_count,day_count FROM (
     SELECT attempts AS n,created_at FROM private.suggestion_operations WHERE profile_id=p_profile_id AND source='player' AND created_at>clock_timestamp()-interval '24 hours'
     UNION ALL
     SELECT 1,min(created_at) FROM public.move_prompt_suggestions WHERE profile_id=p_profile_id AND source='player' AND operation_id IS NULL AND created_at>clock_timestamp()-interval '24 hours'
     GROUP BY coalesce(generation_id,id)
   ) counts;
   IF hour_count>=30 OR day_count>=90 THEN RETURN jsonb_build_object('error','rate_limited'); END IF;
 END IF;
 IF o.id IS NOT NULL THEN
   -- Durable failure prevents an unlimited stream of retries against a broken provider.
   IF o.attempts>=3 THEN
     -- Reclaim just long enough to terminalize/refund through the same fence.
     UPDATE private.suggestion_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',status='pending' WHERE id=o.id RETURNING * INTO o;
     RETURN public.finish_suggestion_operation(o.id,o.lease_token,NULL,'{}','attempts_exhausted');
   END IF;
   UPDATE private.suggestion_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',
     status='pending',failure_code=NULL,attempts=attempts+1,updated_at=clock_timestamp() WHERE id=o.id RETURNING * INTO o;
   IF o.suggestion_id IS NULL THEN
     INSERT INTO public.move_prompt_suggestions(battle_id,profile_id,character_id,round_number,move_type,suggestions,source,generation_id,operation_id,operation_kind)
     VALUES(p_battle_id,p_profile_id,cid,p_round_number,p_move_type,'[{"title":"Opening move","body":"I step aside and watch for an opening to regain control of the exchange."}]',p_source,new_generation_id,o.id,p_operation)
     RETURNING id INTO o.suggestion_id;
     UPDATE private.suggestion_operations SET suggestion_id=o.suggestion_id WHERE id=o.id;
   END IF;
 ELSE
   price:=0;
   IF p_operation='reroll' THEN
     SELECT credits INTO price FROM public.character_edit_prices WHERE edit_kind='prompt_suggestions_reroll' FOR SHARE;
     IF price IS NULL THEN RETURN jsonb_build_object('error','price_unavailable'); END IF;
     IF price<>p_expected_credits THEN RETURN jsonb_build_object('error','price_changed','current_credits',price); END IF;
     IF tester THEN price:=0; END IF;
   END IF;
   new_operation_id:=gen_random_uuid();
   IF price>0 THEN
     PERFORM pg_advisory_xact_lock(hashtext('wallet:'||p_profile_id::text));
     SELECT coalesce(sum(amount),0) INTO balance FROM public.wallet_transactions WHERE profile_id=p_profile_id AND currency_type='credits';
     IF balance<price THEN RETURN jsonb_build_object('error','insufficient_credits'); END IF;
     tx:=public.spend_credits(p_profile_id,price,'prompt_suggestions','suggestion:'||new_operation_id,p_battle_id,NULL,jsonb_build_object('feature','move_prompt_suggestions','operation_id',new_operation_id));
   END IF;
   INSERT INTO private.suggestion_operations(id,profile_id,battle_id,round_number,move_type,operation,idempotency_key,source,credits_spent,wallet_transaction_id)
   VALUES(new_operation_id,p_profile_id,p_battle_id,p_round_number,p_move_type,p_operation,key,p_source,price,tx) RETURNING * INTO o;
   IF s.id IS NOT NULL THEN
     -- Adopt old orphaned pending free rows without freeing/duplicating their slot.
     UPDATE public.move_prompt_suggestions SET operation_id=o.id,generation_id=new_generation_id,moderation_status='pending' WHERE id=s.id;
     o.suggestion_id:=s.id;
   ELSE
     INSERT INTO public.move_prompt_suggestions(battle_id,profile_id,character_id,round_number,move_type,suggestions,is_paid,credits_spent,wallet_transaction_id,source,generation_id,operation_id,operation_kind)
     VALUES(p_battle_id,p_profile_id,cid,p_round_number,p_move_type,'[{"title":"Opening move","body":"I step aside and watch for an opening to regain control of the exchange."}]',price>0,price,tx,p_source,new_generation_id,o.id,p_operation)
     RETURNING id INTO o.suggestion_id;
   END IF;
   UPDATE private.suggestion_operations SET suggestion_id=o.suggestion_id WHERE id=o.id;
 END IF;
 RETURN private.suggestion_operation_result(o.id)||jsonb_build_object('status','claimed','lease_token',o.lease_token);
END $$;

CREATE OR REPLACE FUNCTION public.renew_suggestion_operation(p_operation_id uuid,p_lease_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
BEGIN
 UPDATE private.suggestion_operations SET lease_expires_at=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
 WHERE id=p_operation_id AND lease_token=p_lease_token AND status='pending' AND lease_expires_at>clock_timestamp();
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.finish_suggestion_operation(p_operation_id uuid,p_lease_token uuid,p_suggestions jsonb,p_metadata jsonb DEFAULT '{}',p_failure text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE o private.suggestion_operations%ROWTYPE; valid boolean;
BEGIN
 SELECT * INTO o FROM private.suggestion_operations WHERE id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR o.lease_token IS DISTINCT FROM p_lease_token OR o.status<>'pending' OR o.lease_expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('status','stale'); END IF;
 IF p_failure IS NULL THEN
   valid:=jsonb_typeof(p_suggestions)='array' AND jsonb_array_length(p_suggestions) BETWEEN 1 AND 3;
   IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Invalid suggestion completion'; END IF;
   UPDATE public.move_prompt_suggestions SET suggestions=p_suggestions,moderation_status='approved',
     structure_version=coalesce((p_metadata->>'structure_version')::smallint,1),prompt_version=p_metadata->>'prompt_version',
     provider=p_metadata->>'provider',provider_model=p_metadata->>'model',provider_cost_usd=(p_metadata->>'cost_usd')::numeric,
     provider_latency_ms=(p_metadata->>'latency_ms')::integer WHERE id=o.suggestion_id AND operation_id=o.id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion slot missing'; END IF;
   UPDATE private.suggestion_operations SET status='succeeded',provider_metadata=p_metadata,updated_at=clock_timestamp() WHERE id=o.id;
 ELSE
   IF o.credits_spent>0 AND o.wallet_transaction_id IS NOT NULL THEN
     PERFORM pg_advisory_xact_lock(hashtext('wallet:'||o.profile_id::text));
     PERFORM public.grant_credits(o.profile_id,o.credits_spent,'prompt_suggestions_refund:'||left(p_failure,80),'refund_'||o.wallet_transaction_id,o.battle_id,NULL,jsonb_build_object('feature','move_prompt_suggestions','operation_id',o.id));
   END IF;
   -- Audit lives in the durable operation; failed text never remains client-readable.
   DELETE FROM public.move_prompt_suggestions WHERE id=o.suggestion_id AND operation_id=o.id;
   UPDATE private.suggestion_operations SET status='failed',suggestion_id=NULL,failure_code=left(p_failure,80),provider_metadata=p_metadata,
     refunded_at=CASE WHEN credits_spent>0 THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp() WHERE id=o.id;
 END IF;
 RETURN private.suggestion_operation_result(o.id);
END $$;

-- Sweeper terminalizes abandoned workers, including operations whose battle has ended.
-- It cannot reclaim a live heartbeat or touch already-successful operations.
CREATE OR REPLACE FUNCTION public.expire_suggestion_operations() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE o private.suggestion_operations%ROWTYPE; expired integer:=0;
BEGIN
 FOR o IN SELECT * FROM private.suggestion_operations WHERE status='pending' AND lease_expires_at<clock_timestamp()-interval '4 minutes' FOR UPDATE SKIP LOCKED LIMIT 100 LOOP
   UPDATE private.suggestion_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds' WHERE id=o.id RETURNING * INTO o;
   PERFORM public.finish_suggestion_operation(o.id,o.lease_token,NULL,'{}','worker_expired'); expired:=expired+1;
 END LOOP;
 RETURN expired;
END $$;

REVOKE ALL ON FUNCTION private.suggestion_operation_result(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_suggestion_operation(uuid,uuid,integer,public.move_type,text,text,integer,text,boolean,boolean),public.renew_suggestion_operation(uuid,uuid),public.finish_suggestion_operation(uuid,uuid,jsonb,jsonb,text),public.expire_suggestion_operations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_suggestion_operation(uuid,uuid,integer,public.move_type,text,text,integer,text,boolean,boolean),public.renew_suggestion_operation(uuid,uuid),public.finish_suggestion_operation(uuid,uuid,jsonb,jsonb,text),public.expire_suggestion_operations() TO service_role;
SELECT cron.schedule('expire-suggestion-operations','* * * * *','SELECT public.expire_suggestion_operations()');
