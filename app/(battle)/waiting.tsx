import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useAuth } from '@/providers/AuthProvider';
import { startMatchmaking } from '@/utils/battles';

export default function WaitingScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
  const { battleId } = useLocalSearchParams<{ battleId: string }>();

  const { battle, prompts, isSubscribed } = useRealtimeBattle(battleId || null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  const myPrompt = prompts.find((p) => p.profile_id === user?.id);
  const opponentPrompt = prompts.find((p) => p.profile_id !== user?.id);

  const myPromptLocked = myPrompt?.is_locked || false;
  const opponentPromptLocked = opponentPrompt?.is_locked || false;

  // Cleanup retry timer on unmount or battle change
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [battleId]);

  // Handle queued battle fallback retry
  useEffect(() => {
    if (!battle || !user) return;

    // Clear existing timer when battle changes
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    // Schedule retry for created battles where user is player_one
    if (
      battle.status === 'created' &&
      battle.player_one_id === user.id &&
      battle.player_one_character_id &&
      battle.mode
    ) {
      const createdAt = new Date(battle.created_at).getTime();
      const fallbackTime = createdAt + 60000; // 60 seconds after creation
      const now = Date.now();
      const delay = Math.max(0, fallbackTime - now);

      retryTimerRef.current = setTimeout(async () => {
        try {
          setRetryMessage('Checking for bot match...');
          const result = await startMatchmaking(battle.player_one_character_id, battle.mode as any);

          if (result.matched) {
            // Navigate to prompt entry with the returned battle_id
            router.replace(`/(battle)/prompt-entry?battleId=${result.battle_id}`);
          } else {
            // Update message and keep waiting
            if (result.message) {
              setRetryMessage(result.message);
            }
            // If backend returned a different battle_id while unmatched, replace waiting screen
            if (result.battle_id !== battleId) {
              router.replace(`/(battle)/waiting?battleId=${result.battle_id}`);
            }
          }
        } catch (err) {
          console.error('Matchmaking retry failed:', err);
          setRetryMessage('Retry failed, waiting for updates...');
        }
      }, delay);
    }
  }, [battle, user, battleId, router]);

  useEffect(() => {
    if (!battle) return;

    // Navigate to result screen when ready or if generation failed
    if (battle.status === 'result_ready' || battle.status === 'completed' || battle.status === 'generation_failed') {
      router.replace(`/(battle)/result?battleId=${battleId}`);
      return;
    }

    // If battle becomes matched/waiting_for_prompts and user hasn't submitted, navigate to prompt entry
    if ((battle.status === 'matched' || battle.status === 'waiting_for_prompts') && !myPromptLocked) {
      router.replace(`/(battle)/prompt-entry?battleId=${battleId}`);
    }
  }, [battle, myPromptLocked, battleId, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />

        <Text style={[styles.title, { color: colors.text }]}>
          {battle?.status === 'resolving' ? 'Battle Resolving' : 'Waiting for Opponent'}
        </Text>

        {battle?.theme && (
          <View style={[styles.themeCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.themeLabel, { color: colors.textSecondary }]}>Theme</Text>
            <Text style={[styles.themeText, { color: colors.primary }]}>{battle.theme}</Text>
          </View>
        )}

        {/* Status Checklist */}
        <View style={[styles.statusCard, { backgroundColor: colors.card }]}>
          <View style={styles.statusRow}>
            <Text style={[styles.statusIcon, { color: myPromptLocked ? colors.success : colors.textSecondary }]}>
              {myPromptLocked ? '✓' : '○'}
            </Text>
            <Text style={[styles.statusText, { color: colors.text }]}>Your prompt submitted</Text>
          </View>

          <View style={styles.statusRow}>
            <Text
              style={[
                styles.statusIcon,
                { color: opponentPromptLocked ? colors.success : colors.textSecondary },
              ]}
            >
              {opponentPromptLocked ? '✓' : '○'}
            </Text>
            <Text style={[styles.statusText, { color: colors.text }]}>Opponent's prompt submitted</Text>
          </View>

          {battle?.status === 'resolving' && (
            <View style={styles.statusRow}>
              <Text style={[styles.statusIcon, { color: colors.warning }]}>⚡</Text>
              <Text style={[styles.statusText, { color: colors.text }]}>Judge is scoring...</Text>
            </View>
          )}
        </View>

        {!isSubscribed && (
          <Text style={[styles.realtimeWarning, { color: colors.textSecondary }]}>
            Realtime updates connecting...
          </Text>
        )}

        {retryMessage && (
          <Text style={[styles.retryMessage, { color: colors.textSecondary }]}>
            {retryMessage}
          </Text>
        )}

        {/* Back to Home */}
        <TouchableOpacity
          style={[styles.homeButton, { backgroundColor: colors.backgroundTertiary }]}
          onPress={() => router.push('/(tabs)/home')}
          accessibilityLabel="Return to home"
          accessibilityRole="button"
        >
          <Text style={[styles.homeButtonText, { color: colors.text }]}>Return to Home</Text>
        </TouchableOpacity>

        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          You'll be notified when the result is ready
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  spinner: {
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  themeCard: {
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.lg,
    width: '100%',
  },
  themeLabel: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.xs,
  },
  themeText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  statusCard: {
    padding: Spacing.lg,
    borderRadius: 12,
    width: '100%',
    marginBottom: Spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statusIcon: {
    fontSize: Typography.sizes.xl,
    marginRight: Spacing.md,
    width: 32,
    textAlign: 'center',
  },
  statusText: {
    fontSize: Typography.sizes.base,
  },
  realtimeWarning: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  retryMessage: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.lg,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  homeButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.md,
  },
  homeButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  hint: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
});
