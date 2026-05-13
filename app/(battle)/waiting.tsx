import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useAuth } from '@/providers/AuthProvider';
import { retryBattleResolution, startMatchmaking } from '@/utils/battles';
import {
  Card,
  GlowGradientButton,
  NeonGridBackground,
  ScreenContainer,
} from '@/components';

export default function WaitingScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { battleId } = useLocalSearchParams<{ battleId: string }>();

  const { battle, prompts, isSubscribed } = useRealtimeBattle(battleId || null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resolveRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasRetriedResolutionRef = useRef(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  const myPrompt = prompts.find((p) => p.profile_id === user?.id);
  const opponentPrompt = prompts.find((p) => p.profile_id !== user?.id);
  const myPromptLocked = myPrompt?.is_locked || false;
  const opponentPromptLocked = opponentPrompt?.is_locked || false;

  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.linear }),
      -1,
      false
    );
  }, [spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (resolveRetryTimerRef.current) clearTimeout(resolveRetryTimerRef.current);
    };
  }, [battleId]);

  useEffect(() => {
    hasRetriedResolutionRef.current = false;
  }, [battleId]);

  useEffect(() => {
    if (!battle || !user) return;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (
      battle.status === 'created' &&
      battle.player_one_id === user.id &&
      battle.player_one_character_id &&
      battle.mode
    ) {
      const createdAt = new Date(battle.created_at).getTime();
      const fallbackTime = createdAt + 60000;
      const delay = Math.max(0, fallbackTime - Date.now());
      retryTimerRef.current = setTimeout(async () => {
        try {
          setRetryMessage('Checking for bot match…');
          const result = await startMatchmaking(
            battle.player_one_character_id,
            battle.mode as any
          );
          if (result.matched) {
            router.replace(
              `/(battle)/prompt-entry?battleId=${result.battle_id}`
            );
          } else {
            if (result.message) setRetryMessage(result.message);
            if (result.battle_id !== battleId) {
              router.replace(`/(battle)/waiting?battleId=${result.battle_id}`);
            }
          }
        } catch (err) {
          console.error('Matchmaking retry failed:', err);
          setRetryMessage('Retry failed, waiting for updates…');
        }
      }, delay);
    }
  }, [battle, user, battleId, router]);

  useEffect(() => {
    if (!battle) return;
    if (
      battle.status === 'result_ready' ||
      battle.status === 'completed' ||
      battle.status === 'generation_failed'
    ) {
      router.replace(`/(battle)/result?battleId=${battleId}`);
      return;
    }
    if (
      (battle.status === 'matched' ||
        battle.status === 'waiting_for_prompts') &&
      !myPromptLocked
    ) {
      router.replace(`/(battle)/prompt-entry?battleId=${battleId}`);
    }
  }, [battle, myPromptLocked, battleId, router]);

  useEffect(() => {
    if (!battleId || !battle || battle.status !== 'resolving') return;
    if (hasRetriedResolutionRef.current || resolveRetryTimerRef.current) return;
    resolveRetryTimerRef.current = setTimeout(async () => {
      hasRetriedResolutionRef.current = true;
      resolveRetryTimerRef.current = null;
      try {
        setRetryMessage('Still resolving. Asking the judge to retry…');
        const result = await retryBattleResolution(battleId);
        if (result.error) {
          setRetryMessage('Judge retry failed. Waiting for updates…');
          return;
        }
        setRetryMessage('Judge finished. Loading result…');
      } catch (err) {
        console.error('Battle resolution retry failed:', err);
        setRetryMessage('Judge retry failed. Waiting for updates…');
      }
    }, 5000);
  }, [battle, battleId]);

  const isResolving = battle?.status === 'resolving';

  return (
    <ScreenContainer padded={false}>
      <NeonGridBackground />
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
      >
        <View style={styles.spinnerWrap}>
          <Animated.View
            style={[
              styles.ring,
              {
                borderColor: colors.accent,
                borderTopColor: 'transparent',
              },
              spinStyle,
            ]}
          />
          <MaterialCommunityIcons
            name={isResolving ? 'scale-balance' : 'timer-sand'}
            size={40}
            color={colors.accent}
          />
        </View>

        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              textShadowColor: colors.glowAccent,
            },
          ]}
        >
          {isResolving ? 'JUDGING' : 'STAND BY'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {isResolving
            ? 'Our judges weigh your prompts…'
            : 'Waiting for both warriors to lock in.'}
        </Text>

        {battle?.theme && (
          <Card variant="neon" style={styles.themeCard}>
            <Text style={[styles.themeEyebrow, { color: colors.accent }]}>
              THEME
            </Text>
            <Text style={[styles.themeText, { color: colors.text }]}>
              "{battle.theme}"
            </Text>
          </Card>
        )}

        <View style={styles.lockGrid}>
          <LockTile
            label="You"
            locked={myPromptLocked}
            color={colors.accent}
            colors={colors}
          />
          <LockTile
            label="Opponent"
            locked={opponentPromptLocked}
            color={colors.accentAlt}
            colors={colors}
          />
        </View>

        {!isSubscribed && (
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Realtime updates connecting…
          </Text>
        )}
        {retryMessage && (
          <Text style={[styles.retryMsg, { color: colors.textSecondary }]}>
            {retryMessage}
          </Text>
        )}

        <View style={styles.bottomActions}>
          <GlowGradientButton
            title="Return Home"
            onPress={() => router.push('/(tabs)/home')}
            variant="ghost"
            size="md"
            fullWidth
            iconLeft="home-outline"
          />
          <Text style={[styles.notifyHint, { color: colors.textTertiary }]}>
            You'll be notified when the result is ready
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

function LockTile({
  label,
  locked,
  color,
  colors,
}: {
  label: string;
  locked: boolean;
  color: string;
  colors: ReturnType<typeof useThemedColors>;
}) {
  return (
    <Card
      variant="glass"
      style={[
        styles.lockTile,
        locked && {
          borderColor: color,
          shadowColor: color,
          shadowOpacity: 0.5,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 0 },
        },
      ]}
    >
      <View
        style={[
          styles.lockIconWrap,
          { backgroundColor: locked ? `${color}33` : colors.surface2 },
        ]}
      >
        <MaterialCommunityIcons
          name={locked ? 'lock-check' : 'lock-open-variant-outline'}
          size={28}
          color={locked ? color : colors.textTertiary}
        />
      </View>
      <Text style={[styles.lockLabel, { color: colors.text }]}>{label}</Text>
      <Text
        style={[
          styles.lockStatus,
          { color: locked ? color : colors.textTertiary },
        ]}
      >
        {locked ? 'LOCKED IN' : 'WAITING'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  spinnerWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  ring: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
  },
  title: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.display2,
    letterSpacing: Typography.letterSpacing.wider,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.base,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  themeCard: {
    width: '100%',
    marginBottom: Spacing.lg,
  },
  themeEyebrow: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.widest,
    marginBottom: Spacing.xs,
  },
  themeText: {
    fontFamily: Typography.fonts.display,
    fontSize: Typography.sizes.lg,
    lineHeight: Typography.sizes.lg * 1.3,
  },
  lockGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
    marginBottom: Spacing.lg,
  },
  lockTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  lockIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  lockLabel: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.base,
    marginBottom: 2,
  },
  lockStatus: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: Typography.letterSpacing.widest,
  },
  hint: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  retryMsg: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.sm,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  bottomActions: {
    width: '100%',
    marginTop: 'auto',
  },
  notifyHint: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
