import { useEffect, useState } from 'react';
import { supabase, invokeFunctionResult} from '@/utils/supabase';
import {
  resolveEquippedCosmetics,
  NO_COSMETICS,
  type EquippedCosmetics,
} from '@/utils/cosmetics';

export interface BattleCharacterInfo {
  name: string;
  archetype: string;
  signatureColor: string;
  portraitUrl: string | null;
  /**
   * Full-body render, for the tap-to-enlarge viewer. A different image from
   * `portraitUrl` (2:3 full body vs a 1:1 bust), not a larger crop of it, and
   * null for bots and for characters that only ever got one render.
   */
  fighterUrl: string | null;
  /** Equipped cosmetics, already resolved to their presentations. */
  cosmetics: EquippedCosmetics;
}

interface BattleLike {
  player_one_character_id?: string | null;
  player_two_character_id?: string | null;
  is_player_two_bot?: boolean | null;
}

const DEFAULT_COLOR = '#8B5CF6';

/**
 * Character identity (name / archetype / signature color) plus signed portrait
 * URLs for both sides of a battle. Mirrors the face-off screen's data flow:
 * character rows are read under RLS, portraits come from the
 * sign-battle-portraits edge function (~1h TTL signed URLs into the private
 * bucket) and degrade silently to null — callers fall back to the bundled
 * archetype illustrations. Never blocks the caller's screen.
 */
interface SignedSide {
  portrait_url: string | null;
  fighter_url: string | null;
  archetype: string | null;
  name: string | null;
  signature_color: string | null;
  cosmetics: Record<string, string> | null;
}

interface SignedSides {
  player_one: SignedSide | null;
  player_two: SignedSide | null;
}

export function useBattleCharacters(
  battleId: string | null,
  battle: BattleLike | null,
): {
  p1: BattleCharacterInfo | null;
  p2: BattleCharacterInfo | null;
  refreshPortraits: () => void;
} {
  const [p1, setP1] = useState<BattleCharacterInfo | null>(null);
  const [p2, setP2] = useState<BattleCharacterInfo | null>(null);
  // Signed URLs last ~1h but a Bo3 round can run to 2h, and nothing cached
  // them or refreshed them -- so a portrait opened late in a long round showed
  // a broken frame. Bumping this re-signs.
  const [signNonce, setSignNonce] = useState(0);

  const p1CharId = battle?.player_one_character_id ?? null;
  const p2CharId = battle?.player_two_character_id ?? null;
  const isBot = !!battle?.is_player_two_bot;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ids = [p1CharId, p2CharId].filter(Boolean) as string[];
      if (ids.length === 0) return;
      const { data, error } = await supabase
        .from('characters')
        .select('id, name, archetype, signature_color, cosmetic_config')
        .in('id', ids);
      if (cancelled || error || !data) return;
      const byId = new Map(data.map((c) => [c.id as string, c]));
      const toInfo = (id: string | null, fallbackName: string): BattleCharacterInfo | null => {
        if (!id) return null;
        const row = byId.get(id);
        if (!row) return null;
        return {
          name: (row.name as string | null) ?? fallbackName,
          archetype: (row.archetype as string | null) ?? 'fighter',
          signatureColor: (row.signature_color as string | null) ?? DEFAULT_COLOR,
          portraitUrl: null,
          fighterUrl: null,
          cosmetics: resolveEquippedCosmetics(
            row.cosmetic_config as Record<string, string> | null,
          ),
        };
      };
      setP1((prev) => {
        const next = toInfo(p1CharId, 'Player 1');
        return next
          ? {
              ...next,
              portraitUrl: prev?.portraitUrl ?? null,
              fighterUrl: prev?.fighterUrl ?? null,
            }
          : prev;
      });
      if (isBot) {
        setP2((prev) => ({
          name: 'Bot Opponent',
          archetype: 'fighter',
          signatureColor: DEFAULT_COLOR,
          portraitUrl: prev?.portraitUrl ?? null,
          fighterUrl: prev?.fighterUrl ?? null,
          // Bots own no cosmetics.
          cosmetics: NO_COSMETICS,
        }));
      } else {
        setP2((prev) => {
          const next = toInfo(p2CharId, 'Player 2');
          return next
            ? {
                ...next,
                portraitUrl: prev?.portraitUrl ?? null,
                fighterUrl: prev?.fighterUrl ?? null,
              }
            : prev;
        });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [p1CharId, p2CharId, isBot]);

  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;
    async function signPortraits() {
      try {
        const { data, error } = await invokeFunctionResult<SignedSides>(
          'sign-battle-portraits',
          { battle_id: battleId },
        );
        if (cancelled || error || !data) return;

        // Merge the server payload INTO whatever the direct query produced,
        // creating the side when it produced nothing.
        //
        // This previously read `prev ? {...prev, portraitUrl} : prev`, which
        // dropped the result whenever `prev` was null -- and `prev` is null for
        // exactly the side the client cannot read. RLS on `characters` is
        // `profile_id = auth.uid()`, so that is always the OPPONENT: their
        // portrait was fetched successfully and then discarded, and their name
        // and archetype had no path at all. The face-off screen showed a blank
        // circle, "Player 1"/"Player 2" and "fighter" for every human opponent.
        const apply = (
          side: SignedSide | null | undefined,
          fallbackName: string,
        ) =>
        (prev: BattleCharacterInfo | null): BattleCharacterInfo | null => {
          if (!side) return prev;
          if (prev) {
            // Own side: keep the authoritative local row, add the portrait.
            return {
              ...prev,
              portraitUrl: side.portrait_url ?? prev.portraitUrl,
              fighterUrl: side.fighter_url ?? prev.fighterUrl,
            };
          }
          // Opponent: the server payload is the only source we have.
          return {
            name: side.name ?? fallbackName,
            archetype: side.archetype ?? 'fighter',
            signatureColor: side.signature_color ?? DEFAULT_COLOR,
            portraitUrl: side.portrait_url ?? null,
            fighterUrl: side.fighter_url ?? null,
            cosmetics: resolveEquippedCosmetics(side.cosmetics),
          };
        };

        setP1(apply(data.player_one, 'Player 1'));
        setP2(apply(data.player_two, isBot ? 'Bot Opponent' : 'Player 2'));
      } catch {
        // Degrade silently to bundled archetype illustrations.
      }
    }
    signPortraits();
    return () => {
      cancelled = true;
    };
  }, [battleId, isBot, signNonce]);

  return { p1, p2, refreshPortraits: () => setSignNonce((n) => n + 1) };
}
