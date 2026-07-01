// Shared Tier 0 reveal composition (service-role, SYNCHRONOUS).
//
// Single source of truth for the free "wow moment" reveal payload. Both battle
// resolvers call this synchronously so the reveal is ALWAYS present the moment
// a battle/round reaches `result_ready`:
//   - resolve-battle (single-format) -> battles.tier0_reveal_payload
//   - round-resolve  (Bo3)           -> battles.tier0_reveal_payload (per round)
//                                    +  battle_rounds.reveal_payload (durable)
//
// BOUNDARY (do not relax):
//   * The base RevealPayloadV1 is produced from FROZEN, server-owned state only
//     (battle_rounds / battles.score_payload / battle_prompts / characters).
//   * All generation-derived asset URLs (`*_url`, `asset_url`) are NULLABLE with
//     a deterministic fallback (ids + signature-color gradient + character
//     initials via `character_name`). The base payload never depends on them.
//   * Tier 1 video / audio / TTS success or failure NEVER gates this payload.
//
// COMPAT: the returned object is a backward-compatible SUPERSET. It carries the
// FLAT fields the current client already reads at the TOP LEVEL
// (`summary`, `winnerColor`, `battleCryText`, `winnerPortraitUrl`,
// `portraitUrl`) alongside the richer nested RevealPayloadV1 fields.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createImageProvider, createTtsProvider } from './providers.ts';
import type { Archetype, MoveType } from './types.ts';

// ---------------------------------------------------------------------------
// RevealPayloadV1 shape
// ---------------------------------------------------------------------------

export interface RevealRubricScores {
  clarity: number;
  originality: number;
  specificity: number;
  theme_fit: number;
  archetype_fit: number;
  dramatic_potential: number;
}

export interface RevealPortrait {
  /** Storage object path in the private `character-portraits` bucket. */
  path: string | null;
  /** 7-day service-role signed URL (nullable: bots / missing portrait). */
  signed_url: string | null;
  thumb_signed_url: string | null;
  art_style: string | null;
  seed: number | null;
  /** Deterministic [base, shaded] gradient derived from signature color. */
  fallback_gradient: [string, string];
}

export type MoveMatchupResult = 'win' | 'loss' | 'neutral';

export interface RevealPlayer {
  profile_id: string | null;
  character_name: string;
  archetype: string;
  signature_color: string;
  battle_cry: string;
  portrait: RevealPortrait;
  move_type: string;
  move_matchup_result: MoveMatchupResult;
  move_type_modifier: number | null;
  stat_modifier: number | null;
  rubric_scores: RevealRubricScores;
  prompt_excerpt: string | null;
}

export interface RevealOutcome {
  winner_profile_id: string | null;
  is_draw: boolean;
  is_ko: boolean;
  score_gap: number;
}

export interface RevealJudge {
  why: string;
  prompt_version: string | null;
  model_id: string | null;
}

export interface RevealBattleCryVoice {
  voice_preset: string;
  text: string;
  /** Generation-derived; nullable until TTS enrichment runs. */
  asset_url: string | null;
  duration_ms: number;
}

export interface RevealSpec {
  composition_type: 'motion_poster' | 'static_scorecard';
  animation_preset: string;
  winner_color: string;
  music_track_id: string;
  /** Generation-derived; nullable until audio enrichment runs. */
  music_track_url: string | null;
  move_sting_id: string;
  /** Generation-derived; nullable until audio enrichment runs. */
  move_sting_url: string | null;
  battle_cry_voice: RevealBattleCryVoice;
}

export interface RevealPayloadV1 {
  // -- FLAT backward-compat fields (existing client reads; do not remove) -----
  /** Judge "why"/explanation text. Read by app/(battle)/result.tsx L306/L404. */
  summary: string;
  /** Winner signature color. Read by RoundResultCinematic Tier0Payload. */
  winnerColor: string;
  /** Winner battle cry. Read by RoundResultCinematic Tier0Payload. */
  battleCryText: string;
  /** Winner signed portrait URL (nullable). Read by RoundResultCinematic. */
  winnerPortraitUrl: string | null;
  /** Alias of winnerPortraitUrl for the client's portrait fallback chain. */
  portraitUrl: string | null;

  // -- Nested RevealPayloadV1 -------------------------------------------------
  version: 1;
  tier: 0;
  battle_id: string;
  battle_round_id: string | null;
  round_number: number | null;
  generated_at: string;
  outcome: RevealOutcome;
  players: {
    player_one: RevealPlayer;
    player_two: RevealPlayer;
  };
  judge: RevealJudge;
  reveal_spec: RevealSpec;
}

export interface ComposeRevealArgs {
  battleId: string;
  /** Present for Bo3 per-round composition; null/omitted for single-format. */
  battleRoundId?: string | null;
  roundNumber?: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Private bucket holding all generated character portraits + thumbnails. */
export const PORTRAIT_BUCKET = 'character-portraits';
/** 7-day signed URL lifetime for reveal portraits. */
export const PORTRAIT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_MOVE_TYPE: MoveType = 'attack';
const DEFAULT_P1_COLOR = '#6366f1';
const DEFAULT_P2_COLOR = '#94a3b8';
const PROMPT_EXCERPT_MAX = 160;

// ---------------------------------------------------------------------------
// Public composer
// ---------------------------------------------------------------------------

/**
 * Compose the full RevealPayloadV1 (flat compat superset) from frozen state.
 *
 * Loads the battle (+ characters / bot persona), the optional round row, the
 * round-scoped prompts, and mints 7-day signed portrait URLs for both human
 * participants. Never calls Tier 1 video/audio generation; all such asset URLs
 * are emitted null with deterministic id/gradient fallbacks.
 */
export async function composeRevealPayload(
  supabase: SupabaseClient,
  args: ComposeRevealArgs,
): Promise<RevealPayloadV1> {
  const battleId = args.battleId;
  const battleRoundId = args.battleRoundId ?? null;

  const { data: battleRow, error: battleErr } = await supabase
    .from('battles')
    .select(
      `
      id, status, format, mode, theme,
      player_one_id, player_two_id, is_player_two_bot, bot_persona_id,
      winner_id, is_draw, score_payload,
      judge_prompt_version, judge_model_id,
      player_one_character:characters!battles_player_one_character_id_fkey(
        id, profile_id, name, archetype, signature_color, battle_cry, art_style
      ),
      player_two_character:characters!battles_player_two_character_id_fkey(
        id, profile_id, name, archetype, signature_color, battle_cry, art_style
      ),
      bot_persona:bot_personas(id, name, archetype, signature_color, battle_cry)
    `,
    )
    .eq('id', battleId)
    .single();

  if (battleErr || !battleRow) {
    throw new Error(
      `composeRevealPayload: battle not found (${battleErr?.message ?? 'no row'})`,
    );
  }

  // supabase-js types to-one embeds as arrays; each is a single object at
  // runtime. Read the joined character/persona fields directly via any.
  const battle = battleRow as any;
  const isBot = !!battle.is_player_two_bot;

  // Optional frozen round row (Bo3). Per-round outcome overrides battle aggregate.
  let round: Record<string, unknown> | null = null;
  if (battleRoundId) {
    const { data: r } = await supabase
      .from('battle_rounds')
      .select('*')
      .eq('id', battleRoundId)
      .maybeSingle();
    round = (r as Record<string, unknown> | null) ?? null;
  }

  const effectiveRoundNumber: number | null =
    args.roundNumber ?? (round ? numOrNull(round.round_number) : null);

  // Character metadata sources.
  const p1Char = battle.player_one_character ?? null;
  const p2Char = isBot ? (battle.bot_persona ?? null) : (battle.player_two_character ?? null);

  // Round-scoped locked prompts (for move types + excerpts).
  const promptsQuery = supabase
    .from('battle_prompts')
    .select('profile_id, move_type, custom_prompt_text, prompt_template_id')
    .eq('battle_id', battleId);
  if (effectiveRoundNumber != null) {
    promptsQuery.eq('round_number', effectiveRoundNumber);
  }
  const { data: promptsData } = await promptsQuery;
  const prompts = (promptsData ?? []) as Array<Record<string, unknown>>;
  const p1Prompt =
    prompts.find((p) => p.profile_id === battle.player_one_id) ?? null;
  const p2Prompt = isBot
    ? null
    : prompts.find((p) => p.profile_id === battle.player_two_id) ?? null;

  // Outcome: per-round frozen result wins over battle aggregate when present.
  const winnerId: string | null = round
    ? ((round.round_winner_id as string | null) ?? null)
    : ((battle.winner_id as string | null) ?? null);
  const isDraw: boolean = round ? !!round.is_draw : !!battle.is_draw;
  const isKo: boolean = round ? !!round.is_ko : false;

  // Score / judge source: per-round judge_payload, else battle.score_payload.
  const scoreSrc = round
    ? asRecord(round.judge_payload)
    : asRecord(battle.score_payload);
  const scoreGap: number = round
    ? (numOrNull(round.score_gap) ?? 0)
    : (numOrNull(scoreSrc.aggregate_score_diff) ?? 0);

  const matchup = asRecord(scoreSrc.move_type_matchup);
  const p1MoveType = coerceMoveType(matchup.player_one ?? p1Prompt?.move_type);
  const p2MoveType = coerceMoveType(matchup.player_two ?? p2Prompt?.move_type);

  const p1Rubric = readRubric(scoreSrc.player_one_normalized_scores);
  const p2Rubric = readRubric(scoreSrc.player_two_normalized_scores);
  const judgeWhy = typeof scoreSrc.explanation === 'string' ? scoreSrc.explanation : '';

  // Per-round modifiers (single-format has none -> null).
  const p1MoveMod = round ? numOrNull(round.move_type_modifier_player_one) : null;
  const p2MoveMod = round ? numOrNull(round.move_type_modifier_player_two) : null;
  const p1StatMod = round ? numOrNull(round.stat_modifier_player_one) : null;
  const p2StatMod = round ? numOrNull(round.stat_modifier_player_two) : null;

  const p1Color = (p1Char?.signature_color as string | undefined) ?? DEFAULT_P1_COLOR;
  const p2Color = (p2Char?.signature_color as string | undefined) ?? DEFAULT_P2_COLOR;

  // Mint signed portrait URLs (humans only; bots -> gradient fallback).
  const [p1Portrait, p2Portrait, p1Excerpt, p2Excerpt] = await Promise.all([
    loadSignedPortrait(supabase, p1Char, p1Color),
    loadSignedPortrait(supabase, isBot ? null : p2Char, p2Color),
    resolveExcerpt(supabase, p1Prompt),
    isBot ? Promise.resolve(null) : resolveExcerpt(supabase, p2Prompt),
  ]);

  const playerOne: RevealPlayer = {
    profile_id: (battle.player_one_id as string | null) ?? null,
    character_name: (p1Char?.name as string | undefined) ?? 'Player One',
    archetype: (p1Char?.archetype as string | undefined) ?? 'strategist',
    signature_color: p1Color,
    battle_cry: (p1Char?.battle_cry as string | undefined) ?? '',
    portrait: p1Portrait,
    move_type: p1MoveType,
    move_matchup_result: moveMatchupResult(p1MoveType, p2MoveType),
    move_type_modifier: p1MoveMod,
    stat_modifier: p1StatMod,
    rubric_scores: p1Rubric,
    prompt_excerpt: p1Excerpt,
  };

  const playerTwo: RevealPlayer = {
    profile_id: isBot ? null : ((battle.player_two_id as string | null) ?? null),
    character_name: (p2Char?.name as string | undefined) ?? (isBot ? 'Rival Bot' : 'Player Two'),
    archetype: (p2Char?.archetype as string | undefined) ?? 'titan',
    signature_color: p2Color,
    battle_cry: (p2Char?.battle_cry as string | undefined) ?? '',
    portrait: p2Portrait,
    move_type: p2MoveType,
    move_matchup_result: moveMatchupResult(p2MoveType, p1MoveType),
    move_type_modifier: p2MoveMod,
    stat_modifier: p2StatMod,
    rubric_scores: p2Rubric,
    prompt_excerpt: p2Excerpt,
  };

  // Winner side (null for draw / bot win with no profile). Flat display fields
  // fall back to player_one so the reveal is never blank.
  const winnerSide: 'player_one' | 'player_two' | null =
    isDraw || !winnerId
      ? null
      : winnerId === battle.player_one_id
        ? 'player_one'
        : !isBot && winnerId === battle.player_two_id
          ? 'player_two'
          : null;
  const displayPlayer = winnerSide === 'player_two' ? playerTwo : playerOne;
  const loserPlayer = winnerSide === 'player_two' ? playerOne : playerTwo;

  // Deterministic reveal composition metadata (reuse mock provider mappings;
  // no network I/O, no asset URLs produced here).
  const imageProvider = createImageProvider();
  const motionPoster = await imageProvider.generateMotionPoster({
    battleId,
    winnerCharacterName: displayPlayer.character_name,
    winnerArchetype: coerceArchetype(displayPlayer.archetype),
    winnerSignatureColor: displayPlayer.signature_color,
    loserCharacterName: loserPlayer.character_name,
    loserArchetype: coerceArchetype(loserPlayer.archetype),
    moveTypeWinner: coerceMoveType(displayPlayer.move_type),
    moveTypeLoser: coerceMoveType(loserPlayer.move_type),
    isDraw,
  });

  const ttsProvider = createTtsProvider();
  const battleCry = await ttsProvider.generateBattleCry({
    battleCryText: displayPlayer.battle_cry || 'Victory!',
    characterArchetype: coerceArchetype(displayPlayer.archetype),
    voicePreset: '',
  });

  const revealSpec: RevealSpec = {
    composition_type: motionPoster.compositionType,
    animation_preset: motionPoster.animationPreset,
    winner_color: displayPlayer.signature_color,
    music_track_id: motionPoster.musicStingId,
    music_track_url: null,
    move_sting_id: isDraw ? 'move_sting_draw' : `move_sting_${displayPlayer.move_type}`,
    move_sting_url: null,
    battle_cry_voice: {
      voice_preset: battleCry.voicePreset,
      text: displayPlayer.battle_cry || 'Victory!',
      asset_url: null,
      duration_ms: battleCry.durationMs,
    },
  };

  return {
    // Flat backward-compat fields.
    summary: judgeWhy,
    winnerColor: displayPlayer.signature_color,
    battleCryText: displayPlayer.battle_cry || 'Victory!',
    winnerPortraitUrl: displayPlayer.portrait.signed_url,
    portraitUrl: displayPlayer.portrait.signed_url,
    // Nested RevealPayloadV1.
    version: 1,
    tier: 0,
    battle_id: battleId,
    battle_round_id: battleRoundId,
    round_number: effectiveRoundNumber,
    generated_at: new Date().toISOString(),
    outcome: {
      winner_profile_id: winnerId,
      is_draw: isDraw,
      is_ko: isKo,
      score_gap: scoreGap,
    },
    players: { player_one: playerOne, player_two: playerTwo },
    judge: {
      why: judgeWhy,
      prompt_version:
        (round
          ? (round.judge_prompt_version as string | null)
          : (battle.judge_prompt_version as string | null)) ?? null,
      model_id:
        (round
          ? (round.judge_model_id as string | null)
          : (battle.judge_model_id as string | null)) ?? null,
    },
    reveal_spec: revealSpec,
  };
}

/**
 * Durable, NON-FATAL per-round reveal write.
 *
 * Writes the composed payload to `battle_rounds.reveal_payload`. The column may
 * not exist yet (its migration is intentionally un-applied), so a missing-column
 * Postgres error (42703) is caught and logged rather than surfaced — resolution
 * must never fail on this. It starts persisting automatically once applied.
 */
export async function writeRoundRevealPayload(
  supabase: SupabaseClient,
  battleRoundId: string,
  payload: RevealPayloadV1,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('battle_rounds')
      .update({ reveal_payload: payload, updated_at: new Date().toISOString() })
      .eq('id', battleRoundId);
    if (error) {
      const code = (error as { code?: string }).code;
      const message = (error as { message?: string }).message ?? '';
      const missingColumn =
        code === '42703' ||
        (/column/i.test(message) && /reveal_payload/i.test(message));
      if (missingColumn) {
        console.warn(
          'battle_rounds.reveal_payload not present yet (pre-migration); skipping durable per-round copy.',
        );
        return;
      }
      console.error('Durable per-round reveal write failed (non-blocking):', error);
    }
  } catch (err) {
    console.warn('Durable per-round reveal write threw (non-blocking):', err);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadSignedPortrait(
  supabase: SupabaseClient,
  character: Record<string, unknown> | null,
  signatureColor: string,
): Promise<RevealPortrait> {
  const artStyle = (character?.art_style as string | undefined) ?? null;
  const fallback: RevealPortrait = {
    path: null,
    signed_url: null,
    thumb_signed_url: null,
    art_style: artStyle,
    seed: null,
    fallback_gradient: gradientFromColor(signatureColor),
  };

  const characterId = character?.id as string | undefined;
  const portrait = await resolveCurrentPortrait(supabase, characterId);
  if (!portrait) return fallback;

  const [signedUrl, thumbSignedUrl] = await Promise.all([
    signPortraitPath(supabase, portrait.image_path),
    portrait.thumb_path
      ? signPortraitPath(supabase, portrait.thumb_path)
      : Promise.resolve(null),
  ]);

  return {
    path: portrait.image_path,
    signed_url: signedUrl,
    thumb_signed_url: thumbSignedUrl,
    art_style: artStyle,
    seed: portrait.seed,
    fallback_gradient: gradientFromColor(signatureColor),
  };
}

/** Current, non-rejected portrait storage paths for a character. */
export interface CurrentPortrait {
  image_path: string;
  thumb_path: string | null;
  seed: number | null;
}

/**
 * Resolve a character's CURRENT, non-rejected portrait storage paths.
 *
 * Single source of truth for the `character_portraits` current-portrait lookup
 * (`is_current = true`, excluding `moderation_status = 'rejected'`). Returns
 * null for bots / missing / rejected portraits and never throws on a query
 * error (returns null so callers degrade gracefully).
 */
export async function resolveCurrentPortrait(
  supabase: SupabaseClient,
  characterId: string | null | undefined,
): Promise<CurrentPortrait | null> {
  if (!characterId) return null;

  const { data: portrait, error } = await supabase
    .from('character_portraits')
    .select('image_path, thumb_path, seed, moderation_status')
    .eq('character_id', characterId)
    .eq('is_current', true)
    .maybeSingle();

  if (error || !portrait) return null;
  const imagePath = portrait.image_path as string | undefined;
  if (!imagePath) return null;
  if (portrait.moderation_status === 'rejected') return null;

  return {
    image_path: imagePath,
    thumb_path: (portrait.thumb_path as string | undefined) ?? null,
    seed: numOrNull(portrait.seed),
  };
}

/**
 * Mint a service-role signed URL for a portrait storage path in the private
 * `character-portraits` bucket. Never throws (returns null on failure) so one
 * portrait can never break a multi-portrait response.
 */
export async function signPortraitPath(
  supabase: SupabaseClient,
  path: string,
  ttlSeconds: number = PORTRAIT_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(PORTRAIT_BUCKET)
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch (err) {
    console.error('Portrait sign failed (non-blocking):', err);
    return null;
  }
}

async function resolveExcerpt(
  supabase: SupabaseClient,
  prompt: Record<string, unknown> | null,
): Promise<string | null> {
  if (!prompt) return null;
  let text = (prompt.custom_prompt_text as string | null) ?? '';
  if (!text && prompt.prompt_template_id) {
    const { data: tpl } = await supabase
      .from('prompt_templates')
      .select('body')
      .eq('id', prompt.prompt_template_id as string)
      .maybeSingle();
    text = (tpl?.body as string | undefined) ?? '';
  }
  return excerpt(text);
}

function excerpt(text: string | null | undefined, max = PROMPT_EXCERPT_MAX): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}\u2026` : trimmed;
}

function moveMatchupResult(self: MoveType, opp: MoveType): MoveMatchupResult {
  if (self === opp) return 'neutral';
  if (
    (self === 'attack' && opp === 'finisher') ||
    (self === 'defense' && opp === 'attack') ||
    (self === 'finisher' && opp === 'defense')
  ) {
    return 'win';
  }
  return 'loss';
}

function readRubric(src: unknown): RevealRubricScores {
  const o = asRecord(src);
  const n = (k: string): number => {
    const v = o[k];
    if (typeof v === 'number') return v;
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    clarity: n('clarity'),
    originality: n('originality'),
    specificity: n('specificity'),
    theme_fit: n('theme_fit'),
    archetype_fit: n('archetype_fit'),
    dramatic_potential: n('dramatic_potential'),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function numOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const VALID_MOVE_TYPES: readonly MoveType[] = ['attack', 'defense', 'finisher'];
function coerceMoveType(value: unknown): MoveType {
  return VALID_MOVE_TYPES.includes(value as MoveType)
    ? (value as MoveType)
    : DEFAULT_MOVE_TYPE;
}

const VALID_ARCHETYPES: readonly Archetype[] = [
  'strategist',
  'trickster',
  'titan',
  'mystic',
  'engineer',
];
function coerceArchetype(value: unknown): Archetype {
  return VALID_ARCHETYPES.includes(value as Archetype)
    ? (value as Archetype)
    : 'strategist';
}

/**
 * Deterministic two-stop gradient from a signature color: [base, shaded]. Used
 * as the reveal's portrait fallback when no signed portrait URL is available.
 */
function gradientFromColor(hex: string): [string, string] {
  return [normalizeHex(hex), shade(hex, -0.45)];
}

function normalizeHex(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? '').trim());
  return m ? `#${m[1].toLowerCase()}` : DEFAULT_P1_COLOR;
}

function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? '').trim());
  if (!m) return DEFAULT_P1_COLOR;
  const int = parseInt(m[1], 16);
  const clamp = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  const r = clamp((int >> 16) & 0xff);
  const g = clamp((int >> 8) & 0xff);
  const b = clamp(int & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
