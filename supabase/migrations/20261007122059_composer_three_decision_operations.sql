-- Additive three-decision composition. Financial bank operations retain their
-- original delivery status and price; completion/upgrade operations never touch wallets.
ALTER TABLE private.suggestion_operations ADD COLUMN IF NOT EXISTS composition_version integer NOT NULL DEFAULT 2 CHECK(composition_version IN (2,3));
CREATE TABLE IF NOT EXISTS private.suggestion_completions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 battle_id uuid NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
 round_number integer NOT NULL CHECK(round_number BETWEEN 1 AND 3),
 move_type public.move_type NOT NULL,
 target text NOT NULL CHECK(target IN ('intent','approach','upgrade_v3')),
 context_key text NOT NULL,
 context_snapshot jsonb NOT NULL,
 composition_version integer NOT NULL DEFAULT 3 CHECK(composition_version=3),
 action_text text,
 intent_text text,
 suggestion_id uuid REFERENCES public.move_prompt_suggestions(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','failed')),
 lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
 lease_expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '60 seconds',
 attempts integer NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 3),
 result jsonb,
 failure_code text,
 provider_metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(profile_id,context_key),
 CHECK((target='upgrade_v3' AND suggestion_id IS NOT NULL AND action_text IS NULL AND intent_text IS NULL)
    OR (target='intent' AND suggestion_id IS NULL AND length(action_text) BETWEEN 5 AND 240 AND intent_text IS NULL)
    OR (target='approach' AND suggestion_id IS NULL AND length(action_text) BETWEEN 5 AND 240 AND length(intent_text) BETWEEN 5 AND 180))
);
CREATE TABLE IF NOT EXISTS private.suggestion_completion_attempts (
 operation_id uuid NOT NULL REFERENCES private.suggestion_completions(id) ON DELETE CASCADE,
 attempt_number integer NOT NULL CHECK(attempt_number BETWEEN 1 AND 3),
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(operation_id,attempt_number)
);
ALTER TABLE private.suggestion_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.suggestion_completion_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.suggestion_completions,private.suggestion_completion_attempts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON private.suggestion_completions,private.suggestion_completion_attempts TO service_role;
CREATE INDEX IF NOT EXISTS suggestion_completion_quota ON private.suggestion_completions(profile_id,battle_id,round_number) WHERE target<>'upgrade_v3';
CREATE INDEX IF NOT EXISTS suggestion_completion_rate_window ON private.suggestion_completion_attempts(profile_id,attempted_at);
CREATE INDEX IF NOT EXISTS suggestion_completion_expiry ON private.suggestion_completions(lease_expires_at) WHERE status='pending';

-- One shared attempt budget, always checked under suggestions:<profile> serialization.
CREATE OR REPLACE FUNCTION private.suggestion_rate_limited(p_profile_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
 SELECT count(*) FILTER(WHERE attempted_at>clock_timestamp()-interval '1 hour')>=30 OR count(*)>=90 FROM (
  SELECT attempted_at FROM private.suggestion_operation_attempts WHERE profile_id=p_profile_id AND source='player' AND attempted_at>clock_timestamp()-interval '24 hours'
  UNION ALL
  SELECT attempted_at FROM private.suggestion_completion_attempts WHERE profile_id=p_profile_id AND attempted_at>clock_timestamp()-interval '24 hours'
  UNION ALL
  SELECT min(created_at) FROM public.move_prompt_suggestions WHERE profile_id=p_profile_id AND source='player' AND operation_id IS NULL AND created_at>clock_timestamp()-interval '24 hours' GROUP BY coalesce(generation_id,id)
 ) attempts
$$;
CREATE OR REPLACE FUNCTION private.suggestion_operation_result(p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
 SELECT jsonb_build_object('status',CASE o.status WHEN 'succeeded' THEN 'ready' ELSE o.status END,
  'operation_id',o.id,'id',s.id,'credits_spent',o.credits_spent,'is_paid',o.credits_spent>0,
  'composition_version',o.composition_version,
  'suggestions',CASE WHEN o.status='succeeded' AND s.moderation_status IN ('approved','flagged_human_review') THEN s.suggestions ELSE NULL END,
  'error',o.failure_code,'refunded',o.refunded_at IS NOT NULL)
 FROM private.suggestion_operations o LEFT JOIN public.move_prompt_suggestions s ON s.id=o.suggestion_id WHERE o.id=p_id
$$;

CREATE OR REPLACE FUNCTION public.reserve_suggestion_operation(
 p_profile_id uuid,p_battle_id uuid,p_round_number integer,p_move_type public.move_type,
 p_operation text,p_idempotency_key text,p_expected_credits integer,
 p_source text,p_allow_generate boolean,p_allow_reroll boolean,p_composition_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE b public.battles%ROWTYPE; r public.battle_rounds%ROWTYPE; o private.suggestion_operations%ROWTYPE;
 s public.move_prompt_suggestions%ROWTYPE; key text; price integer; balance integer; tx uuid; cid uuid;
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
 IF b.status NOT IN ('matched','waiting_for_prompts') OR
   (coalesce(b.format,'single')='single' AND p_round_number<>1) OR
   (b.format='bo3' AND p_round_number<>coalesce(b.current_round,1)) THEN
   RETURN jsonb_build_object('error','round_not_open'); END IF;
 IF b.format='bo3' AND (r.id IS NULL OR r.status<>'waiting_for_prompts' OR r.lock_in_deadline IS NULL OR r.lock_in_deadline<=clock_timestamp()) THEN
   RETURN jsonb_build_object('error','round_not_open'); END IF;
 IF coalesce(b.format,'single')='single' AND r.id IS NOT NULL AND r.status<>'waiting_for_prompts' THEN
   RETURN jsonb_build_object('error','round_not_open'); END IF;
 IF coalesce(b.format,'single')='single' AND (CASE WHEN p_profile_id=b.player_one_id THEN b.player_one_prompt_deadline ELSE b.player_two_prompt_deadline END)<=clock_timestamp() THEN
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
   IF private.suggestion_rate_limited(p_profile_id) THEN RETURN jsonb_build_object('error','rate_limited'); END IF;
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

-- Preserve the exact old RPC signature without ambiguous defaulted overloads.
CREATE OR REPLACE FUNCTION public.reserve_suggestion_operation(
 p_profile_id uuid,p_battle_id uuid,p_round_number integer,p_move_type public.move_type,
 p_operation text DEFAULT 'ensure_free',p_idempotency_key text DEFAULT NULL,p_expected_credits integer DEFAULT NULL,
 p_source text DEFAULT 'player',p_allow_generate boolean DEFAULT false,p_allow_reroll boolean DEFAULT false
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
 SELECT public.reserve_suggestion_operation(p_profile_id,p_battle_id,p_round_number,p_move_type,p_operation,p_idempotency_key,p_expected_credits,p_source,p_allow_generate,p_allow_reroll,2)
$$;

-- These checks protect persisted shape as well as the Edge Function validation.
-- Provider moderation remains mandatory before the service invokes finalization.
CREATE OR REPLACE FUNCTION private.valid_approach_hints(p_action text,p_intent text,p_hints jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE h jsonb; ids text[]:=ARRAY[]::text[];
BEGIN
 IF p_action IS NULL OR length(p_action) NOT BETWEEN 5 AND 240 OR p_intent IS NULL OR length(p_intent) NOT BETWEEN 5 AND 180
  OR jsonb_typeof(p_hints) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_hints)<>3 THEN RETURN false; END IF;
 FOR h IN SELECT value FROM jsonb_array_elements(p_hints) LOOP
  IF jsonb_typeof(h) IS DISTINCT FROM 'object' OR jsonb_typeof(h->'id') IS DISTINCT FROM 'string' OR length(h->>'id') NOT BETWEEN 1 AND 200
   OR (h->>'id')=ANY(ids) OR jsonb_typeof(h->'text') IS DISTINCT FROM 'string' OR length(btrim(h->>'text')) NOT BETWEEN 5 AND 240
   OR length(btrim(p_action)||' '||btrim(p_intent)||' '||btrim(h->>'text')) NOT BETWEEN 20 AND 800 THEN RETURN false; END IF;
  ids:=array_append(ids,h->>'id');
 END LOOP;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION private.valid_intent_hints(p_action text,p_hints jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $$
DECLARE h jsonb; ids text[]:=ARRAY[]::text[];
BEGIN
 IF jsonb_typeof(p_hints) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_hints)<>3 THEN RETURN false; END IF;
 FOR h IN SELECT value FROM jsonb_array_elements(p_hints) LOOP
  IF jsonb_typeof(h) IS DISTINCT FROM 'object' OR jsonb_typeof(h->'id') IS DISTINCT FROM 'string' OR length(h->>'id') NOT BETWEEN 1 AND 200
   OR (h->>'id')=ANY(ids) OR jsonb_typeof(h->'text') IS DISTINCT FROM 'string'
   OR NOT private.valid_approach_hints(p_action,h->>'text',h->'approachHints') THEN RETURN false; END IF;
  ids:=array_append(ids,h->>'id');
 END LOOP;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION private.valid_composition_bank(p_bank jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private AS $$
DECLARE a jsonb; ids text[]:=ARRAY[]::text[];
BEGIN
 IF jsonb_typeof(p_bank) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_bank)<>3 THEN RETURN false; END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(p_bank) LOOP
  IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR a->'compositionVersion' IS DISTINCT FROM '3'::jsonb OR a->'structureVersion' IS DISTINCT FROM '2'::jsonb
   OR jsonb_typeof(a->'id') IS DISTINCT FROM 'string' OR length(a->>'id') NOT BETWEEN 1 AND 200 OR (a->>'id')=ANY(ids)
   OR jsonb_typeof(a->'title') IS DISTINCT FROM 'string' OR length(a->>'title') NOT BETWEEN 3 AND 48
   OR jsonb_typeof(a->'body') IS DISTINCT FROM 'string' OR length(a->>'body') NOT BETWEEN 20 AND 800
   OR jsonb_typeof(a->'action') IS DISTINCT FROM 'string'
   OR NOT private.valid_intent_hints(a->>'action',a->'intentHints') THEN RETURN false; END IF;
  ids:=array_append(ids,a->>'id');
 END LOOP;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION private.without_composition_approaches(p_bank jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_agg((a-'compositionVersion')||jsonb_build_object('intentHints',
  (SELECT jsonb_agg(i-'approachHints' ORDER BY iord) FROM jsonb_array_elements(a->'intentHints') WITH ORDINALITY x(i,iord))) ORDER BY aord)
 FROM jsonb_array_elements(p_bank) WITH ORDINALITY y(a,aord)
$$;
CREATE OR REPLACE FUNCTION public.finish_suggestion_operation(p_operation_id uuid,p_lease_token uuid,p_suggestions jsonb,p_metadata jsonb DEFAULT '{}',p_failure text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE o private.suggestion_operations%ROWTYPE; b public.battles%ROWTYPE; r public.battle_rounds%ROWTYPE;
 valid boolean; failure text:=p_failure; checked_at timestamptz;
BEGIN
 -- Read immutable ownership without a lock; every mutating path takes parents first.
 SELECT * INTO o FROM private.suggestion_operations WHERE id=p_operation_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','stale'); END IF;
 SELECT * INTO b FROM public.battles WHERE id=o.battle_id FOR UPDATE;
 SELECT * INTO r FROM public.battle_rounds WHERE battle_id=o.battle_id AND round_number=o.round_number FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtext('suggestions:'||o.profile_id::text));
 SELECT * INTO o FROM private.suggestion_operations WHERE id=p_operation_id FOR UPDATE;
 checked_at:=clock_timestamp(); -- Never transaction-start time: locks may have waited past the deadline.
 IF NOT FOUND OR o.lease_token IS DISTINCT FROM p_lease_token THEN RETURN jsonb_build_object('status','stale'); END IF;
 IF o.status<>'pending' THEN RETURN private.suggestion_operation_result(o.id); END IF;
 IF o.lease_expires_at<=checked_at THEN RETURN jsonb_build_object('status','stale'); END IF;
 IF failure IS NULL THEN
   IF EXISTS(SELECT 1 FROM public.battle_prompts WHERE battle_id=o.battle_id AND profile_id=o.profile_id AND round_number=o.round_number AND is_locked) THEN
     failure:='prompt_locked_before_delivery';
   ELSIF b.id IS NULL OR b.status NOT IN ('matched','waiting_for_prompts') OR
     (coalesce(b.format,'single')='single' AND (o.round_number<>1 OR (r.id IS NOT NULL AND r.status<>'waiting_for_prompts') OR
       (CASE WHEN o.profile_id=b.player_one_id THEN b.player_one_prompt_deadline ELSE b.player_two_prompt_deadline END)<=checked_at)) OR
     (b.format='bo3' AND (o.round_number<>coalesce(b.current_round,1) OR r.id IS NULL OR r.status<>'waiting_for_prompts' OR r.lock_in_deadline IS NULL OR r.lock_in_deadline<=checked_at)) THEN
     failure:='round_closed_before_delivery';
   END IF;
 END IF;
 IF failure IS NULL AND o.composition_version=3 AND (NOT private.valid_composition_bank(p_suggestions) OR p_metadata->>'structure_version' IS DISTINCT FROM '2') THEN
   failure:='invalid_completion';
 END IF;
 IF failure IS NULL THEN
   valid:=jsonb_typeof(p_suggestions)='array' AND jsonb_array_length(p_suggestions) BETWEEN 1 AND 3
     AND (coalesce((p_metadata->>'structure_version')::smallint,1)<>2 OR jsonb_array_length(p_suggestions)=3);
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
     PERFORM public.grant_credits(o.profile_id,o.credits_spent,'prompt_suggestions_refund:'||left(failure,80),'refund_'||o.wallet_transaction_id,o.battle_id,NULL,jsonb_build_object('feature','move_prompt_suggestions','operation_id',o.id));
   END IF;
   -- Audit lives in the durable operation; failed text never remains client-readable.
   DELETE FROM public.move_prompt_suggestions WHERE id=o.suggestion_id AND operation_id=o.id;
   UPDATE private.suggestion_operations SET status='failed',suggestion_id=NULL,failure_code=left(failure,80),provider_metadata=p_metadata,
     refunded_at=CASE WHEN credits_spent>0 THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp() WHERE id=o.id;
 END IF;
 RETURN private.suggestion_operation_result(o.id);
END $$;


CREATE OR REPLACE FUNCTION private.suggestion_completion_result(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
 SELECT jsonb_build_object('status',CASE o.status WHEN 'succeeded' THEN 'ready' ELSE o.status END,
  'operation_id',o.id,'context_key',o.context_key,'target',o.target,'composition_version',o.composition_version,
  'result',CASE WHEN o.status='succeeded' THEN o.result ELSE NULL END,'error',o.failure_code,
  'remaining_adaptations',greatest(0,6-(SELECT count(*) FROM private.suggestion_completions q
   WHERE q.profile_id=o.profile_id AND q.battle_id=o.battle_id AND q.round_number=o.round_number AND q.target<>'upgrade_v3'
   AND (q.status='succeeded' OR (q.status='pending' AND q.lease_expires_at>clock_timestamp())))))
 FROM private.suggestion_completions o WHERE o.id=p_id
$$;
CREATE OR REPLACE FUNCTION public.reserve_suggestion_completion(
 p_profile_id uuid,p_battle_id uuid,p_round_number integer,p_move_type public.move_type,p_target text,
 p_action_text text DEFAULT NULL,p_intent_text text DEFAULT NULL,p_suggestion_id uuid DEFAULT NULL,
 p_composition_version integer DEFAULT 3,p_allow_generate boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE b public.battles%ROWTYPE; r public.battle_rounds%ROWTYPE; o private.suggestion_completions%ROWTYPE;
 s public.move_prompt_suggestions%ROWTYPE; context jsonb; key text; cid uuid; used integer; tester boolean;
 action text:=btrim(p_action_text); intent text:=btrim(p_intent_text);
BEGIN
 IF p_profile_id IS NULL OR p_round_number IS NULL OR p_round_number NOT BETWEEN 1 AND 3 OR p_move_type IS NULL
  OR p_target IS NULL OR p_target NOT IN ('intent','approach','upgrade_v3') OR p_composition_version IS DISTINCT FROM 3 THEN
  RETURN jsonb_build_object('error','bad_request'); END IF;
 IF (p_target='upgrade_v3' AND (p_suggestion_id IS NULL OR p_action_text IS NOT NULL OR p_intent_text IS NOT NULL))
  OR (p_target<>'upgrade_v3' AND (p_suggestion_id IS NOT NULL OR action IS NULL OR length(action) NOT BETWEEN 5 AND 240))
  OR (p_target='intent' AND p_intent_text IS NOT NULL)
  OR (p_target='approach' AND (intent IS NULL OR length(intent) NOT BETWEEN 5 AND 180)) THEN
  RETURN jsonb_build_object('error','bad_request'); END IF;
 SELECT * INTO b FROM public.battles WHERE id=p_battle_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 IF p_profile_id IS DISTINCT FROM b.player_one_id AND p_profile_id IS DISTINCT FROM b.player_two_id THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 SELECT * INTO r FROM public.battle_rounds WHERE battle_id=p_battle_id AND round_number=p_round_number FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtext('suggestions:'||p_profile_id::text));
 cid:=CASE WHEN p_profile_id=b.player_one_id THEN b.player_one_character_id ELSE b.player_two_character_id END;
 IF p_target='upgrade_v3' THEN
  SELECT * INTO s FROM public.move_prompt_suggestions WHERE id=p_suggestion_id AND profile_id=p_profile_id
   AND battle_id=p_battle_id AND round_number=p_round_number AND move_type=p_move_type;
  IF NOT FOUND OR s.moderation_status NOT IN ('approved','flagged_human_review') OR s.structure_version<>2 THEN
   RETURN jsonb_build_object('error','suggestion_not_available'); END IF;
 END IF;
 -- The server derives identity from authoritative frozen context, never a client key.
 context:=jsonb_build_object('policy','composition-v3','profile_id',p_profile_id,'battle_id',p_battle_id,
  'round_number',p_round_number,'move_type',p_move_type,'target',p_target,'character_id',cid,
  'theme',b.theme,'situation',r.situation_snapshot,'action',action,'intent',intent,'suggestion_id',p_suggestion_id);
 key:=encode(extensions.digest(convert_to(context::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO o FROM private.suggestion_completions WHERE profile_id=p_profile_id AND context_key=key FOR UPDATE;
 IF FOUND THEN
  IF o.context_snapshot IS DISTINCT FROM context THEN RETURN jsonb_build_object('error','idempotency_conflict'); END IF;
  IF o.status='succeeded' OR (o.status='pending' AND o.lease_expires_at>clock_timestamp()) THEN
   RETURN private.suggestion_completion_result(o.id); END IF;
 END IF;
 -- Already-enriched historical data is readable even after closing a round.
 IF p_target='upgrade_v3' AND private.valid_composition_bank(s.suggestions) THEN
  RETURN jsonb_build_object('status','ready','context_key',key,'target',p_target,'composition_version',3,'result',s.suggestions); END IF;
 IF b.status NOT IN ('matched','waiting_for_prompts') OR
  (coalesce(b.format,'single')='single' AND (p_round_number<>1 OR (r.id IS NOT NULL AND r.status<>'waiting_for_prompts') OR
    (CASE WHEN p_profile_id=b.player_one_id THEN b.player_one_prompt_deadline ELSE b.player_two_prompt_deadline END)<=clock_timestamp())) OR
  (b.format='bo3' AND (p_round_number<>coalesce(b.current_round,1) OR r.id IS NULL OR r.status<>'waiting_for_prompts' OR r.lock_in_deadline IS NULL OR r.lock_in_deadline<=clock_timestamp())) THEN
  RETURN jsonb_build_object('error','round_not_open'); END IF;
 IF EXISTS(SELECT 1 FROM public.battle_prompts WHERE battle_id=p_battle_id AND profile_id=p_profile_id AND round_number=p_round_number AND is_locked) THEN
  RETURN jsonb_build_object('error','prompt_locked'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.characters WHERE id=cid AND profile_id=p_profile_id) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 IF NOT coalesce(p_allow_generate,false) THEN RETURN jsonb_build_object('error','generation_disabled'); END IF;
 IF o.id IS NOT NULL AND o.attempts>=3 THEN
  UPDATE private.suggestion_completions SET status='failed',lease_token=gen_random_uuid(),failure_code='attempts_exhausted',updated_at=clock_timestamp() WHERE id=o.id;
  RETURN private.suggestion_completion_result(o.id); END IF;
 IF p_target<>'upgrade_v3' THEN
  SELECT count(*) INTO used FROM private.suggestion_completions
   WHERE profile_id=p_profile_id AND battle_id=p_battle_id AND round_number=p_round_number AND target<>'upgrade_v3'
    AND (status='succeeded' OR (status='pending' AND lease_expires_at>clock_timestamp())) AND id IS DISTINCT FROM o.id;
  IF used>=6 THEN RETURN jsonb_build_object('error','adaptation_limit_reached','remaining_adaptations',0,'context_key',key); END IF;
 END IF;
 SELECT coalesce(is_test_user,false) INTO tester FROM public.profiles WHERE id=p_profile_id;
 IF NOT coalesce(tester,false) AND private.suggestion_rate_limited(p_profile_id) THEN RETURN jsonb_build_object('error','rate_limited','context_key',key); END IF;
 IF o.id IS NULL THEN
  INSERT INTO private.suggestion_completions(profile_id,battle_id,round_number,move_type,target,context_key,context_snapshot,action_text,intent_text,suggestion_id)
  VALUES(p_profile_id,p_battle_id,p_round_number,p_move_type,p_target,key,context,action,intent,p_suggestion_id) RETURNING * INTO o;
 ELSE
  UPDATE private.suggestion_completions SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',
   status='pending',failure_code=NULL,attempts=attempts+1,updated_at=clock_timestamp() WHERE id=o.id RETURNING * INTO o;
 END IF;
 INSERT INTO private.suggestion_completion_attempts(operation_id,attempt_number,profile_id) VALUES(o.id,o.attempts,p_profile_id);
 RETURN private.suggestion_completion_result(o.id)||jsonb_build_object('status','claimed','lease_token',o.lease_token);
END $$;

CREATE OR REPLACE FUNCTION public.renew_suggestion_completion(p_operation_id uuid,p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
BEGIN
 UPDATE private.suggestion_completions SET lease_expires_at=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
 WHERE id=p_operation_id AND lease_token=p_lease_token AND status='pending' AND lease_expires_at>clock_timestamp();
 RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.finish_suggestion_completion(
 p_operation_id uuid,p_lease_token uuid,p_result jsonb,p_metadata jsonb DEFAULT '{}',p_failure text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE o private.suggestion_completions%ROWTYPE; b public.battles%ROWTYPE; r public.battle_rounds%ROWTYPE;
 s public.move_prompt_suggestions%ROWTYPE; failure text:=p_failure; checked_at timestamptz;
BEGIN
 SELECT * INTO o FROM private.suggestion_completions WHERE id=p_operation_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','stale'); END IF;
 SELECT * INTO b FROM public.battles WHERE id=o.battle_id FOR UPDATE;
 SELECT * INTO r FROM public.battle_rounds WHERE battle_id=o.battle_id AND round_number=o.round_number FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtext('suggestions:'||o.profile_id::text));
 SELECT * INTO o FROM private.suggestion_completions WHERE id=p_operation_id FOR UPDATE;
 checked_at:=clock_timestamp();
 IF NOT FOUND OR o.lease_token IS DISTINCT FROM p_lease_token THEN RETURN jsonb_build_object('status','stale'); END IF;
 IF o.status<>'pending' THEN RETURN private.suggestion_completion_result(o.id); END IF;
 IF o.lease_expires_at<=checked_at THEN RETURN jsonb_build_object('status','stale'); END IF;
 IF failure IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.battle_prompts WHERE battle_id=o.battle_id AND profile_id=o.profile_id AND round_number=o.round_number AND is_locked) THEN
   failure:='prompt_locked_before_delivery';
  ELSIF b.id IS NULL OR b.status NOT IN ('matched','waiting_for_prompts') OR
   (coalesce(b.format,'single')='single' AND (o.round_number<>1 OR (r.id IS NOT NULL AND r.status<>'waiting_for_prompts') OR
     (CASE WHEN o.profile_id=b.player_one_id THEN b.player_one_prompt_deadline ELSE b.player_two_prompt_deadline END)<=checked_at)) OR
   (b.format='bo3' AND (o.round_number<>coalesce(b.current_round,1) OR r.id IS NULL OR r.status<>'waiting_for_prompts' OR r.lock_in_deadline IS NULL OR r.lock_in_deadline<=checked_at)) THEN
   failure:='round_closed_before_delivery';
  END IF;
 END IF;
 IF failure IS NULL THEN
  IF (o.target='intent' AND (jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR NOT private.valid_intent_hints(o.action_text,p_result->'intentHints')))
   OR (o.target='approach' AND (jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR NOT private.valid_approach_hints(o.action_text,o.intent_text,p_result->'approachHints')))
   OR (o.target='upgrade_v3' AND NOT private.valid_composition_bank(p_result)) THEN failure:='invalid_completion'; END IF;
 END IF;
 IF failure IS NULL AND o.target='upgrade_v3' THEN
  SELECT * INTO s FROM public.move_prompt_suggestions WHERE id=o.suggestion_id AND profile_id=o.profile_id
   AND battle_id=o.battle_id AND round_number=o.round_number AND move_type=o.move_type FOR UPDATE;
  IF NOT FOUND OR s.moderation_status NOT IN ('approved','flagged_human_review') THEN failure:='suggestion_not_available';
  ELSIF private.without_composition_approaches(p_result) IS DISTINCT FROM private.without_composition_approaches(s.suggestions) THEN failure:='upgrade_changed_existing_content';
  ELSE
   -- Only additive JSON changes: financial metadata, parent operation and body stay untouched.
   UPDATE public.move_prompt_suggestions SET suggestions=p_result WHERE id=s.id;
  END IF;
 END IF;
 UPDATE private.suggestion_completions SET status=CASE WHEN failure IS NULL THEN 'succeeded' ELSE 'failed' END,
  result=CASE WHEN failure IS NULL THEN p_result ELSE NULL END,failure_code=left(failure,80),
  provider_metadata=coalesce(p_metadata,'{}'),updated_at=clock_timestamp() WHERE id=o.id;
 RETURN private.suggestion_completion_result(o.id);
END $$;

CREATE OR REPLACE FUNCTION public.expire_suggestion_completions() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE candidate record; o private.suggestion_completions%ROWTYPE; bid uuid; rid uuid; expired integer:=0;
BEGIN
 FOR candidate IN SELECT id,battle_id,profile_id,round_number FROM private.suggestion_completions
  WHERE status='pending' AND lease_expires_at<clock_timestamp()-interval '4 minutes'
  ORDER BY battle_id,profile_id,id LIMIT 100 LOOP
  SELECT id INTO bid FROM public.battles WHERE id=candidate.battle_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT id INTO rid FROM public.battle_rounds WHERE battle_id=candidate.battle_id AND round_number=candidate.round_number FOR UPDATE SKIP LOCKED;
  IF NOT FOUND AND EXISTS(SELECT 1 FROM public.battle_rounds WHERE battle_id=candidate.battle_id AND round_number=candidate.round_number) THEN CONTINUE; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('suggestions:'||candidate.profile_id::text)) THEN CONTINUE; END IF;
  SELECT * INTO o FROM private.suggestion_completions WHERE id=candidate.id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR o.status<>'pending' OR o.lease_expires_at>=clock_timestamp()-interval '4 minutes' THEN CONTINUE; END IF;
  UPDATE private.suggestion_completions SET lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds'
   WHERE id=o.id RETURNING * INTO o;
  PERFORM public.finish_suggestion_completion(o.id,o.lease_token,NULL,'{}','worker_expired');
  expired:=expired+1;
 END LOOP;
 RETURN expired;
END $$;

REVOKE ALL ON FUNCTION private.suggestion_rate_limited(uuid),private.suggestion_operation_result(uuid),
 private.valid_approach_hints(text,text,jsonb),private.valid_intent_hints(text,jsonb),private.valid_composition_bank(jsonb),
 private.without_composition_approaches(jsonb),private.suggestion_completion_result(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_suggestion_operation(uuid,uuid,integer,public.move_type,text,text,integer,text,boolean,boolean,integer),
 public.reserve_suggestion_completion(uuid,uuid,integer,public.move_type,text,text,text,uuid,integer,boolean),
 public.renew_suggestion_completion(uuid,uuid),public.finish_suggestion_completion(uuid,uuid,jsonb,jsonb,text),
 public.expire_suggestion_completions() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_suggestion_operation(uuid,uuid,integer,public.move_type,text,text,integer,text,boolean,boolean,integer),
 public.reserve_suggestion_completion(uuid,uuid,integer,public.move_type,text,text,text,uuid,integer,boolean),
 public.renew_suggestion_completion(uuid,uuid),public.finish_suggestion_completion(uuid,uuid,jsonb,jsonb,text),
 public.expire_suggestion_completions() TO service_role;
SELECT cron.schedule('expire-suggestion-completions','* * * * *','SELECT public.expire_suggestion_completions()');

-- Repeated events use a separate additive table. The original aggregate PK and
-- deployed endpoint ON CONFLICT target stay valid throughout backend rollout.
CREATE TABLE IF NOT EXISTS public.composer_event_occurrences (
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 battle_id uuid NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
 round_number integer NOT NULL CHECK(round_number BETWEEN 1 AND 3),
 session_id uuid NOT NULL,
 event text NOT NULL CHECK(event IN ('composer_approach_selected','composer_step_next','composer_step_back',
  'composer_adaptation_requested','composer_adaptation_ready','composer_adaptation_failed')),
 sequence_number integer NOT NULL CHECK(sequence_number BETWEEN 1 AND 10000),
 duration_ms integer NOT NULL CHECK(duration_ms BETWEEN 0 AND 86400000),
 choice text CHECK(choice IN ('builder','write','suggestion','custom','free','paid')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id,battle_id,round_number,session_id,event,sequence_number)
);
ALTER TABLE public.composer_event_occurrences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.composer_event_occurrences FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.composer_event_occurrences TO authenticated;
GRANT ALL ON public.composer_event_occurrences TO service_role;
DROP POLICY IF EXISTS composer_event_occurrences_read_own ON public.composer_event_occurrences;
CREATE POLICY composer_event_occurrences_read_own ON public.composer_event_occurrences FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS composer_event_occurrences_created_at ON public.composer_event_occurrences(created_at);
DROP TRIGGER IF EXISTS keep_composer_occurrence_duration ON public.composer_event_occurrences;
CREATE TRIGGER keep_composer_occurrence_duration BEFORE UPDATE ON public.composer_event_occurrences
 FOR EACH ROW EXECUTE FUNCTION public.keep_composer_event_duration();
