-- Prompt Wars Phase 1: Expanded Character Creation
-- Adds vibe/silhouette/era/expression/palette traits, signature items,
-- AI-generated portraits, per-edit pricing, and edit history.

--------------------------------------------------------------------------------
-- CATALOG: SIGNATURE ITEMS
--------------------------------------------------------------------------------

CREATE TABLE signature_items_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  item_class TEXT NOT NULL CHECK (
    item_class IN ('tool','symbol','weaponized_mundane','relic','instrument')
  ),
  archetype_affinity archetype[],
  image_path TEXT,
  prompt_fragment TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  min_subscription_tier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signature_items_catalog_active
  ON signature_items_catalog(is_active) WHERE is_active = TRUE;

--------------------------------------------------------------------------------
-- USER-SCOPED: SIGNATURE ITEMS (catalog instances + custom)
--------------------------------------------------------------------------------

CREATE TABLE signature_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  catalog_id UUID REFERENCES signature_items_catalog(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('catalog','custom')),
  item_class TEXT NOT NULL CHECK (
    item_class IN ('tool','symbol','weaponized_mundane','relic','instrument')
  ),
  name TEXT NOT NULL,
  description TEXT,
  prompt_fragment TEXT NOT NULL,
  image_path TEXT,
  moderation_status moderation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT signature_items_kind_shape CHECK (
    (kind = 'catalog' AND catalog_id IS NOT NULL AND profile_id IS NULL) OR
    (kind = 'custom'  AND profile_id IS NOT NULL AND catalog_id IS NULL)
  )
);

CREATE INDEX idx_signature_items_profile ON signature_items(profile_id)
  WHERE profile_id IS NOT NULL;
CREATE INDEX idx_signature_items_catalog ON signature_items(catalog_id)
  WHERE catalog_id IS NOT NULL;
CREATE INDEX idx_signature_items_moderation ON signature_items(moderation_status);

--------------------------------------------------------------------------------
-- CHARACTER PORTRAITS
--------------------------------------------------------------------------------

CREATE TABLE character_portraits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL, -- FK added after characters ALTER below
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  thumb_path TEXT,
  seed BIGINT NOT NULL,
  provider TEXT NOT NULL,
  provider_model TEXT NOT NULL,
  prompt_snapshot JSONB NOT NULL,
  generation_job_id UUID,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  moderation_status moderation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_character_portraits_character ON character_portraits(character_id);
CREATE INDEX idx_character_portraits_profile ON character_portraits(profile_id);
CREATE UNIQUE INDEX idx_character_portraits_current
  ON character_portraits(character_id) WHERE is_current = TRUE;

--------------------------------------------------------------------------------
-- PORTRAIT GENERATION JOBS
--------------------------------------------------------------------------------

CREATE TABLE portrait_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL, -- FK added after characters ALTER
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('initial','regenerate')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued','running','succeeded','failed','moderation_rejected','cancelled')
  ),
  provider TEXT,
  provider_model TEXT,
  seed BIGINT NOT NULL,
  prompt_payload JSONB NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  result_portrait_id UUID REFERENCES character_portraits(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portrait_jobs_character ON portrait_jobs(character_id);
CREATE INDEX idx_portrait_jobs_profile ON portrait_jobs(profile_id);
CREATE INDEX idx_portrait_jobs_status ON portrait_jobs(status);
CREATE UNIQUE INDEX idx_portrait_jobs_idempotency
  ON portrait_jobs(profile_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

--------------------------------------------------------------------------------
-- CHARACTERS: NEW COLUMNS
--------------------------------------------------------------------------------

ALTER TABLE characters
  ADD COLUMN vibe TEXT CHECK (
    vibe IS NULL OR vibe IN ('heroic','sinister','mischievous','stoic','unhinged','regal')
  ),
  ADD COLUMN silhouette TEXT CHECK (
    silhouette IS NULL OR silhouette IN (
      'lean_duelist','heavy_bruiser','slim_trickster',
      'armored_knight','robed_mystic','sharp_tactician'
    )
  ),
  ADD COLUMN era TEXT CHECK (
    era IS NULL OR era IN ('ancient','industrial','modern','cyberpunk','far_future')
  ),
  ADD COLUMN expression TEXT CHECK (
    expression IS NULL OR expression IN (
      'smirk','glare','calm','roar','smile','thousand_yard'
    )
  ),
  ADD COLUMN palette_key TEXT CHECK (
    palette_key IS NULL OR palette_key IN (
      'ember','ocean','neon','bone','forest','royal','ash','gold'
    )
  ),
  ADD COLUMN signature_item_id UUID REFERENCES signature_items(id) ON DELETE SET NULL,
  ADD COLUMN portrait_id UUID REFERENCES character_portraits(id) ON DELETE SET NULL,
  ADD COLUMN portrait_seed BIGINT,
  ADD COLUMN portrait_prompt_raw TEXT CHECK (
    portrait_prompt_raw IS NULL OR char_length(portrait_prompt_raw) <= 200
  ),
  ADD COLUMN portrait_prompt_resolved TEXT,
  ADD COLUMN traits_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_edited_at TIMESTAMPTZ;

ALTER TABLE character_portraits
  ADD CONSTRAINT character_portraits_character_fk
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;

ALTER TABLE portrait_jobs
  ADD CONSTRAINT portrait_jobs_character_fk
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;

CREATE INDEX idx_characters_portrait_id ON characters(portrait_id)
  WHERE portrait_id IS NOT NULL;
CREATE INDEX idx_characters_signature_item_id ON characters(signature_item_id)
  WHERE signature_item_id IS NOT NULL;

--------------------------------------------------------------------------------
-- CHARACTERS: TRIGGER (write-once seed + last_edited_at + updated_at)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION characters_guard_and_touch()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.portrait_seed IS NOT NULL
     AND NEW.portrait_seed IS DISTINCT FROM OLD.portrait_seed THEN
    RAISE EXCEPTION 'portrait_seed is immutable once set';
  END IF;

  IF NEW IS DISTINCT FROM OLD THEN
    NEW.last_edited_at := NOW();
    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS characters_guard_and_touch_trg ON characters;
CREATE TRIGGER characters_guard_and_touch_trg
  BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION characters_guard_and_touch();

--------------------------------------------------------------------------------
-- CHARACTER EDIT PRICING
--------------------------------------------------------------------------------

CREATE TABLE character_edit_prices (
  edit_kind TEXT PRIMARY KEY,
  credits INTEGER NOT NULL CHECK (credits >= 0),
  cooldown_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO character_edit_prices (edit_kind, credits, cooldown_seconds) VALUES
  ('rename',              0, 604800),
  ('archetype',           0, 1209600),
  ('signature_color',     0, 86400),
  ('battle_cry',          0, 86400),
  ('palette',             0, 86400),
  ('traits_single_swap',  1, 0),
  ('traits_full_reroll',  2, 0),
  ('regenerate_portrait', 1, 0),
  ('new_portrait',        2, 0),
  ('signature_item_swap', 0, 0),
  ('custom_item_text',    1, 604800),
  ('custom_item_image',   3, 604800);

--------------------------------------------------------------------------------
-- CHARACTER EDIT LOG
--------------------------------------------------------------------------------

CREATE TABLE character_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  edit_kind TEXT NOT NULL CHECK (
    edit_kind IN (
      'traits','signature_item','palette','name',
      'regenerate_portrait','new_portrait',
      'custom_item_text','custom_item_image',
      'battle_cry','signature_color','archetype'
    )
  ),
  before JSONB,
  after JSONB,
  credits_spent INTEGER NOT NULL DEFAULT 0 CHECK (credits_spent >= 0),
  wallet_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_character_edits_character ON character_edits(character_id, created_at DESC);
CREATE INDEX idx_character_edits_profile ON character_edits(profile_id, created_at DESC);
CREATE UNIQUE INDEX idx_character_edits_idempotency
  ON character_edits(profile_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

--------------------------------------------------------------------------------
-- SEED CATALOG ITEMS
--------------------------------------------------------------------------------

INSERT INTO signature_items_catalog (slug, name, item_class, prompt_fragment, image_path) VALUES
  ('lucky_coin',       'Lucky Coin',       'symbol',             'a worn lucky coin flipping mid-air',                 'catalog/lucky_coin.webp'),
  ('briefcase',        'Briefcase',        'weaponized_mundane', 'a battered briefcase clutched like a weapon',        'catalog/briefcase.webp'),
  ('fountain_pen',     'Fountain Pen',     'tool',               'an ink-stained fountain pen held like a stylus',     'catalog/fountain_pen.webp'),
  ('microphone',       'Microphone',       'instrument',         'a vintage microphone trailing a coiled cable',       'catalog/microphone.webp'),
  ('umbrella',         'Umbrella',         'weaponized_mundane', 'a sharp-tipped black umbrella half-open',            'catalog/umbrella.webp'),
  ('compass',          'Compass',          'tool',               'a brass compass with a quivering needle',            'catalog/compass.webp'),
  ('hourglass',        'Hourglass',        'relic',              'a cracked hourglass with glowing sand',              'catalog/hourglass.webp'),
  ('folding_chair',    'Folding Chair',    'weaponized_mundane', 'a folding chair raised overhead like a hammer',     'catalog/folding_chair.webp'),
  ('tarot_card',       'Tarot Card',       'relic',              'a single tarot card held between two fingers',       'catalog/tarot_card.webp'),
  ('wrench',           'Wrench',           'tool',               'a heavy adjustable wrench resting on the shoulder',  'catalog/wrench.webp'),
  ('megaphone',        'Megaphone',        'instrument',         'a dented megaphone with a frayed strap',             'catalog/megaphone.webp'),
  ('crown_fragment',   'Crown Fragment',   'relic',              'a jagged shard of a golden crown',                   'catalog/crown_fragment.webp'),
  ('stopwatch',        'Stopwatch',        'tool',               'a chained stopwatch ticking loudly',                 'catalog/stopwatch.webp'),
  ('polaroid',         'Polaroid',         'symbol',             'a half-developed polaroid photo',                    'catalog/polaroid.webp'),
  ('tuning_fork',      'Tuning Fork',      'instrument',         'a humming tuning fork vibrating with sound',         'catalog/tuning_fork.webp');

--------------------------------------------------------------------------------
-- STORAGE BUCKETS
--------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('character-portraits',     'character-portraits',     FALSE),
  ('signature-items-custom',  'signature-items-custom',  FALSE),
  ('signature-items-catalog', 'signature-items-catalog', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: owner read for private buckets; writes restricted to service role.
DROP POLICY IF EXISTS character_portraits_owner_read ON storage.objects;
CREATE POLICY character_portraits_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'character-portraits'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS signature_items_custom_owner_read ON storage.objects;
CREATE POLICY signature_items_custom_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signature-items-custom'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS signature_items_catalog_public_read ON storage.objects;
CREATE POLICY signature_items_catalog_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'signature-items-catalog');

-- No client INSERT/UPDATE/DELETE policies; service role bypasses RLS.

--------------------------------------------------------------------------------
-- TABLE RLS
--------------------------------------------------------------------------------

ALTER TABLE signature_items_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_portraits ENABLE ROW LEVEL SECURITY;
ALTER TABLE portrait_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_edit_prices ENABLE ROW LEVEL SECURITY;

-- Catalog: any user can SELECT active rows
CREATE POLICY signature_items_catalog_select_active
  ON signature_items_catalog FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

-- Signature items: owner SELECT
CREATE POLICY signature_items_select_own
  ON signature_items FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Signature items: opponent in an open battle (within last 30 days) can SELECT.
-- Uses a SECURITY DEFINER helper to bypass characters RLS during the lookup.
CREATE OR REPLACE FUNCTION user_can_see_signature_item(
  p_item_id UUID,
  p_user UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM characters c
    JOIN battles b
      ON (b.player_one_character_id = c.id OR b.player_two_character_id = c.id)
    WHERE c.signature_item_id = p_item_id
      AND b.status IN (
        'matched','waiting_for_prompts','resolving',
        'result_ready','generating_video','completed'
      )
      AND b.created_at > NOW() - INTERVAL '30 days'
      AND (b.player_one_id = p_user OR b.player_two_id = p_user)
  );
$$;

REVOKE ALL ON FUNCTION user_can_see_signature_item(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION user_can_see_signature_item(UUID, UUID) TO authenticated;

CREATE POLICY signature_items_select_opponent_open_battle
  ON signature_items FOR SELECT
  TO authenticated
  USING (user_can_see_signature_item(id, auth.uid()));

-- Character portraits: owner SELECT
CREATE POLICY character_portraits_select_own
  ON character_portraits FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Character portraits: opponent in shared battle, only is_current=TRUE
CREATE POLICY character_portraits_select_opponent_current
  ON character_portraits FOR SELECT
  TO authenticated
  USING (
    is_current = TRUE
    AND EXISTS (
      SELECT 1
      FROM battles b
      WHERE (b.player_one_character_id = character_portraits.character_id
             OR b.player_two_character_id = character_portraits.character_id)
        AND (b.player_one_id = auth.uid() OR b.player_two_id = auth.uid())
    )
  );

-- Portrait jobs: owner SELECT
CREATE POLICY portrait_jobs_select_own
  ON portrait_jobs FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Character edits: owner SELECT
CREATE POLICY character_edits_select_own
  ON character_edits FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Edit prices: readable to all
CREATE POLICY character_edit_prices_select_all
  ON character_edit_prices FOR SELECT
  TO anon, authenticated
  USING (TRUE);

--------------------------------------------------------------------------------
-- TIGHTEN characters UPDATE: clients may only toggle is_active directly.
-- All other field changes must flow through edit-character (service role).
--------------------------------------------------------------------------------

REVOKE UPDATE ON characters FROM authenticated;
GRANT UPDATE (is_active) ON characters TO authenticated;

--------------------------------------------------------------------------------
-- REALTIME
--------------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE portrait_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE character_portraits;
