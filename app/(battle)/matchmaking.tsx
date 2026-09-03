import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Pressable,
  AccessibilityInfo,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { UiArt } from '@/constants/UiArt';
import { modeLabel } from '@/utils/battleCopy';
import {
  resolveMatchmakingMode,
  matchmakingErrorCopy,
  matchFoundMessage,
  NO_ACTIVE_CHARACTER,
  SEARCHING_MESSAGE,
  type MatchmakingErrorCopy,
} from '@/utils/prebattleCopy';
import { startMatchmaking, hasOpponent } from '@/utils/battles';
import { supabase } from '@/utils/supabase';
import { hapticSuccess } from '@/utils/haptics';
import { useAuth } from '@/providers/AuthProvider';

type Status = 'finding' | 'matched' | 'error';

export default function MatchmakingScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
  const { mode: rawMode } = useLocalSearchParams<{ mode?: string }>();
  const mode = resolveMatchmakingMode(rawMode);

  const [status, setStatus] = useState<Status>('finding');
  const [message, setMessage] = useState(SEARCHING_MESSAGE);
  const [errorCopy, setErrorCopy] = useState<MatchmakingErrorCopy | null>(null);
  // Try again bumps this; the effect below re-runs the search.
  const [attempt, setAttempt] = useState(0);

  // The 1 s "Match found" beat before routing. Held in a ref so unmounting
  // (the player backed out) can cancel it -- a replace that fires after the
  // screen is gone drops the player into a battle they just walked away from.
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
        navTimerRef.current = null;
      }
    };
  }, []);

  const announce = useCallback((text: string) => {
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  const findMatch = useCallback(async () => {
    if (!user) {
      Alert.alert('Signed out', 'Sign in to start a battle.');
      router.back();
      return;
    }

    setStatus('finding');
    setErrorCopy(null);
    setMessage(SEARCHING_MESSAGE);
    announce(SEARCHING_MESSAGE);

    try {
      // Only the ACTIVE character may fight. Without the filter a player with
      // a retired character got "No character found" from a multi-row result.
      const { data: character, error: charError } = await supabase
        .from('characters')
        .select('id')
        .eq('profile_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (charError) {
        throw new Error(charError.message);
      }
      if (!character) {
        throw new Error(NO_ACTIVE_CHARACTER);
      }

      const result = await startMatchmaking(character.id, mode);

      if (!result.battle_id) {
        throw new Error(result.message || 'Matchmaking failed');
      }

      const { data: battleRow } = await supabase
        .from('battles')
        .select(
          'format, player_two_id, player_two_character_id, is_player_two_bot, bot_persona_id',
        )
        .eq('id', result.battle_id)
        .single();

      const opponentReady = Boolean(battleRow) && hasOpponent(battleRow!);
      const matched = result.matched && opponentReady;

      if (matched) {
        const found = matchFoundMessage(result, mode);
        setStatus('matched');
        setMessage(found);
        hapticSuccess();
        announce(`Match found. ${found}`);
      }

      navTimerRef.current = setTimeout(() => {
        navTimerRef.current = null;
        if (matched) {
          router.replace(`/(battle)/face-off?battleId=${result.battle_id}`);
          return;
        }
        router.replace(`/(battle)/waiting?battleId=${result.battle_id}`);
      }, 1000);
    } catch (err) {
      console.error('Matchmaking error:', err);
      const copy = matchmakingErrorCopy(
        err instanceof Error ? err.message : null,
      );
      setStatus('error');
      setErrorCopy(copy);
      setMessage(copy.message);
      announce(`${copy.title}. ${copy.message}`);
    }
  }, [mode, router, user, announce]);

  // `attempt` is the Try-again trigger; findMatch itself only changes with
  // the mode or the session.
  useEffect(() => {
    findMatch();
  }, [findMatch, attempt]);

  const title =
    status === 'matched'
      ? 'Match found'
      : status === 'error'
        ? (errorCopy?.title ?? "Couldn't find a match")
        : 'Scanning the arena';

  return (
    <ImageBackground
      source={UiArt.arenaBackdrop}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Scrim keeps overlay text AA on top of the arena illustration. */}
      <View style={styles.scrim} />
      <View style={styles.content}>
        <Image
          source={UiArt.clash}
          style={styles.clash}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />

        {status === 'finding' && (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={styles.spinner}
            accessibilityLabel="Finding an opponent"
          />
        )}

        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>

        <Text style={styles.message}>{message}</Text>

        {status === 'error' ? (
          <View style={styles.actions}>
            {errorCopy?.canRetry !== false ? (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                onPress={() => setAttempt((n) => n + 1)}
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <Text style={styles.primaryButtonText}>Try again</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                { opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.modeBadge}>
            <Text style={styles.modeText}>{modeLabel(mode).toUpperCase()}</Text>
          </View>
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  // Fixed-dark cinematic surface: the arena backdrop is dark, so the fallback
  // color must be dark too (a light-theme colors.background flash would break
  // the mood and the AA of the white-on-scrim text below).
  container: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 11, 15, 0.45)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  spinner: {
    marginBottom: Spacing.lg,
  },
  clash: {
    width: 128,
    height: 128,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  // On-scrim text uses fixed white (not themed colors) so it stays AA over the
  // dark arena illustration in both light and dark app themes.
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    color: '#FFFFFF',
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  message: {
    fontSize: Typography.sizes.base,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  modeBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  modeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  actions: {
    width: '100%',
    gap: Spacing.sm,
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
    color: '#FFFFFF',
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  secondaryButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: '#FFFFFF',
  },
});
