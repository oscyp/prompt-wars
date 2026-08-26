-- ============================================================================
-- Give character portraits an image KIND: 'fighter' (full-body) + 'avatar'
-- ============================================================================
--
-- Why
-- ---
-- A character has one image today and it is already a full-body render:
-- `_shared/portrait-prompt-resolver.ts:126` forces "full-body ... head to toe
-- including feet ... no crop" for all eight art styles. The round avatars in
-- battle strips are a CSS crop of that same image
-- (`PortraitPreview variant="circle"`), not a purpose-made portrait.
--
-- We now want two real images per character:
--   fighter -- the existing full-body render. Reveal poster, edit screen, and
--              the reference image handed to AI video generation.
--   avatar  -- a new head/bust render for strips, rings and small contexts.
--
-- What blocks that today
-- ----------------------
-- `idx_character_portraits_current` is UNIQUE on (character_id) WHERE
-- is_current, so a second live image per character is impossible. The index is
-- replaced with (character_id, kind).
--
-- No backfill statement is needed. `ADD COLUMN NOT NULL DEFAULT 'fighter'`
-- stamps every existing row correctly, because every existing row IS a
-- full-body render. On PG11+ a constant default is metadata-only, no rewrite.
--
-- Why two pointer columns on `characters` rather than one kind-agnostic one
-- ------------------------------------------------------------------------
-- `characters.portrait_id` is read by `regenerate-portrait/index.ts:346-349`
-- (history builder) and by the edit screen, neither of which has any concept of
-- kind. Repointing it would silently change what "the portrait" means in code
-- that cannot express the distinction. `portrait_id` therefore keeps meaning
-- "current FIGHTER", and `avatar_portrait_id` is added alongside -- every
-- existing read stays correct with zero edits.
--
-- `portrait_history` stays fighter-only: it is write-only in this codebase
-- (written at regenerate-portrait:346, read nowhere), so a kind dimension there
-- buys nothing.
--
-- Opponent RLS is narrowed to avatars
-- -----------------------------------
-- `character_portraits_select_opponent_current` matches any is_current row, so
-- once a second kind exists it would expose the full-body fighter render -- the
-- video reference and reveal asset -- to the opponent. Narrowing is a strict
-- reduction and breaks nothing: no client code selects an opponent's portrait
-- row, and both cross-participant paths (`sign-battle-portraits`, the reveal
-- payload) run service-role and bypass RLS.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, guarded ADD CONSTRAINT,
-- CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS, ON CONFLICT DO NOTHING.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The kind dimension
-- ----------------------------------------------------------------------------

ALTER TABLE public.character_portraits
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'fighter';

DO $$ BEGIN
  ALTER TABLE public.character_portraits
    ADD CONSTRAINT character_portraits_kind_check
    CHECK (kind IN ('fighter', 'avatar'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.character_portraits.kind IS
  'fighter = full-body render (reveal poster, video reference). '
  'avatar = head/bust render (battle strips, rings). One current row per kind.';

-- Replace the single-current index with a per-kind one. Both statements live in
-- the same migration so there is never a committed state without a uniqueness
-- guarantee. Not CONCURRENTLY: Supabase migrations run in a transaction.
DROP INDEX IF EXISTS idx_character_portraits_current;

CREATE UNIQUE INDEX IF NOT EXISTS idx_character_portraits_current_kind
  ON public.character_portraits (character_id, kind)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_character_portraits_character_kind
  ON public.character_portraits (character_id, kind);

-- ----------------------------------------------------------------------------
-- 2. Sibling pointer on characters
-- ----------------------------------------------------------------------------

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS avatar_portrait_id UUID
    REFERENCES public.character_portraits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_characters_avatar_portrait_id
  ON public.characters (avatar_portrait_id)
  WHERE avatar_portrait_id IS NOT NULL;

COMMENT ON COLUMN public.characters.portrait_id IS
  'Current FIGHTER (full-body) portrait. See avatar_portrait_id for the '
  'head/bust image. Deliberately kind-specific: existing readers have no kind '
  'concept and must keep resolving the full-body render.';

COMMENT ON COLUMN public.characters.avatar_portrait_id IS
  'Current AVATAR (head/bust) portrait, or NULL when one has not been '
  'generated. Consumers must fall back to the fighter render.';

-- ----------------------------------------------------------------------------
-- 3. Job provenance
-- ----------------------------------------------------------------------------

-- A NEW column, not a reuse of portrait_jobs.kind -- that one means
-- 'initial' | 'regenerate' and carries its own CHECK.
ALTER TABLE public.portrait_jobs
  ADD COLUMN IF NOT EXISTS portrait_kind TEXT NOT NULL DEFAULT 'fighter';

DO $$ BEGIN
  ALTER TABLE public.portrait_jobs
    ADD CONSTRAINT portrait_jobs_portrait_kind_check
    CHECK (portrait_kind IN ('fighter', 'avatar'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 4. Pricing for avatar generation
-- ----------------------------------------------------------------------------

-- initial_avatar is free: the fighter render is already paid for at creation,
-- and charging for the first avatar would make the strips look broken until a
-- player happened to spend a credit.
INSERT INTO public.character_edit_prices (edit_kind, credits, cooldown_seconds)
VALUES
  ('initial_avatar',    0, 0),
  ('regenerate_avatar', 1, 0)
ON CONFLICT (edit_kind) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Opponents may see the avatar, never the fighter render
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS character_portraits_select_opponent_current
  ON public.character_portraits;

CREATE POLICY character_portraits_select_opponent_current
  ON public.character_portraits
  FOR SELECT TO authenticated
  USING (
    is_current = TRUE
    AND kind = 'avatar'
    AND EXISTS (
      SELECT 1 FROM battles b
      WHERE (b.player_one_character_id = character_portraits.character_id
             OR b.player_two_character_id = character_portraits.character_id)
        AND (b.player_one_id = auth.uid() OR b.player_two_id = auth.uid())
    )
  );

COMMENT ON POLICY character_portraits_select_opponent_current
  ON public.character_portraits IS
  'Opponents may see the AVATAR row only. The fighter render is the video '
  'reference and reveal asset and stays owner-only. Note this exposes the row, '
  'not the bytes -- storage RLS still keys on the owner uid in the path.';
