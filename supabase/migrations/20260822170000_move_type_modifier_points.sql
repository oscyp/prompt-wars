-- ============================================================================
-- Bo3 retune: move-type modifier becomes absolute points, not a fraction
-- ============================================================================
--
-- Why
-- ---
-- The move-type modifier was +12% / -8% multiplicative on the 0-60 rubric
-- aggregate. On a typical base of 40 that opened a ~8-point gap between two
-- otherwise equal prompts -- past DRAW_EPSILON (3.0) and past
-- KO_SCORE_GAP_THRESHOLD (7). The rock-paper-scissors pick, not the writing,
-- decided close rounds, which contradicts §7.1's own statement that the
-- modifier must not override clear quality differences.
--
-- It is now an absolute aggregate-point adjustment: +0.9 winning matchup,
-- -0.6 losing, 0 mirror (MOVE_TYPE_POINTS_WIN / _LOSE in _shared/judge.ts).
-- A counter-pick against an equal prompt now yields a 1.5-point gap, inside the
-- draw band, so it breaks ties instead of creating them.
--
-- What breaks without this migration
-- ----------------------------------
-- `battle_rounds` has CHECK constraints from 20260525120000:
--
--   battle_rounds_combined_mod_p1_cap
--     CHECK (stat_modifier_player_one + move_type_modifier_player_one
--            BETWEEN -0.20 AND 0.20)
--
-- With move_type now 0.9, that sum is ~0.95 and EVERY Bo3 round write would be
-- rejected. The constraint was written when both operands were fractions of the
-- base; they are no longer the same unit, so summing them is meaningless.
--
-- The fix
-- -------
--   * Drop the two combined-cap constraints. They cannot express a cap across
--     two different units, and the real combined cap (±20% of base, floored at
--     2.0 points) is enforced in round-resolve, which is the only writer and is
--     the only place that knows the base aggregate.
--   * Add per-column bounds for move_type_modifier matching the new constants.
--   * Leave the stat_modifier ±0.05 constraints alone -- stat stays a fraction
--     of the base, per §7.7.
--
-- Units after this migration:
--   stat_modifier_player_*      FRACTION of base aggregate, [-0.05, 0.05]
--   move_type_modifier_player_* ABSOLUTE aggregate points,  [-0.6, 0.9]
--
-- Legacy rows written under the old semantics keep values in [-0.08, 0.12],
-- which sit inside the new bounds, so no backfill is needed and no historical
-- row is invalidated. They are not directly comparable to new rows; the reveal
-- renders whatever was stored.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + guarded ADD.
-- ============================================================================

ALTER TABLE public.battle_rounds
  DROP CONSTRAINT IF EXISTS battle_rounds_combined_mod_p1_cap,
  DROP CONSTRAINT IF EXISTS battle_rounds_combined_mod_p2_cap,
  DROP CONSTRAINT IF EXISTS battle_rounds_move_mod_p1_bounds,
  DROP CONSTRAINT IF EXISTS battle_rounds_move_mod_p2_bounds;

ALTER TABLE public.battle_rounds
  ADD CONSTRAINT battle_rounds_move_mod_p1_bounds
    CHECK (move_type_modifier_player_one IS NULL
           OR move_type_modifier_player_one BETWEEN -0.6 AND 0.9),
  ADD CONSTRAINT battle_rounds_move_mod_p2_bounds
    CHECK (move_type_modifier_player_two IS NULL
           OR move_type_modifier_player_two BETWEEN -0.6 AND 0.9);

COMMENT ON COLUMN public.battle_rounds.move_type_modifier_player_one IS
  'Absolute aggregate-point adjustment from the move-type matchup '
  '(+0.9 / -0.6 / 0). NOT a percentage. Rows written before migration '
  '20260822170000 hold the old fractional values (+0.12 / -0.08).';

COMMENT ON COLUMN public.battle_rounds.move_type_modifier_player_two IS
  'Absolute aggregate-point adjustment from the move-type matchup '
  '(+0.9 / -0.6 / 0). NOT a percentage. Rows written before migration '
  '20260822170000 hold the old fractional values (+0.12 / -0.08).';

COMMENT ON COLUMN public.battle_rounds.stat_modifier_player_one IS
  'Fraction of the base rubric aggregate, capped to ±0.05 per §7.7.';

COMMENT ON COLUMN public.battle_rounds.stat_modifier_player_two IS
  'Fraction of the base rubric aggregate, capped to ±0.05 per §7.7.';
