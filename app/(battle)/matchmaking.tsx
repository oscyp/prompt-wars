import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { startMatchmaking } from '@/utils/battles';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';

export default function MatchmakingScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
  const { mode = 'ranked' } = useLocalSearchParams<{ mode?: string }>();

  const [status, setStatus] = useState<'finding' | 'matched' | 'error'>('finding');
  const [message, setMessage] = useState('Finding opponent...');

  useEffect(() => {
    findMatch();
  }, []);

  const findMatch = async () => {
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
        setStatus('matched');
        setMessage(result.message || (result.matched ? 'Match found!' : 'Battle queued...'));

        // Navigate to prompt entry if matched, or waiting if async queued
        setTimeout(() => {
          if (result.matched) {
            router.replace(`/(battle)/prompt-entry?battleId=${result.battle_id}`);
          } else {
            router.replace(`/(battle)/waiting?battleId=${result.battle_id}`);
          }
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
  };

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
