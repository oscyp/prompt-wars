-- Phase 3, AFTER deploying the compatible round-resolve/matchmaking consumers.
-- Do not deploy this default flip with the additive schema before those consumers.
-- Existing rows (including waiting queues and invitations) are never updated.
DO $$ BEGIN
 IF (SELECT count(*) FROM private.bot_tactic_catalog WHERE catalog_version=1)<>45 THEN
   RAISE EXCEPTION 'Private bot catalogue is incomplete';
 END IF;
END $$;
ALTER TABLE public.battles ALTER COLUMN bot_policy_version SET DEFAULT 2;
