/**
 * The Profile tab's view model: everything the screen says about a player's
 * standing, derived from rows the client can already read. Pure, so the rules
 * ("unrated until a ranked battle", "which unlock is nearest") are pinned by
 * tests rather than by a device pass.
 */

import { ARCHETYPES, type ArchetypeId } from '@/constants/Archetypes';
import type { CosmeticItem } from '@/utils/cosmetics';

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

export interface RatingView {
  value: string;
  caption: string;
  rated: boolean;
}

/**
 * `profiles.rating` defaults to 1500 before anyone has played a rated battle,
 * and `last_rated_at` is not client-readable, so "have I been rated" is
 * answered from the player's own battle history instead.
 */
export function ratingView(input: {
  rating: number | null | undefined;
  hasRatedBattle: boolean;
}): RatingView {
  if (
    !input.hasRatedBattle ||
    input.rating === null ||
    input.rating === undefined
  ) {
    return {
      value: 'Unrated',
      caption: 'Win or lose a ranked battle to get a rating',
      rated: false,
    };
  }
  return {
    value: `${Math.round(input.rating)}`,
    caption: 'Rating',
    rated: true,
  };
}

/** A completed ranked battle against a human is what moves a rating. */
export function isRatedBattle(battle: {
  mode?: string | null;
  status?: string | null;
  is_player_two_bot?: boolean | null;
}): boolean {
  return (
    battle.mode === 'ranked' &&
    battle.status === 'completed' &&
    battle.is_player_two_bot !== true
  );
}

// ---------------------------------------------------------------------------
// Next unlock
// ---------------------------------------------------------------------------

export interface UnlockProgress {
  wins: number;
  totalBattles: number;
  bestStreak: number;
  /** Null when unknown (the daily-meta call failed); login rules are skipped. */
  loginStreak: number | null;
}

export type UnlockMetric =
  | 'wins'
  | 'total_battles'
  | 'best_streak'
  | 'daily_login_streak';

export interface NextUnlock {
  item: CosmeticItem;
  metric: UnlockMetric;
  remaining: number;
  target: number;
  /** "2 more wins to unlock Iron Frame" */
  hint: string;
}

const METRIC_NOUN: Record<UnlockMetric, [string, string]> = {
  wins: ['win', 'wins'],
  total_battles: ['battle', 'battles'],
  best_streak: ['more win in a row', 'more wins in a row'],
  daily_login_streak: ['more day', 'more days'],
};

function progressFor(metric: UnlockMetric, p: UnlockProgress): number | null {
  switch (metric) {
    case 'wins':
      return p.wins;
    case 'total_battles':
      return p.totalBattles;
    case 'best_streak':
      return p.bestStreak;
    case 'daily_login_streak':
      return p.loginStreak;
  }
}

/**
 * The closest earned cosmetic the player does not own yet.
 *
 * `level` rules are ignored: nothing in the game grants XP, so a level goal
 * can never be reached and must not be shown as one. Rules on a metric we
 * cannot read (login streak when daily-meta failed) are skipped too.
 */
export function nextUnlock(
  items: readonly CosmeticItem[],
  progress: UnlockProgress,
): NextUnlock | null {
  let best: NextUnlock | null = null;
  for (const item of items) {
    if (item.owned || !item.unlock_rule) continue;
    for (const [metric, target] of Object.entries(item.unlock_rule)) {
      if (!(metric in METRIC_NOUN)) continue;
      const m = metric as UnlockMetric;
      const have = progressFor(m, progress);
      if (have === null || typeof target !== 'number') continue;
      const remaining = target - have;
      if (remaining <= 0) continue;
      if (
        !best ||
        remaining < best.remaining ||
        (remaining === best.remaining && item.sort_order < best.item.sort_order)
      ) {
        const [one, many] = METRIC_NOUN[m];
        const noun = remaining === 1 ? one : many;
        const hint: string =
          m === 'wins' || m === 'total_battles'
            ? `${remaining} more ${noun} to unlock ${item.name}`
            : `${remaining} ${noun} to unlock ${item.name}`;
        best = { item, metric: m, remaining, target, hint };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Rivals
// ---------------------------------------------------------------------------

export interface RivalRecord {
  wins: number;
  losses: number;
  draws: number;
  total: number;
}

export interface RivalBattleLike {
  status?: string | null;
  winner_id?: string | null;
  is_draw?: boolean | null;
  player_one_id?: string | null;
  player_two_id?: string | null;
  created_at?: string | null;
  tier0_reveal_payload?: unknown;
}

/** Wins, losses and draws against one opponent, from the viewer's side. */
export function rivalRecord(
  battles: readonly RivalBattleLike[],
  myId: string,
): RivalRecord {
  const rec: RivalRecord = { wins: 0, losses: 0, draws: 0, total: 0 };
  for (const b of battles) {
    if (b.status !== 'completed') continue;
    rec.total += 1;
    if (b.is_draw) rec.draws += 1;
    else if (b.winner_id === myId) rec.wins += 1;
    else if (b.winner_id) rec.losses += 1;
  }
  return rec;
}

/** "3–1" or "3–1–1" (draws only when there are any). */
export function rivalRecordLabel(rec: RivalRecord): string {
  return rec.draws > 0
    ? `${rec.wins}–${rec.losses}–${rec.draws}`
    : `${rec.wins}–${rec.losses}`;
}

export function rivalRecordSentence(rec: RivalRecord): string {
  const parts = [
    `${rec.wins} ${rec.wins === 1 ? 'win' : 'wins'}`,
    `${rec.losses} ${rec.losses === 1 ? 'loss' : 'losses'}`,
  ];
  if (rec.draws > 0)
    parts.push(`${rec.draws} ${rec.draws === 1 ? 'draw' : 'draws'}`);
  return parts.join(', ');
}

export interface RivalIdentity {
  name: string | null;
  archetype: string | null;
  signatureColor: string | null;
}

/**
 * Who the rival is, read from the newest battle's reveal payload — the one
 * place an opponent's archetype, name and colour are client-readable. Null
 * fields when no completed battle carries a payload.
 */
export function rivalIdentityFromBattles(
  battles: readonly RivalBattleLike[],
  rivalId: string,
): RivalIdentity {
  const sorted = [...battles].sort(
    (a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''),
  );
  for (const b of sorted) {
    const root = (b.tier0_reveal_payload ?? null) as Record<
      string,
      unknown
    > | null;
    if (!root) continue;
    const players = (root.players ?? {}) as Record<
      string,
      Record<string, unknown> | undefined
    >;
    const side =
      b.player_one_id === rivalId
        ? players.player_one
        : b.player_two_id === rivalId
          ? players.player_two
          : undefined;
    if (!side) continue;
    return {
      name:
        typeof side.character_name === 'string' ? side.character_name : null,
      archetype: typeof side.archetype === 'string' ? side.archetype : null,
      signatureColor:
        typeof side.signature_color === 'string' ? side.signature_color : null,
    };
  }
  return { name: null, archetype: null, signatureColor: null };
}

// ---------------------------------------------------------------------------
// Progression strip
// ---------------------------------------------------------------------------

export interface SeasonRankView {
  rank: number | null;
  seasonName: string | null;
  endsAt: string | null;
}

export interface ProgressionRow {
  key: 'winStreak' | 'loginStreak' | 'rank' | 'unlock';
  label: string;
  value: string;
  detail?: string;
  tone: 'up' | 'neutral';
  /** Where a tap goes; rows without a route are information only. */
  route?: '/(tabs)/rankings' | '/(profile)/shop';
  accessibilityLabel: string;
}

export function seasonEndsLabel(
  endsAt: string | null,
  now: number = Date.now(),
): string | null {
  if (!endsAt) return null;
  const ms = Date.parse(endsAt) - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return 'ended';
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 1) return 'ends today';
  return `ends in ${days} days`;
}

export function progressionRows(input: {
  currentStreak: number;
  bestStreak: number;
  loginStreak: number | null;
  rank: SeasonRankView | null;
  hasRatedBattle: boolean;
  unlock: NextUnlock | null;
  now?: number;
}): ProgressionRow[] {
  const rows: ProgressionRow[] = [];
  const { currentStreak, bestStreak } = input;

  const isNewBest = currentStreak > 1 && currentStreak === bestStreak;
  const streakDetail = isNewBest
    ? 'New best'
    : bestStreak > 0
      ? `Best ${bestStreak}`
      : undefined;
  rows.push({
    key: 'winStreak',
    label: 'Win streak',
    value: `${currentStreak}`,
    detail: streakDetail,
    tone: currentStreak > 0 ? 'up' : 'neutral',
    accessibilityLabel: `Win streak ${currentStreak}${streakDetail ? `, ${streakDetail.toLowerCase()}` : ''}`,
  });

  if (input.loginStreak !== null) {
    const n = input.loginStreak;
    rows.push({
      key: 'loginStreak',
      label: 'Login streak',
      value: `${n} ${n === 1 ? 'day' : 'days'}`,
      detail: n > 0 ? 'Come back tomorrow to keep it' : undefined,
      tone: n > 0 ? 'up' : 'neutral',
      accessibilityLabel: `Login streak ${n} ${n === 1 ? 'day' : 'days'}`,
    });
  }

  if (input.rank && input.rank.rank !== null) {
    const ends = seasonEndsLabel(input.rank.endsAt, input.now);
    const detail =
      [input.rank.seasonName, ends].filter(Boolean).join(' · ') || undefined;
    rows.push({
      key: 'rank',
      label: 'Season rank',
      value: `#${input.rank.rank}`,
      detail,
      tone: 'up',
      route: '/(tabs)/rankings',
      accessibilityLabel: `Season rank ${input.rank.rank}${detail ? `, ${detail}` : ''}. Opens rankings`,
    });
  } else {
    rows.push({
      key: 'rank',
      label: 'Season rank',
      value: 'Unranked',
      detail: input.hasRatedBattle
        ? 'Standings update after each ranked battle'
        : 'Play a ranked battle to enter the season',
      tone: 'neutral',
      route: '/(tabs)/rankings',
      accessibilityLabel: 'Season rank: unranked. Opens rankings',
    });
  }

  if (input.unlock) {
    rows.push({
      key: 'unlock',
      label: 'Next unlock',
      value: input.unlock.item.name,
      detail: input.unlock.hint,
      tone: 'neutral',
      route: '/(profile)/shop',
      accessibilityLabel: `Next unlock: ${input.unlock.item.name}. ${input.unlock.hint}. Opens the shop`,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Fighter card
// ---------------------------------------------------------------------------

export interface FighterCardCopy {
  name: string;
  /** "The Titan · Brass compass" */
  subtitle: string;
  battleCry: string | null;
  accessibilityLabel: string;
}

export function fighterCardCopy(input: {
  name: string | null | undefined;
  archetype: string | null | undefined;
  battleCry: string | null | undefined;
  itemName: string | null | undefined;
}): FighterCardCopy {
  const name = input.name?.trim() || 'Your fighter';
  const arch =
    input.archetype && input.archetype in ARCHETYPES
      ? ARCHETYPES[input.archetype as ArchetypeId].name
      : null;
  const subtitle = [arch, input.itemName?.trim() || null]
    .filter(Boolean)
    .join(' · ');
  const cry = input.battleCry?.trim();
  const battleCry = cry ? `“${cry}”` : null;
  return {
    name,
    subtitle,
    battleCry,
    accessibilityLabel:
      [name, subtitle, cry ? `battle cry ${cry}` : null]
        .filter(Boolean)
        .join(', ') + '. Opens Edit character',
  };
}

export const PROFILE_ERROR_COPY = {
  title: 'Couldn’t load your profile',
  body: 'Check your connection and try again.',
  retry: 'Retry',
} as const;
