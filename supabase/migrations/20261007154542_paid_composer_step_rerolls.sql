-- Paid, context-bound intention/approach rerolls. The original action-bank and
-- free-completion contracts remain available to older clients.
CREATE TABLE IF NOT EXISTS private.suggestion_step_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 battle_id uuid NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
 round_number integer NOT NULL CHECK(round_number BETWEEN 1 AND 3),
 move_type public.move_type NOT NULL,
 target text NOT NULL CHECK(target IN ('intent','approach')),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
 context_key text NOT NULL,
 context_snapshot jsonb NOT NULL,
 composition_version integer NOT NULL DEFAULT 3 CHECK(composition_version=3),
 action_text text NOT NULL CHECK(length(action_text) BETWEEN 5 AND 240),
 intent_text text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','failed')),
 lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
 lease_expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '60 seconds',
 attempts integer NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 3),
 credits_spent integer NOT NULL CHECK(credits_spent>=0),
 wallet_transaction_id uuid REFERENCES public.wallet_transactions(id),
 refunded_at timestamptz,
 result jsonb,
 failure_code text,
 provider_metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(profile_id,idempotency_key),
 CHECK((target='intent' AND intent_text IS NULL) OR
       (target='approach' AND intent_text IS NOT NULL AND length(intent_text) BETWEEN 5 AND 180)),
 CHECK((credits_spent=0 AND wallet_transaction_id IS NULL AND refunded_at IS NULL) OR
       (credits_spent>0 AND wallet_transaction_id IS NOT NULL)),
 CHECK((status='succeeded' AND result IS NOT NULL AND failure_code IS NULL AND refunded_at IS NULL) OR
       (status='pending' AND result IS NULL AND failure_code IS NULL AND refunded_at IS NULL) OR
       (status='failed' AND result IS NULL AND failure_code IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS private.suggestion_step_attempts (
 operation_id uuid NOT NULL REFERENCES private.suggestion_step_operations(id) ON DELETE CASCADE,
 attempt_number integer NOT NULL CHECK(attempt_number BETWEEN 1 AND 3),
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(operation_id,attempt_number)
);
ALTER TABLE private.suggestion_step_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.suggestion_step_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.suggestion_step_operations,private.suggestion_step_attempts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON private.suggestion_step_operations,private.suggestion_step_attempts TO service_role;
CREATE INDEX IF NOT EXISTS suggestion_step_rate_window ON private.suggestion_step_attempts(profile_id,attempted_at);
CREATE INDEX IF NOT EXISTS suggestion_step_expiry ON private.suggestion_step_operations(lease_expires_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS suggestion_step_context ON private.suggestion_step_operations(profile_id,battle_id,round_number,context_key);

-- All three generation paths call this under suggestions:<profile> serialization.
CREATE OR REPLACE FUNCTION private.suggestion_rate_limited(p_profile_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
 SELECT count(*) FILTER(WHERE attempted_at>clock_timestamp()-interval '1 hour')>=30 OR count(*)>=90 FROM (
  SELECT attempted_at FROM private.suggestion_operation_attempts WHERE profile_id=p_profile_id AND source='player' AND attempted_at>clock_timestamp()-interval '24 hours'
  UNION ALL
  SELECT attempted_at FROM private.suggestion_completion_attempts WHERE profile_id=p_profile_id AND attempted_at>clock_timestamp()-interval '24 hours'
  UNION ALL
  SELECT attempted_at FROM private.suggestion_step_attempts WHERE profile_id=p_profile_id AND attempted_at>clock_timestamp()-interval '24 hours'
  UNION ALL
  SELECT min(created_at) FROM public.move_prompt_suggestions WHERE profile_id=p_profile_id AND source='player' AND operation_id IS NULL AND created_at>clock_timestamp()-interval '24 hours' GROUP BY coalesce(generation_id,id)
 ) attempts
$$;
CREATE OR REPLACE FUNCTION private.suggestion_step_result(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
 SELECT jsonb_build_object('status',CASE o.status WHEN 'succeeded' THEN 'ready' ELSE o.status END,
  'operation_id',o.id,'context_key',o.context_key,'target',o.target,'composition_version',o.composition_version,
  'credits_spent',o.credits_spent,'is_paid',o.credits_spent>0,'refunded',o.refunded_at IS NOT NULL,
  'result',CASE WHEN o.status='succeeded' THEN o.result ELSE NULL END,'error',o.failure_code)
 FROM private.suggestion_step_operations o WHERE o.id=p_id
$$;

CREATE OR REPLACE FUNCTION public.finish_suggestion_step_operation(
 p_operation_id uuid,p_lease_token uuid,p_result jsonb,p_metadata jsonb DEFAULT '{}',p_failure text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE o private.suggestion_step_operations%ROWTYPE; b public.battles%ROWTYPE; r public.battle_rounds%ROWTYPE;
 failure text:=p_failure; checked_at timestamptz;
BEGIN
 -- Immutable ownership read first. Every path that may touch a wallet takes
 -- battle -> round -> suggestions serialization -> operation -> wallet.
 SELECT * INTO o FROM private.suggestion_step_operations WHERE id=p_operation_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','stale'); END IF;
 SELECT * INTO b FROM public.battles WHERE id=o.battle_id FOR UPDATE;
 SELECT * INTO r FROM public.battle_rounds WHERE battle_id=o.battle_id AND round_number=o.round_number FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtext('suggestions:'||o.profile_id::text));
 SELECT * INTO o FROM private.suggestion_step_operations WHERE id=p_operation_id FOR UPDATE;
 checked_at:=clock_timestamp();
 IF NOT FOUND OR o.lease_token IS DISTINCT FROM p_lease_token THEN RETURN jsonb_build_object('status','stale'); END IF;
 IF o.status<>'pending' THEN RETURN private.suggestion_step_result(o.id); END IF;
 IF o.lease_expires_at<=checked_at THEN RETURN jsonb_build_object('status','stale'); END IF;
 IF failure IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.battle_prompts WHERE battle_id=o.battle_id AND profile_id=o.profile_id AND round_number=o.round_number AND is_locked) THEN
   failure:='prompt_locked_before_delivery';
  ELSIF b.id IS NULL OR b.status NOT IN ('matched','waiting_for_prompts') OR b.prompt_experience_version<>2 OR b.format<>'bo3'
   OR o.round_number<>coalesce(b.current_round,1) OR r.id IS NULL OR r.status<>'waiting_for_prompts'
   OR r.lock_in_deadline IS NULL OR r.lock_in_deadline<=checked_at THEN
   failure:='round_closed_before_delivery';
  END IF;
 END IF;
 IF failure IS NULL AND (
  jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR
  (o.target='intent' AND NOT private.valid_intent_hints(o.action_text,p_result->'intentHints')) OR
  (o.target='approach' AND NOT private.valid_approach_hints(o.action_text,o.intent_text,p_result->'approachHints'))
 ) THEN failure:='invalid_completion'; END IF;
 IF failure IS NOT NULL AND o.credits_spent>0 AND o.wallet_transaction_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtext('wallet:'||o.profile_id::text));
  PERFORM public.grant_credits(o.profile_id,o.credits_spent,'prompt_suggestions_refund:'||left(failure,80),
   'refund_'||o.wallet_transaction_id,o.battle_id,NULL,
   jsonb_build_object('feature','move_step_suggestions','operation_id',o.id,'target',o.target));
 END IF;
 UPDATE private.suggestion_step_operations SET status=CASE WHEN failure IS NULL THEN 'succeeded' ELSE 'failed' END,
  result=CASE WHEN failure IS NULL THEN p_result ELSE NULL END,failure_code=left(failure,80),
  refunded_at=CASE WHEN failure IS NOT NULL AND credits_spent>0 THEN clock_timestamp() ELSE NULL END,
  provider_metadata=coalesce(p_metadata,'{}'),updated_at=clock_timestamp() WHERE id=o.id;
 RETURN private.suggestion_step_result(o.id);
END $$;

CREATE OR REPLACE FUNCTION public.reserve_suggestion_step_operation(
 p_profile_id uuid,p_battle_id uuid,p_round_number integer,p_move_type public.move_type,p_target text,
 p_action_text text,p_intent_text text,p_idempotency_key text,p_expected_credits integer,
 p_allow_generate boolean,p_allow_reroll boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE b public.battles%ROWTYPE; r public.battle_rounds%ROWTYPE; o private.suggestion_step_operations%ROWTYPE;
 context jsonb; context_hash text; key text:=btrim(p_idempotency_key); cid uuid; price integer; balance bigint;
 tx uuid; operation_id uuid:=gen_random_uuid(); tester boolean; failure text;
 action text:=btrim(p_action_text); intent text:=btrim(p_intent_text);
BEGIN
 IF p_profile_id IS NULL OR p_battle_id IS NULL OR p_round_number IS NULL OR p_round_number NOT BETWEEN 1 AND 3
  OR p_move_type IS NULL OR p_target IS NULL OR p_target NOT IN ('intent','approach')
  OR action IS NULL OR length(action) NOT BETWEEN 5 AND 240
  OR (p_target='intent' AND p_intent_text IS NOT NULL)
  OR (p_target='approach' AND (intent IS NULL OR length(intent) NOT BETWEEN 5 AND 180)) THEN
  RETURN jsonb_build_object('error','bad_request'); END IF;
 IF key IS NULL OR length(key) NOT BETWEEN 8 AND 128 OR p_expected_credits IS NULL OR p_expected_credits<0 THEN
  RETURN jsonb_build_object('error','purchase_confirmation_required'); END IF;
 SELECT * INTO b FROM public.battles WHERE id=p_battle_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 IF p_profile_id IS DISTINCT FROM b.player_one_id AND p_profile_id IS DISTINCT FROM b.player_two_id THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 SELECT * INTO r FROM public.battle_rounds WHERE battle_id=p_battle_id AND round_number=p_round_number FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtext('suggestions:'||p_profile_id::text));
 cid:=CASE WHEN p_profile_id=b.player_one_id THEN b.player_one_character_id ELSE b.player_two_character_id END;
 context:=jsonb_build_object('policy','paid-step-v1','profile_id',p_profile_id,'battle_id',p_battle_id,
  'round_number',p_round_number,'move_type',p_move_type,'target',p_target,'character_id',cid,
  'theme',b.theme,'situation',r.situation_snapshot,'action',action,'intent',intent,'composition_version',3);
 context_hash:=encode(extensions.digest(convert_to(context::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO o FROM private.suggestion_step_operations WHERE profile_id=p_profile_id AND idempotency_key=key FOR UPDATE;
 IF FOUND THEN
  IF o.battle_id IS DISTINCT FROM p_battle_id OR o.round_number IS DISTINCT FROM p_round_number
   OR o.move_type IS DISTINCT FROM p_move_type OR o.target IS DISTINCT FROM p_target
   OR o.action_text IS DISTINCT FROM action OR o.intent_text IS DISTINCT FROM intent THEN
   RETURN jsonb_build_object('error','idempotency_conflict'); END IF;
  -- Read a delivered purchase before live state, price, kill switch or rate checks.
  IF o.status IN ('succeeded','failed') OR o.lease_expires_at>clock_timestamp() THEN RETURN private.suggestion_step_result(o.id); END IF;
 END IF;
 -- An expired purchase cannot be regenerated against altered server context.
 -- Its delivered/failed replay above remains readable even if a character disappears.
 IF o.id IS NOT NULL AND o.context_snapshot IS DISTINCT FROM context THEN
  UPDATE private.suggestion_step_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds'
   WHERE id=o.id RETURNING * INTO o;
  RETURN public.finish_suggestion_step_operation(o.id,o.lease_token,NULL,'{}','context_changed_before_delivery');
 END IF;
 IF b.prompt_experience_version<>2 OR b.format<>'bo3' OR r.situation_snapshot IS NULL
  OR jsonb_typeof(r.situation_snapshot->'text') IS DISTINCT FROM 'string' THEN
  RETURN jsonb_build_object('error','bad_request'); END IF;
 IF EXISTS(SELECT 1 FROM public.battle_prompts WHERE battle_id=p_battle_id AND profile_id=p_profile_id AND round_number=p_round_number AND is_locked) THEN
  failure:='prompt_locked_before_delivery';
 ELSIF b.status NOT IN ('matched','waiting_for_prompts') OR p_round_number<>coalesce(b.current_round,1)
  OR r.id IS NULL OR r.status<>'waiting_for_prompts' OR r.lock_in_deadline IS NULL OR r.lock_in_deadline<=clock_timestamp() THEN
  failure:='round_closed_before_delivery';
 END IF;
 IF failure IS NOT NULL THEN
  IF o.id IS NOT NULL THEN
   UPDATE private.suggestion_step_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds'
    WHERE id=o.id RETURNING * INTO o;
   RETURN public.finish_suggestion_step_operation(o.id,o.lease_token,NULL,'{}',failure);
  END IF;
  RETURN jsonb_build_object('error',CASE failure WHEN 'prompt_locked_before_delivery' THEN 'prompt_locked' ELSE 'round_not_open' END);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.characters WHERE id=cid AND profile_id=p_profile_id) THEN
  IF o.id IS NOT NULL THEN
   UPDATE private.suggestion_step_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds'
    WHERE id=o.id RETURNING * INTO o;
   RETURN public.finish_suggestion_step_operation(o.id,o.lease_token,NULL,'{}','character_unavailable');
  END IF;
  RETURN jsonb_build_object('error','forbidden');
 END IF;
 IF o.id IS NOT NULL AND o.attempts>=3 THEN
  UPDATE private.suggestion_step_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds'
   WHERE id=o.id RETURNING * INTO o;
  RETURN public.finish_suggestion_step_operation(o.id,o.lease_token,NULL,'{}','attempts_exhausted');
 END IF;
 IF NOT coalesce(p_allow_generate,false) THEN RETURN coalesce(private.suggestion_step_result(o.id),'{}')||jsonb_build_object('error','generation_disabled'); END IF;
 IF o.id IS NULL AND NOT coalesce(p_allow_reroll,false) THEN RETURN jsonb_build_object('error','rerolls_disabled'); END IF;
 SELECT coalesce(is_test_user,false) INTO tester FROM public.profiles WHERE id=p_profile_id;
 IF NOT coalesce(tester,false) AND private.suggestion_rate_limited(p_profile_id) THEN RETURN coalesce(private.suggestion_step_result(o.id),'{}')||jsonb_build_object('error','rate_limited'); END IF;
 IF o.id IS NULL THEN
  SELECT credits INTO price FROM public.character_edit_prices WHERE edit_kind='prompt_suggestions_reroll' FOR SHARE;
  IF price IS NULL THEN RETURN jsonb_build_object('error','price_unavailable'); END IF;
  IF tester THEN price:=0; END IF;
  IF price<>p_expected_credits THEN RETURN jsonb_build_object('error','price_changed','current_credits',price); END IF;
  IF price>0 THEN
   PERFORM pg_advisory_xact_lock(hashtext('wallet:'||p_profile_id::text));
   SELECT coalesce(sum(amount),0) INTO balance FROM public.wallet_transactions WHERE profile_id=p_profile_id AND currency_type='credits';
   IF balance<price THEN RETURN jsonb_build_object('error','insufficient_credits'); END IF;
   tx:=public.spend_credits(p_profile_id,price,'prompt_suggestions','suggestion-step:'||operation_id,p_battle_id,NULL,
    jsonb_build_object('feature','move_step_suggestions','operation_id',operation_id,'target',p_target));
  END IF;
  INSERT INTO private.suggestion_step_operations(id,profile_id,battle_id,round_number,move_type,target,idempotency_key,
   context_key,context_snapshot,action_text,intent_text,credits_spent,wallet_transaction_id)
  VALUES(operation_id,p_profile_id,p_battle_id,p_round_number,p_move_type,p_target,key,context_hash,context,action,intent,price,tx)
  RETURNING * INTO o;
 ELSE
  UPDATE private.suggestion_step_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',
   attempts=attempts+1,updated_at=clock_timestamp() WHERE id=o.id RETURNING * INTO o;
 END IF;
 INSERT INTO private.suggestion_step_attempts(operation_id,attempt_number,profile_id) VALUES(o.id,o.attempts,p_profile_id);
 RETURN private.suggestion_step_result(o.id)||jsonb_build_object('status','claimed','lease_token',o.lease_token);
END $$;

CREATE OR REPLACE FUNCTION public.renew_suggestion_step_operation(p_operation_id uuid,p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
BEGIN
 UPDATE private.suggestion_step_operations SET lease_expires_at=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
 WHERE id=p_operation_id AND lease_token=p_lease_token AND status='pending' AND lease_expires_at>clock_timestamp();
 RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.expire_suggestion_step_operations() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE candidate record; o private.suggestion_step_operations%ROWTYPE; bid uuid; rid uuid; expired integer:=0;
BEGIN
 FOR candidate IN SELECT id,battle_id,profile_id,round_number FROM private.suggestion_step_operations
  WHERE status='pending' AND lease_expires_at<clock_timestamp()-interval '4 minutes'
  ORDER BY battle_id,profile_id,id LIMIT 100 LOOP
  SELECT id INTO bid FROM public.battles WHERE id=candidate.battle_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT id INTO rid FROM public.battle_rounds WHERE battle_id=candidate.battle_id AND round_number=candidate.round_number FOR UPDATE SKIP LOCKED;
  IF NOT FOUND AND EXISTS(SELECT 1 FROM public.battle_rounds WHERE battle_id=candidate.battle_id AND round_number=candidate.round_number) THEN CONTINUE; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('suggestions:'||candidate.profile_id::text)) THEN CONTINUE; END IF;
  SELECT * INTO o FROM private.suggestion_step_operations WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR o.status<>'pending' OR o.lease_expires_at>=clock_timestamp()-interval '4 minutes' THEN CONTINUE; END IF;
  UPDATE private.suggestion_step_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds'
   WHERE id=o.id RETURNING * INTO o;
  PERFORM public.finish_suggestion_step_operation(o.id,o.lease_token,NULL,'{}','worker_expired');
  expired:=expired+1;
 END LOOP;
 RETURN expired;
END $$;
REVOKE ALL ON FUNCTION private.suggestion_rate_limited(uuid),private.suggestion_step_result(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_suggestion_step_operation(uuid,uuid,integer,public.move_type,text,text,text,text,integer,boolean,boolean),
 public.renew_suggestion_step_operation(uuid,uuid),public.finish_suggestion_step_operation(uuid,uuid,jsonb,jsonb,text),
 public.expire_suggestion_step_operations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_suggestion_step_operation(uuid,uuid,integer,public.move_type,text,text,text,text,integer,boolean,boolean),
 public.renew_suggestion_step_operation(uuid,uuid),public.finish_suggestion_step_operation(uuid,uuid,jsonb,jsonb,text),
 public.expire_suggestion_step_operations() TO service_role;
SELECT cron.schedule('expire-suggestion-step-operations','* * * * *','SELECT public.expire_suggestion_step_operations()');

-- Older test clients confirm the catalogue price; newer clients confirm their
-- effective zero price. Both remain waived, while ordinary clients must match
-- the actual configured price. Existing action purchases keep their durable
-- recovery identity while blocked, and terminal recovery refunds under a new fence.
CREATE OR REPLACE FUNCTION public.reserve_suggestion_operation(
 p_profile_id uuid,p_battle_id uuid,p_round_number integer,p_move_type public.move_type,
 p_operation text,p_idempotency_key text,p_expected_credits integer,
 p_source text,p_allow_generate boolean,p_allow_reroll boolean,p_composition_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE b public.battles%ROWTYPE; r public.battle_rounds%ROWTYPE; o private.suggestion_operations%ROWTYPE;
 s public.move_prompt_suggestions%ROWTYPE; key text; price integer; balance integer; tx uuid; cid uuid; failure text; prompt_locked boolean;
 hour_count integer; day_count integer; tester boolean; new_operation_id uuid; new_generation_id uuid:=gen_random_uuid();
BEGIN
 IF p_profile_id IS NULL OR p_round_number NOT BETWEEN 1 AND 3 OR p_round_number IS NULL OR p_move_type IS NULL
 OR p_composition_version IS NULL OR p_composition_version NOT IN (2,3)
 OR p_operation NOT IN ('ensure_free','reroll') OR p_operation IS NULL OR p_source NOT IN ('player','prefetch') THEN
   RETURN jsonb_build_object('error','bad_request'); END IF;
 IF p_operation='reroll' AND (p_source<>'player' OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 OR p_expected_credits IS NULL OR p_expected_credits<0) THEN
   RETURN jsonb_build_object('error','purchase_confirmation_required'); END IF;
 SELECT * INTO b FROM public.battles WHERE id=p_battle_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 IF p_profile_id IS DISTINCT FROM b.player_one_id AND p_profile_id IS DISTINCT FROM b.player_two_id THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 SELECT * INTO r FROM public.battle_rounds WHERE battle_id=p_battle_id AND round_number=p_round_number FOR UPDATE;
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
 prompt_locked:=EXISTS(SELECT 1 FROM public.battle_prompts WHERE battle_id=p_battle_id AND profile_id=p_profile_id AND round_number=p_round_number AND is_locked);
 -- Existing delivery outcomes use the finalizer's prompt-lock precedence;
 -- fresh requests keep the legacy round-closed decline when both are true.
 IF o.id IS NOT NULL AND prompt_locked THEN
   failure:='prompt_locked_before_delivery';
 ELSIF b.status NOT IN ('matched','waiting_for_prompts') OR
   (coalesce(b.format,'single')='single' AND p_round_number<>1) OR
   (b.format='bo3' AND (p_round_number<>coalesce(b.current_round,1) OR r.id IS NULL OR r.status<>'waiting_for_prompts'
     OR r.lock_in_deadline IS NULL OR r.lock_in_deadline<=clock_timestamp())) OR
   (coalesce(b.format,'single')='single' AND ((r.id IS NOT NULL AND r.status<>'waiting_for_prompts') OR
     (CASE WHEN p_profile_id=b.player_one_id THEN b.player_one_prompt_deadline ELSE b.player_two_prompt_deadline END)<=clock_timestamp())) THEN
   failure:='round_closed_before_delivery';
 ELSIF prompt_locked THEN
   failure:='prompt_locked_before_delivery';
 END IF;
 cid:=CASE WHEN p_profile_id=b.player_one_id THEN b.player_one_character_id ELSE b.player_two_character_id END;
 IF failure IS NULL AND NOT EXISTS(SELECT 1 FROM public.characters WHERE id=cid AND profile_id=p_profile_id) THEN
   failure:='character_unavailable'; END IF;
 IF failure IS NOT NULL THEN
   IF o.id IS NOT NULL THEN
     -- Parent/round/player/operation locks are already held in the common order.
     -- Supersede the expired worker before the finalizer can touch the wallet.
     UPDATE private.suggestion_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',status='pending'
       WHERE id=o.id RETURNING * INTO o;
     RETURN public.finish_suggestion_operation(o.id,o.lease_token,NULL,'{}',failure);
   END IF;
   RETURN jsonb_build_object('error',CASE failure WHEN 'prompt_locked_before_delivery' THEN 'prompt_locked'
     WHEN 'character_unavailable' THEN 'forbidden' ELSE 'round_not_open' END);
 END IF;
 IF p_operation='ensure_free' AND o.id IS NULL THEN
   SELECT * INTO s FROM public.move_prompt_suggestions WHERE battle_id=p_battle_id AND profile_id=p_profile_id
     AND round_number=p_round_number AND move_type=p_move_type AND NOT is_paid AND operation_kind='ensure_free' FOR UPDATE;
   IF FOUND AND s.moderation_status IN ('approved','flagged_human_review') THEN
     RETURN jsonb_build_object('status','ready','id',s.id,'suggestions',s.suggestions,'is_paid',false,'credits_spent',0); END IF;
   IF s.id IS NOT NULL AND s.created_at>clock_timestamp()-interval '60 seconds' THEN
     RETURN jsonb_build_object('status','pending','id',s.id,'is_paid',false,'credits_spent',0); END IF;
 END IF;
 IF o.id IS NOT NULL AND o.attempts>=3 THEN
   -- Exhaustion is terminal even when generation or further purchases are disabled.
   UPDATE private.suggestion_operations SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',status='pending' WHERE id=o.id RETURNING * INTO o;
   RETURN public.finish_suggestion_operation(o.id,o.lease_token,NULL,'{}','attempts_exhausted');
 END IF;
 IF NOT coalesce(p_allow_generate,false) THEN RETURN coalesce(private.suggestion_operation_result(o.id),'{}')||jsonb_build_object('error','generation_disabled'); END IF;
 IF p_operation='reroll' AND o.id IS NULL AND NOT coalesce(p_allow_reroll,false) THEN RETURN jsonb_build_object('error','rerolls_disabled'); END IF;
 SELECT coalesce(is_test_user,false) INTO tester FROM public.profiles WHERE id=p_profile_id;
 IF p_source='player' AND NOT tester THEN
   IF private.suggestion_rate_limited(p_profile_id) THEN RETURN coalesce(private.suggestion_operation_result(o.id),'{}')||jsonb_build_object('error','rate_limited'); END IF;
 END IF;
 IF o.id IS NOT NULL THEN
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
     IF price<>p_expected_credits AND NOT (tester AND p_expected_credits=0) THEN RETURN jsonb_build_object('error','price_changed','current_credits',price); END IF;
     IF tester THEN price:=0; END IF;
   END IF;
   new_operation_id:=gen_random_uuid();
   IF price>0 THEN
     PERFORM pg_advisory_xact_lock(hashtext('wallet:'||p_profile_id::text));
     SELECT coalesce(sum(amount),0) INTO balance FROM public.wallet_transactions WHERE profile_id=p_profile_id AND currency_type='credits';
     IF balance<price THEN RETURN jsonb_build_object('error','insufficient_credits'); END IF;
     tx:=public.spend_credits(p_profile_id,price,'prompt_suggestions','suggestion:'||new_operation_id,p_battle_id,NULL,jsonb_build_object('feature','move_prompt_suggestions','operation_id',new_operation_id));
   END IF;
   INSERT INTO private.suggestion_operations(id,profile_id,battle_id,round_number,move_type,operation,idempotency_key,source,credits_spent,wallet_transaction_id,composition_version)
   VALUES(new_operation_id,p_profile_id,p_battle_id,p_round_number,p_move_type,p_operation,key,p_source,price,tx,p_composition_version) RETURNING * INTO o;
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
 INSERT INTO private.suggestion_operation_attempts(operation_id,attempt_number,profile_id,source)
 VALUES(o.id,o.attempts,p_profile_id,p_source);
 RETURN private.suggestion_operation_result(o.id)||jsonb_build_object('status','claimed','lease_token',o.lease_token);
END $$;
