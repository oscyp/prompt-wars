import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { startMatchmaking } from '@/utils/battles';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';

interface BattleRoutingRow {
  format?: string | null;
  player_two_id?: string | null;
  player_two_character_id?: string | null;
  is_player_two_bot?: boolean | null;
  bot_persona_id?: string | null;
}

function hasOpponent(row: BattleRoutingRow | null): boolean {
  if (!row) return false;
  if (row.is_player_two_bot) return Boolean(row.bot_persona_id);
  return Boolean(row.player_two_id && row.player_two_character_id);
}

export default function MatchmakingScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
  const { mode = 'ranked' } = useLocalSearchParams<{ mode?: string }>();

  const [status, setStatus] = useState<'finding' | 'matched' | 'error'>('finding');
  const [message, setMessage] = useState('Finding opponent...');

  const findMatch = useCallback(async () => {
    if (!user) {
      Alert.alert('Error', 'You must be signed in');
      router.back();
      return;
    }

    try {
      // Get user's active character
      const { data: character, error: charError } = await supabase
        .from('characters')
        .select('id')
        .eq('profile_id', user.id)
        .single();

      if (charError || !character) {
        throw new Error('No character found. Please create a character first.');
      }

      setMessage('Finding the perfect opponent...');

      // Start matchmaking
      const result = await startMatchmaking(character.id, mode as any);

      if (result.battle_id) {
        const { data: battleRow } = await supabase
          .from('battles')
          .select(
            'format, player_two_id, player_two_character_id, is_player_two_bot, bot_persona_id',
          )
          .eq('id', result.battle_id)
          .single();
        const routeRow = (battleRow ?? null) as BattleRoutingRow | null;

        setStatus(result.matched ? 'matched' : 'finding');
        setMessage(
          result.message ||
            (result.matched
              ? result.is_bot_battle
                ? 'Bot opponent found!'
                : 'Opponent found!'
              : 'Searching for opponent...'),
        );

        setTimeout(() => {
          if (result.matched && hasOpponent(routeRow)) {
            router.replace(`/(battle)/face-off?battleId=${result.battle_id}`);
            return;
          }

          router.replace(`/(battle)/waiting?battleId=${result.battle_id}`);
        }, 1000);
      } else {
        throw new Error(result.message || 'Matchmaking failed');
      }
    } catch (err) {
      console.error('Matchmaking error:', err);
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to find match');
      
      Alert.alert(
        'Matchmaking Failed',
        err instanceof Error ? err.message : 'Please try again',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  }, [mode, router, user]);

  useEffect(() => {
    findMatch();
  }, [findMatch]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {status === 'finding' && (
          <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
        )}
        
        {status === 'matched' && (
          <Text style={[styles.emoji, { color: colors.primary }]}>⚔️</Text>
        )}

        <Text style={[styles.title, { color: colors.text }]}>
          {status === 'matched' ? 'Match Found!' : 'Finding Opponent'}
        </Text>
        
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          {message}
        </Text>

        <View style={[styles.modeBadge, { backgroundColor: colors.backgroundTertiary }]}>
          <Text style={[styles.modeText, { color: colors.primary }]}>
            {(mode as string).toUpperCase()} MODE
          </Text>
        </View>
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
  emoji: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  message: {
    fontSize: Typography.sizes.base,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  modeBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 16,
  },
  modeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
});
