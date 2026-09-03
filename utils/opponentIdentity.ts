/**
 * Who the other fighter in a battle row is, from the viewer's side.
 *
 * Opponents' `characters` rows are owner-only under RLS, so a list row has two
 * places to learn a fighter's name, archetype and colour:
 *
 * 1. the battle's `tier0_reveal_payload`, frozen at resolve time and carrying
 *    both players (the truth for finished battles);
 * 2. the `public_player_cosmetics` view (`fetchPublicPlayers`), which knows the
 *    opponent's *current* active fighter (the fallback for live battles).
 *
 * Field by field, in that order, then null. Pure, so the order of truth is
 * pinned by tests rather than by a device pass.
 */

import type { PublicPlayerMap } from './publicPlayers';

export interface OpponentIdentity {
  /** The fighter's character name; null when unknown or for a bot. */
  name: string | null;
  archetype: string | null;
  /** As stored (hex or palette key); resolve with `resolveSignatureHex`. */
  signatureColor: string | null;
  isBot: boolean;
}

export interface OpponentIdentityBattle {
  player_one_id?: string | null;
  player_two_id?: string | null;
  is_player_two_bot?: boolean | null;
  tier0_reveal_payload?: unknown;
}

export const UNKNOWN_OPPONENT: OpponentIdentity = {
  name: null,
  archetype: null,
  signatureColor: null,
  isBot: false,
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** `payload.players.<side>` as a loose record, or null when absent. */
function payloadPlayer(
  payload: unknown,
  side: 'player_one' | 'player_two',
): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const players = (payload as Record<string, unknown>).players;
  if (!players || typeof players !== 'object') return null;
  const player = (players as Record<string, unknown>)[side];
  if (!player || typeof player !== 'object') return null;
  return player as Record<string, unknown>;
}

/**
 * The opponent's identity for a battle row.
 *
 * A viewer who is not in the battle (or unknown) is treated as player one, the
 * same default `describeBattleRow` uses. Bots are always player two, so only
 * player one ever faces one; a bot has no profile to look up and no name here
 * (callers keep the shared "Practice bot" vocabulary via `opponentNameFor`),
 * but its persona's archetype and colour are used when the payload has them.
 */
export function opponentIdentityFor(
  battle: OpponentIdentityBattle,
  myProfileId: string | null | undefined,
  publicPlayers?: PublicPlayerMap | null,
): OpponentIdentity {
  const iAmPlayerTwo =
    Boolean(myProfileId) &&
    battle.player_two_id === myProfileId &&
    battle.player_one_id !== myProfileId;
  const opponentSide = iAmPlayerTwo ? 'player_one' : 'player_two';
  const opponentId = iAmPlayerTwo ? battle.player_one_id : battle.player_two_id;
  const isBot = !iAmPlayerTwo && battle.is_player_two_bot === true;

  const frozen = payloadPlayer(battle.tier0_reveal_payload, opponentSide);
  const payloadArchetype = str(frozen?.archetype);
  const payloadColor = str(frozen?.signature_color);

  if (isBot) {
    return {
      name: null,
      archetype: payloadArchetype,
      signatureColor: payloadColor,
      isBot: true,
    };
  }

  const current = opponentId ? publicPlayers?.get(opponentId) : undefined;
  return {
    name: str(frozen?.character_name),
    archetype: payloadArchetype ?? current?.archetype ?? null,
    signatureColor: payloadColor ?? current?.signatureColor ?? null,
    isBot: false,
  };
}
