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
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Spacing,
  Typography,
  BorderRadius,
  Layout,
  Ink,
  Motion,
  NumericFontVariant,
} from '@/constants/DesignTokens';
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
import {
  validatePromptText,
  CUSTOM_PROMPT_MAX_LENGTH,
  CUSTOM_PROMPT_MIN_LENGTH,
} from '@/utils/promptSelection';
import { coachPrompt, type CoachTone } from '@/utils/promptCoach';
import { describeSubmitError, moveLabel } from '@/utils/battleCopy';
import { inkFor } from '@/utils/contrast';
import { formatCredits, insufficientCreditsMessage } from '@/utils/credits';
import { fetchEditPrice } from '@/utils/editCooldowns';
import { hapticImpact, hapticSelection } from '@/utils/haptics';
import { useAuth } from '@/providers/AuthProvider';
import {
  useRealtimeBattle,
  type PromptUpdate,
} from '@/hooks/useRealtimeBattle';
import { useLeaveBattle } from '@/hooks/useLeaveBattle';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import { usePortraitViewer } from '@/hooks/usePortraitViewer';
import SeriesScoreIndicator from '@/components/SeriesScoreIndicator';
import HPBar from '@/components/HPBar';
import VersusStrip from '@/components/VersusStrip';
import PortraitViewer from '@/components/PortraitViewer';
import HeaderLeaveButton from '@/components/HeaderLeaveButton';
import InlineBanner from '@/components/InlineBanner';
import PromptPreparationState from '@/components/prompt-preparation-state';
import { useBattleAudio } from '@/providers/BattleAudioProvider';

// Lock-in ceremony: press-and-hold duration before the submit fires.
const HOLD_DURATION_MS = 600;
// How long the "keep holding" nudge replaces the standing hint after an
// early release.
const HINT_FLASH_MS = 1600;
// The channel is not joined for the first few hundred ms of every mount;
// "Reconnecting…" only appears once the gap is long enough to mean something.
const RECONNECT_GRACE_MS = 2000;
// setTimeout wraps past 2^31-1 ms; deadlines are minutes away, but clamp.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const MOVE_TYPES: MoveType[] = ['attack', 'defense', 'finisher'];

// Battle- and round-level states in which writing a prompt is pointless: the
// server has moved on, so the screen must too. Waiting knows where to go next.
const CLOSED_BATTLE_STATUSES = new Set([
  'completed',
  'expired',
  'canceled',
  'result_ready',
  'generation_failed',
  'moderation_failed',
]);
const CLOSED_ROUND_STATUSES = new Set([
  'resolving',
  'result_ready',
  'expired',
  'canceled',
]);

// `battle_prompts` is fetched with `select('*')`, so the row carries the text;
// the shared hook type just never declared it. Own rows only, under RLS.
type PromptRow = PromptUpdate & { custom_prompt_text?: string | null };

export default function PromptEntryScreen() {
  const colors = useThemedColors();
  // Dyslexia-friendly spacing on the theme + prompt-writing surface (§22a).
  const accessibleText = useAccessibleTextStyle();
  const reduceMotion = useReducedMotion();
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

  // The move type is chosen on move-select and arrives as a param. It is NOT
  // defaulted: a silent fallback to 'attack' would submit a move the player
  // never picked, and they would not find out until the reveal.
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
  // The credit wall gets a way out that is not "run the paid call again".
  const [suggestionPaywall, setSuggestionPaywall] = useState(false);
  const [customText, setCustomText] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reroll price, read once. The server bills from its own table; this only
  // decides what the button and the confirmation say. 1 is the seeded price
  // and the fallback if the read fails, so the copy never shows a blank.
  const [rerollCredits, setRerollCredits] = useState(1);
  useEffect(() => {
    let mounted = true;
    fetchEditPrice('prompt_suggestions_reroll').then((price) => {
      if (mounted && price) setRerollCredits(price.credits);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const rerollIsFree = rerollCredits <= 0;
  const rerollChip = formatCredits(rerollCredits, 'chip');
  const rerollSentence = formatCredits(rerollCredits, 'sentence');

  // Realtime Bo3 state (HP, series score, opponent lock status).
  const {
    battle: rtBattle,
    prompts,
    rounds,
    format,
    current_round,
    series_score,
    hp,
    hp_max,
    isSubscribed,
  } = useRealtimeBattle(battleId || null);
  const battleAudio = useBattleAudio(rtBattle?.theme ?? battle?.theme);

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

  const waitingHref =
    `/(battle)/waiting?battleId=${battleId}&round=${roundNumber}` as const;

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

  // My own prompt row for THIS round. If it is already locked there is nothing
  // to write: coming back here (a stale deep link, a back-swipe from waiting)
  // must not present an editor that would be refused on submit.
  const myPrompt = useMemo<PromptRow | null>(
    () =>
      (prompts.find(
        (p) =>
          p.profile_id === user?.id && (p.round_number ?? 1) === roundNumber,
      ) as PromptRow | undefined) ?? null,
    [prompts, user?.id, roundNumber],
  );
  const alreadyLocked = Boolean(myPrompt?.is_locked);
  const lockedMove: MoveType | null = myPrompt?.move_type ?? moveType;
  const lockedText = myPrompt?.custom_prompt_text ?? null;

  // Lock-in deadline for the countdown: per-round for Bo3, per-player for single.
  const myDeadline = isBo3
    ? (roundData?.lock_in_deadline ?? null)
    : isPlayerOne
      ? (rtBattle?.player_one_prompt_deadline ?? null)
      : (rtBattle?.player_two_prompt_deadline ?? null);

  // One timer that fires at the deadline, rather than a 1s tick: the strip
  // already ticks its own clock, and re-rendering an editor every second while
  // someone types is a jank source for nothing.
  const deadlineMs = myDeadline ? Date.parse(myDeadline) : NaN;
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  useEffect(() => {
    if (!Number.isFinite(deadlineMs)) {
      setDeadlinePassed(false);
      return;
    }
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) {
      setDeadlinePassed(true);
      return;
    }
    setDeadlinePassed(false);
    const t = setTimeout(
      () => setDeadlinePassed(true),
      Math.min(remaining, MAX_TIMEOUT_MS),
    );
    return () => clearTimeout(t);
  }, [deadlineMs]);

  // "Reconnecting…" after a grace period, so the ordinary join delay on mount
  // does not flash a warning at every player.
  const [showReconnecting, setShowReconnecting] = useState(false);
  useEffect(() => {
    if (isSubscribed) {
      setShowReconnecting(false);
      return;
    }
    const t = setTimeout(() => setShowReconnecting(true), RECONNECT_GRACE_MS);
    return () => clearTimeout(t);
  }, [isSubscribed]);

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

  // Live length coaching (utils/promptCoach.ts) + a keyword theme check.
  const coach = useMemo(
    () =>
      coachPrompt(customText, {
        minChars: CUSTOM_PROMPT_MIN_LENGTH,
        maxChars: CUSTOM_PROMPT_MAX_LENGTH,
      }),
    [customText],
  );
  const toneColor: Record<CoachTone, string> = {
    muted: colors.textTertiary,
    warning: colors.warning,
    success: colors.success,
    error: colors.error,
  };
  const referencesTheme = useMemo(() => {
    const theme = (battle?.theme ?? '').toLowerCase();
    if (!theme || customText.trim().length === 0) return false;
    const themeWords = theme.split(/\W+/).filter((w) => w.length > 3);
    const text = customText.toLowerCase();
    return themeWords.some((w) => text.includes(w));
  }, [battle?.theme, customText]);

  // Which idea, if any, the editor currently holds verbatim. Derived rather
  // than stored so a card stops looking selected the moment the text differs.
  const selectedSuggestion = useMemo(
    () => suggestions.findIndex((s) => s.body === customText),
    [suggestions, customText],
  );

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

  // The battle moved on underneath this screen: the round resolved or expired,
  // the battle ended, or the server opened a later round. Hand off to waiting,
  // which owns the "where does this battle go next" routing, once.
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!battleId || !rtBattle || redirectedRef.current) return;
    const battleClosed = CLOSED_BATTLE_STATUSES.has(rtBattle.status);
    const roundClosed =
      isBo3 && roundData ? CLOSED_ROUND_STATUSES.has(roundData.status) : false;
    const roundMovedOn = (rtBattle.current_round ?? 1) > roundNumber;
    if (battleClosed || roundClosed || roundMovedOn) {
      redirectedRef.current = true;
      router.replace(waitingHref);
    }
  }, [battleId, rtBattle, isBo3, roundData, roundNumber, router, waitingHref]);

  useEffect(() => {
    if (!battleId) {
      setIsLoading(false);
      Alert.alert('Battle not found', 'This battle couldn’t be opened.');
      router.back();
      return;
    }
    let cancelled = false;
    getBattle(battleId as string)
      .then((data) => {
        if (!cancelled) setBattle(data as { theme?: string | null });
      })
      .catch((err) => {
        console.error('Failed to load prompt entry data:', err);
        if (!cancelled) {
          Alert.alert(
            'Couldn’t load the battle',
            'Check your connection and try again.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [battleId, router]);

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
      setSuggestionPaywall(false);
      try {
        const result = await generateMoveSuggestions(
          battleId as string,
          moveType,
          roundNumber,
        );
        if (result.set) {
          setSuggestions(result.set.suggestions);
          setSuggestionRetry(null);
        } else if (result.failure === 'insufficient_credits') {
          // Not retryable: running the paid call again is the one thing that
          // cannot help. The way forward is the wallet, or writing your own.
          setSuggestionsError(insufficientCreditsMessage());
          setSuggestionRetry(null);
          setSuggestionPaywall(true);
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
              ? 'Couldn’t generate new ideas. You weren’t charged.'
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
  // round: only the newest call may write state.
  const suggestionRunRef = useRef(0);

  const readOrGenerateSuggestions = useCallback(async () => {
    if (!battleId || !moveType) return;
    const run = ++suggestionRunRef.current;
    const isStale = () => run !== suggestionRunRef.current;

    setSuggestionsLoading(true);
    setSuggestionsGenerating(false);
    setSuggestionsError(null);
    setSuggestionRetry(null);
    setSuggestionPaywall(false);
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
      // top of one is a purchase.
      setSuggestionsError('Couldn’t load your ideas.');
      setSuggestionRetry('read');
      return;
    }
    if (isStale()) return;
    await loadSuggestions(false);
  }, [battleId, moveType, roundNumber, loadSuggestions]);

  useEffect(() => {
    // Nothing to read for once the prompt is in; the editor is not shown.
    if (alreadyLocked) return;
    readOrGenerateSuggestions();
  }, [readOrGenerateSuggestions, alreadyLocked]);

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

  // Applying an idea over text the player typed themselves is destructive, so
  // it asks. Text that IS one of the ideas (tapped, not typed) is not a draft.
  const applySuggestion = useCallback(
    (index: number, openEditor: boolean) => {
      const idea = suggestions[index];
      if (!idea) return;
      setCustomText(idea.body);
      if (openEditor) setIsCustom(true);
    },
    [suggestions],
  );
  const handleUseSuggestion = useCallback(
    (index: number, openEditor: boolean) => {
      hapticSelection();
      const idea = suggestions[index];
      if (!idea) return;
      const hasDraft = customText.trim().length > 0;
      const draftIsAnIdea = suggestions.some((s) => s.body === customText);
      if (hasDraft && !draftIsAnIdea && customText !== idea.body) {
        Alert.alert(
          'Replace your draft?',
          'Using this idea replaces what you wrote.',
          [
            { text: 'Keep mine', style: 'cancel' },
            {
              text: 'Replace',
              style: 'destructive',
              onPress: () => applySuggestion(index, openEditor),
            },
          ],
        );
        return;
      }
      applySuggestion(index, openEditor);
    },
    [suggestions, customText, applySuggestion],
  );

  // --- Lock-in ceremony state (press-and-hold) -------------------------------
  const holdProgress = useSharedValue(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hintFlash, setHintFlash] = useState(false);

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

  const lockDisabled = isSubmitting || deadlinePassed || alreadyLocked;

  const handleSubmit = async () => {
    if (!battleId || !moveType) return;

    if (!validateSelection()) return;

    setIsSubmitting(true);

    try {
      const result = await submitPrompt(
        battleId as string,
        moveType,
        customText,
        isBo3 ? roundNumber : undefined,
      );

      if (result.success) {
        // Optimistic transition; no Alert interstitial.
        battleAudio.playSound('promptLocked');
        router.replace(waitingHref);
        return;
      }

      // Status and code decide the words; the server's message is developer
      // prose and never reaches the player (utils/battleCopy.ts).
      const copy = describeSubmitError({
        status: result.status,
        code: result.code,
        message: result.error,
      });
      if (copy.roundClosed) {
        Alert.alert(copy.title, copy.message, [
          { text: 'OK', onPress: () => router.replace(waitingHref) },
        ]);
      } else {
        Alert.alert(copy.title, copy.message);
      }
    } catch (err) {
      console.error('Submit error:', err);
      const copy = describeSubmitError({});
      Alert.alert(copy.title, copy.message);
    } finally {
      setIsSubmitting(false);
      holdProgress.value = 0;
    }
  };

  const flashHoldHint = () => {
    setHintFlash(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHintFlash(false), HINT_FLASH_MS);
  };

  const startHold = () => {
    if (lockDisabled) return;
    if (!validateSelection()) return;
    hapticSelection();
    cancelAnimation(holdProgress);
    holdProgress.value = 0;
    // Under Reduce Motion the fill does not sweep; the 600 ms hold still
    // applies (it is the ceremony, not decoration) and the fill snaps to full
    // when it completes so the button still reads as "done".
    if (!reduceMotion) {
      holdProgress.value = withTiming(1, {
        duration: HOLD_DURATION_MS,
        easing: Easing.linear,
      });
    }
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (reduceMotion) holdProgress.value = 1;
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
    holdProgress.value = reduceMotion ? 0 : withTiming(0, { duration: 150 });
    flashHoldHint();
  };

  // Screen-reader activation path: plain tap + confirmation Alert.
  const confirmLockIn = () => {
    if (lockDisabled || !validateSelection()) return;
    Alert.alert(
      'Lock in?',
      'Lock in your prompt? You can’t change it afterward.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Lock in', onPress: () => handleSubmit() },
      ],
    );
  };

  const holdFillStyle = useAnimatedStyle(() => ({
    width: `${holdProgress.value * 100}%`,
  }));

  // The standing hint carries the irreversibility so it is said once, visibly,
  // before the gesture; the early-release nudge swaps the text in place so the
  // footer never changes height.
  const holdHintText = deadlinePassed
    ? ''
    : screenReaderEnabled
      ? 'Tap to lock in · you can’t change it afterward'
      : hintFlash
        ? 'Keep holding to lock in'
        : 'Hold to lock in · you can’t change it afterward';

  const primaryInk = Ink.onAccentLight;

  // The read-only move badge: text and glyph ink chosen for the move colour,
  // never a fixed white. Renders nothing for a null move -- the mount guard is
  // already redirecting, and a badge that says "null" helps nobody.
  const renderMoveBadge = (move: MoveType | null) => {
    if (!move) return null;
    const fill = colors[move];
    const ink = inkFor(fill);
    return (
      <View style={[styles.moveChipBadge, { backgroundColor: fill }]}>
        <Ionicons name={MOVE_META[move].icon} size={14} color={ink} />
        <Text style={[styles.moveChipBadgeText, { color: ink }]}>
          {move.toUpperCase()}
        </Text>
      </View>
    );
  };

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
        {opponentHasLocked && !alreadyLocked ? (
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

        {showReconnecting ? (
          <Text
            style={[styles.reconnecting, { color: colors.textTertiary }]}
            accessibilityLiveRegion="polite"
          >
            Reconnecting…
          </Text>
        ) : null}
      </View>

      {/* Scrolling decision surface: move reminder + prompt authoring. */}
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
              viewer={isPlayerOne ? 'p1' : 'p2'}
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

        {alreadyLocked ? (
          /* Locked panel: the prompt is in. No editor, no ideas, no hold. */
          <View
            style={[
              styles.lockedPanel,
              { backgroundColor: colors.card, borderColor: colors.success },
            ]}
          >
            <View style={styles.lockedHeader}>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.success}
              />
              <Text
                style={[styles.lockedTitle, { color: colors.text }]}
                accessibilityRole="header"
              >
                You’re locked in
              </Text>
            </View>
            {lockedMove ? (
              <View
                style={styles.lockedMoveRow}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`Move: ${moveLabel(lockedMove)}`}
              >
                {renderMoveBadge(lockedMove)}
                <Text
                  style={[styles.moveChipHint, { color: colors.textSecondary }]}
                >
                  beats {MOVE_META[lockedMove].beats.toUpperCase()}
                </Text>
              </View>
            ) : null}
            <Text
              style={[
                styles.lockedPrompt,
                { color: colors.textSecondary },
                accessibleText,
              ]}
              accessibilityLabel={
                lockedText ? `Your prompt: ${lockedText}` : 'Your prompt is in.'
              }
            >
              {lockedText ?? 'Your prompt is in.'}
            </Text>
          </View>
        ) : (
          <>
            {/* Read-only move chip. The choice was made on move-select; this is
                a reminder plus a way back, not a second selector -- two places
                to change one value is how a player ends up submitting a move
                they thought they had changed. */}
            {moveType ? (
              <TouchableOpacity
                style={[styles.moveChip, { backgroundColor: colors.card }]}
                onPress={() => {
                  hapticSelection();
                  router.back();
                }}
                accessibilityLabel={`Move: ${moveLabel(moveType)}. Beats ${moveLabel(
                  MOVE_META[moveType].beats,
                )}. Tap to change.`}
                accessibilityRole="button"
              >
                {renderMoveBadge(moveType)}
                <Text
                  style={[styles.moveChipHint, { color: colors.textSecondary }]}
                >
                  beats {MOVE_META[moveType].beats.toUpperCase()}
                </Text>
                <View style={styles.moveChipChange}>
                  <Ionicons
                    name="swap-horizontal"
                    size={14}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.moveChipChangeText,
                      { color: colors.primary },
                    ]}
                  >
                    Change
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {/* Ideas / Write-your-own segmented control */}
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
                  color={!isCustom ? primaryInk : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.segmentText,
                    { color: !isCustom ? primaryInk : colors.text },
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
                  color={isCustom ? primaryInk : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.segmentText,
                    { color: isCustom ? primaryInk : colors.text },
                  ]}
                >
                  Write your own
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.segmentHelp, { color: colors.textTertiary }]}>
              {isCustom
                ? 'Write your own prompt (20–800 characters; 15–80 words is the sweet spot). It’s moderated, then judged on clarity, originality and theme fit.'
                : 'Ideas written for your fighter, this move and this theme. Use one as is, or edit it first.'}
            </Text>

            {/* Suggestions written for THIS fighter and THIS move type — the
                only prompt help the arena offers now that the static template
                library is retired. Rendered unconditionally on this tab: an
                empty tab has to say why it is empty and offer a way out. */}
            {!isCustom ? (
              <View style={styles.section}>
                <View style={styles.suggestionHeader}>
                  <Ionicons name="bulb" size={14} color={colors.primary} />
                  <Text
                    style={[styles.suggestionTitle, { color: colors.text }]}
                  >
                    Ideas for {myChar?.name ?? 'your fighter'}
                  </Text>
                </View>

                {suggestionsLoading && moveType ? (
                  <PromptPreparationState
                    fighterName={myChar?.name ?? 'your fighter'}
                    moveType={moveType}
                    generating={suggestionsGenerating}
                    onWriteOwn={() => {
                      hapticSelection();
                      setIsCustom(true);
                    }}
                  />
                ) : null}

                {!suggestionsLoading && suggestionsError ? (
                  <View>
                    <Text
                      style={[
                        styles.suggestionError,
                        { color: colors.textTertiary },
                      ]}
                      accessibilityLiveRegion="polite"
                    >
                      {suggestionsError}
                    </Text>
                    <View style={styles.suggestionFallback}>
                      {suggestionPaywall ? (
                        <TouchableOpacity
                          style={[
                            styles.rerollButton,
                            { borderColor: colors.primary },
                          ]}
                          onPress={() => {
                            hapticSelection();
                            router.push('/(profile)/wallet');
                          }}
                          accessibilityLabel="Top up credits"
                          accessibilityRole="button"
                        >
                          <Ionicons
                            name="wallet-outline"
                            size={14}
                            color={colors.primary}
                          />
                          <Text
                            style={[
                              styles.rerollText,
                              { color: colors.primary },
                            ]}
                          >
                            Top up
                          </Text>
                        </TouchableOpacity>
                      ) : null}
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
                  suggestions.map((suggestion, index) => {
                    const selected = selectedSuggestion === index;
                    return (
                      /* The card is content, not a target: two explicit
                         buttons below it, each a full 44pt row, replace the
                         old card-tap + nested "Use and edit" link. */
                      <Animated.View
                        key={`${index}-${suggestion.title}`}
                        entering={
                          reduceMotion
                            ? undefined
                            : FadeIn.duration(Motion.durations.base).delay(
                                index * 50,
                              )
                        }
                        style={[
                          styles.suggestionCard,
                          {
                            backgroundColor: colors.card,
                            borderColor: selected
                              ? colors.primary
                              : 'transparent',
                          },
                        ]}
                      >
                        <View style={styles.suggestionCardHeader}>
                          <Text
                            style={[
                              styles.suggestionCardTitle,
                              { color: colors.text },
                            ]}
                            numberOfLines={1}
                          >
                            {suggestion.title}
                          </Text>
                          {selected ? (
                            <View style={styles.suggestionSelectedTag}>
                              <Ionicons
                                name="checkmark-circle"
                                size={14}
                                color={colors.primary}
                              />
                              <Text
                                style={[
                                  styles.suggestionSelectedText,
                                  { color: colors.primary },
                                ]}
                              >
                                Selected
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text
                          style={[
                            styles.suggestionCardBody,
                            { color: colors.textSecondary },
                            accessibleText,
                          ]}
                        >
                          {suggestion.body}
                        </Text>
                        <View style={styles.suggestionActions}>
                          <TouchableOpacity
                            style={[
                              styles.suggestionAction,
                              { backgroundColor: colors.primary },
                            ]}
                            onPress={() => handleUseSuggestion(index, false)}
                            accessibilityLabel={`Use idea: ${suggestion.title}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                          >
                            <Ionicons
                              name="checkmark"
                              size={16}
                              color={primaryInk}
                            />
                            <Text
                              style={[
                                styles.suggestionActionText,
                                { color: primaryInk },
                              ]}
                            >
                              Use
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.suggestionAction,
                              styles.suggestionActionOutline,
                              { borderColor: colors.border },
                            ]}
                            onPress={() => handleUseSuggestion(index, true)}
                            accessibilityLabel={`Edit idea: ${suggestion.title}`}
                            accessibilityRole="button"
                          >
                            <Ionicons
                              name="create-outline"
                              size={16}
                              color={colors.primary}
                            />
                            <Text
                              style={[
                                styles.suggestionActionText,
                                { color: colors.primary },
                              ]}
                            >
                              Edit
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </Animated.View>
                    );
                  })}

                {/* Paid reroll, only once a set is on screen: after a failure
                    the server has already released the free slot, so the next
                    attempt is not a purchase and must not be priced like one.
                    The price is on the button, in the question and on the
                    confirm, so nobody is surprised by a charge. */}
                {suggestions.length > 0 && !suggestionsLoading ? (
                  <TouchableOpacity
                    style={[
                      styles.rerollButton,
                      { borderColor: colors.border },
                    ]}
                    onPress={() => {
                      Alert.alert(
                        'New ideas',
                        rerollIsFree
                          ? 'Generate three new ideas? It takes a few seconds.'
                          : `Generate three new ideas for ${rerollSentence}?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: rerollIsFree
                              ? 'Generate'
                              : `Spend ${rerollSentence}`,
                            onPress: () => loadSuggestions(true),
                          },
                        ],
                      );
                    }}
                    accessibilityLabel={
                      rerollIsFree
                        ? 'Generate three new ideas'
                        : `Generate three new ideas for ${rerollSentence}`
                    }
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
                      New ideas · {rerollChip}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {/* Custom Prompt Input */}
            {isCustom ? (
              <View style={styles.section}>
                <TextInput
                  style={[
                    styles.customInput,
                    { backgroundColor: colors.card, color: colors.text },
                    accessibleText,
                  ]}
                  placeholder="Write your prompt (20–800 characters)…"
                  placeholderTextColor={colors.textTertiary}
                  value={customText}
                  onChangeText={setCustomText}
                  multiline
                  maxLength={CUSTOM_PROMPT_MAX_LENGTH}
                  accessibilityLabel="Your prompt"
                  accessibilityHint="20 to 800 characters"
                />
                <View style={styles.qualityRow}>
                  <View
                    style={styles.qualityItem}
                    accessible
                    accessibilityRole="text"
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={coach.label}
                  >
                    <Ionicons
                      name={coach.icon}
                      size={13}
                      color={toneColor[coach.tone]}
                    />
                    <Text
                      style={[
                        styles.qualityText,
                        { color: toneColor[coach.tone] },
                      ]}
                    >
                      {coach.label}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.charCount,
                      NumericFontVariant,
                      { color: colors.textTertiary },
                    ]}
                  >
                    {coach.counter}
                  </Text>
                </View>
                {battle?.theme && coach.words > 0 ? (
                  <View style={styles.qualityItem}>
                    <Ionicons
                      name={
                        referencesTheme ? 'checkmark-circle' : 'bulb-outline'
                      }
                      size={13}
                      color={
                        referencesTheme ? colors.success : colors.textTertiary
                      }
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
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Pinned footer: the primary action is always reachable and never
          hidden behind the keyboard. Press-and-hold ceremony; tap + confirm
          under a screen reader, where a timed hold isn't feasible. Once the
          prompt is in, the only action left is to go and wait. */}
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
        {alreadyLocked ? (
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              hapticSelection();
              router.replace(waitingHref);
            }}
            accessibilityLabel="Wait for your opponent"
            accessibilityRole="button"
          >
            <View style={styles.submitButtonInner}>
              <Ionicons name="hourglass-outline" size={18} color={primaryInk} />
              <Text style={[styles.submitButtonText, { color: primaryInk }]}>
                Wait for your opponent
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <>
            {deadlinePassed ? (
              <View style={styles.footerBanner}>
                <InlineBanner
                  tone="warning"
                  icon="time-outline"
                  text="Time’s up for this round — waiting for the judge."
                />
              </View>
            ) : null}
            <Pressable
              style={[
                styles.submitButton,
                { backgroundColor: colors.primary },
                lockDisabled && styles.buttonDisabled,
              ]}
              onPressIn={screenReaderEnabled ? undefined : startHold}
              onPressOut={screenReaderEnabled ? undefined : cancelHold}
              onPress={screenReaderEnabled ? confirmLockIn : undefined}
              disabled={lockDisabled}
              accessibilityLabel="Lock in prompt"
              accessibilityHint={
                deadlinePassed
                  ? 'The deadline for this round has passed'
                  : screenReaderEnabled
                    ? 'Activates a confirmation to lock in your prompt. You can’t change it afterward.'
                    : 'Press and hold to lock in your prompt. You can’t change it afterward.'
              }
              accessibilityRole="button"
              accessibilityState={{
                disabled: lockDisabled,
                busy: isSubmitting,
              }}
            >
              {/* Hold progress fill. */}
              <Animated.View
                style={[styles.holdFill, holdFillStyle]}
                pointerEvents="none"
              />
              {isSubmitting ? (
                <ActivityIndicator color={primaryInk} />
              ) : (
                <View style={styles.submitButtonInner}>
                  <Ionicons name="lock-closed" size={18} color={primaryInk} />
                  <Text
                    style={[styles.submitButtonText, { color: primaryInk }]}
                  >
                    Lock In
                  </Text>
                </View>
              )}
            </Pressable>
            {/* Reserved height: the hint changes words, never the footer's size. */}
            <Text
              style={[
                styles.holdHint,
                { color: hintFlash ? colors.warning : colors.textSecondary },
              ]}
              accessibilityLiveRegion={hintFlash ? 'polite' : 'none'}
            >
              {holdHintText}
            </Text>
          </>
        )}
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
  footerBanner: {
    marginBottom: Spacing.sm,
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
  reconnecting: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
  section: {
    marginBottom: Spacing.lg,
  },
  moveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Layout.inputHeight,
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
  lockedPanel: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lockedTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  lockedMoveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lockedPrompt: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
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
    // Always 2 so selecting a card never shifts the list.
    borderWidth: 2,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  suggestionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  suggestionCardTitle: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  suggestionSelectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  suggestionSelectedText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  suggestionCardBody: {
    fontSize: Typography.sizes.xs,
    lineHeight: 18,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  suggestionAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: Layout.inputHeight,
    borderRadius: BorderRadius.md,
  },
  suggestionActionOutline: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestionActionText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
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
    minHeight: Layout.inputHeight,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rerollText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
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
    minHeight: Layout.inputHeight,
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
    borderRadius: BorderRadius.md,
    fontSize: Typography.sizes.base,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: Typography.sizes.xs,
    textAlign: 'right',
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
    borderRadius: BorderRadius.lg,
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
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  holdHint: {
    // Reserved so the footer keeps its height whether or not a hint shows.
    minHeight: 20,
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
