import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import FaceOffPortraits, { FaceOffPlayer } from '@/components/FaceOffPortraits';
import { supabase } from '@/utils/supabase';
import { StatBlock } from '@/types/battle';
import { leaveBattle } from '@/utils/battles';

interface CharacterRow {
  id: string;
  name: string | null;
  archetype: string;
  signature_color: string | null;
  battle_cry: string | null;
  avatar_asset_url?: string | null;
  portrait_url: string | null;
}

export default function FaceOffScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { battleId } = useLocalSearchParams<{ battleId: string }>();

  const { battle, hp, hp_max, stats_snapshot, isSubscribed } =
    useRealtimeBattle(battleId || null);

  const [chars, setChars] = useState<{
    p1: CharacterRow | null;
    p2: CharacterRow | null;
  }>({ p1: null, p2: null });
  const [loadingChars, setLoadingChars] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  const handledTerminalRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!battle) return;
      const ids = [
        battle.player_one_character_id,
        battle.player_two_character_id,
      ].filter(Boolean) as string[];
      if (ids.length === 0) {
        setLoadingChars(false);
        return;
      }
      const { data, error } = await supabase
        .from('characters')
        .select(
          'id, name, archetype, signature_color, battle_cry, avatar_asset_url',
        )
        .in('id', ids);
      if (cancelled) return;
      if (error || !data) {
        setLoadingChars(false);
        return;
      }
      const byId = new Map<string, CharacterRow>(
        data.map((c) => [
          c.id as string,
          {
            ...(c as Omit<CharacterRow, 'portrait_url'>),
            portrait_url: (c.avatar_asset_url as string | null) ?? null,
          },
        ]),
      );
      setChars({
        p1: byId.get(battle.player_one_character_id) ?? null,
        p2: battle.player_two_character_id
          ? (byId.get(battle.player_two_character_id) ?? null)
          : null,
      });
      setLoadingChars(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [battle]);

  const advance = useCallback(() => {
    if (!battleId) return;
    router.replace(`/(battle)/prompt-entry?battleId=${battleId}&round=1`);
  }, [battleId, router]);

  const isRankedHumanMatch =
    battle?.mode === 'ranked' &&
    !battle.is_player_two_bot &&
    Boolean(battle.player_two_id);

  const leaveLabel = isRankedHumanMatch ? 'Forfeit' : 'Leave Battle';

  const handleLeave = useCallback(() => {
    if (!battleId || !battle || isLeaving) return;

    const title = isRankedHumanMatch
      ? 'Forfeit Ranked Battle?'
      : 'Leave Battle?';
    const message = isRankedHumanMatch
      ? 'This will count as a ranked loss and award the win to your opponent.'
      : 'This will cancel the battle before prompt lock.';
    const actionLabel = isRankedHumanMatch ? 'Forfeit' : 'Leave';

    Alert.alert(title, message, [
      { text: 'Stay', style: 'cancel' },
      {
        text: actionLabel,
        style: 'destructive',
        onPress: async () => {
          setIsLeaving(true);
          try {
            const result = await leaveBattle(battleId);
            if (!result.success) {
              throw new Error(result.error || 'Unable to leave battle.');
            }
            router.replace('/(tabs)/home');
          } catch (err) {
            Alert.alert(
              'Could Not Leave',
              err instanceof Error ? err.message : 'Please try again.',
            );
          } finally {
            setIsLeaving(false);
          }
        },
      },
    ]);
  }, [battle, battleId, isLeaving, isRankedHumanMatch, router]);

  useEffect(() => {
    if (!battle || handledTerminalRef.current) return;

    if (battle.status === 'canceled') {
      handledTerminalRef.current = true;
      Alert.alert('Battle Canceled', 'This battle is no longer available.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/home') },
      ]);
      return;
    }

    if (battle.status === 'completed') {
      handledTerminalRef.current = true;
      router.replace(`/(battle)/result?battleId=${battleId}`);
    }
  }, [battle, battleId, router]);

  // Defensive fallback: if data fails to load within 4s, advance anyway.
  useEffect(() => {
    if (!battleId) return;
    const t = setTimeout(() => {
      if (!battle) {
        advance();
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [battle, battleId, advance]);

  if (!battle || loadingChars) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loading, { color: colors.textSecondary }]}>
          {isSubscribed ? 'Preparing the arena…' : 'Connecting…'}
        </Text>
      </SafeAreaView>
    );
  }

  const playerOne = buildPlayer(
    chars.p1,
    stats_snapshot.p1,
    hp.p1,
    hp_max.p1,
    'Player 1',
  );
  const playerTwo = buildPlayer(
    chars.p2,
    stats_snapshot.p2,
    hp.p2,
    hp_max.p2,
    battle.is_player_two_bot ? 'Bot Opponent' : 'Player 2',
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <FaceOffPortraits
        playerOne={playerOne}
        playerTwo={playerTwo}
        theme={battle.theme}
        onAdvance={advance}
        onLeave={handleLeave}
        leaveLabel={leaveLabel}
        actionsDisabled={isLeaving}
      />
    </SafeAreaView>
  );
}

function buildPlayer(
  c: CharacterRow | null,
  stats: StatBlock,
  hp: number,
  hpMax: number,
  fallbackName: string,
): FaceOffPlayer {
  return {
    characterId: c?.id ?? 'unknown',
    displayName: c?.name ?? fallbackName,
    archetype: c?.archetype ?? 'fighter',
    battleCry: c?.battle_cry ?? null,
    signatureColor: c?.signature_color ?? '#8B5CF6',
    portraitUrl: c?.portrait_url ?? null,
    stats,
    hp,
    hpMax,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  loading: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.base,
  },
});
