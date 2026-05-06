// Shared types for Prompt Wars Edge Functions
// Use across all functions for type safety

export type BattleStatus =
  | 'created'
  | 'matched'
  | 'waiting_for_prompts'
  | 'resolving'
  | 'result_ready'
  | 'generating_video'
  | 'completed'
  | 'expired'
  | 'canceled'
  | 'moderation_failed'
  | 'generation_failed';

export type BattleMode = 'ranked' | 'unranked' | 'friend_challenge' | 'daily_theme' | 'bot';

export type MoveType = 'attack' | 'defense' | 'finisher';

export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged_human_review';

export type VideoJobStatus = 'queued' | 'submitted' | 'processing' | 'succeeded' | 'failed';

export type Archetype = 'strategist' | 'trickster' | 'titan' | 'mystic' | 'engineer';

export interface Battle {
  id: string;
  mode: BattleMode;
  status: BattleStatus;
  player_one_id: string;
  player_two_id: string | null;
  player_one_character_id: string;
  player_two_character_id: string | null;
  is_player_two_bot: boolean;
  bot_persona_id: string | null;
  theme: string | null;
  theme_revealed_at: string | null;
  winner_id: string | null;
  is_draw: boolean;
  score_payload: Record<string, unknown> | null;
  rating_delta_payload: Record<string, unknown> | null;
  judge_prompt_version: string | null;
  judge_model_id: string | null;
  judge_seed: number | null;
  created_at: string;
  matched_at: string | null;
  completed_at: string | null;
}

export interface BattlePrompt {
  id: string;
  battle_id: string;
  profile_id: string;
  prompt_template_id: string | null;
  custom_prompt_text: string | null;
  move_type: MoveType;
  moderation_status: ModerationStatus;
  is_locked: boolean;
  locked_at: string | null;
  word_count: number | null;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  rating: number;
  rating_deviation: number;
  rating_volatility: number;
  total_battles: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface Character {
  id: string;
  profile_id: string;
  name: string;
  archetype: Archetype;
  battle_cry: string;
  signature_color: string;
}

export interface JudgeRubricScores {
  clarity: number;
  originality: number;
  specificity: number;
  theme_fit: number;
  archetype_fit: number;
  dramatic_potential: number;
}

export interface JudgeRunResult {
  player_one_raw_scores: JudgeRubricScores;
  player_two_raw_scores: JudgeRubricScores;
  player_one_normalized_scores: JudgeRubricScores;
  player_two_normalized_scores: JudgeRubricScores;
  winner_profile_id: string | null;
  is_draw: boolean;
  explanation: string;
  aggregate_score_diff: number;
}
