-- Bo3 HP-max CHECK floor fix.
--
-- The prior migration `20260525120000_bo3_rounds_mode.sql` added inline column
-- CHECK constraints on `battles.player_one_hp_max` / `player_two_hp_max` with
-- floor 70. The application formula is `hpMaxFromStamina(s) = 60 + 8*s` and
-- `stat_stamina` is legal in `[1, 10]`, which yields `[68, 140]`. A character
-- with `stat_stamina = 1` produces HP max = 68, which violates the 70 floor
-- and deadlocks the face-off writer.
--
-- This migration lowers the floor to 68 (= 60 + 8*1), keeping the ceiling at
-- 140 (= 60 + 8*10).
--
-- Inline column CHECKs in the prior migration are auto-named by Postgres as
-- `<table>_<column>_check`, i.e.:
--   battles_player_one_hp_max_check
--   battles_player_two_hp_max_check
--
-- For reference / verification:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'battles'::regclass AND conname LIKE '%hp_max%';
--
-- We use DROP CONSTRAINT IF EXISTS for both the auto-named form and the
-- explicit names we now apply, so this migration is idempotent and resilient
-- if the auto-name differs in any environment.

ALTER TABLE battles
  DROP CONSTRAINT IF EXISTS battles_player_one_hp_max_check,
  DROP CONSTRAINT IF EXISTS battles_hp_max_in_range_p1,
  ADD CONSTRAINT battles_hp_max_in_range_p1
    CHECK (player_one_hp_max IS NULL OR player_one_hp_max BETWEEN 68 AND 140);

ALTER TABLE battles
  DROP CONSTRAINT IF EXISTS battles_player_two_hp_max_check,
  DROP CONSTRAINT IF EXISTS battles_hp_max_in_range_p2,
  ADD CONSTRAINT battles_hp_max_in_range_p2
    CHECK (player_two_hp_max IS NULL OR player_two_hp_max BETWEEN 68 AND 140);
