-- Provider health is separate from per-item retry eligibility.
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS failed_provider_model text;
ALTER TABLE public.appeals ADD COLUMN IF NOT EXISTS provider_unavailable_until timestamptz;
CREATE INDEX IF NOT EXISTS appeals_provider_cooldown ON public.appeals(failed_provider_model,provider_unavailable_until)
 WHERE review_status='retryable_failure' AND failed_provider_model IS NOT NULL;
CREATE OR REPLACE FUNCTION public.fail_independent_appeal(p_appeal_id uuid,p_token uuid,p_error text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE appeals SET review_status='retryable_failure',last_error=left(p_error,500),
  retry_after=now()+interval '10 minutes'*power(2,least(5,greatest(0,attempts-1))),
  lease_expires_at=NULL,failed_provider_model=NULL,provider_unavailable_until=NULL
 WHERE id=p_appeal_id AND review_status='processing' AND lease_token=p_token;
$$;
-- Old callers fail as item-specific, which is conservative for unknown failure causes.
CREATE OR REPLACE FUNCTION public.fail_independent_appeal_classified(
 p_appeal_id uuid,p_token uuid,p_error text,p_failed_provider_model text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM appeals WHERE id=p_appeal_id AND review_status='processing' AND lease_token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF;
 PERFORM fail_independent_appeal(p_appeal_id,p_token,p_error);
 IF nullif(trim(p_failed_provider_model),'') IS NOT NULL THEN
  UPDATE appeals SET failed_provider_model=trim(p_failed_provider_model),provider_unavailable_until=now()+interval '10 minutes' WHERE id=p_appeal_id;
 END IF;
END;$$;
REVOKE ALL ON FUNCTION public.fail_independent_appeal(uuid,uuid,text),public.fail_independent_appeal_classified(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_independent_appeal(uuid,uuid,text),public.fail_independent_appeal_classified(uuid,uuid,text,text) TO service_role;
