import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import { BorderRadius, Spacing, Typography } from '@/constants/DesignTokens';
import { startMatchmaking } from '@/utils/battles';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { ARCHETYPES, ArchetypeId } from '@/constants/Archetypes';
import {
  ArchetypeBadge,
  GlowGradientButton,
  NeonGridBackground,
  ScreenContainer,
} from '@/components';

export default function MatchmakingScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
  const { mode = 'ranked' } = useLocalSearchParams<{ mode?: string }>();

  const [status, setStatus] = useState<'finding' | 'matched' | 'error'>('finding');
  const [message, setMessage] = useState('Scanning the arena for worthy foes…');
  const [character, setCharacter] = useState<any>(null);

  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);

  useEffect(() => {
    ring1.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
    ring2.value = withRepeat(
      withTiming(1, {
        duration: 1800,
        easing: Easing.out(Easing.quad),
      }),
      -1,
      false
    );
  }, [ring1, ring2]);

  const ring1Style = useAnimatedStyle(() => ({
    opacity: 1 - ring1.value,
    transform: [{ scale: 1 + ring1.value * 1.2 }],
  }));
  const ring2Style = useAnimatedStyle(() => ({
    opacity: 0.6 - ring2.value * 0.6,
    transform: [{ scale: 1 + ring2.value * 1.6 }],
  }));

  useEffect(() => {
    findMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findMatch = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be signed in');
      router.back();
      return;
    }
    try {
      const { data: char, error: charError } = await supabase
        .from('characters')
        .select('*')
        .eq('profile_id', user.id)
        .single();
      if (charError || !char) {
        throw new Error('No character found. Please create a character first.');
      }
      setCharacter(char);
      setMessage('Searching the arena…');

      const result = await startMatchmaking(char.id, mode as any);

      if (result.battle_id) {
        setStatus('matched');
        setMessage(result.message || (result.matched ? 'Match found!' : 'Battle queued…'));
        setTimeout(() => {
          if (result.matched) {
            router.replace(`/(battle)/prompt-entry?battleId=${result.battle_id}`);
          } else {
            router.replace(`/(battle)/waiting?battleId=${result.battle_id}`);
          }
        }, 900);
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
        [{ text: 'OK', onPress: () => router.back() }],
      );
    }
  };

  const archetypeId = (character?.archetype as ArchetypeId) ?? 'strategist';
  const archetype = ARCHETYPES[archetypeId];

  return (
    <ScreenContainer padded={false}>
      <NeonGridBackground
        glowColors={[`${archetype.gradient[1]}AA`, `${colors.background}00`, `${colors.background}00`]}
      />
      <View style={styles.content}>
        <View style={styles.modeBadgeWrap}>
          <View
            style={[
              styles.modeBadge,
              {
                backgroundColor: `${colors.accent}1F`,
                borderColor: colors.accent,
              },
            ]}
          >
            <MaterialCommunityIcons name="lightning-bolt" size={14} color={colors.accent} />
            <Text style={[styles.modeText, { color: colors.accent }]}>
              {(mode as string).toUpperCase()} MODE
            </Text>
          </View>
        </View>

        <View style={styles.center}>
          <View style={styles.ringWrap}>
            <Animated.View
              style={[
                styles.ring,
                { borderColor: archetype.color },
                ring2Style,
              ]}
            />
            <Animated.View
              style={[
                styles.ring,
                { borderColor: archetype.color },
                ring1Style,
              ]}
            />
            <ArchetypeBadge archetypeId={archetypeId} size="xl" animated />
          </View>

          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                textShadowColor: colors.glowPrimary,
              },
            ]}
          >
            {status === 'matched' ? 'MATCH FOUND' : 'SEARCHING'}
          </Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {message}
          </Text>
        </View>

        {status === 'error' && (
          <View style={styles.actions}>
            <GlowGradientButton
              title="Try Again"
              onPress={findMatch}
              variant="primary"
              size="lg"
              fullWidth
              iconLeft="refresh"
            />
          </View>
        )}

        {status === 'finding' && (
          <View style={styles.actions}>
            <GlowGradientButton
              title="Cancel"
              onPress={() => router.back()}
              variant="ghost"
              size="md"
              fullWidth
            />
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xl,
    justifyContent: 'space-between',
  },
  modeBadgeWrap: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  modeText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.widest,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  ringWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  ring: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
  },
  title: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.display2,
    letterSpacing: Typography.letterSpacing.wider,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    marginBottom: Spacing.md,
  },
  message: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.base,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  actions: {
    paddingBottom: Spacing.lg,
  },
});
