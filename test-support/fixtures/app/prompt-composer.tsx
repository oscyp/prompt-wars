import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Alert,
  AppState,
  BackHandler,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  cancelAnimation,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { GameButton, GameField, GameFooter, GameText } from '@/components/game';
import BattleBackdrop from '@/components/battle/BattleBackdrop';
import BattleHeader from '@/components/battle/BattleHeader';
import VersusStrip from '@/components/VersusStrip';
import { BattleSituation } from '@/components/battle/BattleSituation';
import { PromptLockConfirmation } from '@/components/battle/PromptLockConfirmation';
import { ComposerModeSwitch } from '@/components/battle/ComposerModeSwitch';
import { ComposerMoveReview } from '@/components/battle/ComposerMoveReview';
import {
  ComposerProgress,
  composerProgressLabel,
} from '@/components/battle/ComposerProgress';
import { WritingTips } from '@/components/battle/WritingTips';
import {
  PromptComposerPanel,
  ComposerMoveTypeControl,
} from '@/components/battle/PromptComposerPanel';
import { BattleLockInControl } from '@/components/game/battle/BattleLockInControl';
import { BattleDeadline } from '@/components/game/battle/BattleDeadline';
import {
  composerReducer,
  createComposerState,
  type BuilderChange,
} from '@/utils/promptComposer';
import {
  composerBackStep,
  composerNextStep,
  composerCanReview,
  normalizeComposerStep,
  restoreComposerStep,
  type ComposerStep,
} from '@/utils/promptComposerFlow';
import { getAllFallbackMoveSuggestions } from '@/utils/promptSituations';
import type { MoveType } from '@/utils/battles';
import type { SituationSnapshot } from '@/types/battle';
import { SITUATIONS } from '@/supabase/functions/_shared/prompt-situations';

const { theme: _theme, ...publishedSituation } = SITUATIONS.find(
  (entry) => entry.id === 'storm-1',
)!;
const situation: SituationSnapshot = publishedSituation;
const HOLD_MS = 600;

/** Presentation fixture only. No auth, telemetry, suggestion requests or purchases. */
export default function PromptComposerFixture() {
  const { state: variant = 'build' } = useLocalSearchParams<{
    state?: string;
  }>();
  const router = useRouter();
  const [fixtureDeadline] = useState(() =>
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  );
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const scrollContent = useRef<View>(null);
  const heading = useRef<View>(null);
  const editor = useRef<TextInput>(null);
  const options = useMemo(() => getAllFallbackMoveSuggestions(situation), []);
  const purchased = useMemo(
    () =>
      variant === 'paid'
        ? options
            .filter((item) => item.moveType === 'attack')
            .map((item) => ({
              ...item,
              id: `fixture-paid:${item.id}`,
              source: 'ai' as const,
              affordanceIds: [],
            }))
        : [],
    [variant, options],
  );
  const [composer, dispatch] = useReducer(composerReducer, undefined, () => {
    let initial = createComposerState(
      variant === 'write' || variant === 'overflow' ? 'write' : 'build',
    );
    if (
      [
        'ready',
        'intent',
        'approach',
        'write',
        'detached',
        'pending',
        'overflow',
      ].includes(variant)
    ) {
      initial = composerReducer(initial, {
        type: 'change',
        change: {
          type: 'action',
          id: options[0].id!,
          moveType: options[0].moveType,
          text: options[0].action!,
          intentHints: options[0].intentHints,
        },
      });
      if (variant !== 'intent')
        initial = composerReducer(initial, {
          type: 'change',
          change: {
            type: 'intent',
            id: options[0].intentHints![0].id,
            text: options[0].intentHints![0].text,
          },
        });
    }
    if (variant === 'ready' && initial.approachHints?.length)
      initial = composerReducer(initial, {
        type: 'change',
        change: { type: 'approach', ...initial.approachHints[0] },
      });
    if (variant === 'pending')
      initial = composerReducer(initial, {
        type: 'change',
        change: {
          type: 'action',
          id: options[1].id!,
          moveType: options[1].moveType,
          text: options[1].action!,
          intentHints: options[1].intentHints,
        },
      });
    if (variant === 'detached')
      initial = composerReducer(initial, {
        type: 'edit',
        text: 'I swing the rope across the courtyard, creating a moving barrier so I can get to the lower balcony.',
      });
    if (variant === 'overflow')
      initial = composerReducer(initial, {
        type: 'edit',
        text: 'A very long editable prompt should stay visible without losing any of the original writing. '.repeat(
          10,
        ),
      });
    if (variant === 'write')
      initial = composerReducer(initial, { type: 'mode', mode: 'write' });
    return initial;
  });
  const [step, setStep] = useState<ComposerStep>(() =>
    restoreComposerStep(
      composer,
      variant === 'write' || variant === 'overflow' ? 'write' : undefined,
    ),
  );
  const [viewedBank, setViewedBank] = useState<MoveType | null>(null);
  const [ideasReady, setIdeasReady] = useState(
    !['loading', 'error'].includes(variant),
  );
  const [keyboard, setKeyboard] = useState(false);
  const [writingTips, setWritingTips] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [holding, setHolding] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [active, setActive] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const [preview, setPreview] = useState<{
    text: string;
    moveType: MoveType | null;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(0);
  const latest = useRef({ composer, step, screenReader, active, submitted });
  latest.current = { composer, step, screenReader, active, submitted };
  const canLock =
    active && !submitted && step === 'review' && composerCanReview(composer);

  const cancelHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    cancelAnimation(progress);
    progress.value = 0;
  }, [progress]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboard(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboard(false),
    );
    const app = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) setScreenReader(enabled);
    });
    const accessibility = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setScreenReader,
    );
    return () => {
      mounted = false;
      show.remove();
      hide.remove();
      app.remove();
      accessibility.remove();
    };
  }, []);

  useEffect(
    () => cancelHold(),
    [
      composer.revision,
      composer.finalText,
      composer.moveType,
      composer.mode,
      step,
      active,
      submitted,
      screenReader,
      cancelHold,
    ],
  );
  useEffect(() => cancelHold, [cancelHold]);
  useEffect(() => {
    setStep((current) => normalizeComposerStep(current, composer));
  }, [composer]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scroll.current?.scrollTo({ y: 0, animated: !reduceMotion });
      const node = findNodeHandle(heading.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    });
    return () => cancelAnimationFrame(frame);
  }, [step, reduceMotion]);

  const navigate = useCallback(
    (target: ComposerStep) => {
      cancelHold();
      Keyboard.dismiss();
      setPreview(null);
      if (target === 'action') dispatch({ type: 'mode', mode: 'build' });
      if (target === 'write') dispatch({ type: 'mode', mode: 'write' });
      setStep(target);
    },
    [cancelHold],
  );
  const back = useCallback(() => {
    if (keyboard) {
      Keyboard.dismiss();
      return;
    }
    const target = composerBackStep(step, composer);
    if (target) navigate(target);
    else {
      cancelHold();
      router.replace('/');
    }
  }, [keyboard, step, composer, navigate, cancelHold, router]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => listener.remove();
  }, [back]);

  const reveal = (field: TextInput | View | null, animated = false) => {
    const inner = scrollContent.current;
    if (field && inner)
      field.measureLayout(
        inner,
        (_x, y) =>
          scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated }),
        () => {},
      );
  };
  const change = (value: BuilderChange) => {
    if (submitted) return;
    dispatch({ type: 'change', change: value });
  };
  const startHold = () => {
    const snapshot = latest.current;
    if (
      timer.current ||
      snapshot.screenReader ||
      !snapshot.active ||
      snapshot.submitted ||
      snapshot.step !== 'review' ||
      !composerCanReview(snapshot.composer)
    )
      return;
    setHolding(true);
    progress.value = reduceMotion ? 0 : withTiming(1, { duration: HOLD_MS });
    timer.current = setTimeout(() => {
      timer.current = null;
      const current = latest.current;
      if (
        !current.active ||
        current.submitted ||
        current.screenReader ||
        current.step !== 'review' ||
        current.composer.mode !== snapshot.composer.mode ||
        current.composer.revision !== snapshot.composer.revision ||
        current.composer.finalText !== snapshot.composer.finalText ||
        current.composer.moveType !== snapshot.composer.moveType ||
        !composerCanReview(current.composer)
      ) {
        cancelHold();
        return;
      }
      progress.value = 1;
      setHolding(false);
      setSubmitted(true);
    }, HOLD_MS);
  };
  const title =
    step === 'faceoff'
      ? 'How will you create your move?'
      : step === 'action'
        ? 'What do you do?'
        : step === 'intent'
          ? 'What are you trying to achieve?'
          : step === 'approach'
            ? 'How will you make it work?'
            : step === 'write'
              ? 'Write your own'
              : 'Your move';
  const validPreview = Boolean(
    preview &&
    canLock &&
    preview.text === composer.finalText &&
    preview.moveType === composer.moveType,
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0B0B13' }}
      behavior={Platform.select({
        ios: 'padding',
        android: keyboard ? 'padding' : undefined,
      })}
    >
      <BattleBackdrop theme="The calm before the storm" quiet />
      <BattleHeader
        onPark={back}
        parkLabel={step === 'faceoff' ? 'Arena' : 'Back'}
        onLeave={() => undefined}
      />
      <ScrollView
        ref={scroll}
        innerViewRef={scrollContent as React.RefObject<View>}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ padding: 16, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={false}
      >
        <GameText variant="caption">
          DEV · local composer fixture · no live actions
        </GameText>
        <GameText variant="label">ROUND 1 OF 3</GameText>
        <VersusStrip
          compact={step !== 'faceoff'}
          left={{
            name: 'Andrew',
            archetype: 'warrior',
            signatureColor: '#C6BBE8',
            label: 'YOU',
            hp: 100,
            hpMax: 100,
          }}
          right={{
            name: 'Rook',
            archetype: 'mystic',
            signatureColor: '#E9BC63',
            label: 'OPPONENT',
            hp: 100,
            hpMax: 100,
          }}
        />
        <BattleSituation
          theme="The calm before the storm"
          compact={keyboard}
          situation={situation}
          footer={<BattleDeadline deadline={fixtureDeadline} />}
        />
        <View
          ref={heading}
          collapsable={false}
          accessible
          accessibilityRole="header"
          accessibilityLabel={
            step === 'faceoff' || step === 'write'
              ? title
              : composerProgressLabel(step)
          }
        >
          {step !== 'faceoff' && step !== 'write' ? (
            <ComposerProgress step={step} />
          ) : (
            <GameText variant="title">{title}</GameText>
          )}
        </View>
        {step === 'faceoff' ? (
          <View style={{ gap: 12 }}>
            <ComposerModeSwitch
              value={composer.mode}
              onChange={(mode) => dispatch({ type: 'mode', mode })}
              disabled={submitted}
            />
          </View>
        ) : null}
        {step === 'action' || step === 'intent' || step === 'approach' ? (
          <PromptComposerPanel
            stage={step}
            actionsLoading={!ideasReady && variant === 'loading'}
            state={composer}
            suggestions={
              viewedBank && purchased.length
                ? [
                    ...options.filter((item) => item.moveType !== 'attack'),
                    ...purchased,
                  ]
                : ideasReady
                  ? options
                  : []
            }
            viewedBank={viewedBank}
            onViewAll={() => setViewedBank(null)}
            onMoveType={(moveType) => dispatch({ type: 'move-type', moveType })}
            disabled={submitted}
            onChange={change}
            onConfirm={(field) => dispatch({ type: 'confirm-fragment', field })}
            onFieldFocus={reveal}
          />
        ) : null}
        {step === 'action' && !ideasReady && variant === 'error' ? (
          <View style={{ gap: 12 }}>
            <GameText accessibilityLiveRegion="polite">
              Couldn’t load ideas. Try again or return to Face-off to write your
              own.
            </GameText>
            <GameButton
              label="Check ideas"
              tone="secondary"
              chrome="text"
              disabled={submitted}
              onPress={() => setIdeasReady(true)}
            />
          </View>
        ) : null}
        {(step === 'action' || step === 'intent' || step === 'approach') &&
        composer.moveType ? (
          <View style={{ gap: 12 }}>
            <GameButton
              label={
                step === 'action'
                  ? '3 new actions'
                  : step === 'intent'
                    ? '3 new intentions'
                    : '3 new approaches'
              }
              amount={1}
              labelStyle={{ flex: 1 }}
              tone="secondary"
              chrome="utility"
              disabled={submitted}
              onPress={() =>
                Alert.alert(
                  'Preview purchase',
                  'This fixture does not charge credits.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Preview',
                      onPress: () => {
                        // Local fixture only: display the prepared set immediately.
                        if (step === 'action') setViewedBank('attack');
                      },
                    },
                  ],
                )
              }
            />
          </View>
        ) : null}
        <View
          style={step === 'write' ? { gap: 12 } : { display: 'none' }}
          accessibilityElementsHidden={step !== 'write'}
          importantForAccessibility={
            step === 'write' ? 'auto' : 'no-hide-descendants'
          }
        >
          <ComposerMoveTypeControl
            value={composer.moveType}
            onChange={(moveType) => dispatch({ type: 'move-type', moveType })}
            disabled={submitted}
          />
          <GameField
            ref={editor}
            testID="fixture-prompt-editor"
            label="Your move"
            multiline
            style={{ height: 200 }}
            scrollEnabled
            value={composer.finalText}
            editable={step === 'write' && !submitted}
            onFocus={() => reveal(editor.current)}
            onChangeText={(text) => dispatch({ type: 'edit', text })}
            error={
              composer.finalText.trim().length > 800
                ? 'Keep your complete prompt within 800 characters.'
                : undefined
            }
          />
          <GameText>{composer.finalText.trim().length}/800 characters</GameText>
          <GameText>
            Describe one clear action and what you want it to achieve.
          </GameText>
        </View>
        {step === 'review' ? (
          <View style={{ gap: 16 }}>
            <ComposerMoveReview
              state={composer}
              testID="fixture-exact-prompt"
            />
          </View>
        ) : null}
        {step !== 'faceoff' ? (
          <WritingTips
            expanded={writingTips}
            onToggle={() => setWritingTips((value) => !value)}
          >
            <GameText>
              Pick one clear action. Next, you’ll choose its purpose and how to
              carry it out. You don’t have to use every detail in the scene.
            </GameText>
          </WritingTips>
        ) : null}
      </ScrollView>
      <GameFooter
        keyboardVisible={keyboard}
        style={{ paddingBottom: (keyboard ? 0 : insets.bottom) + 8 }}
      >
        {step === 'review' ? (
          <BattleLockInControl
            state={
              submitted
                ? 'submitted'
                : !canLock
                  ? 'unavailable'
                  : holding
                    ? 'holding'
                    : 'ready'
            }
            progress={progress}
            screenReaderEnabled={screenReader}
            activation="hold"
            onStart={startHold}
            onCancel={cancelHold}
            onConfirm={() => {
              if (!canLock) return;
              Keyboard.dismiss();
              setPreview({
                text: composer.finalText,
                moveType: composer.moveType,
              });
            }}
          />
        ) : (
          <GameButton
            label="Next"
            disabled={submitted || !composerNextStep(step, composer)}
            onPress={() => {
              const target = composerNextStep(step, composer);
              if (target) navigate(target);
            }}
          />
        )}
      </GameFooter>
      <PromptLockConfirmation
        visible={preview !== null}
        text={preview?.text ?? ''}
        moveType={preview?.moveType ?? null}
        disabled={!validPreview}
        onClose={() => setPreview(null)}
        onConfirm={() => {
          if (!validPreview) return;
          setSubmitted(true);
          setPreview(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}
