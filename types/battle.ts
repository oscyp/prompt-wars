/**
 * Shared types for Best-of-3 battle data.
 *
 * Mirrors the `battle_rounds` table and the new Bo3 columns on `battles`.
 * The backend remains the source of truth for scoring; these types only
 * describe the shape clients read from Supabase.
 */

export type BattleFormat = 'single' | 'bo3';

export type RoundStatus =
  | 'pending'
  | 'waiting_for_prompts'
  | 'resolving'
  | 'result_ready'
  | 'expired'
  | 'canceled'
  | 'moderation_failed';

export interface StatBlock {
  strength: number;
  stamina: number;
  agility: number;
  focus: number;
}

export interface RubricScoreSet {
  clarity: number;
  originality: number;
  specificity: number;
  theme_fit: number;
  archetype_fit: number;
  dramatic_potential: number;
}

export interface RoundJudgePayload {
  player_one_raw_scores?: RubricScoreSet;
  player_two_raw_scores?: RubricScoreSet;
  player_one_normalized_scores?: RubricScoreSet;
  player_two_normalized_scores?: RubricScoreSet;
  explanation?: string;
  move_type_matchup?: {
    player_one: string;
    player_two: string;
  };
  forfeit_profile_id?: string | null;
}

export interface BattleRound {
  id: string;
  battle_id: string;
  round_number: number;
  status: RoundStatus;

  lock_in_deadline: string | null;
  player_one_locked_at: string | null;
  player_two_locked_at: string | null;
  both_locked_at: string | null;

  round_winner_id: string | null;
  is_draw: boolean;
  player_one_score: number | null;
  player_two_score: number | null;
  score_gap: number | null;
  player_one_damage: number;
  player_two_damage: number;
  player_one_hp_after: number | null;
  player_two_hp_after: number | null;
  is_ko: boolean;

  judge_payload: RoundJudgePayload | null;
  judge_prompt_version: string | null;
  judge_model_id: string | null;
  stat_modifier_player_one: number | null;
  stat_modifier_player_two: number | null;
  move_type_modifier_player_one: number | null;
  move_type_modifier_player_two: number | null;

  /** Optional — these columns may be added later by the cinematic pipeline. */
  cinematic_video_job_id?: string | null;
  cinematic_asset_url?: string | null;
  /** DB: SMALLINT CHECK (cinematic_tier IN (0, 1)). 0 = Tier 0 text reveal, 1 = Tier 1 video. */
  cinematic_tier?: 0 | 1 | null;

  created_at: string;
  resolved_at: string | null;
  updated_at: string;
}

export type RubricCategory = keyof RubricScoreSet;
