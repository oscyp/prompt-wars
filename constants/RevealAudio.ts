/**
 * Client-side reveal audio registry (Tier 0 "wow moment").
 *
 * Maps the server-authored, deterministic reveal ids to *bundled* audio assets:
 *   - `reveal_spec.music_track_id`  -> a short musical victory / draw sting
 *   - `reveal_spec.move_sting_id`   -> a per-move-type impact sting
 *
 * The id VALUES below are emitted by the server and must stay in lockstep with
 * `supabase/functions/_shared/providers.ts` (MockImageProvider.getMusicSting) and
 * `compose-reveal-payload.ts` (`move_sting_${winner move_type}` / `move_sting_draw`).
 * If the server adds or renames an id, add or rename the matching key here.
 *
 * SHIPPING STATE: every value is `null` on purpose — no licensed audio is bundled
 * yet, so the reveal plays silently. Playback code treats a `null`/missing entry
 * as a graceful no-op (it never throws), so real files "just slot in" later: drop
 * the file into `assets/audio/...` and swap the `null` for a `require(...)`.
 *
 * WHERE TO PUT REAL FILES (see assets/audio/README.md):
 *   - Music stings -> assets/audio/music/<name>.m4a   (~6 tracks, ~1.5-3s each)
 *   - Move stings  -> assets/audio/stings/<name>.m4a  (3 moves + draw, <1s each)
 * Prefer .m4a/.aac or .mp3 (broad iOS + Android support). Keep them short and
 * pre-trimmed; this layer plays each once and never loops.
 */

/** Music sting ids (server: MockImageProvider.getMusicSting, by winner archetype / draw). */
export type MusicTrackId =
  | 'music_tactical_victory' // strategist wins
  | 'music_chaos_triumph' // trickster wins
  | 'music_power_surge' // titan wins
  | 'music_ethereal_win' // mystic wins
  | 'music_precision_success' // engineer wins
  | 'music_draw_ambiguous' // draw
  | 'music_default_win'; // fallback

/** Move-type sting ids (server: `move_sting_${winner move_type}` or `move_sting_draw`). */
export type MoveStingId =
  | 'move_sting_attack'
  | 'move_sting_defense'
  | 'move_sting_finisher'
  | 'move_sting_draw';

/**
 * A bundled audio asset reference (the number returned by `require()`), or
 * `null` when no file is shipped for that id yet.
 */
export type BundledAudio = number | null;

/**
 * `music_track_id` -> bundled music sting.
 *
 * Swap a `null` for e.g. `require('@/assets/audio/music/tactical_victory.m4a')`
 * once the licensed file exists.
 */
export const MUSIC_TRACKS: Record<MusicTrackId, BundledAudio> = {
  music_tactical_victory: require('@/assets/audio/music/music_tactical_victory.mp3'),
  music_chaos_triumph: require('@/assets/audio/music/music_chaos_triumph.mp3'),
  music_power_surge: require('@/assets/audio/music/music_power_surge.mp3'),
  music_ethereal_win: require('@/assets/audio/music/music_ethereal_win.mp3'),
  music_precision_success: require('@/assets/audio/music/music_precision_success.mp3'),
  music_draw_ambiguous: require('@/assets/audio/music/music_draw_ambiguous.mp3'),
  music_default_win: require('@/assets/audio/music/music_default_win.mp3'),
};

/**
 * `move_sting_id` -> bundled move-type sting.
 *
 * Swap a `null` for e.g. `require('@/assets/audio/stings/attack.m4a')` once the
 * licensed file exists.
 */
export const MOVE_STINGS: Record<MoveStingId, BundledAudio> = {
  move_sting_attack: null, // require('@/assets/audio/stings/attack.m4a')
  move_sting_defense: null, // require('@/assets/audio/stings/defense.m4a')
  move_sting_finisher: null, // require('@/assets/audio/stings/finisher.m4a')
  move_sting_draw: null, // require('@/assets/audio/stings/draw.m4a')
};

/**
 * Resolve a bundled music sting for a `music_track_id`. Unknown or unshipped ids
 * return `null` (the caller must treat that as "play nothing").
 */
export function getMusicTrackSource(id?: string | null): number | null {
  if (!id) return null;
  const src = (MUSIC_TRACKS as Record<string, BundledAudio>)[id];
  return src ?? null;
}

/**
 * Resolve a bundled move sting for a `move_sting_id`. Unknown or unshipped ids
 * return `null` (the caller must treat that as "play nothing").
 */
export function getMoveStingSource(id?: string | null): number | null {
  if (!id) return null;
  const src = (MOVE_STINGS as Record<string, BundledAudio>)[id];
  return src ?? null;
}
