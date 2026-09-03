import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Pressable,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useBattleExitGuard } from '@/hooks/useBattleExitGuard';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import type { BattleCharacterInfo } from '@/hooks/useBattleCharacters';
import { usePortraitViewer } from '@/hooks/usePortraitViewer';
import { useAuth } from '@/providers/AuthProvider';
import FaceOffPortraits, { FaceOffPlayer } from '@/components/FaceOffPortraits';
import PortraitViewer from '@/components/PortraitViewer';
import SeriesScoreIndicator from '@/components/SeriesScoreIndicator';
import { supabase } from '@/utils/supabase';
import { StatBlock } from '@/types/battle';
import { BattleMode } from '@/utils/battles';
import { inkFor } from '@/utils/contrast';

/** How long a missing battle row is a spinner before it is a problem. */
const LOAD_TIMEOUT_MS = 6000;
/**
 * How long to hold the clash for character identity to arrive. Names and
 * colours come from a second query and a signing call; playing the slide-in
 * with "Player 2" and swapping the name mid-animation looked like a bug.
 */
const CHARACTER_GRACE_MS = 1500;

export default function FaceOffScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { battleId } = useLocalSearchParams<{ battleId: string }>();

  const { user } = useAuth();
  const {
    battle,
    prompts,
    format,
    hp,
    hp_max,
    stats_snapshot,
    series_score,
    isSubscribed,
    refetch,
  } = useRealtimeBattle(battleId || null);

  const { p1, p2, refreshPortraits } = useBattleCharacters(
    battleId || null,
    battle,
  );
  const portraitViewer = usePortraitViewer(refreshPortraits);

  // The hook does not carry the battle cry, and the opponent's was never
  // readable (characters RLS is owner-only), so this only ever fetched our
  // own. Kept as a tiny side query rather than widening the shared hook.
  const [myBattleCry, setMyBattleCry] = useState<string | null>(null);
  const isPlayerOne = battle ? battle.player_one_id === user?.id : true;
  const myCharacterId = battle
    ? isPlayerOne
      ? battle.player_one_character_id
      : battle.player_two_character_id
    : null;
  useEffect(() => {
    if (!myCharacterId) return;
    let cancelled = false;
    supabase
      .from('characters')
      .select('battle_cry')
      .eq('id', myCharacterId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setMyBattleCry((data?.battle_cry as string | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [myCharacterId]);

  const handledTerminalRef = useRef(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [graceElapsed, setGraceElapsed] = useState(false);

  // No battle row after LOAD_TIMEOUT_MS is a problem the player can act on,
  // not a reason to advance blind: the old 4 s auto-advance sent people into
  // move-select for a battle that had not loaded, where nothing worked.
  useEffect(() => {
    if (!battleId || battle) return;
    const t = setTimeout(() => setLoadTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [battleId, battle]);

  useEffect(() => {
    if (!battle) return;
    const t = setTimeout(() => setGraceElapsed(true), CHARACTER_GRACE_MS);
    return () => clearTimeout(t);
  }, [battle]);

  const currentRound = battle?.current_round ?? 1;
  const isBo3 = format === 'bo3';

  const isRankedHumanMatch =
    battle?.mode === 'ranked' &&
    !battle.is_player_two_bot &&
    Boolean(battle.player_two_id);

  const leaveLabel = isRankedHumanMatch ? 'Forfeit' : 'Leave Battle';

  // Android hardware back is the only navigation off this screen (the header
  // and swipe gesture are off in the layout), and it used to abandon the
  // battle silently. The guard funnels it into the same dialog as the footer
  // button. Leaving is usually free here, but not always: a Bo3 re-entry can
  // reach the face-off after a round-1 lock, and then it costs credits -- the
  // shared hook reads the lock state, so the dialog says the right thing.
  const leave = useBattleExitGuard(battleId || null, {
    format,
    mode: (battle?.mode ?? 'ranked') as BattleMode,
    isBot: Boolean(battle?.is_player_two_bot),
    prompts,
    myProfileId: user?.id,
    enabled: Boolean(battle),
  });

  const handleLeave = () => leave.confirmLeave();
  const { exitTo } = leave;

  // Continue is a router.replace, and a replace removes this screen -- which
  // the guard above would intercept with the leave dialog. exitTo stands the
  // guard down first. (This is what made bot battles look broken: Continue
  // asked "Leave battle?", and confirming cancelled the battle.)
  const advance = useCallback(() => {
    if (!battleId) return;
    exitTo(() =>
      router.replace(
        `/(battle)/move-select?battleId=${battleId}&round=${currentRound}`,
      ),
    );
  }, [battleId, router, currentRound, exitTo]);

  useEffect(() => {
    if (!battle || handledTerminalRef.current) return;

    if (
      battle.status === 'canceled' ||
      battle.status === 'expired' ||
      battle.status === 'moderation_failed'
    ) {
      handledTerminalRef.current = true;
      Alert.alert('Battle ended', 'This battle is no longer available.', [
        {
          text: 'OK',
          onPress: () => exitTo(() => router.replace('/(tabs)/home')),
        },
      ]);
      return;
    }

    if (
      battle.status === 'completed' ||
      battle.status === 'generation_failed'
    ) {
      handledTerminalRef.current = true;
      exitTo(() => router.replace(`/(battle)/result?battleId=${battleId}`));
    }
  }, [battle, battleId, router, exitTo]);

  if (!battle && loadTimedOut) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: colors.background }]}
      >
        <Text
          style={[styles.errorTitle, { color: colors.text }]}
          accessibilityRole="header"
        >
          Couldn't load this battle
        </Text>
        <Text style={[styles.loading, { color: colors.textSecondary }]}>
          Check your connection and try again.
        </Text>
        <View style={styles.errorActions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={() => {
              setLoadTimedOut(false);
              refetch();
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text
              style={[
                styles.primaryButtonText,
                { color: inkFor(colors.primary) },
              ]}
            >
              Retry
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            onPress={() => router.replace('/(tabs)/home')}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const charactersReady = Boolean(p1 && p2);
  if (!battle || (!charactersReady && !graceElapsed)) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator
          size="large"
          color={colors.primary}
          accessibilityLabel="Loading the arena"
        />
        <Text style={[styles.loading, { color: colors.textSecondary }]}>
          {isSubscribed ? 'Preparing the arena…' : 'Connecting…'}
        </Text>
      </SafeAreaView>
    );
  }

  // The viewer is always on the left, as on every other arena screen.
  const me = isPlayerOne ? p1 : p2;
  const them = isPlayerOne ? p2 : p1;
  const myStats = isPlayerOne ? stats_snapshot.p1 : stats_snapshot.p2;
  const theirStats = isPlayerOne ? stats_snapshot.p2 : stats_snapshot.p1;
  const myHp = isPlayerOne ? hp.p1 : hp.p2;
  const theirHp = isPlayerOne ? hp.p2 : hp.p1;
  const myHpMax = isPlayerOne ? hp_max.p1 : hp_max.p2;
  const theirHpMax = isPlayerOne ? hp_max.p2 : hp_max.p1;

  const openViewer = (c: BattleCharacterInfo | null) =>
    portraitViewer.canOpen(c) ? () => portraitViewer.open(c) : undefined;

  const theirCharacterId = isPlayerOne
    ? battle.player_two_character_id
    : battle.player_one_character_id;

  const mine = buildPlayer({
    info: me,
    characterId: myCharacterId,
    fallbackName: 'You',
    label: 'YOU',
    stats: myStats,
    hp: myHp,
    hpMax: myHpMax,
    battleCry: myBattleCry,
    fallbackColor: colors.primary,
    onPortraitPress: openViewer(me),
  });
  const theirs = buildPlayer({
    info: them,
    characterId: theirCharacterId,
    fallbackName: battle.is_player_two_bot ? 'Bot Opponent' : 'Opponent',
    label: 'OPPONENT',
    stats: theirStats,
    hp: theirHp,
    hpMax: theirHpMax,
    battleCry: null,
    fallbackColor: colors.textSecondary,
    onPortraitPress: openViewer(them),
  });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <FaceOffPortraits
        playerOne={mine}
        playerTwo={theirs}
        theme={battle.theme}
        roundLabel={isBo3 ? `Round ${currentRound}` : null}
        header={
          isBo3 ? (
            <SeriesScoreIndicator
              score={series_score}
              currentRound={currentRound}
              format={format}
              bestOf={battle.best_of ?? 3}
              viewer={isPlayerOne ? 'p1' : 'p2'}
            />
          ) : null
        }
        onAdvance={advance}
        onLeave={handleLeave}
        leaveLabel={leaveLabel}
        actionsDisabled={leave.isLeaving}
      />
      <PortraitViewer
        visible={portraitViewer.visible}
        uri={portraitViewer.viewer?.uri ?? null}
        caption={portraitViewer.viewer?.caption}
        aspect={portraitViewer.viewer?.aspect}
        onImageError={portraitViewer.handleError}
        onClose={portraitViewer.close}
      />
    </SafeAreaView>
  );
}

function buildPlayer(args: {
  info: BattleCharacterInfo | null;
  characterId: string | null | undefined;
  fallbackName: string;
  label: string;
  stats: StatBlock;
  hp: number;
  hpMax: number;
  battleCry: string | null;
  fallbackColor: string;
  onPortraitPress?: () => void;
}): FaceOffPlayer {
  const { info } = args;
  return {
    onPortraitPress: args.onPortraitPress,
    characterId: args.characterId ?? 'unknown',
    displayName: info?.name ?? args.fallbackName,
    archetype: info?.archetype ?? 'fighter',
    battleCry: args.battleCry,
    signatureColor: info?.signatureColor ?? args.fallbackColor,
    portraitUrl: info?.portraitUrl ?? null,
    cosmetics: info?.cosmetics,
    label: args.label,
    stats: args.stats,
    hp: args.hp,
    hpMax: args.hpMax,
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
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  errorActions: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  secondaryButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
