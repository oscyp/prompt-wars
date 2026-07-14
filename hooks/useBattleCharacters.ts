import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';

export interface BattleCharacterInfo {
  name: string;
  archetype: string;
  signatureColor: string;
  portraitUrl: string | null;
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
export function useBattleCharacters(
  battleId: string | null,
  battle: BattleLike | null,
): { p1: BattleCharacterInfo | null; p2: BattleCharacterInfo | null } {
  const [p1, setP1] = useState<BattleCharacterInfo | null>(null);
  const [p2, setP2] = useState<BattleCharacterInfo | null>(null);

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
        .select('id, name, archetype, signature_color')
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
        };
      };
      setP1((prev) => {
        const next = toInfo(p1CharId, 'Player 1');
        return next ? { ...next, portraitUrl: prev?.portraitUrl ?? null } : prev;
      });
      if (isBot) {
        setP2((prev) => ({
          name: 'Bot Opponent',
          archetype: 'fighter',
          signatureColor: DEFAULT_COLOR,
          portraitUrl: prev?.portraitUrl ?? null,
        }));
      } else {
        setP2((prev) => {
          const next = toInfo(p2CharId, 'Player 2');
          return next ? { ...next, portraitUrl: prev?.portraitUrl ?? null } : prev;
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
        const { data, error } = await supabase.functions.invoke(
          'sign-battle-portraits',
          { body: { battle_id: battleId } },
        );
        if (cancelled || error || !data) return;
        const payload = data as {
          player_one: { portrait_url: string | null } | null;
          player_two: { portrait_url: string | null } | null;
        };
        const p1Url = payload.player_one?.portrait_url ?? null;
        const p2Url = payload.player_two?.portrait_url ?? null;
        setP1((prev) => (prev ? { ...prev, portraitUrl: p1Url } : prev));
        setP2((prev) => (prev ? { ...prev, portraitUrl: p2Url } : prev));
      } catch {
        // Degrade silently to bundled archetype illustrations.
      }
    }
    signPortraits();
    return () => {
      cancelled = true;
    };
  }, [battleId]);

  return { p1, p2 };
}
