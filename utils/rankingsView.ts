/**
 * Pure shaping for the leaderboard rows.
 *
 * Kept out of the screen so the rank words, medal tiers and the "pin the
 * viewer under the list" rule can be tested without mounting a FlatList.
 */

export interface RankingRow {
  id?: string | null;
  profile_id: string;
  rank: number | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  profile?: { username?: string | null; display_name?: string | null } | null;
}

export type MedalTier = 'gold' | 'silver' | 'bronze';

/** Podium tier for a rank, or null off the podium. */
export function medalFor(rank: number | null | undefined): MedalTier | null {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return null;
}

/** "#12" for a ranked row, an em dash for one the season has not placed. */
export function rankDisplay(rank: number | null | undefined): string {
  return typeof rank === 'number' && rank > 0 ? `#${rank}` : '—';
}

/** "1st place", "2nd place", "3rd place", then "Rank 12"; "Unranked" for null. */
export function ordinalRank(rank: number | null | undefined): string {
  if (typeof rank !== 'number' || rank <= 0) return 'Unranked';
  if (rank === 1) return '1st place';
  if (rank === 2) return '2nd place';
  if (rank === 3) return '3rd place';
  return `Rank ${rank}`;
}

/** The name a leaderboard row shows. */
export function rankingPlayerName(row: RankingRow): string {
  return row.profile?.display_name || row.profile?.username || 'Unknown player';
}

/** "10W - 2L - 1D" as prose: "10 wins, 2 losses, 1 draw". */
export function recordSentence(row: {
  wins: number;
  losses: number;
  draws: number;
}): string {
  const count = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  return [
    count(row.wins, 'win', 'wins'),
    count(row.losses, 'loss', 'losses'),
    count(row.draws, 'draw', 'draws'),
  ].join(', ');
}

/**
 * One screen-reader label per row: rank as a word (not colour), name, rating
 * and the full record.
 */
export function rankingRowLabel(row: RankingRow, isViewer: boolean): string {
  const who = isViewer
    ? `${rankingPlayerName(row)} (you)`
    : rankingPlayerName(row);
  return `${ordinalRank(row.rank)}: ${who}, rating ${Math.round(row.rating)}, ${recordSentence(row)}`;
}

/**
 * Whether the viewer's own row should be pinned under the list: only when
 * they have one and it is not already visible.
 */
export function shouldPinViewerRow(
  listed: readonly { profile_id: string }[],
  viewer: { profile_id: string } | null | undefined,
): boolean {
  if (!viewer) return false;
  return !listed.some((row) => row.profile_id === viewer.profile_id);
}
