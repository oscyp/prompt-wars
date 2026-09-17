import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  GameText as Text,
  GameFooter,
  GameButton,
  GameBevel,
} from '@/components/game';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
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
import { useReducedMotion } from '@/hooks/useReducedMotion';
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
import { startMatchmaking, hasOpponent, leaveBattle } from '@/utils/battles';
import { supabase } from '@/utils/supabase';
import { hapticSuccess } from '@/utils/haptics';
import { loadPortraitRef } from '@/utils/characters';
import {
  resolveEquippedCosmetics,
  NO_COSMETICS,
  type EquippedCosmetics,
} from '@/utils/cosmetics';
import { ARENA_TIPS } from '@/utils/arenaTips';
import { useAuth } from '@/providers/AuthProvider';
import FighterEntrance from '@/components/FighterEntrance';
import ArenaTips from '@/components/ArenaTips';
import { generateIdempotencyKey } from '@/utils/characters';
import { inkFor } from '@/utils/contrast';
import { useBattleAudio } from '@/providers/BattleAudioProvider';

type Status = 'finding' | 'matched' | 'error';

/**
 * The player's own fighter for the entrance card. Starts neutral ("You", the
 * archetype's default illustration, the brand colour) and fills in as the
 * character row and then its signed render arrive; the search never waits on
 * either, and a failed read simply leaves the neutral card up.
 */
interface EntranceFighter {
  name: string;
  archetype: string;
  signatureColor: string | null;
  portraitUrl: string | null;
  cosmetics: EquippedCosmetics;
}

const NEUTRAL_FIGHTER: EntranceFighter = {
  name: 'You',
  archetype: '',
  signatureColor: null,
  portraitUrl: null,
  cosmetics: NO_COSMETICS,
};

export default function MatchmakingScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const battleAudio = useBattleAudio();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { mode: rawMode } = useLocalSearchParams<{ mode?: string }>();
  const mode = resolveMatchmakingMode(rawMode);

  const [status, setStatus] = useState<Status>('finding');
  const [message, setMessage] = useState(SEARCHING_MESSAGE);
  const [errorCopy, setErrorCopy] = useState<MatchmakingErrorCopy | null>(null);
  // Try again bumps this; the effect below re-runs the search.
  const [attempt, setAttempt] = useState(0);
  const [fighter, setFighter] = useState<EntranceFighter>(NEUTRAL_FIGHTER);
  // One offset per visit so the tips do not always open on the same line.
  const tipSeed = useRef(Math.floor(Math.random() * ARENA_TIPS.length)).current;
  // One id per visit/action. Error retries reuse it; remounting from a fresh
  // mode selection intentionally creates a new action id.
  const requestIdRef = useRef(generateIdempotencyKey());
  const requestInFlightRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const cancelInFlightRef = useRef(false);
  const createdBattleIdRef = useRef<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // The 1 s "Match found" beat before routing. Held in a ref so unmounting
  // (the player backed out) can cancel it -- a replace that fires after the
  // screen is gone drops the player into a battle they just walked away from.
  const activeVisit = useRef(true);
  const visitNumber = useRef(0);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    activeVisit.current = true;
    requestInFlightRef.current = false;
    const visit = visitNumber.current;
    return () => {
      activeVisit.current = false;
      visitNumber.current = visit + 1;
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
        navTimerRef.current = null;
      }
    };
  }, []);

  const park = useCallback(() => {
    activeVisit.current = false;
    visitNumber.current++;
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
    router.dismissTo('/(tabs)/home');
  }, [router]);

  // Stage the player's fighter. Separate from the search on purpose: this is
  // decoration for the wait, so nothing here may delay or fail the queue.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('characters')
          .select(
            'name, archetype, signature_color, portrait_id, avatar_portrait_id, cosmetic_config',
          )
          .eq('profile_id', userId)
          .eq('is_active', true)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const row = data as {
          name: string | null;
          archetype: string | null;
          signature_color: string | null;
          portrait_id: string | null;
          avatar_portrait_id: string | null;
          cosmetic_config: Record<string, string> | null;
        };
        setFighter({
          name: row.name?.trim() || NEUTRAL_FIGHTER.name,
          archetype: row.archetype ?? '',
          signatureColor: row.signature_color ?? null,
          portraitUrl: null,
          cosmetics: resolveEquippedCosmetics(row.cosmetic_config),
        });
        // The 1:1 avatar is the crop made for circles; the full-body portrait
        // stands in for characters that predate it.
        const portraitId = row.avatar_portrait_id ?? row.portrait_id;
        if (!portraitId) return;
        const ref = await loadPortraitRef(portraitId);
        if (cancelled || !ref.url) return;
        setFighter((f) => ({ ...f, portraitUrl: ref.url }));
      } catch {
        // The neutral card stays up; the search is unaffected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const announce = useCallback((text: string) => {
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  const cancelCreatedBattle = useCallback(
    async (battleId: string) => {
      if (cancelInFlightRef.current) return;
      cancelInFlightRef.current = true;
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
        navTimerRef.current = null;
      }
      const result = await leaveBattle(battleId);
      if (!activeVisit.current) return;
      if (result.success) {
        router.dismissTo('/(tabs)/home');
        return;
      }
      cancelInFlightRef.current = false;
      setIsCancelling(false);
      Alert.alert(
        'Could not cancel search',
        result.error ?? 'Open the battle and try again.',
      );
      router.replace(
        `/(battle)/waiting?battleId=${battleId}&requestId=${requestIdRef.current}`,
      );
    },
    [router],
  );

  const confirmCancelSearch = useCallback(() => {
    if (cancelRequestedRef.current) return;
    Alert.alert(
      'Cancel search?',
      'This ends the search. If an opponent connects first, the server will apply the normal leave rules.',
      [
        { text: 'Keep searching', style: 'cancel' },
        {
          text: 'Cancel search',
          style: 'destructive',
          onPress: () => {
            cancelRequestedRef.current = true;
            setIsCancelling(true);
            announce('Canceling search');
            if (createdBattleIdRef.current) {
              void cancelCreatedBattle(createdBattleIdRef.current);
            }
          },
        },
      ],
    );
  }, [announce, cancelCreatedBattle]);

  const findMatch = useCallback(async () => {
    if (requestInFlightRef.current) return;
    if (!user) {
      Alert.alert('Signed out', 'Sign in to start a battle.');
      router.back();
      return;
    }
    requestInFlightRef.current = true;
    const visit = visitNumber.current;
    const current = () => activeVisit.current && visitNumber.current === visit;

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

      if (!current()) return;
      if (charError) {
        throw new Error(charError.message);
      }
      if (!character) {
        throw new Error(NO_ACTIVE_CHARACTER);
      }

      const result = await startMatchmaking(character.id, mode, {
        requestId: requestIdRef.current,
      });

      if (!current()) return;
      if (!result.battle_id) {
        throw new Error(result.message || 'Matchmaking failed');
      }
      createdBattleIdRef.current = result.battle_id;
      if (cancelRequestedRef.current) {
        await cancelCreatedBattle(result.battle_id);
        return;
      }

      const { data: battleRow } = await supabase
        .from('battles')
        .select(
          'format, player_two_id, player_two_character_id, is_player_two_bot, bot_persona_id',
        )
        .eq('id', result.battle_id)
        .single();

      if (!current()) return;
      const opponentReady = Boolean(battleRow) && hasOpponent(battleRow!);
      const matched = result.matched && opponentReady;

      if (matched) {
        const found = matchFoundMessage(result, mode);
        setStatus('matched');
        setMessage(found);
        hapticSuccess();
        battleAudio.playSound('matchFound');
        announce(`Match found. ${found}`);
      }

      navTimerRef.current = setTimeout(() => {
        navTimerRef.current = null;
        if (!current()) return;
        if (matched) {
          router.replace(`/(battle)/face-off?battleId=${result.battle_id}`);
          return;
        }
        router.replace(
          `/(battle)/waiting?battleId=${result.battle_id}&requestId=${requestIdRef.current}`,
        );
      }, 1000);
    } catch (err) {
      if (!current()) return;
      requestInFlightRef.current = false;
      console.error('Matchmaking error:', err);
      const copy = matchmakingErrorCopy(
        err instanceof Error ? err.message : null,
      );
      setStatus('error');
      setErrorCopy(copy);
      setMessage(copy.message);
      announce(`${copy.title}. ${copy.message}`);
    }
  }, [mode, router, user, announce, battleAudio, cancelCreatedBattle]);

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
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          {status === 'error' ? (
            <Image
              source={UiArt.clash}
              style={styles.clash}
              resizeMode="cover"
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : (
            // The fighter stays on stage through the "Match found" beat; a swap
            // to the clash emblem for one second would read as a glitch.
            <View style={styles.entrance}>
              <GameBevel
                color={colors.ornament}
                insetColor={colors.ornamentMuted}
              />
              <FighterEntrance
                name={fighter.name}
                archetype={fighter.archetype}
                signatureColor={fighter.signatureColor ?? colors.primary}
                portraitUrl={fighter.portraitUrl}
                cosmetics={fighter.cosmetics}
                modeLabel={modeLabel(mode)}
                reduceMotion={reduceMotion}
              />
            </View>
          )}

          <GameDisplayTitle style={styles.title} accessibilityRole="header">
            {title}
          </GameDisplayTitle>

          {status === 'finding' && (
            <ActivityIndicator
              size="small"
              color="#FFFFFF"
              style={styles.spinner}
              accessibilityLabel="Finding an opponent"
            />
          )}

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
                  <Text
                    style={[
                      styles.primaryButtonText,
                      { color: inkFor(colors.primary) },
                    ]}
                  >
                    Try again
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={park}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>
            </View>
          ) : null}

          {status === 'finding' ? (
            <>
              <ArenaTips seed={tipSeed} reduceMotion={reduceMotion} />
              <Pressable
                style={({ pressed }) => [
                  styles.cancelSearchButton,
                  { opacity: pressed || isCancelling ? 0.65 : 1 },
                ]}
                onPress={confirmCancelSearch}
                disabled={isCancelling}
                accessibilityRole="button"
                accessibilityLabel="Cancel search"
                accessibilityState={{ disabled: isCancelling }}
              >
                <Text style={styles.cancelSearchText}>
                  {isCancelling ? 'Canceling…' : 'Cancel search'}
                </Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <SafeAreaView
        edges={['bottom']}
        style={{ backgroundColor: colors.background }}
      >
        <GameFooter>
          <GameButton
            tone="secondary"
            label="Arena · Keep search active"
            accessibilityLabel="Return to Arena; keep search active"
            onPress={park}
          />
        </GameFooter>
      </SafeAreaView>
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
    backgroundColor: 'rgba(11, 11, 15, 0.68)',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingTop: Spacing.lg + 44,
  },
  entrance: {
    padding: 16,
    marginBottom: Spacing.xl,
  },
  spinner: {
    marginBottom: Spacing.md,
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
    minHeight: 48,
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
  cancelSearchButton: {
    minHeight: 48,
    minWidth: 160,
    marginTop: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  cancelSearchText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    textDecorationLine: 'underline',
  },
});
