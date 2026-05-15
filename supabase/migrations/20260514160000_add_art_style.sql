-- Adds art_style enum column and portrait_history to characters.
-- art_style drives the portrait prompt style scaffold (painterly, anime, etc).
-- portrait_history retains the last 3 portrait pointers for free revert.

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS art_style TEXT NOT NULL DEFAULT 'painterly'
    CHECK (art_style IN (
      'painterly',
      'anime',
      'comic',
      'pixel',
      'oil',
      'lowpoly',
      'darkfantasy',
      'vaporwave'
    )),
  ADD COLUMN IF NOT EXISTS portrait_history JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.characters.art_style IS
  'Selected art style key; drives portrait prompt scaffold. See _shared/portrait-prompt-resolver.ts.';
COMMENT ON COLUMN public.characters.portrait_history IS
  'Last 3 prior portraits as [{portrait_id, created_at}]; tap-to-revert is free.';
