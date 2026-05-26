--------------------------------------------------------------------------------
-- BATTLE ROUNDS + VIDEO JOBS REALTIME PUBLICATION
--------------------------------------------------------------------------------
-- Mobile clients subscribe to battle_rounds for round state changes and to
-- video_jobs (joined via battle_rounds.cinematic_video_job_id) to observe
-- cinematic generation progress. Postgres lacks a native IF NOT EXISTS guard
-- on ALTER PUBLICATION ... ADD TABLE, so wrap each statement in a DO block
-- that swallows the duplicate_object error for safe re-runs.
--------------------------------------------------------------------------------

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE battle_rounds;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE video_jobs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
