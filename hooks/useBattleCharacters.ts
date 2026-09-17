import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { invokeFunctionResult } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import {
  resolveEquippedCosmetics,
  type EquippedCosmetics,
} from '@/utils/cosmetics';
import type { BattleIdentitySnapshot } from '@/types/battle';

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
  identity_snapshot?: BattleIdentitySnapshot | null;
}
interface SignedSide {
  name: string | null;
  archetype: string | null;
  signature_color: string | null;
  portrait_url: string | null;
  fighter_url: string | null;
  cosmetics: Record<string, string> | null;
}
interface SignedSides {
  player_one: SignedSide | null;
  player_two: SignedSide | null;
}
const cache = new Map<string, { value: SignedSides; expires: number }>();
function toInfo(
  side: SignedSide | null | undefined,
): BattleCharacterInfo | null {
  return side
    ? {
        name: side.name ?? 'Fighter',
        archetype: side.archetype ?? 'strategist',
        signatureColor: side.signature_color ?? '#8B5CF6',
        portraitUrl: side.portrait_url,
        fighterUrl: side.fighter_url,
        cosmetics: resolveEquippedCosmetics(side.cosmetics),
      }
    : null;
}
export function useBattleCharacters(
  battleId: string | null,
  battle: BattleLike | null,
): {
  p1: BattleCharacterInfo | null;
  p2: BattleCharacterInfo | null;
  refreshPortraits: () => void;
} {
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const key = accountId && battleId ? `${accountId}:${battleId}` : null;
  const [signed, setSigned] = useState<{
    key: string;
    value: SignedSides;
  } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNonce((n) => n + 1);
    });
    const timer = setInterval(() => setNonce((n) => n + 1), 50 * 60 * 1000);
    return () => {
      listener.remove();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!key || !battleId) {
      setSigned(null);
      if (!accountId) cache.clear();
      return;
    }
    let active = true;
    const cached = cache.get(key);
    if (cached) setSigned({ key, value: cached.value });
    async function sign() {
      try {
        const { data, error } = await invokeFunctionResult<SignedSides>(
          'sign-battle-portraits',
          { battle_id: battleId },
        );
        if (!active || error || !data) return;
        cache.set(key!, { value: data, expires: Date.now() + 50 * 60 * 1000 });
        setSigned({ key: key!, value: data });
      } catch {
        /* Keep frozen identity; a manual or foreground retry re-signs. */
      }
    }
    if (!cached || cached.expires <= Date.now() || nonce > 0) void sign();
    return () => {
      active = false;
    };
  }, [key, battleId, accountId, nonce]);
  const snapshot = battle?.identity_snapshot;
  const fallback = (
    side: BattleIdentitySnapshot['player_one'] | undefined,
  ): SignedSide | null =>
    side
      ? {
          name: side.name,
          archetype: side.archetype,
          signature_color: side.signature_color,
          portrait_url: null,
          fighter_url: null,
          cosmetics: side.cosmetic_config,
        }
      : null;
  const value = signed?.key === key ? signed?.value : null;
  return {
    p1: toInfo(value?.player_one ?? fallback(snapshot?.player_one)),
    p2: toInfo(value?.player_two ?? fallback(snapshot?.player_two)),
    refreshPortraits: () => setNonce((n) => n + 1),
  };
}
