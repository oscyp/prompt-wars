import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ImpactFeedbackStyle } from 'expo-haptics';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import {
  generateMoveSuggestions,
  getBattle,
  getMoveSuggestions,
  submitPrompt,
  BattleMode,
  MoveSuggestion,
  MoveType,
} from '@/utils/battles';
import { MOVE_META } from '@/constants/MoveTypes';
import { validatePromptText } from '@/utils/promptSelection';
import { hapticImpact, hapticSelection } from '@/utils/haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useLeaveBattle } from '@/hooks/useLeaveBattle';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import { usePortraitViewer } from '@/hooks/usePortraitViewer';
import SeriesScoreIndicator from '@/components/SeriesScoreIndicator';
import HPBar from '@/components/HPBar';
import VersusStrip from '@/components/VersusStrip';
import PortraitViewer from '@/components/PortraitViewer';
import HeaderLeaveButton from '@/components/HeaderLeaveButton';

// Judge length normalization (soft target 15–80 words, penalty past 100 —
// see _shared/judge.ts normalizeScores). Client-side hint only.
const WORDS_MIN_GOOD = 15;
const WORDS_MAX_GOOD = 80;
const WORDS_PENALTY = 100;

// Lock-in ceremony: press-and-hold duration before the submit fires.
const HOLD_DURATION_MS = 600;

const MOVE_TYPES: MoveType[] = ['attack', 'defense', 'finisher'];

export default function PromptEntryScreen() {
  const colors = useThemedColors();
  // Dyslexia-friendly spacing on the theme + prompt-writing surface (§22a).
  const accessibleText = useAccessibleTextStyle();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    battleId,
    round,
    moveType: moveTypeParam,
  } = useLocalSearchParams<{
    battleId: string;
    round?: string;
    moveType?: string;
  }>();

  // The move type is now chosen on move-select and arrives as a param. It is
  // NOT defaulted: a silent fallback to 'attack' would submit a move the
  // player never picked, and they would not find out until the reveal.
  const moveType = MOVE_TYPES.includes(moveTypeParam as MoveType)
    ? (moveTypeParam as MoveType)
    : null;

  const [battle, setBattle] = useState<{ theme?: string | null } | null>(null);
  const [suggestions, setSuggestions] = useState<MoveSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  // Reading an existing set is a single indexed select; generating one is an
  // LLM round trip. Only the second is worth warning the player about, and
  // showing "this takes a few seconds" over a 200ms read would just flash.
  const [suggestionsGenerating, setSuggestionsGenerating] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  // Which retry is safe here, not merely whether one is. A generation failure
  // provably released the slot, so re-generating costs what the failed attempt
  // did; a failed *read* proves nothing about the slot, so it must re-read
  // first or it could silently buy a set the player already owns. A credit or
  // rate-limit wall is not retryable at all.
  const [suggestionRetry, setSuggestionRetry] = useState<
    'read' | 'generate' | null
  >(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(
    null,
  );
  const [customText, setCustomText] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Realtime Bo3 state (HP, series score, opponent move history).
  const {
    battle: rtBattle,
    prompts,
    rounds,
    format,
    current_round,
    series_score,
    hp,
    hp_max,
  } = useRealtimeBattle(battleId || null);

  const roundNumber = round ? Number(round) : current_round;

  // Derive the round from the number THIS SCREEN is showing, not from
  // battle.current_round.
  //
  // The hook's `current_round_data` is keyed strictly off `battle.current_round`,
  // but this screen takes its round from the `?round=` param. Right after
  // round-result navigates to round N+1 the server has not advanced yet, so
  // `current_round` is still N -- and the countdown and the "opponent locked
  // in" indicator described the previous round while the player wrote for the
  // next one. round-result.tsx already derives correctly; this mirrors it.
  const roundData = useMemo(
    () => rounds.find((r) => r.round_number === roundNumber) ?? null,
    [rounds, roundNumber],
  );
  const isBo3 = format === 'bo3';

  // useLeaveBattle, not useBattleExitGuard: back from this screen returns to
  // move-select, which is still inside the battle. Guarding it would ask a
  // player whether they want to forfeit every time they changed their mind
  // about attack vs defense. Leaving gets its own explicit button instead.
  const leave = useLeaveBattle(battleId || null, {
    format,
    mode: (rtBattle?.mode ?? 'ranked') as BattleMode,
    isBot: Boolean(rtBattle?.is_player_two_bot),
    prompts,
    myProfileId: user?.id,
  });

  const isPlayerOne = rtBattle?.player_one_id === user?.id;
  const myHp = isPlayerOne ? hp.p1 : hp.p2;
  const myHpMax = isPlayerOne ? hp_max.p1 : hp_max.p2;
  const oppHp = isPlayerOne ? hp.p2 : hp.p1;
  const oppHpMax = isPlayerOne ? hp_max.p2 : hp_max.p1;

  // Both characters for the versus header strip (names + signed portraits).
  const {
    p1: p1Char,
    p2: p2Char,
    refreshPortraits,
  } = useBattleCharacters(battleId || null, rtBattle);
  const portraitViewer = usePortraitViewer(refreshPortraits);
  const myChar = isPlayerOne ? p1Char : p2Char;
  const oppChar = isPlayerOne ? p2Char : p1Char;

  // Lock-in deadline for the countdown: per-round for Bo3, per-player for single.
  const myDeadline = isBo3
    ? (roundData?.lock_in_deadline ?? null)
    : isPlayerOne
      ? (rtBattle?.player_one_prompt_deadline ?? null)
      : (rtBattle?.player_two_prompt_deadline ?? null);

  // Opponent lock status (never move type or content). Bo3 uses the current
  // round's per-round timestamps; single uses the battle-level columns. All
  // fields are nullable on legacy rows and simply yield "not locked".
  const opponentHasLocked = useMemo<boolean>(() => {
    if (!rtBattle) return false;
    if (isBo3) {
      const rd = roundData;
      if (!rd) return false;
      return Boolean(
        isPlayerOne ? rd.player_two_locked_at : rd.player_one_locked_at,
      );
    }
    return Boolean(
      isPlayerOne
        ? rtBattle.player_two_locked_at
        : rtBattle.player_one_locked_at,
    );
  }, [rtBattle, isBo3, roundData, isPlayerOne]);

  // Live custom-prompt quality hints (mirrors the judge's length
  // normalization; theme check is a simple keyword heuristic).
  const customWordCount = useMemo(() => {
    const trimmed = customText.trim();
    return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  }, [customText]);
  const referencesTheme = useMemo(() => {
    const theme = (battle?.theme ?? '').toLowerCase();
    if (!theme || customText.trim().length === 0) return false;
    const themeWords = theme.split(/\W+/).filter((w) => w.length > 3);
    const text = customText.toLowerCase();
    return themeWords.some((w) => text.includes(w));
  }, [battle?.theme, customText]);

  // Mount guard: no valid move type means this screen was reached without a
  // choice being made. Redirect rather than defaulting -- a silent 'attack'
  // would submit a move the player never picked and they would only find out
  // at the reveal. `replace` so back does not bounce them straight back here.
  useEffect(() => {
    if (!battleId) return;
    if (!moveType) {
      router.replace(
        `/(battle)/move-select?battleId=${battleId}&round=${roundNumber}`,
      );
    }
  }, [battleId, moveType, roundNumber, router]);

  useEffect(() => {
    loadData();
  }, [battleId]);

  /**
   * Loads the free suggestion set for this move type.
   *
   * `paid` is not a request parameter -- the server decides free-vs-paid from
   * its own index and reports back what happened. This flag only controls the
   * confirmation copy shown before the call.
   */
  const loadSuggestions = useCallback(
    async (paid: boolean) => {
      if (!battleId || !moveType) return;
      setSuggestionsLoading(true);
      setSuggestionsGenerating(true);
      setSuggestionsError(null);
      setSuggestionRetry(null);
      try {
        const result = await generateMoveSuggestions(
          battleId as string,
          moveType,
          roundNumber,
        );
        if (result.set) {
          setSuggestions(result.set.suggestions);
          setSelectedSuggestion(null);
          setSuggestionRetry(null);
        } else if (result.failure === 'insufficient_credits') {
          setSuggestionsError('Not enough credits for another set.');
          setSuggestionRetry(null);
        } else if (result.failure === 'rate_limited') {
          setSuggestionsError(
            'Too many suggestion requests — try again in a few minutes.',
          );
          setSuggestionRetry(null);
        } else {
          // A generation failure releases the slot AND refunds the credit
          // server-side (generate-move-suggestions: "Release the slot so a
          // provider outage does not consume the free set"), so retrying costs
          // the player exactly what the failed attempt did. Offer the retry:
          // with the static templates gone, this state has no other way
          // forward except writing from scratch.
          setSuggestionsError(
            paid
              ? 'Could not generate new ideas. You were not charged.'
              : 'Ideas unavailable right now.',
          );
          setSuggestionRetry('generate');
        }
      } finally {
        setSuggestionsLoading(false);
        setSuggestionsGenerating(false);
      }
    },
    [battleId, moveType, roundNumber],
  );

  // On mount, READ any set already generated for this slot; only generate
  // when there is none.
  //
  // Generating on every mount would charge the player for navigating: the free
  // slot is spent on the first call and every later call for the same
  // (battle, round, move type) is a paid reroll. Walking back to change the
  // move and forward again is normal use, not a purchase.
  //
  // Never retried automatically either -- every generate call costs money
  // server-side, and a retry loop during a provider outage would burn the
  // player's rate limit for nothing. A failure offers the player a button
  // instead, so the retry is one deliberate call rather than a loop.

  // Guards against a stale read landing after the player has changed move or
  // round: only the newest call may write state. Replaces the `cancelled` flag
  // the effect used to own, which no longer fits now that the retry button
  // calls this outside any effect.
  const suggestionRunRef = useRef(0);

  const readOrGenerateSuggestions = useCallback(async () => {
    if (!battleId || !moveType) return;
    const run = ++suggestionRunRef.current;
    const isStale = () => run !== suggestionRunRef.current;

    setSuggestionsLoading(true);
    setSuggestionsGenerating(false);
    setSuggestionsError(null);
    setSuggestionRetry(null);
    try {
      const existing = await getMoveSuggestions(
        battleId as string,
        moveType,
        roundNumber,
      );
      if (isStale()) return;
      if (existing.length > 0) {
        setSuggestions(existing);
        setSuggestionsLoading(false);
        return;
      }
    } catch {
      if (isStale()) return;
      setSuggestionsLoading(false);
      // The read is free, so this is safe to offer again -- but it must go
      // back through the read, never straight to generate: a failed read
      // proves nothing about whether a set already exists, and generating on
      // top of one is a purchase. It has to say *something* too; the ideas are
      // the whole tab now, so failing silently would leave the player staring
      // at a header and nothing else.
      setSuggestionsError('Could not load your ideas.');
      setSuggestionRetry('read');
      return;
    }
    if (isStale()) return;
    await loadSuggestions(false);
  }, [battleId, moveType, roundNumber, loadSuggestions]);

  useEffect(() => {
    readOrGenerateSuggestions();
  }, [readOrGenerateSuggestions]);

  const loadData = async () => {
    if (!battleId) {
      Alert.alert('Error', 'No battle ID');
      router.back();
      return;
    }

    try {
      const battleData = await getBattle(battleId as string);
      setBattle(battleData as { theme?: string | null });
    } catch (err) {
      console.error('Failed to load prompt entry data:', err);
      Alert.alert('Error', 'Failed to load battle');
    } finally {
      setIsLoading(false);
    }
  };

  // Shared pre-flight validation: used both before starting the hold gesture
  // (so a hold never ends in a validation error) and inside the submit path.
  // Tapping a suggestion fills `customText`, so both entry paths validate the
  // same way -- see utils/promptSelection.ts.
  const validateSelection = useCallback((): boolean => {
    const problem = validatePromptText(customText);
    if (problem) {
      Alert.alert(problem.title, problem.message);
      return false;
    }
    return true;
  }, [customText]);

  // --- Lock-in ceremony state (press-and-hold) -------------------------------
  const holdProgress = useSharedValue(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showHoldHint, setShowHoldHint] = useState(false);

  // Screen readers can't perform a timed hold; fall back to tap + confirm.
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (mounted) setScreenReaderEnabled(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setScreenReaderEnabled,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(
    () => () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    },
    [],
  );

  const handleSubmit = async () => {
    if (!battleId) return;

    if (!validateSelection()) return;

    setIsSubmitting(true);

    try {
      const result = await submitPrompt(
        battleId as string,
        // Non-null by the time submit is reachable: the mount guard below
        // redirects to move-select when the param is missing or invalid.
        moveType as MoveType,
        customText,
        isBo3 ? roundNumber : undefined,
      );

      if (result.success) {
        // Optimistic transition; no Alert interstitial.
        router.replace(
          `/(battle)/waiting?battleId=${battleId}${isBo3 ? `&round=${roundNumber}` : ''}`,
        );
      } else {
        throw new Error(result.error || 'Failed to submit prompt');
      }
    } catch (err) {
      console.error('Submit error:', err);
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to submit',
      );
    } finally {
      setIsSubmitting(false);
      holdProgress.value = 0;
    }
  };

  const flashHoldHint = () => {
    setShowHoldHint(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setShowHoldHint(false), 1600);
  };

  const startHold = () => {
    if (isSubmitting) return;
    if (!validateSelection()) return;
    holdProgress.value = 0;
    holdProgress.value = withTiming(1, {
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
    });
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      hapticImpact(ImpactFeedbackStyle.Heavy);
      handleSubmit();
    }, HOLD_DURATION_MS);
  };

  const cancelHold = () => {
    // No pending timer means the hold already completed (or never started).
    if (!holdTimerRef.current) return;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    cancelAnimation(holdProgress);
    holdProgress.value = withTiming(0, { duration: 150 });
    flashHoldHint();
  };

  // Screen-reader activation path: plain tap + confirmation Alert.
  const confirmLockIn = () => {
    if (isSubmitting || !validateSelection()) return;
    Alert.alert(
      'Lock In?',
      'Lock in your prompt? You cannot change it afterward.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Lock In', onPress: () => handleSubmit() },
      ],
    );
  };

  const holdFillStyle = useAnimatedStyle(() => ({
    width: `${holdProgress.value * 100}%`,
  }));

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background },
          styles.centered,
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* headerRight, not headerLeft: the chevron on this screen means "change
          my move" and must keep meaning that. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderLeaveButton
              onPress={() => leave.confirmLeave()}
              disabled={leave.isLeaving}
            />
          ),
        }}
      />
      {/* Pinned battle bar: opponent, theme, and countdown stay locked to the
          top so they never scroll out of view while you write. The top inset +
          44 clears the transparent stack header (floating back button). */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: insets.top + 44,
          },
        ]}
      >
        {/* You-vs-opponent context strip (replaces the old screen title). */}
        <VersusStrip
          left={{
            name: myChar?.name ?? 'You',
            archetype: myChar?.archetype ?? '',
            signatureColor: myChar?.signatureColor ?? colors.primary,
            portraitUrl: myChar?.portraitUrl,
            cosmetics: myChar?.cosmetics,
            label: 'YOU',
            onAvatarPress: portraitViewer.canOpen(myChar)
              ? () => portraitViewer.open(myChar)
              : undefined,
          }}
          right={{
            name: oppChar?.name ?? 'Opponent',
            archetype: oppChar?.archetype ?? '',
            signatureColor: oppChar?.signatureColor ?? colors.textSecondary,
            portraitUrl: oppChar?.portraitUrl,
            cosmetics: oppChar?.cosmetics,
            label: 'OPPONENT',
            onAvatarPress: portraitViewer.canOpen(oppChar)
              ? () => portraitViewer.open(oppChar)
              : undefined,
          }}
          subtitle={isBo3 ? `Round ${roundNumber}` : null}
          deadline={myDeadline}
        />

        {/* Theme — the creative constraint — stays pinned while you write. */}
        {battle?.theme ? (
          <View style={[styles.themeBar, { backgroundColor: colors.card }]}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text
              style={[styles.themeBarLabel, { color: colors.textTertiary }]}
            >
              THEME
            </Text>
            <Text
              style={[
                styles.themeBarText,
                { color: colors.primary },
                accessibleText,
              ]}
              numberOfLines={2}
            >
              {battle.theme}
            </Text>
          </View>
        ) : null}

        {/* Opponent lock status only — never their move type or content. */}
        {opponentHasLocked ? (
          <View
            style={[
              styles.opponentLockedBanner,
              { backgroundColor: colors.card, borderColor: colors.warning },
            ]}
            accessible
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            accessibilityLabel="Opponent has locked in. Your move."
          >
            <Ionicons name="lock-closed" size={14} color={colors.warning} />
            <Text style={[styles.opponentLockedText, { color: colors.text }]}>
              Opponent has locked in — your move
            </Text>
          </View>
        ) : null}
      </View>

      {/* Scrolling decision surface: strategy (move type) + prompt authoring. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {isBo3 ? (
          <>
            <SeriesScoreIndicator
              score={series_score}
              currentRound={roundNumber}
              format={format}
              bestOf={rtBattle?.best_of ?? 3}
            />
            <View style={styles.hpRow}>
              <View style={styles.hpCol}>
                <HPBar
                  current={myHp}
                  max={myHpMax}
                  side="left"
                  playerName="You"
                  compact
                />
              </View>
              <View style={styles.hpCol}>
                <HPBar
                  current={oppHp}
                  max={oppHpMax}
                  side="right"
                  playerName="Opponent"
                  compact
                />
              </View>
            </View>
          </>
        ) : null}

        {/* Read-only move chip. The choice was made on move-select; this is
            a reminder plus a way back, not a second selector -- two places to
            change one value is how a player ends up submitting a move they
            thought they had changed. */}
        <TouchableOpacity
          style={[styles.moveChip, { backgroundColor: colors.card }]}
          onPress={() => {
            hapticSelection();
            router.back();
          }}
          accessibilityLabel={`Move type ${moveType}. Tap to change.`}
          accessibilityRole="button"
        >
          <View
            style={[
              styles.moveChipBadge,
              { backgroundColor: moveType ? colors[moveType] : colors.card },
            ]}
          >
            <Ionicons
              name={moveType ? MOVE_META[moveType].icon : 'help'}
              size={14}
              color="#FFFFFF"
            />
            <Text style={styles.moveChipBadgeText}>
              {(moveType ?? '').toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.moveChipHint, { color: colors.textSecondary }]}>
            {moveType ? `beats ${MOVE_META[moveType].beats.toUpperCase()}` : ''}
          </Text>
          <View style={styles.moveChipChange}>
            <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
            <Text
              style={[styles.moveChipChangeText, { color: colors.primary }]}
            >
              Change
            </Text>
          </View>
        </TouchableOpacity>

        {/* Template/Custom segmented control */}
        <View style={[styles.segmented, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[
              styles.segment,
              !isCustom && { backgroundColor: colors.primary },
            ]}
            onPress={() => {
              hapticSelection();
              setIsCustom(false);
            }}
            accessibilityLabel="Use a generated idea"
            accessibilityRole="button"
            accessibilityState={{ selected: !isCustom }}
          >
            <Ionicons
              name="sparkles"
              size={16}
              color={!isCustom ? '#FFFFFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                { color: !isCustom ? '#FFFFFF' : colors.text },
              ]}
            >
              Ideas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segment,
              isCustom && { backgroundColor: colors.primary },
            ]}
            onPress={() => {
              hapticSelection();
              setIsCustom(true);
            }}
            accessibilityLabel="Write your own prompt"
            accessibilityRole="button"
            accessibilityState={{ selected: isCustom }}
          >
            <Ionicons
              name="create"
              size={16}
              color={isCustom ? '#FFFFFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                { color: isCustom ? '#FFFFFF' : colors.text },
              ]}
            >
              Write your own
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.segmentHelp, { color: colors.textTertiary }]}>
          {isCustom
            ? 'Write your own prompt from scratch (20–800 characters). It is moderated, then judged on clarity, originality and theme fit.'
            : 'Ideas written for your fighter, this move and this theme. Tap one to use it, or edit it first.'}
        </Text>

        {/* Suggestions written for THIS fighter and THIS move type — the only
            prompt help the arena offers now that the static template library is
            retired. Rendered unconditionally on this tab: with no templates
            underneath, an empty tab has to say why it is empty and offer a way
            out, rather than collapsing to nothing. */}
        {!isCustom ? (
          <View style={styles.section}>
            <View style={styles.suggestionHeader}>
              <Ionicons name="bulb" size={14} color={colors.primary} />
              <Text style={[styles.suggestionTitle, { color: colors.text }]}>
                Ideas for {myChar?.name ?? 'your fighter'}
              </Text>
            </View>

            {suggestionsLoading ? (
              <View
                style={[
                  styles.suggestionCard,
                  styles.suggestionLoadingCard,
                  { backgroundColor: colors.card },
                ]}
                accessibilityLiveRegion="polite"
                accessibilityLabel={
                  suggestionsGenerating
                    ? 'Writing ideas for your fighter. This takes a few seconds.'
                    : 'Loading ideas'
                }
              >
                <ActivityIndicator color={colors.primary} />
                {suggestionsGenerating ? (
                  <>
                    <Text
                      style={[
                        styles.suggestionLoadingTitle,
                        { color: colors.text },
                      ]}
                    >
                      Writing ideas for {myChar?.name ?? 'your fighter'}…
                    </Text>
                    <Text
                      style={[
                        styles.suggestionLoadingHint,
                        { color: colors.textTertiary },
                      ]}
                    >
                      This takes a few seconds — each idea is written for this
                      fighter, this move and this theme.
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}

            {!suggestionsLoading && suggestionsError ? (
              <View>
                <Text
                  style={[
                    styles.suggestionError,
                    { color: colors.textTertiary },
                  ]}
                >
                  {suggestionsError}
                </Text>
                <View style={styles.suggestionFallback}>
                  {suggestionRetry ? (
                    <TouchableOpacity
                      style={[
                        styles.rerollButton,
                        { borderColor: colors.border },
                      ]}
                      onPress={() => {
                        hapticSelection();
                        if (suggestionRetry === 'read') {
                          readOrGenerateSuggestions();
                        } else {
                          loadSuggestions(false);
                        }
                      }}
                      accessibilityLabel="Try loading ideas again"
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name="refresh"
                        size={14}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.rerollText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Try again
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[
                      styles.rerollButton,
                      { borderColor: colors.border },
                    ]}
                    onPress={() => {
                      hapticSelection();
                      setIsCustom(true);
                    }}
                    accessibilityLabel="Write your own prompt instead"
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name="create-outline"
                      size={14}
                      color={colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.rerollText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Write your own
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {!suggestionsLoading &&
              suggestions.map((suggestion, index) => (
                <TouchableOpacity
                  key={`${index}-${suggestion.title}`}
                  style={[
                    styles.suggestionCard,
                    { backgroundColor: colors.card },
                    selectedSuggestion === index && {
                      borderColor: colors.primary,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => {
                    hapticSelection();
                    // A suggestion becomes the player's own custom text, so it
                    // is editable before lock-in and travels the ordinary
                    // custom-prompt path (moderation, length hints, judging).
                    setSelectedSuggestion(index);
                    setCustomText(suggestion.body);
                  }}
                  accessibilityLabel={`Use suggestion: ${suggestion.title}`}
                  accessibilityRole="button"
                >
                  <Text
                    style={[styles.suggestionCardTitle, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {suggestion.title}
                  </Text>
                  <Text
                    style={[
                      styles.suggestionCardBody,
                      { color: colors.textSecondary },
                      accessibleText,
                    ]}
                  >
                    {suggestion.body}
                  </Text>
                  {/* The card body selects; this opens the editor with the
                      suggestion in it. Previously "Use and edit" was inert
                      text, so there was no way to edit a suggestion. */}
                  <TouchableOpacity
                    style={styles.suggestionUse}
                    onPress={() => {
                      hapticSelection();
                      setSelectedSuggestion(index);
                      setCustomText(suggestion.body);
                      setIsCustom(true);
                    }}
                    accessibilityLabel={`Edit suggestion: ${suggestion.title}`}
                    accessibilityRole="button"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name="create-outline"
                      size={14}
                      color={colors.primary}
                    />
                    <Text
                      style={[
                        styles.suggestionUseText,
                        { color: colors.primary },
                      ]}
                    >
                      Use and edit
                    </Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}

            {/* Paid reroll, only once a set is on screen: after a failure the
                server has already released the free slot, so the next attempt
                is not a purchase and must not be priced like one. */}
            {suggestions.length > 0 && !suggestionsLoading ? (
              <TouchableOpacity
                style={[styles.rerollButton, { borderColor: colors.border }]}
                onPress={() => {
                  Alert.alert(
                    'New ideas',
                    'Generate three new suggestions for 1 credit? It takes a few seconds.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Spend 1 credit',
                        onPress: () => loadSuggestions(true),
                      },
                    ],
                  );
                }}
                accessibilityLabel="Generate new suggestions for one credit"
                accessibilityRole="button"
              >
                <Ionicons
                  name="refresh"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.rerollText, { color: colors.textSecondary }]}
                >
                  New suggestions — 1 credit
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Custom Prompt Input */}
        {isCustom && (
          <View style={styles.section}>
            <TextInput
              style={[
                styles.customInput,
                { backgroundColor: colors.card, color: colors.text },
                accessibleText,
              ]}
              placeholder="Write your prompt (20-800 characters)..."
              placeholderTextColor={colors.textTertiary}
              value={customText}
              onChangeText={setCustomText}
              multiline
              maxLength={800}
              accessibilityLabel="Custom prompt input"
            />
            {/* Live quality hints: mirrors the judge's length normalization
                (sweet spot 15–80 words, penalty past 100) + theme reference. */}
            {(() => {
              const length =
                customWordCount === 0
                  ? {
                      color: colors.textTertiary,
                      icon: 'ellipse-outline' as const,
                      text: `Aim for ${WORDS_MIN_GOOD}–${WORDS_MAX_GOOD} words`,
                    }
                  : customWordCount < WORDS_MIN_GOOD
                    ? {
                        color: colors.warning,
                        icon: 'alert-circle' as const,
                        text: 'Too short — add detail',
                      }
                    : customWordCount <= WORDS_MAX_GOOD
                      ? {
                          color: colors.success,
                          icon: 'checkmark-circle' as const,
                          text: "In the judge's sweet spot",
                        }
                      : customWordCount <= WORDS_PENALTY
                        ? {
                            color: colors.warning,
                            icon: 'alert-circle' as const,
                            text: 'Getting long',
                          }
                        : {
                            color: colors.error,
                            icon: 'close-circle' as const,
                            text: 'Length penalty applies',
                          };
              return (
                <View style={styles.qualityRow}>
                  <View style={styles.qualityItem}>
                    <Ionicons
                      name={length.icon}
                      size={13}
                      color={length.color}
                    />
                    <Text style={[styles.qualityText, { color: length.color }]}>
                      {length.text}
                    </Text>
                  </View>
                  <Text
                    style={[styles.charCount, { color: colors.textTertiary }]}
                  >
                    {customWordCount} words · {customText.length}/800
                  </Text>
                </View>
              );
            })()}
            {battle?.theme && customWordCount > 0 ? (
              <View style={styles.qualityItem}>
                <Ionicons
                  name={referencesTheme ? 'checkmark-circle' : 'bulb-outline'}
                  size={13}
                  color={referencesTheme ? colors.success : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.qualityText,
                    {
                      color: referencesTheme
                        ? colors.success
                        : colors.textTertiary,
                    },
                  ]}
                >
                  {referencesTheme
                    ? 'References the theme'
                    : 'Tip: work the theme into your prompt'}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Pinned Lock-In footer: the primary action is always reachable and never
          hidden behind the keyboard. Press-and-hold ceremony; tap + confirm
          under a screen reader, where a timed hold isn't feasible. */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + Spacing.sm,
          },
        ]}
      >
        <Pressable
          style={[
            styles.submitButton,
            { backgroundColor: colors.primary },
            isSubmitting && styles.buttonDisabled,
          ]}
          onPressIn={screenReaderEnabled ? undefined : startHold}
          onPressOut={screenReaderEnabled ? undefined : cancelHold}
          onPress={screenReaderEnabled ? confirmLockIn : undefined}
          disabled={isSubmitting}
          accessibilityLabel="Lock in prompt"
          accessibilityHint={
            screenReaderEnabled
              ? 'Activates a confirmation to lock in your prompt'
              : 'Press and hold to lock in your prompt'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
        >
          {/* Hold progress fill. */}
          <Animated.View
            style={[styles.holdFill, holdFillStyle]}
            pointerEvents="none"
          />
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.submitButtonInner}>
              <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>Lock In</Text>
            </View>
          )}
        </Pressable>
        {showHoldHint ? (
          <Text style={[styles.holdHint, { color: colors.textSecondary }]}>
            Hold to lock in
          </Text>
        ) : null}
      </View>
      <PortraitViewer
        visible={portraitViewer.visible}
        uri={portraitViewer.viewer?.uri ?? null}
        caption={portraitViewer.viewer?.caption}
        aspect={portraitViewer.viewer?.aspect}
        onImageError={portraitViewer.handleError}
        onClose={portraitViewer.close}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hpRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  hpCol: {
    flex: 1,
  },
  themeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  themeBarLabel: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.8,
  },
  themeBarText: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.md,
  },
  moveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  moveChipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  moveChipBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
  moveChipHint: {
    flex: 1,
    fontSize: Typography.sizes.xs,
  },
  moveChipChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  moveChipChangeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  suggestionTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  suggestionCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  suggestionCardTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  suggestionCardBody: {
    fontSize: Typography.sizes.xs,
    lineHeight: 18,
  },
  suggestionUse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  suggestionUseText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  suggestionLoadingCard: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
  },
  suggestionLoadingTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    textAlign: 'center',
  },
  suggestionLoadingHint: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
  suggestionError: {
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.sm,
  },
  suggestionFallback: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  rerollButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rerollText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  matchupHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  matchupText: {
    fontSize: Typography.sizes.xs,
  },
  matchupDivider: {
    width: 1,
    height: 12,
    marginHorizontal: Spacing.xs,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    padding: 4,
    gap: 4,
    marginBottom: Spacing.sm,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  segmentText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  segmentHelp: {
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.lg,
    lineHeight: 16,
  },
  customInput: {
    minHeight: 120,
    padding: Spacing.md,
    borderRadius: 8,
    fontSize: Typography.sizes.base,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: Typography.sizes.xs,
    textAlign: 'right',
  },
  winRateText: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  qualityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  qualityText: {
    fontSize: Typography.sizes.xs,
  },
  opponentLockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  opponentLockedText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  submitButton: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  holdFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  submitButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  holdHint: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
