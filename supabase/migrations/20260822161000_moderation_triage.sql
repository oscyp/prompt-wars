-- ============================================================================
-- Moderation triage: make the 24h report SLA something a human can act on
-- ============================================================================
--
-- What was wrong
-- --------------
-- report-intake writes `reports` rows with `due_at = now() + 24h`
-- (report-intake/index.ts:142-155) and NOTHING ever reads them. There is no
-- triage function, no cron job, no admin surface. `moderation_events` is
-- likewise write-only. Verified on the live project: one report has been
-- sitting in `pending` unread.
--
-- The concept doc (§22) commits to a 24-hour human review SLA, and App Store
-- guideline 1.2 expects UGC reports to be acted on. Today the honest answer to
-- "who actions reports?" is nobody.
--
-- What this adds
-- --------------
--   * `moderation_queue` -- a service-role view over pending reports, oldest
--     due first, with an is_overdue flag and the reported content joined in so
--     a reviewer sees the prompt text without running their own query.
--   * `resolve_report()` -- records the decision atomically and, when the
--     decision is to uphold, applies the block so the reporter is protected.
--   * `overdue_report_count()` -- a single number for alerting.
--
-- This is deliberately a backend operator surface (Supabase Studio + the
-- moderation-queue Edge Function), not an in-app admin console. It is the
-- smallest thing that converts an unbacked public commitment into a
-- demonstrable process.
--
-- Notes:
--   * Status vocabulary is the one already in the schema comment at
--     20260506110000_economy_video_social_schema.sql:283:
--     pending | reviewed | actioned | dismissed.
--   * The view is service_role only. Reports contain both parties' identities
--     and the reported content, so it must never be client-readable.
--   * `reviewed_by` references auth.users; for automated/system decisions it
--     stays NULL and the decision is still recorded.
--
-- Idempotent: CREATE OR REPLACE throughout; view has a fixed column list.
-- ============================================================================

CREATE OR REPLACE VIEW public.moderation_queue
WITH (security_invoker = true) AS
SELECT
  r.id                AS report_id,
  r.created_at,
  r.due_at,
  (r.due_at < NOW())  AS is_overdue,
  r.status,
  r.reason,
  r.description,
  r.reported_type,
  r.reported_id,
  r.reported_profile_id,
  r.reporter_profile_id,
  -- Prompt text for a battle report, so the reviewer has the actual content.
  (
    SELECT string_agg(bp.custom_prompt_text, E'\n---\n' ORDER BY bp.created_at)
    FROM battle_prompts bp
    WHERE r.reported_type = 'battle'
      AND bp.battle_id = r.reported_id
      AND bp.custom_prompt_text IS NOT NULL
  ) AS reported_prompt_text
FROM public.reports r
WHERE r.status = 'pending'
ORDER BY r.due_at ASC;

COMMENT ON VIEW public.moderation_queue IS
  'Service-role triage queue: pending reports, oldest SLA deadline first. '
  'Contains both parties'' identities and the reported content -- never grant '
  'this to anon or authenticated.';

REVOKE ALL ON public.moderation_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.moderation_queue TO service_role;

-- ----------------------------------------------------------------------------
-- Resolve a report
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_report(
  p_report_id   UUID,
  p_decision    TEXT,                 -- 'actioned' | 'dismissed'
  p_reviewer_id UUID DEFAULT NULL,
  p_apply_block BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r          RECORD;
  v_blocked  BOOLEAN := FALSE;
BEGIN
  IF p_decision NOT IN ('actioned', 'dismissed', 'reviewed') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  SELECT * INTO r FROM reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  IF r.status <> 'pending' THEN
    -- Idempotent: a double-click or retried request must not re-apply a block.
    RETURN jsonb_build_object(
      'already_resolved', TRUE,
      'status', r.status,
      'blocked', FALSE
    );
  END IF;

  -- Upholding a report should protect the reporter from the reported player.
  IF p_apply_block
     AND r.reported_profile_id IS NOT NULL
     AND r.reporter_profile_id IS NOT NULL
     AND r.reported_profile_id <> r.reporter_profile_id
  THEN
    INSERT INTO blocks (blocker_profile_id, blocked_profile_id)
    VALUES (r.reporter_profile_id, r.reported_profile_id)
    ON CONFLICT DO NOTHING;
    v_blocked := TRUE;
  END IF;

  UPDATE reports
  SET status      = p_decision,
      reviewed_by = p_reviewer_id,
      reviewed_at = NOW()
  WHERE id = p_report_id;

  RETURN jsonb_build_object(
    'already_resolved', FALSE,
    'status', p_decision,
    'blocked', v_blocked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_report(UUID, TEXT, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_report(UUID, TEXT, UUID, BOOLEAN)
  TO service_role;

-- ----------------------------------------------------------------------------
-- SLA alerting hook
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.overdue_report_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT count(*)::INTEGER
  FROM public.reports
  WHERE status = 'pending' AND due_at < NOW();
$$;

COMMENT ON FUNCTION public.overdue_report_count() IS
  'Reports past the §22 24-hour review SLA. Intended as an alerting probe.';

REVOKE ALL ON FUNCTION public.overdue_report_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overdue_report_count() TO service_role;
