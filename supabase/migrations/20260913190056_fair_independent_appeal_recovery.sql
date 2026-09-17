-- Canonical selection and direct claim use one eligibility definition.
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS retry_after timestamptz;
UPDATE public.appeals SET retry_after=coalesce(lease_expires_at,created_at)
 WHERE review_status='retryable_failure' AND retry_after IS NULL;
CREATE INDEX IF NOT EXISTS appeals_recovery_due ON public.appeals(review_status,retry_after,lease_expires_at,created_at);
CREATE OR REPLACE FUNCTION public.due_independent_appeal_candidates()
RETURNS TABLE(id uuid,due_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT a.id,CASE WHEN a.review_status='processing' THEN a.lease_expires_at ELSE coalesce(a.retry_after,a.created_at) END
 FROM appeals a
 WHERE ((a.review_status IN ('pending','retryable_failure') AND coalesce(a.retry_after,a.created_at)<=now())
  OR (a.review_status='processing' AND a.lease_expires_at<=now()))
 AND NOT EXISTS (SELECT 1 FROM appeals first_appeal WHERE first_appeal.battle_id=a.battle_id
  AND (first_appeal.created_at,first_appeal.id)<(a.created_at,a.id));
$$;
CREATE OR REPLACE FUNCTION public.list_due_independent_appeals(p_limit integer DEFAULT 10)
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT c.id FROM due_independent_appeal_candidates() c ORDER BY c.due_at,c.id LIMIT greatest(1,least(10,coalesce(p_limit,10)));
$$;
CREATE OR REPLACE FUNCTION public.claim_independent_appeal(p_appeal_id uuid,p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a appeals%ROWTYPE;
BEGIN
 -- Lock before evaluating the shared eligibility query: a second worker must see
 -- the first worker's committed lease, not a candidate from an earlier snapshot.
 SELECT * INTO a FROM appeals WHERE id=p_appeal_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM due_independent_appeal_candidates() c WHERE c.id=p_appeal_id) THEN RETURN NULL;END IF;
 UPDATE appeals SET review_status='processing',lease_token=p_token,lease_expires_at=now()+interval '15 minutes',
  attempts=attempts+1,last_error=NULL,retry_after=NULL WHERE id=p_appeal_id RETURNING * INTO a;
 RETURN to_jsonb(a);
END;$$;
CREATE OR REPLACE FUNCTION public.fail_independent_appeal(p_appeal_id uuid,p_token uuid,p_error text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE appeals SET review_status='retryable_failure',last_error=left(p_error,500),
  retry_after=now()+interval '10 minutes'*power(2,least(5,greatest(0,attempts-1))),
  lease_expires_at=now()+interval '10 minutes'*power(2,least(5,greatest(0,attempts-1)))
 WHERE id=p_appeal_id AND review_status='processing' AND lease_token=p_token;
$$;
REVOKE ALL ON FUNCTION public.due_independent_appeal_candidates(),public.list_due_independent_appeals(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.due_independent_appeal_candidates(),public.list_due_independent_appeals(integer) TO service_role;
REVOKE ALL ON FUNCTION public.claim_independent_appeal(uuid,uuid),public.fail_independent_appeal(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_independent_appeal(uuid,uuid),public.fail_independent_appeal(uuid,uuid,text) TO service_role;
