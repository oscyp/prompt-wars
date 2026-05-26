-- Best-of-3 Rounds Mode (Phase 2)
-- Adds `battles.format` flag, per-character stats, snapshotted stats on battles,
-- HP / round-tally columns, `battle_prompts.round_number`, and `battle_rounds` table.
--
-- Backward compatible: existing rows default to `format='single'`, `best_of=1`,
-- `current_round=1`, and are backfilled with one `battle_rounds` row.
--
-- Writes to `battle_rounds` are SERVICE-ROLE ONLY (no client policies).

--------------------------------------------------------------------------------
-- ENUMS
--------------------------------------------------------------------------------

CREATE TYPE battle_format AS ENUM ('single', 'bo3');

CREATE TYPE round_status AS ENUM (
  'pending',
  'waiting_for_prompts',
  'resolving',
  'result_ready',
  'expired',
  'canceled',
  'moderation_failed'
);

--------------------------------------------------------------------------------
-- CHARACTERS: per-character earn-only stats (1-10, default 5)
--------------------------------------------------------------------------------

ALTER TABLE characters
  ADD COLUMN stat_strength SMALLINT NOT NULL DEFAULT 5
    CHECK (stat_strength BETWEEN 1 AND 10),
  ADD COLUMN stat_stamina  SMALLINT NOT NULL DEFAULT 5
    CHECK (stat_stamina BETWEEN 1 AND 10),
  ADD COLUMN stat_agility  SMALLINT NOT NULL DEFAULT 5
    CHECK (stat_agility BETWEEN 1 AND 10),
  ADD COLUMN stat_focus    SMALLINT NOT NULL DEFAULT 5
    CHECK (stat_focus BETWEEN 1 AND 10);

--------------------------------------------------------------------------------
-- BATTLES: Bo3 columns
--------------------------------------------------------------------------------

ALTER TABLE battles
  ADD COLUMN format battle_format NOT NULL DEFAULT 'single',
  ADD COLUMN best_of SMALLINT NOT NULL DEFAULT 1
    CHECK (best_of IN (1, 3)),
  ADD COLUMN current_round SMALLINT NOT NULL DEFAULT 1
    CHECK (current_round BETWEEN 1 AND 3),
  ADD COLUMN player_one_hp SMALLINT,
  ADD COLUMN player_two_hp SMALLINT,
  ADD COLUMN player_one_hp_max SMALLINT
    CHECK (player_one_hp_max IS NULL OR player_one_hp_max BETWEEN 70 AND 140),
  ADD COLUMN player_two_hp_max SMALLINT
    CHECK (player_two_hp_max IS NULL OR player_two_hp_max BETWEEN 70 AND 140),
  ADD COLUMN player_one_rounds_won SMALLINT NOT NULL DEFAULT 0
    CHECK (player_one_rounds_won BETWEEN 0 AND 3),
  ADD COLUMN player_two_rounds_won SMALLINT NOT NULL DEFAULT 0
    CHECK (player_two_rounds_won BETWEEN 0 AND 3),
  ADD COLUMN face_off_revealed_at TIMESTAMPTZ,
  ADD COLUMN player_one_stats_snapshot JSONB,
  ADD COLUMN player_two_stats_snapshot JSONB,
  ADD CONSTRAINT battles_format_best_of_consistent CHECK (
    (format = 'single' AND best_of = 1)
    OR (format = 'bo3' AND best_of = 3)
  ),
  ADD CONSTRAINT battles_hp_pair_consistent CHECK (
    (player_one_hp IS NULL) = (player_one_hp_max IS NULL)
    AND (player_two_hp IS NULL) = (player_two_hp_max IS NULL)
  ),
  ADD CONSTRAINT battles_hp_in_range CHECK (
    (player_one_hp IS NULL OR player_one_hp <= player_one_hp_max)
    AND (player_two_hp IS NULL OR player_two_hp <= player_two_hp_max)
  );

-- Partial index for the round timeout sweeper.
CREATE INDEX idx_battles_format_status
  ON battles(format, status)
  WHERE format = 'bo3';

--------------------------------------------------------------------------------
-- BATTLE_PROMPTS: round_number, drop old per-battle uniqueness
--------------------------------------------------------------------------------

ALTER TABLE battle_prompts
  ADD COLUMN round_number SMALLINT NOT NULL DEFAULT 1
    CHECK (round_number BETWEEN 1 AND 3);

-- Drop the legacy `(battle_id, profile_id)` uniqueness; one prompt per round now.
ALTER TABLE battle_prompts
  DROP CONSTRAINT IF EXISTS one_prompt_per_player_per_battle;

ALTER TABLE battle_prompts
  ADD CONSTRAINT one_prompt_per_player_per_round
    UNIQUE (battle_id, profile_id, round_number);

--------------------------------------------------------------------------------
-- BATTLE_ROUNDS
--------------------------------------------------------------------------------

CREATE TABLE battle_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  round_number SMALLINT NOT NULL CHECK (round_number BETWEEN 1 AND 3),

  status round_status NOT NULL DEFAULT 'pending',

  -- Lock-in flow (per-round deadlines)
  lock_in_deadline TIMESTAMPTZ,
  player_one_locked_at TIMESTAMPTZ,
  player_two_locked_at TIMESTAMPTZ,
  both_locked_at TIMESTAMPTZ,

  -- Result
  round_winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_draw BOOLEAN NOT NULL DEFAULT FALSE,
  player_one_score NUMERIC(8, 4),
  player_two_score NUMERIC(8, 4),
  score_gap NUMERIC(8, 4),
  player_one_damage SMALLINT NOT NULL DEFAULT 0 CHECK (player_one_damage >= 0),
  player_two_damage SMALLINT NOT NULL DEFAULT 0 CHECK (player_two_damage >= 0),
  player_one_hp_after SMALLINT,
  player_two_hp_after SMALLINT,
  is_ko BOOLEAN NOT NULL DEFAULT FALSE,

  -- Judge & scoring payload (per round)
  judge_payload JSONB,
  judge_prompt_version TEXT,
  judge_model_id TEXT,
  stat_modifier_player_one NUMERIC(5, 4),
  stat_modifier_player_two NUMERIC(5, 4),
  move_type_modifier_player_one NUMERIC(5, 4),
  move_type_modifier_player_two NUMERIC(5, 4),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT battle_rounds_unique_per_battle UNIQUE (battle_id, round_number),
  CONSTRAINT battle_rounds_winner_xor_draw CHECK (
    (is_draw = TRUE  AND round_winner_id IS NULL)
    OR (is_draw = FALSE)
  ),
  -- Hard caps mirror application-level enforcement.
  CONSTRAINT battle_rounds_stat_mod_p1_cap
    CHECK (stat_modifier_player_one IS NULL
           OR stat_modifier_player_one BETWEEN -0.05 AND 0.05),
  CONSTRAINT battle_rounds_stat_mod_p2_cap
    CHECK (stat_modifier_player_two IS NULL
           OR stat_modifier_player_two BETWEEN -0.05 AND 0.05),
  CONSTRAINT battle_rounds_combined_mod_p1_cap CHECK (
    (stat_modifier_player_one IS NULL OR move_type_modifier_player_one IS NULL)
    OR (stat_modifier_player_one + move_type_modifier_player_one BETWEEN -0.20 AND 0.20)
  ),
  CONSTRAINT battle_rounds_combined_mod_p2_cap CHECK (
    (stat_modifier_player_two IS NULL OR move_type_modifier_player_two IS NULL)
    OR (stat_modifier_player_two + move_type_modifier_player_two BETWEEN -0.20 AND 0.20)
  )
);

CREATE INDEX idx_battle_rounds_battle ON battle_rounds(battle_id, round_number);
CREATE INDEX idx_battle_rounds_status ON battle_rounds(status);
CREATE INDEX idx_battle_rounds_lock_deadline
  ON battle_rounds(lock_in_deadline)
  WHERE status = 'waiting_for_prompts';

--------------------------------------------------------------------------------
-- BACKFILL: one round per existing battle
--------------------------------------------------------------------------------
-- Mapping from battle_status -> round_status for the backfill round 1 row.
-- Choices documented inline:
--   created, matched, waiting_for_prompts -> 'waiting_for_prompts'
--   resolving                              -> 'resolving'
--   result_ready, generating_video,
--   completed, generation_failed           -> 'result_ready'  (the round resolved)
--   expired                                -> 'expired'
--   canceled                               -> 'canceled'
--   moderation_failed                      -> 'moderation_failed'

INSERT INTO battle_rounds (
  battle_id, round_number, status,
  lock_in_deadline, both_locked_at, resolved_at,
  round_winner_id, is_draw
)
SELECT
  b.id,
  1,
  CASE b.status
    WHEN 'created' THEN 'waiting_for_prompts'::round_status
    WHEN 'matched' THEN 'waiting_for_prompts'::round_status
    WHEN 'waiting_for_prompts' THEN 'waiting_for_prompts'::round_status
    WHEN 'resolving' THEN 'resolving'::round_status
    WHEN 'result_ready' THEN 'result_ready'::round_status
    WHEN 'generating_video' THEN 'result_ready'::round_status
    WHEN 'completed' THEN 'result_ready'::round_status
    WHEN 'generation_failed' THEN 'result_ready'::round_status
    WHEN 'expired' THEN 'expired'::round_status
    WHEN 'canceled' THEN 'canceled'::round_status
    WHEN 'moderation_failed' THEN 'moderation_failed'::round_status
    ELSE 'pending'::round_status
  END,
  COALESCE(b.player_one_prompt_deadline, b.player_two_prompt_deadline),
  CASE WHEN b.status IN (
      'resolving','result_ready','generating_video','completed','generation_failed'
    ) THEN COALESCE(b.matched_at, b.created_at) ELSE NULL END,
  b.completed_at,
  b.winner_id,
  b.is_draw
FROM battles b
ON CONFLICT (battle_id, round_number) DO NOTHING;

-- Existing single-format battles also need their per-round denormalized win count
-- to match the legacy battle-level result so future code paths can read uniformly.
UPDATE battles
SET
  player_one_rounds_won = CASE
    WHEN winner_id = player_one_id THEN 1 ELSE 0 END,
  player_two_rounds_won = CASE
    WHEN winner_id IS NOT NULL AND winner_id = player_two_id THEN 1 ELSE 0 END
WHERE status IN ('result_ready','generating_video','completed','generation_failed');

--------------------------------------------------------------------------------
-- RLS: battle_prompts SELECT replacement (visibility-aware) and battle_rounds
--------------------------------------------------------------------------------

-- Replace the prior battle_prompts SELECT policy with a visibility-aware one:
--   a player always sees their own prompt rows; the opponent's row is only
--   visible after both sides locked in for that round.
DROP POLICY IF EXISTS battle_prompts_select_own_battles ON battle_prompts;

CREATE POLICY battle_prompts_select_visibility_aware ON battle_prompts FOR SELECT USING (
  profile_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM battles b
    JOIN battle_rounds r
      ON r.battle_id = b.id
     AND r.round_number = battle_prompts.round_number
    WHERE b.id = battle_prompts.battle_id
      AND (b.player_one_id = auth.uid() OR b.player_two_id = auth.uid())
      AND r.both_locked_at IS NOT NULL
  )
);

ALTER TABLE battle_rounds ENABLE ROW LEVEL SECURITY;

-- Participant-only SELECT; no client INSERT/UPDATE/DELETE policy (service role only).
CREATE POLICY battle_rounds_select_participant ON battle_rounds FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM battles b
    WHERE b.id = battle_rounds.battle_id
      AND (b.player_one_id = auth.uid() OR b.player_two_id = auth.uid())
  )
);
