-- Additive durable state: retain the legacy enum for old readers.
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending'
 CHECK (review_status IN ('pending','processing','retryable_failure','upheld','overturned','no_contest'));
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS original_resolution jsonb;
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS reviewed_round_results jsonb;
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS review_metadata jsonb;
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS review_call_log jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.appeals SET review_status=CASE status::text WHEN 'resolved_upheld' THEN 'upheld' WHEN 'resolved_overturned' THEN 'overturned' ELSE 'pending' END
 WHERE review_status='pending' AND status::text<>'pending';
CREATE UNIQUE INDEX IF NOT EXISTS appeals_one_new_review_per_battle ON public.appeals(battle_id) WHERE original_resolution IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.appeal_rating_corrections (
 appeal_id uuid NOT NULL REFERENCES public.appeals(id),profile_id uuid NOT NULL REFERENCES public.profiles(id),
 delta numeric NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(appeal_id,profile_id)
);
ALTER TABLE public.appeal_rating_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appeal_rating_corrections FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.appeal_rating_corrections TO service_role;
DROP POLICY IF EXISTS appeals_select_own ON public.appeals;
CREATE POLICY appeals_participant_read ON public.appeals FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.battles b WHERE b.id=battle_id AND auth.uid() IN(b.player_one_id,b.player_two_id))
);
GRANT SELECT ON public.appeals TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.appeals FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.can_appeal(p_profile_id uuid,p_battle_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM battles b WHERE b.id=p_battle_id AND p_profile_id IN(b.player_one_id,b.player_two_id)
  AND b.mode='ranked' AND NOT b.is_player_two_bot AND b.completed_at IS NOT NULL
  AND b.winner_id IS NOT NULL AND b.winner_id<>p_profile_id
  AND coalesce(b.score_payload->>'resolution','') NOT IN ('forfeit','series_abandoned')
  AND NOT EXISTS(SELECT 1 FROM appeals a WHERE a.battle_id=b.id)
  AND NOT EXISTS(SELECT 1 FROM appeals a WHERE a.profile_id=p_profile_id AND a.created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'));
$$;
CREATE OR REPLACE FUNCTION public.submit_independent_appeal(p_battle_id uuid,p_profile_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b battles%ROWTYPE;a uuid;
BEGIN
 -- Serialize same-battle and same-profile submissions; repeat submissions return the original ID.
 SELECT * INTO b FROM battles WHERE id=p_battle_id FOR UPDATE;
 IF NOT FOUND OR p_profile_id IS NULL OR NOT (p_profile_id=b.player_one_id OR p_profile_id IS NOT DISTINCT FROM b.player_two_id) THEN RAISE EXCEPTION 'Not a participant'; END IF;
 SELECT id INTO a FROM appeals WHERE battle_id=p_battle_id ORDER BY created_at LIMIT 1;
 IF a IS NOT NULL THEN RETURN a;END IF;
 PERFORM 1 FROM profiles WHERE id=p_profile_id FOR UPDATE;
 IF NOT can_appeal(p_profile_id,p_battle_id) THEN RAISE EXCEPTION 'Appeal unavailable or daily allowance used';END IF;
 INSERT INTO appeals(battle_id,profile_id,original_winner_id,original_resolution)
 VALUES(b.id,p_profile_id,b.winner_id,to_jsonb(b)) RETURNING id INTO a;
 RETURN a;
END;$$;
CREATE OR REPLACE FUNCTION public.claim_independent_appeal(p_appeal_id uuid,p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a appeals%ROWTYPE;
BEGIN
 UPDATE appeals SET review_status='processing',lease_token=p_token,lease_expires_at=now()+interval '15 minutes',attempts=attempts+1,last_error=NULL
 WHERE id=p_appeal_id
 AND id=(SELECT first_appeal.id FROM appeals first_appeal WHERE first_appeal.battle_id=appeals.battle_id ORDER BY first_appeal.created_at,first_appeal.id LIMIT 1)
 AND (review_status IN('pending','retryable_failure') OR (review_status='processing' AND lease_expires_at<now()))
 RETURNING * INTO a;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN to_jsonb(a);
END;$$;
CREATE OR REPLACE FUNCTION public.fail_independent_appeal(p_appeal_id uuid,p_token uuid,p_error text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE appeals SET review_status='retryable_failure',last_error=left(p_error,500),lease_expires_at=now()+interval '10 minutes'
 WHERE id=p_appeal_id AND review_status='processing' AND lease_token=p_token;
$$;
CREATE OR REPLACE FUNCTION public.finalize_independent_appeal(p_appeal_id uuid,p_token uuid,p_review jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a appeals%ROWTYPE;b battles%ROWTYPE;pid uuid;new_winner uuid;state text;correction numeric;
 old_counted boolean;new_counted boolean;r record;streak integer;best integer;bid uuid;
BEGIN
 -- All resolution paths lock parent battle before its dependent records and profiles.
 SELECT battle_id INTO bid FROM appeals WHERE id=p_appeal_id;
 SELECT * INTO b FROM battles WHERE id=bid FOR UPDATE;
 SELECT * INTO a FROM appeals WHERE id=p_appeal_id FOR UPDATE;
 IF NOT FOUND OR b.adjudication_revision>coalesce((a.original_resolution->>'adjudication_revision')::integer,0) OR a.review_status<>'processing' OR a.lease_token IS DISTINCT FROM p_token OR a.lease_expires_at<now() THEN RETURN false;END IF;
 state:=p_review->>'status';
 IF state NOT IN('upheld','overturned','no_contest') THEN RAISE EXCEPTION 'Invalid terminal state';END IF;
 new_winner:=CASE p_review->>'winner' WHEN '1' THEN b.player_one_id WHEN '2' THEN b.player_two_id ELSE NULL END;
 IF state='no_contest' THEN new_winner:=NULL;END IF;
 PERFORM 1 FROM profiles WHERE id IN(b.player_one_id,b.player_two_id) ORDER BY id FOR UPDATE;
 old_counted:=NOT(b.mode='ranked' AND (coalesce(b.score_payload->>'mock_assisted','false')='true' OR coalesce(b.score_payload->>'competitive_eligible','true')='false'));
 new_counted:=old_counted AND state<>'no_contest';
 IF state<>'upheld' THEN
  FOR pid IN SELECT id FROM profiles WHERE id IN(b.player_one_id,b.player_two_id) ORDER BY id LOOP
   correction:=-coalesce((b.rating_delta_payload->pid::text->>'delta')::numeric,0);
   INSERT INTO appeal_rating_corrections(appeal_id,profile_id,delta) VALUES(a.id,pid,correction) ON CONFLICT DO NOTHING;
   IF FOUND THEN UPDATE profiles SET rating=rating+correction WHERE id=pid;END IF;
   UPDATE profiles SET
    wins=wins-(CASE WHEN old_counted AND b.winner_id=pid THEN 1 ELSE 0 END)+(CASE WHEN new_counted AND new_winner=pid THEN 1 ELSE 0 END),
    losses=losses-(CASE WHEN old_counted AND NOT b.is_draw AND b.winner_id IS DISTINCT FROM pid THEN 1 ELSE 0 END)+(CASE WHEN new_counted AND NOT coalesce((p_review->>'isDraw')::boolean,false) AND new_winner IS DISTINCT FROM pid THEN 1 ELSE 0 END),
    draws=draws-(CASE WHEN old_counted AND b.is_draw THEN 1 ELSE 0 END)+(CASE WHEN new_counted AND coalesce((p_review->>'isDraw')::boolean,false) THEN 1 ELSE 0 END)
   WHERE id=pid;
  END LOOP;
 END IF;
 UPDATE battles SET winner_id=new_winner,is_draw=coalesce((p_review->>'isDraw')::boolean,false),
  adjudication_revision=adjudication_revision+1,
  score_payload=coalesce(score_payload,'{}')||coalesce(p_review->'rounds'->-1->'judge','{}'::jsonb)||jsonb_build_object('mock_assisted',coalesce((score_payload->>'mock_assisted')::boolean,false),'competitive_eligible',coalesce((score_payload->>'competitive_eligible')::boolean,true),'appeal_status',state,'no_contest',state='no_contest','rating_gated',CASE WHEN state<>'upheld' THEN 'appeal_correction' ELSE score_payload->>'rating_gated' END),
  rating_delta_payload=CASE WHEN state='upheld' THEN rating_delta_payload ELSE NULL END,
  resolution_metadata=p_review,
  player_one_hp=CASE WHEN format='bo3' THEN (p_review->>'playerOneHp')::integer ELSE player_one_hp END,
  player_two_hp=CASE WHEN format='bo3' THEN (p_review->>'playerTwoHp')::integer ELSE player_two_hp END,
  player_one_rounds_won=CASE WHEN format='bo3' THEN (p_review->>'playerOneWins')::integer ELSE player_one_rounds_won END,
  player_two_rounds_won=CASE WHEN format='bo3' THEN (p_review->>'playerTwoWins')::integer ELSE player_two_rounds_won END
 WHERE id=b.id;
 IF state<>'upheld' THEN
  -- Replay record-bearing completions in durable chronological order. Draws retain streak.
  -- Practice/casual historically update records too; mock ranked exhibitions do not.
  FOR pid IN SELECT id FROM profiles WHERE id IN(b.player_one_id,b.player_two_id) ORDER BY id LOOP
   streak:=0;best:=0;
   FOR r IN SELECT winner_id,is_draw FROM battles x WHERE pid IN(x.player_one_id,x.player_two_id)
    AND x.completed_at IS NOT NULL AND x.status IN('result_ready','generating_video','completed')
    AND coalesce(x.score_payload->>'no_contest','false')<>'true'
    AND NOT(x.mode='ranked' AND (coalesce(x.score_payload->>'mock_assisted','false')='true' OR coalesce(x.score_payload->>'competitive_eligible','true')='false'))
    ORDER BY x.completed_at,x.id LOOP
    IF r.winner_id=pid THEN streak:=streak+1;best:=greatest(best,streak);ELSIF NOT r.is_draw THEN streak:=0;END IF;
   END LOOP;
   UPDATE profiles SET current_streak=streak,best_streak=best WHERE id=pid;
  END LOOP;
 END IF;
 UPDATE appeals SET review_status=state,status=CASE WHEN state='upheld' THEN 'resolved_upheld'::appeal_status ELSE 'resolved_overturned'::appeal_status END,
 original_resolution=coalesce(original_resolution,to_jsonb(b)),reviewed_round_results=p_review->'rounds',review_metadata=p_review,
 appeal_winner_id=new_winner,rating_reverted=state<>'upheld',resolved_at=now(),lease_expires_at=NULL WHERE id=a.id;
 RETURN true;
END;$$;
REVOKE ALL ON FUNCTION public.submit_appeal(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.resolve_appeal(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.can_appeal(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_appeal(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.submit_independent_appeal(uuid,uuid),public.claim_independent_appeal(uuid,uuid),public.fail_independent_appeal(uuid,uuid,text),public.finalize_independent_appeal(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_independent_appeal(uuid,uuid),public.claim_independent_appeal(uuid,uuid),public.fail_independent_appeal(uuid,uuid,text),public.finalize_independent_appeal(uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.append_appeal_call(p_appeal_id uuid,p_token uuid,p_call jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE appeals SET review_call_log=review_call_log||jsonb_build_array(p_call)
 WHERE id=p_appeal_id AND lease_token=p_token AND review_status='processing' AND lease_expires_at>now();
 RETURN FOUND;
END;$$;
REVOKE ALL ON FUNCTION public.append_appeal_call(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_appeal_call(uuid,uuid,jsonb) TO service_role;
