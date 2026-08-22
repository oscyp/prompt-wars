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
import { useRouter, useLocalSearchParams } from 'expo-router';
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
  getBattle,
  getBattleTemplates,
  getOpponentMoveProfile,
  getPromptTemplates,
  submitPrompt,
  BattleTemplate,
  MoveType,
  OpponentMoveProfile,
} from '@/utils/battles';
import { MOVE_META, counterOf } from '@/constants/MoveTypes';
import { hapticImpact, hapticSelection } from '@/utils/haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import SeriesScoreIndicator from '@/components/SeriesScoreIndicator';
import HPBar from '@/components/HPBar';
import MoveTypeChipRow from '@/components/MoveTypeChipRow';
import VersusStrip from '@/components/VersusStrip';

// Judge length normalization (soft target 15–80 words, penalty past 100 —
// see _shared/judge.ts normalizeScores). Client-side hint only.
const WORDS_MIN_GOOD = 15;
const WORDS_MAX_GOOD = 80;
const WORDS_PENALTY = 100;

// Lock-in ceremony: press-and-hold duration before the submit fires.
const HOLD_DURATION_MS = 600;

export default function PromptEntryScreen() {
  const colors = useThemedColors();
  // Dyslexia-friendly spacing on the theme + prompt-writing surface (§22a).
  const accessibleText = useAccessibleTextStyle();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { battleId, round } = useLocalSearchParams<{
    battleId: string;
    round?: string;
  }>();

  const [battle, setBattle] = useState<{ theme?: string | null } | null>(null);
  const [oppProfile, setOppProfile] = useState<OpponentMoveProfile | null>(
    null,
  );
  const [templates, setTemplates] = useState<BattleTemplate[]>([]);
  const [moveType, setMoveType] = useState<MoveType>('attack');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Realtime Bo3 state (HP, series score, opponent move history).
  const {
    battle: rtBattle,
    prompts,
    format,
    current_round,
    current_round_data,
    series_score,
    hp,
    hp_max,
  } = useRealtimeBattle(battleId || null);

  const roundNumber = round ? Number(round) : current_round;
  const isBo3 = format === 'bo3';

  const isPlayerOne = rtBattle?.player_one_id === user?.id;
  const myHp = isPlayerOne ? hp.p1 : hp.p2;
  const myHpMax = isPlayerOne ? hp_max.p1 : hp_max.p2;
  const oppHp = isPlayerOne ? hp.p2 : hp.p1;
  const oppHpMax = isPlayerOne ? hp_max.p2 : hp_max.p1;

  // Opponent's last 5 move types across rounds (from battle_prompts).
  const opponentHistory = useMemo<MoveType[]>(() => {
    if (!rtBattle || !user) return [];
    const opp = prompts
      .filter((p) => p.profile_id !== user.id && p.move_type)
      .sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1))
      .map((p) => p.move_type as MoveType);
    return opp.slice(-5);
  }, [prompts, rtBattle, user]);

  // Both characters for the versus header strip (names + signed portraits).
  const { p1: p1Char, p2: p2Char } = useBattleCharacters(
    battleId || null,
    rtBattle,
  );
  const myChar = isPlayerOne ? p1Char : p2Char;
  const oppChar = isPlayerOne ? p2Char : p1Char;

  // Cross-battle opponent move profile (§7.1): last-5 from resolved battles +
  // per-move win rates vs their archetype. Non-blocking; null on failure.
  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;
    getOpponentMoveProfile(battleId as string).then((profile) => {
      if (!cancelled) setOppProfile(profile);
    });
    return () => {
      cancelled = true;
    };
  }, [battleId]);

  // Prefer this battle's rounds (Bo3); fall back to the cross-battle profile
  // so single-format players get move legibility too.
  const displayedHistory = useMemo<MoveType[]>(
    () =>
      opponentHistory.length > 0
        ? opponentHistory
        : (oppProfile?.recent_moves ?? []),
    [opponentHistory, oppProfile],
  );
  const historyLabel =
    opponentHistory.length > 0
      ? "Opponent's moves this battle"
      : "Opponent's recent moves";

  // Suggest the move that counters the opponent's most frequent recent move.
  const suggestedCounter = useMemo<MoveType | null>(() => {
    if (displayedHistory.length === 0) return null;
    const counts: Record<MoveType, number> = {
      attack: 0,
      defense: 0,
      finisher: 0,
    };
    displayedHistory.forEach((m) => {
      counts[m] += 1;
    });
    const mostFrequent = (Object.keys(counts) as MoveType[]).sort(
      (a, b) => counts[b] - counts[a],
    )[0];
    return counterOf(mostFrequent);
  }, [displayedHistory]);

  // Lock-in deadline for the countdown: per-round for Bo3, per-player for single.
  const myDeadline = isBo3
    ? (current_round_data?.lock_in_deadline ?? null)
    : isPlayerOne
      ? (rtBattle?.player_one_prompt_deadline ?? null)
      : (rtBattle?.player_two_prompt_deadline ?? null);

  // Opponent lock status (never move type or content). Bo3 uses the current
  // round's per-round timestamps; single uses the battle-level columns. All
  // fields are nullable on legacy rows and simply yield "not locked".
  const opponentHasLocked = useMemo<boolean>(() => {
    if (!rtBattle) return false;
    if (isBo3) {
      const rd = current_round_data;
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
  }, [rtBattle, isBo3, current_round_data, isPlayerOne]);

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

  useEffect(() => {
    loadData();
  }, [battleId]);

  const loadData = async () => {
    if (!battleId) {
      Alert.alert('Error', 'No battle ID');
      router.back();
      return;
    }

    try {
      // Battle-scoped serving (up to 3, one per move type). Null on failure —
      // e.g. RPC not yet deployed — so fall back to the generic template list.
      const [battleData, battleTemplates] = await Promise.all([
        getBattle(battleId as string),
        getBattleTemplates(battleId as string),
      ]);

      setBattle(battleData as { theme?: string | null });

      if (battleTemplates && battleTemplates.length > 0) {
        setTemplates(battleTemplates);
      } else {
        const legacy = ((await getPromptTemplates()) ?? []) as {
          id: string;
          title: string;
          body: string;
          category?: string | null;
        }[];
        setTemplates(
          legacy.slice(0, 3).map((t) => ({
            id: t.id,
            title: t.title,
            body: t.body,
            category: t.category ?? null,
            suggested_move_type: null,
          })),
        );
      }
    } catch (err) {
      console.error('Failed to load prompt entry data:', err);
      Alert.alert('Error', 'Failed to load battle');
    } finally {
      setIsLoading(false);
    }
  };

  // Shared pre-flight validation: used both before starting the hold gesture
  // (so a hold never ends in a validation error) and inside the submit path.
  const validateSelection = useCallback((): boolean => {
    if (!isCustom && !selectedTemplate) {
      Alert.alert(
        'Select a Prompt',
        'Please select a template or write a custom prompt',
      );
      return false;
    }
    if (isCustom && customText.trim().length < 20) {
      Alert.alert(
        'Prompt Too Short',
        'Custom prompts must be at least 20 characters',
      );
      return false;
    }
    return true;
  }, [isCustom, selectedTemplate, customText]);

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
        moveType,
        isCustom ? undefined : selectedTemplate || undefined,
        isCustom ? customText : undefined,
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
            label: 'YOU',
          }}
          right={{
            name: oppChar?.name ?? 'Opponent',
            archetype: oppChar?.archetype ?? '',
            signatureColor: oppChar?.signatureColor ?? colors.textSecondary,
            portraitUrl: oppChar?.portraitUrl,
            label: 'OPPONENT',
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

        {/* Move Type Selector */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Move Type</Text>
          {displayedHistory.length > 0 ? (
            <MoveTypeChipRow history={displayedHistory} label={historyLabel} />
          ) : null}
          <View style={styles.moveTypeButtons}>
            {(['attack', 'defense', 'finisher'] as MoveType[]).map((type) => {
              const selected = moveType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.moveTypeButton,
                    { backgroundColor: selected ? colors[type] : colors.card },
                    selected && styles.moveTypeButtonSelected,
                  ]}
                  onPress={() => {
                    hapticSelection();
                    setMoveType(type);
                  }}
                  accessibilityLabel={`Select ${type} move${suggestedCounter === type ? ', counters opponent pattern' : ''}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  {suggestedCounter === type ? (
                    <View
                      style={[
                        styles.counterPill,
                        { backgroundColor: colors.success },
                      ]}
                    >
                      <Text style={styles.counterPillText}>COUNTER</Text>
                    </View>
                  ) : null}
                  <Ionicons
                    name={MOVE_META[type].icon}
                    size={20}
                    color={selected ? '#FFFFFF' : colors[type]}
                  />
                  <Text
                    style={[
                      styles.moveTypeText,
                      { color: selected ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {type.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Live matchup hint for the selected move (replaces the static rule line). */}
          <View
            style={[styles.matchupHint, { backgroundColor: colors.card }]}
            accessible
            accessibilityLabel={`${moveType} beats ${MOVE_META[moveType].beats}, loses to ${MOVE_META[moveType].losesTo}`}
          >
            <Ionicons name="trending-up" size={14} color={colors.success} />
            <Text style={[styles.matchupText, { color: colors.textSecondary }]}>
              beats{' '}
              <Text
                style={{
                  color: colors[MOVE_META[moveType].beats],
                  fontWeight: Typography.weights.bold,
                }}
              >
                {MOVE_META[moveType].beats.toUpperCase()}
              </Text>
            </Text>
            <View
              style={[
                styles.matchupDivider,
                { backgroundColor: colors.border },
              ]}
            />
            <Ionicons name="trending-down" size={14} color={colors.error} />
            <Text style={[styles.matchupText, { color: colors.textSecondary }]}>
              loses to{' '}
              <Text
                style={{
                  color: colors[MOVE_META[moveType].losesTo],
                  fontWeight: Typography.weights.bold,
                }}
              >
                {MOVE_META[moveType].losesTo.toUpperCase()}
              </Text>
            </Text>
          </View>

          {/* §7.1 counter-pick win rate vs the opponent's archetype (RPC data). */}
          {(() => {
            const rate = oppProfile?.counter_win_rates?.[moveType];
            const archetype = oppProfile?.opponent_archetype;
            if (!rate || !archetype || rate.total < 3) return null;
            return (
              <Text
                style={[styles.winRateText, { color: colors.textTertiary }]}
              >
                {moveType.toUpperCase()} wins {Math.round(rate.win_rate * 100)}%
                vs {archetype.toUpperCase()} ({rate.total} battles)
              </Text>
            );
          })()}
        </View>

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
            accessibilityLabel="Use a ready-made template"
            accessibilityRole="button"
            accessibilityState={{ selected: !isCustom }}
          >
            <Ionicons
              name="albums"
              size={16}
              color={!isCustom ? '#FFFFFF' : colors.textSecondary}
            />
            <Text
              style={[
                styles.segmentText,
                { color: !isCustom ? '#FFFFFF' : colors.text },
              ]}
            >
              Templates
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
            : 'Pick a ready-made prompt — a safe start that still scores on theme fit.'}
        </Text>

        {/* Template List */}
        {!isCustom && (
          <View style={styles.section}>
            {templates.slice(0, 3).map((template) => (
              <TouchableOpacity
                key={template.id}
                style={[
                  styles.templateCard,
                  { backgroundColor: colors.card },
                  selectedTemplate === template.id && {
                    borderColor: colors.primary,
                    borderWidth: 2,
                  },
                ]}
                onPress={() => {
                  hapticSelection();
                  setSelectedTemplate(template.id);
                  // Selecting a template also selects its suggested move; the
                  // user can still override via the move-type selector above.
                  if (template.suggested_move_type) {
                    setMoveType(template.suggested_move_type);
                  }
                }}
                accessibilityLabel={`Select template: ${template.title}${
                  template.suggested_move_type
                    ? `, suggested move ${template.suggested_move_type}`
                    : ''
                }`}
                accessibilityRole="button"
              >
                <View style={styles.templateHeader}>
                  <Text
                    style={[styles.templateTitle, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {template.title}
                  </Text>
                  {template.suggested_move_type ? (
                    <View
                      style={[
                        styles.templateMoveChip,
                        {
                          backgroundColor: colors[template.suggested_move_type],
                        },
                      ]}
                    >
                      <Ionicons
                        name={MOVE_META[template.suggested_move_type].icon}
                        size={10}
                        color="#FFFFFF"
                      />
                      <Text style={styles.templateMoveChipText}>
                        {template.suggested_move_type.toUpperCase()}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[styles.templateText, { color: colors.textSecondary }]}
                >
                  {template.body}
                </Text>
                {/* Lowers the blank-page barrier: seed the custom editor with
                    this template's text as a starting point. */}
                <TouchableOpacity
                  style={styles.templateEdit}
                  onPress={() => {
                    hapticSelection();
                    setCustomText(template.body);
                    setIsCustom(true);
                  }}
                  accessibilityLabel={`Start a custom prompt from template: ${template.title}`}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="create-outline"
                    size={14}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.templateEditText, { color: colors.primary }]}
                  >
                    Start from this
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

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
  moveTypeButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  moveTypeButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    gap: 4,
  },
  moveTypeButtonSelected: {
    transform: [{ scale: 1.03 }],
  },
  moveTypeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  counterPill: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    zIndex: 1,
  },
  counterPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
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
  templateCard: {
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  templateTitle: {
    flex: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  templateMoveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  templateMoveChipText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
  templateText: {
    fontSize: Typography.sizes.sm,
  },
  templateEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: Spacing.sm,
  },
  templateEditText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
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
