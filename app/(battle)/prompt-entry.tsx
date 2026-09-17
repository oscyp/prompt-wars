import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { BattleLockInControl } from '@/components/game/battle/BattleLockInControl';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import { BattleThemePlaque } from '@/components/game/battle/BattleThemePlaque';
import { BattleMovePicker } from '@/components/game/battle/BattleMovePicker';
import { GameText as Text, GameFooter, GameField } from '@/components/game';
import BattleOpponentSafety from '@/components/BattleOpponentSafety';
import TutorialCoach from '@/components/TutorialCoach';
import { recordFunnelEvent } from '@/utils/tutorial';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { ImpactFeedbackStyle } from 'expo-haptics';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
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
import { useBattleExitGuard } from '@/hooks/useBattleExitGuard';
import { useBattleDraft } from '@/hooks/useBattleDraft';
import { resolveRoundParam } from '@/utils/prebattleCopy';
import { BattleDeadline } from '@/components/game/battle/BattleDeadline';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import { usePortraitViewer } from '@/hooks/usePortraitViewer';
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
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.5;
  // Dyslexia-friendly spacing on the theme + prompt-writing surface (§22a).
  const accessibleText = useAccessibleTextStyle();
  const reduceMotion = useReducedMotion();
  const presentationActive = useBattlePresentationActive();
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

  // A legacy deep link may supply the initial move. It is NOT
  // defaulted: a silent fallback to 'attack' would submit a move the player
  // never picked, and they would not find out until the reveal.
  const [moveType, setMoveType] = useState<MoveType | null>(
    MOVE_TYPES.includes(moveTypeParam as MoveType)
      ? (moveTypeParam as MoveType)
      : null,
  );
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const editorRef = useRef<TextInput>(null);
  const workspaceScroll = useRef<ScrollView>(null);
  const editorTop = useRef(0);
  const [workspaceHeight, setWorkspaceHeight] = useState(360);
  useEffect(() => {
    if (editorRef.current?.isFocused())
      workspaceScroll.current?.scrollTo({
        y: Math.max(0, editorTop.current - 8),
        animated: false,
      });
  }, [workspaceHeight]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const [battle, setBattle] = useState<{ theme?: string | null } | null>(null);
  const suggestionRunRef = useRef(0);
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
    isSubscribed,
  } = useRealtimeBattle(battleId || null);
  const battleAudio = useBattleAudio(rtBattle?.theme ?? battle?.theme);

  const roundNumber = resolveRoundParam(round, current_round);
  const draft = useBattleDraft(user?.id, battleId, roundNumber);
  const { save: saveDraft, clear: clearDraft } = draft;
  const [restoredScope, setRestoredScope] = useState<string | null>(null);
  const draftScope = `${user?.id}:${battleId}:${roundNumber}`;
  const [acceptedSubmission, setAcceptedSubmission] = useState<{
    scope: string;
    move: MoveType;
    text: string;
  } | null>(null);
  const submitAccepted = acceptedSubmission?.scope === draftScope;
  const authoringScopeRef = useRef(draftScope);
  authoringScopeRef.current = draftScope;
  const authoringBlockedRef = useRef(false);
  useEffect(() => {
    if (!draft.ready || restoredScope === draftScope) return;
    setRestoredScope(draftScope);
    if (draft.draft && battleId)
      void recordFunnelEvent('draft_recovered', battleId);
    setCustomText(draft.draft?.text ?? '');
    setIsCustom(draft.draft?.editMode ?? true);
    setMoveType(
      draft.draft?.move ??
        (MOVE_TYPES.includes(moveTypeParam as MoveType)
          ? (moveTypeParam as MoveType)
          : null),
    );
  }, [
    draft.ready,
    draft.draft,
    draftScope,
    moveTypeParam,
    restoredScope,
    battleId,
  ]);

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

  // Back parks the battle and flushes the draft; forfeiting is explicit.
  const leave = useBattleExitGuard(battleId || null, {
    format,
    mode: (rtBattle?.mode ?? 'ranked') as BattleMode,
    isBot: Boolean(rtBattle?.is_player_two_bot),
    prompts,
    myProfileId: user?.id,
    status: rtBattle?.status,
    hasOpponent: Boolean(
      rtBattle?.player_two_id || rtBattle?.is_player_two_bot,
    ),
    beforeExit: draft.flush,
  });

  const { exitTo } = leave;
  const isPlayerOne = rtBattle?.player_one_id === user?.id;
  const myHp = isPlayerOne ? rtBattle?.player_one_hp : rtBattle?.player_two_hp;
  const myHpMax = isPlayerOne
    ? rtBattle?.player_one_hp_max
    : rtBattle?.player_two_hp_max;
  const oppHp = isPlayerOne ? rtBattle?.player_two_hp : rtBattle?.player_one_hp;
  const oppHpMax = isPlayerOne
    ? rtBattle?.player_two_hp_max
    : rtBattle?.player_one_hp_max;

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
  authoringBlockedRef.current = alreadyLocked || submitAccepted || isSubmitting;
  const lockedMove: MoveType | null =
    myPrompt?.move_type ??
    (submitAccepted ? acceptedSubmission.move : moveType);
  const lockedText =
    myPrompt?.custom_prompt_text ??
    (submitAccepted ? acceptedSubmission.text : null);

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

  const [draftSaving, setDraftSaving] = useState(false);
  useEffect(() => {
    if (
      !draft.ready ||
      restoredScope !== draftScope ||
      alreadyLocked ||
      submitAccepted
    )
      return;
    let active = true;
    setDraftSaving(true);
    void saveDraft({
      text: customText,
      move: moveType,
      editMode: isCustom,
      selectedSuggestion:
        selectedSuggestion >= 0
          ? (suggestions[selectedSuggestion]?.body ?? null)
          : null,
    }).finally(() => {
      if (active) setDraftSaving(false);
    });
    return () => {
      active = false;
    };
  }, [
    draft.ready,
    saveDraft,
    draftScope,
    restoredScope,
    customText,
    moveType,
    isCustom,
    selectedSuggestion,
    suggestions,
    alreadyLocked,
    submitAccepted,
  ]);
  useEffect(() => {
    if (alreadyLocked) void clearDraft();
  }, [alreadyLocked, clearDraft]);

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
      void clearDraft().then((deleted) => {
        if (deleted) exitTo(() => router.replace(waitingHref));
        else redirectedRef.current = false;
      });
    }
  }, [
    battleId,
    rtBattle,
    isBo3,
    roundData,
    roundNumber,
    router,
    waitingHref,
    clearDraft,
    exitTo,
  ]);

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
      if (
        !battleId ||
        !moveType ||
        authoringBlockedRef.current ||
        authoringScopeRef.current !== draftScope
      )
        return;
      const run = ++suggestionRunRef.current;
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
        if (run !== suggestionRunRef.current) return;
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
        if (run === suggestionRunRef.current) {
          setSuggestionsLoading(false);
          setSuggestionsGenerating(false);
        }
      }
    },
    [battleId, moveType, roundNumber, draftScope],
  );

  // On mount, READ any set already generated for this slot; only generate
  // when there is none.
  //
  // Generating on every mount would charge the player for navigating: the free
  // slot is spent on the first call and every later call for the same
  // (battle, round, move type) is a paid reroll. Switching moves in the
  // workspace is normal use, not a purchase.
  //
  // Never retried automatically either -- every generate call costs money
  // server-side, and a retry loop during a provider outage would burn the
  // player's rate limit for nothing. A failure offers the player a button
  // instead, so the retry is one deliberate call rather than a loop.

  // Guards against a stale read landing after the player has changed move or
  // round: only the newest call may write state.
  const readOrGenerateSuggestions = useCallback(async () => {
    if (
      !battleId ||
      !moveType ||
      authoringBlockedRef.current ||
      authoringScopeRef.current !== draftScope
    )
      return;
    const run = ++suggestionRunRef.current;
    const isStale = () => run !== suggestionRunRef.current;

    setSuggestions([]);
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
  }, [battleId, moveType, roundNumber, loadSuggestions, draftScope]);

  const hasLoadedBattle = Boolean(rtBattle);
  useEffect(() => {
    // Nothing to read for once the prompt is in; the editor is not shown.
    if (
      alreadyLocked ||
      submitAccepted ||
      !draft.ready ||
      restoredScope !== draftScope ||
      !hasLoadedBattle
    )
      return;
    readOrGenerateSuggestions();
    return () => {
      suggestionRunRef.current += 1;
    };
  }, [
    readOrGenerateSuggestions,
    alreadyLocked,
    submitAccepted,
    draft.ready,
    hasLoadedBattle,
    restoredScope,
    draftScope,
  ]);

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
      if (
        authoringBlockedRef.current ||
        authoringScopeRef.current !== draftScope
      )
        return;
      const idea = suggestions[index];
      if (!idea) return;
      setCustomText(idea.body);
      if (openEditor) setIsCustom(true);
    },
    [suggestions, draftScope],
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
  const [holding, setHolding] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const submissionInFlight = useRef(false);

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

  useEffect(() => {
    if (presentationActive) return;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    setHolding(false);
    cancelAnimation(holdProgress);
    holdProgress.value = 0;
  }, [presentationActive, holdProgress]);

  const lockDisabled =
    isSubmitting ||
    submitAccepted ||
    deadlinePassed ||
    alreadyLocked ||
    !moveType ||
    !draft.ready ||
    !rtBattle ||
    Boolean(validatePromptText(customText));

  useEffect(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    setHolding(false);
    cancelAnimation(holdProgress);
    holdProgress.value = 0;
  }, [customText, moveType, lockDisabled, holdProgress]);

  const lockDisabledRef = useRef(lockDisabled);
  lockDisabledRef.current = lockDisabled;

  const handleSubmit = async () => {
    if (
      !battleId ||
      !moveType ||
      authoringScopeRef.current !== draftScope ||
      lockDisabledRef.current ||
      submissionInFlight.current
    )
      return;

    if (!validateSelection()) return;

    submissionInFlight.current = true;
    authoringBlockedRef.current = true;
    const submission = { scope: draftScope, move: moveType, text: customText };
    setSubmitFailed(false);
    setHolding(false);
    setIsSubmitting(true);

    try {
      const result = await submitPrompt(
        battleId as string,
        moveType,
        customText,
        isBo3 ? roundNumber : undefined,
      );

      // This route can be reused for another round while the request settles.
      // Its authoritative prompt will be recovered when that round reopens.
      if (authoringScopeRef.current !== submission.scope) return;

      if (result.success) {
        authoringBlockedRef.current = true;
        setAcceptedSubmission(submission);
        if (roundNumber === 1)
          void recordFunnelEvent('first_prompt_submitted', battleId);
        // Optimistic transition; no Alert interstitial.
        battleAudio.playSound('promptLocked');
        if (!(await clearDraft())) return;
        if (authoringScopeRef.current !== submission.scope) return;
        exitTo(() => router.replace(waitingHref));
        return;
      }

      // Status and code decide the words; the server's message is developer
      // prose and never reaches the player (utils/battleCopy.ts).
      setSubmitFailed(true);
      const copy = describeSubmitError({
        status: result.status,
        code: result.code,
        message: result.error,
      });
      if (copy.roundClosed) {
        Alert.alert(copy.title, copy.message, [
          {
            text: 'OK',
            onPress: () => {
              void clearDraft().then((deleted) => {
                if (deleted) exitTo(() => router.replace(waitingHref));
              });
            },
          },
        ]);
      } else {
        Alert.alert(copy.title, copy.message);
      }
    } catch (err) {
      setSubmitFailed(true);
      console.error('Submit error:', err);
      const copy = describeSubmitError({});
      Alert.alert(copy.title, copy.message);
    } finally {
      submissionInFlight.current = false;
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
    if (lockDisabled || holdTimerRef.current) return;
    if (!validateSelection()) return;
    setHolding(true);
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
    setHolding(false);
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

  const lockReason = submitAccepted
    ? 'Your prompt is locked in'
    : deadlinePassed
      ? 'The deadline for this round has passed'
      : !draft.ready
        ? 'Restore your draft before submitting'
        : !rtBattle
          ? 'Waiting for battle details'
          : !moveType
            ? 'Choose a move before locking in'
            : validatePromptText(customText)?.message;
  const holdHintText =
    lockReason ??
    (hintFlash
      ? 'Keep holding to lock in'
      : submitFailed
        ? 'Couldn’t submit. Your draft is kept; try again.'
        : 'Your prompt stays editable until you submit.');

  const primaryInk = inkFor(colors.primary);

  // The read-only move badge: text and glyph ink chosen for the move colour,
  // never a fixed white. Renders nothing for a null move -- the mount guard is
  // already redirecting, and a badge that says "null" helps nobody.
  const renderMoveBadge = (move: MoveType | null) => {
    if (!move) return null;
    const fill = colors[move];
    const ink = inkFor(fill);
    return (
      <View style={[styles.moveChipBadge, { backgroundColor: fill }]}>
        <GameSymbol name={MOVE_META[move].icon} size={14} color={ink} />
        <Text style={[styles.moveChipBadgeText, { color: ink }]}>
          {move.toUpperCase()}
        </Text>
      </View>
    );
  };

  if (isLoading || (!draft.ready && !draft.error)) {
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
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 44 },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Parking preserves the draft; forfeiting remains a separate action. */}
      <Stack.Screen
        options={{
          headerLeft: () => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Save draft and return to Arena"
              onPress={leave.park}
              style={{
                minHeight: 48,
                minWidth: largeText ? 140 : 64,
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: colors.text }}>Arena</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <HeaderLeaveButton
              onPress={() => leave.confirmLeave()}
              disabled={leave.isLeaving || !leave.canForfeit}
            />
          ),
        }}
      />
      {/* Only navigator clearance sits above this flexible viewport. Full
          identity/theme/status stay scrollable at every size and while typing;
          keyboard changes never move or remount the controlled editor. */}
      <ScrollView
        testID="battle-workspace-scroll"
        ref={workspaceScroll}
        onLayout={(event) =>
          setWorkspaceHeight(event.nativeEvent.layout.height)
        }
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
      >
        <View testID="battle-workspace-context" style={styles.battleContext}>
          <GameDisplayTitle
            accessibilityRole="header"
            style={{ textAlign: 'center', fontSize: 34, lineHeight: 40 }}
          >
            {isBo3
              ? `ROUND ${roundNumber} OF ${rtBattle?.best_of ?? 3}`
              : 'YOUR MOVE'}
          </GameDisplayTitle>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
            {rtBattle?.is_player_two_bot
              ? 'Practice · AI opponent'
              : rtBattle?.mode
                ? rtBattle.mode.charAt(0).toUpperCase() + rtBattle.mode.slice(1)
                : ''}
            {isBo3 ? ' · First to 2 wins' : ''}
          </Text>
          {/* You-vs-opponent context strip (replaces the old screen title). */}
          <VersusStrip
            compact={keyboardVisible}
            series={
              isBo3 &&
              rtBattle?.player_one_rounds_won != null &&
              rtBattle?.player_two_rounds_won != null
                ? {
                    score: series_score,
                    currentRound: roundNumber,
                    format,
                    bestOf: rtBattle?.best_of ?? 3,
                    viewer: isPlayerOne ? 'p1' : 'p2',
                  }
                : undefined
            }
            left={{
              hp: isBo3 ? (myHp ?? undefined) : undefined,
              hpMax: isBo3 ? (myHpMax ?? undefined) : undefined,
              name: myChar?.name ?? 'You',
              archetype: myChar?.archetype ?? '',
              signatureColor: myChar?.signatureColor ?? colors.primary,
              portraitUrl: myChar?.portraitUrl,
              cosmetics: myChar?.cosmetics,
              label: 'YOU',
              onAvatarPress: portraitViewer.canOpen(myChar)
                ? (opener) => portraitViewer.open(myChar, opener)
                : undefined,
            }}
            right={{
              hp: isBo3 ? (oppHp ?? undefined) : undefined,
              hpMax: isBo3 ? (oppHpMax ?? undefined) : undefined,
              name: oppChar?.name ?? 'Opponent',
              archetype: oppChar?.archetype ?? '',
              signatureColor: oppChar?.signatureColor ?? colors.textSecondary,
              portraitUrl: oppChar?.portraitUrl,
              cosmetics: oppChar?.cosmetics,
              label: rtBattle?.is_player_two_bot ? 'AI OPPONENT' : 'OPPONENT',
              onAvatarPress: portraitViewer.canOpen(oppChar)
                ? (opener) => portraitViewer.open(oppChar, opener)
                : undefined,
            }}
          />
          {/* The authoritative theme is never replaced with invented scene copy. */}
          {battle?.theme ? (
            <BattleThemePlaque theme={battle.theme} compact={keyboardVisible} />
          ) : null}
          <BattleDeadline deadline={myDeadline} />

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
              <GameSymbol name="lock-closed" size={14} color={colors.warning} />
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

        {draft.error && (
          <>
            <InlineBanner tone="warning" text={draft.error} />
            <TouchableOpacity
              accessibilityRole="button"
              onPress={async () => {
                if (!(await draft.retry())) return;
                const closed =
                  rtBattle &&
                  (CLOSED_BATTLE_STATUSES.has(rtBattle.status) ||
                    (rtBattle.current_round ?? 1) > roundNumber ||
                    (isBo3 &&
                      roundData &&
                      CLOSED_ROUND_STATUSES.has(roundData.status)));
                if (alreadyLocked || submitAccepted || closed)
                  exitTo(() => router.replace(waitingHref));
              }}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.primary }}>Retry draft storage</Text>
            </TouchableOpacity>
          </>
        )}

        {alreadyLocked || submitAccepted ? (
          /* Locked panel: the prompt is in. No editor, no ideas, no hold. */
          <View
            style={[
              styles.lockedPanel,
              { backgroundColor: colors.card, borderColor: colors.success },
            ]}
          >
            <View style={styles.lockedHeader}>
              <GameSymbol
                name="checkmark-circle"
                size={20}
                color={colors.success}
              />
              <Text
                variant="display"
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
            <TutorialCoach
              battleId={battleId}
              stage={
                !moveType
                  ? 'theme'
                  : customText.trim().length === 0
                    ? 'move'
                    : customText.trim().length < 80
                      ? 'write'
                      : 'lock'
              }
            />
            <BattleMovePicker
              value={moveType}
              onChange={(move) => {
                if (authoringBlockedRef.current) return;
                hapticSelection();
                setMoveType(move);
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <Text variant="label">YOUR PROMPT</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Open prompt ideas"
                onPress={() => {
                  hapticSelection();
                  setIsCustom(false);
                }}
                style={{
                  minHeight: 48,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <GameIcon name="ideas" size={24} />
                <Text
                  style={{
                    textDecorationLine: 'underline',
                    color: colors.primary,
                  }}
                >
                  Ideas
                </Text>
              </TouchableOpacity>
            </View>
            {/* Ideas / Write-your-own segmented control */}
            <View
              style={[
                styles.segmented,
                { backgroundColor: colors.card },
                largeText && { flexDirection: 'column', alignItems: 'stretch' },
              ]}
            >
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
                <GameSymbol
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
                <GameSymbol
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
                <Text
                  style={{
                    color: colors.textSecondary,
                    marginBottom: Spacing.sm,
                  }}
                >
                  First idea set per move and round is free. Further sets:{' '}
                  {rerollChip}. Ideas do not guarantee a higher score.
                </Text>

                <View style={styles.suggestionHeader}>
                  <GameSymbol name="bulb" size={14} color={colors.primary} />
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
                          <GameSymbol
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
                          <GameSymbol
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
                        <GameSymbol
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
                              <GameSymbol
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
                            <GameSymbol
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
                            <GameSymbol
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
                    <GameSymbol
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
            <View
              style={styles.section}
              onLayout={(event) => {
                editorTop.current = event.nativeEvent.layout.y;
              }}
            >
              <GameField
                testID="battle-prompt-editor"
                ref={editorRef}
                editable={draft.ready && !isSubmitting && !submitAccepted}
                scrollEnabled
                onFocus={() =>
                  workspaceScroll.current?.scrollTo({
                    y: Math.max(0, editorTop.current - 8),
                    animated: false,
                  })
                }
                style={[
                  styles.customInput,
                  {
                    backgroundColor: colors.fieldSurface,
                    color: colors.text,
                    height: Math.max(80, Math.min(240, workspaceHeight - 48)),
                    minHeight: 80,
                  },
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
              <View
                style={[
                  styles.qualityRow,
                  largeText && {
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 8,
                  },
                ]}
              >
                <View
                  style={styles.qualityItem}
                  accessible
                  accessibilityRole="text"
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={coach.label}
                >
                  <GameSymbol
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
                  <GameSymbol
                    name={referencesTheme ? 'checkmark-circle' : 'bulb-outline'}
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
            <Text
              accessibilityLiveRegion="polite"
              style={{
                color: draft.error ? colors.warning : colors.textSecondary,
              }}
            >
              {draft.error
                ? 'Draft not saved — retry storage above'
                : draftSaving
                  ? 'Saving draft on this device…'
                  : 'Draft saved on this device'}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  'Discard draft?',
                  'This removes the saved text and move on this device.',
                  [
                    { text: 'Keep draft', style: 'cancel' },
                    {
                      text: 'Discard',
                      style: 'destructive',
                      onPress: () => {
                        if (
                          authoringBlockedRef.current ||
                          authoringScopeRef.current !== draftScope
                        )
                          return;
                        void draft.clear(false);
                        setCustomText('');
                        setMoveType(null);
                      },
                    },
                  ],
                )
              }
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.textSecondary }}>Discard draft</Text>
            </TouchableOpacity>
          </>
        )}
        <BattleOpponentSafety
          battle={rtBattle}
          myId={user?.id}
          name={oppChar?.name}
        />
      </ScrollView>

      {/* Pinned footer: the primary action is always reachable and never
          hidden behind the keyboard. Press-and-hold ceremony; tap + confirm
          under a screen reader, where a timed hold isn't feasible. Once the
          prompt is in, the only action left is to go and wait. */}
      <GameFooter
        testID="battle-workspace-footer"
        keyboardVisible={keyboardVisible}
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: (keyboardVisible ? 0 : insets.bottom) + Spacing.sm,
          },
        ]}
      >
        {alreadyLocked ? (
          <TouchableOpacity
            style={[styles.submitButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              hapticSelection();
              exitTo(() => router.replace(waitingHref));
            }}
            accessibilityLabel="Wait for your opponent"
            accessibilityRole="button"
          >
            <View style={styles.submitButtonInner}>
              <GameSymbol
                name="hourglass-outline"
                size={18}
                color={primaryInk}
              />
              <Text
                variant="label"
                style={[styles.submitButtonText, { color: primaryInk }]}
              >
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
            <BattleLockInControl
              state={
                submitAccepted
                  ? 'submitted'
                  : isSubmitting
                    ? 'submitting'
                    : lockDisabled
                      ? 'unavailable'
                      : holding
                        ? 'holding'
                        : submitFailed
                          ? 'failure'
                          : 'ready'
              }
              reason={lockReason}
              progress={holdProgress}
              screenReaderEnabled={screenReaderEnabled}
              onStart={startHold}
              onCancel={cancelHold}
              onConfirm={confirmLockIn}
            />
            {/* Reserved height: the hint changes words, never the footer's size. */}
            {!largeText && (
              <Text
                style={[
                  styles.holdHint,
                  { color: hintFlash ? colors.warning : colors.textSecondary },
                ]}
                accessibilityLiveRegion={hintFlash ? 'polite' : 'none'}
              >
                {holdHintText}
              </Text>
            )}
            {!keyboardVisible && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ disabled: lockDisabled }}
                onPress={confirmLockIn}
                disabled={lockDisabled}
                style={{
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    textDecorationLine: 'underline',
                    color: lockDisabled ? colors.textTertiary : colors.primary,
                  }}
                >
                  Use confirmation instead
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </GameFooter>
      <PortraitViewer
        returnFocusRef={portraitViewer.returnFocusRef}
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
  battleContext: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
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
    fontSize: 14,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.8,
  },
  themeBarText: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
  reconnecting: {
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
  moveChipHint: {
    flex: 1,
    fontSize: 14,
  },
  moveChipChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  moveChipChangeText: {
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: Typography.weights.semibold,
  },
  suggestionCardBody: {
    fontSize: 16,
    lineHeight: 24,
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
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 14,
    marginBottom: Spacing.lg,
    lineHeight: 16,
  },
  customInput: {
    minHeight: 120,
    lineHeight: 26,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: Typography.sizes.base,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 14,
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
    fontSize: 14,
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
    minHeight: 56,
    borderRadius: 0,
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
