-- Three free draft portrait re-rolls, and a welcome grant so the fourth is a
-- real choice rather than a dead end.
--
-- Draft re-rolls were uncapped ("as many times as it likes"), and each one now
-- renders two images, so character creation was an unbounded 2-image path open
-- to anyone who opened the flow.
--
-- A hard cap of one would be worse than the cost: the render is
-- non-deterministic, so one-and-done means a player's first impression of the
-- game is a character they may dislike and cannot change without paying. Three
-- matches PORTRAIT_HISTORY_LIMIT, so a player generates exactly the set the app
-- is able to remember and restore between.
--
-- The fourth costs `render_look` like every other render. That only works
-- because of the grant below: there was NO signup credit of any kind, so a new
-- player reached creation with zero and the paywall would have been a wall.

--------------------------------------------------------------------------------
-- FREE ALLOWANCE
--------------------------------------------------------------------------------

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS draft_portrait_renders INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN characters.draft_portrait_renders IS
  'Portrait renders spent during creation. The first DRAFT_FREE_RENDERS (3) are free; beyond that generate-portrait charges render_look. Server-owned.';

-- Existing drafts keep whatever allowance they have left rather than being
-- retroactively charged for renders they were told were free.
UPDATE characters SET draft_portrait_renders = 0 WHERE finalized_at IS NULL;

--------------------------------------------------------------------------------
-- WELCOME GRANT
--------------------------------------------------------------------------------
-- handle_new_user created a profile and nothing else, so every new account
-- started on zero credits and could not try a single paid feature: a render is
-- 3, a custom item 3, a video upgrade 1, and the only free income is roughly one
-- credit a day from logging in.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  generated_username TEXT;
  generated_display_name TEXT;
BEGIN
  generated_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 15);
  generated_display_name := left(
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), ''), 'Player'),
    40
  );

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, generated_username, generated_display_name)
  ON CONFLICT (id) DO NOTHING;

  -- Never let a credit grant block account creation. This trigger fires on
  -- auth.users INSERT, so an exception here fails the signup itself -- the one
  -- outcome strictly worse than starting with no credits.
  BEGIN
    PERFORM public.grant_credits(
      NEW.id,
      10,
      'welcome_grant',
      'welcome_' || NEW.id::text,
      NULL,
      NULL,
      jsonb_build_object('source', 'signup')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'welcome grant failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: existing players never had the chance to receive this. The
-- idempotency key is per profile, so re-running grants nobody a second one.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT id FROM public.profiles LOOP
    BEGIN
      PERFORM public.grant_credits(
        p.id, 10, 'welcome_grant', 'welcome_' || p.id::text,
        NULL, NULL, jsonb_build_object('source', 'backfill')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'welcome backfill failed for %: %', p.id, SQLERRM;
    END;
  END LOOP;
END $$;
