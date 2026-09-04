import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ARCHETYPES,
  ARCHETYPE_ART,
  type ArchetypeId,
} from '@/constants/Archetypes';
import {
  BATTLE_CRY_SUGGESTIONS,
  type Era,
  type Expression,
  type ItemClass,
  type PaletteKey,
  type Silhouette,
  type Vibe,
} from '@/constants/CharacterTraits';
import {
  BorderRadius,
  Ink,
  Layout,
  Motion,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useAuth } from '@/providers/AuthProvider';
import { invokeAuthenticatedFunction, supabase } from '@/utils/supabase';
import { checkAccountEligibility, getDeviceFingerprint } from '@/utils/safety';
import { fetchEditPrice } from '@/utils/editCooldowns';
import { EditError } from '@/utils/editErrors';
import { hapticError, hapticSelection, hapticSuccess } from '@/utils/haptics';
import { STAT_POINT_TOTAL } from '@/utils/statAllocation';
import { traitOptions, PALETTE_SWATCH_OPTIONS } from '@/utils/traitOptions';
import {
  ArtStylePicker,
  ColorSwatchGrid,
  ConfirmSheet,
  InlineBanner,
  ItemGrid,
  OptionGrid,
  PortraitPreview,
  StatAllocator,
  type ColorSwatchOption,
  type ItemGridItem,
} from '@/components';
import { HEADER_BUTTON_SIZE } from '@/components/HeaderBackButton';
import {
  generatePortrait,
  getPortraitFallbackUri,
  listSignatureItemsCatalog,
  resolvePortraitImageUrl,
} from '@/utils/characters';
import {
  INITIAL_DRAFT,
  MAX_BATTLE_CRY_LEN,
  MAX_NAME_LEN,
  MAX_PROMPT_LEN,
  MIN_NAME_LEN,
  PLACEHOLDER_BATTLE_CRY,
  PORTRAIT_STALE_NOTICE,
  STATS_REJECTED_MESSAGE,
  STEP,
  TOTAL_STEPS,
  canAdvance,
  clampStepToDraft,
  clearDraft,
  describeFinalizeError,
  describePortraitError,
  draftAccentHex,
  finalizeBlocker,
  finalizeErrorNamesStats,
  freePortraitsIntro,
  freePortraitsLeft,
  loadDraft,
  nextDisabledHint,
  outOfFreePortraitsCopy,
  portraitIsStale,
  progressLabel,
  regenerateLabel,
  renderInputs,
  saveDraft,
  stepAnnouncement,
  stepForSummaryLabel,
  summaryRows,
  type CreationPath,
  type Draft,
  type PortraitErrorCopy,
} from '@/utils/onboardingDraft';

const getDefaultUsername = (userId: string) =>
  `user_${userId.replace(/-/g, '').slice(0, 15)}`;

const DRAFT_SAVE_DEBOUNCE_MS = 300;
const PROGRESS_TRACK_HEIGHT = 4;
/** Option value for "use the archetype's colour" in the signature picker. */
const ARCHETYPE_DEFAULT_COLOR = 'archetype';

type Patch = (p: Partial<Draft>) => void;
type CreationState = 'idle' | 'creating' | 'done';

interface ConfirmNotice {
  message: string;
  /** Step that fixes it, when there is one. */
  step: number | null;
}

export default function CreateCharacterScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const accessibleText = useAccessibleTextStyle();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [step, setStep] = useState<number>(STEP.name);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [restored, setRestored] = useState(false);
  const [creation, setCreation] = useState<CreationState>('idle');
  const [confirmNotice, setConfirmNotice] = useState<ConfirmNotice | null>(
    null,
  );
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  const creationRef = useRef<CreationState>('idle');
  const confirmLatch = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const progress = useRef(new Animated.Value(STEP.name / TOTAL_STEPS)).current;
  const firstStepRender = useRef(true);
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

  const patch = useCallback<Patch>((p) => {
    setDraft((d) => ({ ...d, ...p }));
  }, []);

  const setCreationState = (next: CreationState) => {
    creationRef.current = next;
    setCreation(next);
  };

  // ------------------------- Draft persistence -------------------------------
  useEffect(() => {
    if (!userId) {
      setRestored(true);
      return;
    }
    let active = true;
    (async () => {
      const saved = await loadDraft(userId);
      if (!active) return;
      if (saved) {
        let next = saved.draft;
        // Signed URLs are stripped before saving; re-sign from the id, and drop
        // the portrait (never the row) if the id no longer resolves.
        if (next.portrait && !next.portrait.imageUrl) {
          try {
            const imageUrl = await resolvePortraitImageUrl(
              next.portrait.portraitId,
            );
            next = { ...next, portrait: { ...next.portrait, imageUrl } };
          } catch {
            next = { ...next, portrait: undefined, renderedWith: undefined };
          }
          if (!active) return;
        }
        setDraft(next);
        setStep(clampStepToDraft(saved.step, next));
      }
      setRestored(true);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!restored || !userId || creation !== 'idle') return;
    const timer = setTimeout(() => {
      if (creationRef.current === 'idle') void saveDraft(userId, step, draft);
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, step, restored, userId, creation]);

  // ------------------------- Progress + step change --------------------------
  useEffect(() => {
    const toValue = step / TOTAL_STEPS;
    if (reduceMotion) {
      progress.setValue(toValue);
      return;
    }
    Animated.timing(progress, {
      toValue,
      duration: Motion.durations.base,
      useNativeDriver: false,
    }).start();
  }, [step, reduceMotion, progress]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotionRef.current });
    if (firstStepRender.current) {
      firstStepRender.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(stepAnnouncement(step));
  }, [step]);

  // ------------------------- Exit guard --------------------------------------
  // Header chevron, swipe-back and hardware back all funnel through the
  // navigator's remove action. Off on step 1 (nothing to lose), while
  // creating, and once done: the success path navigates with replace, which
  // is itself a removal.
  usePreventRemove(
    restored && step > STEP.name && creation === 'idle',
    ({ data }) => {
      setPendingLeave(() => () => navigation.dispatch(data.action));
    },
  );

  const confirmLeave = async () => {
    const leave = pendingLeave;
    setPendingLeave(null);
    if (userId) await saveDraft(userId, step, draft);
    leave?.();
  };

  // ------------------------- Navigation --------------------------------------
  const advance = canAdvance(step, draft);
  const advanceHint = nextDisabledHint(step, draft);

  const goNext = () => {
    if (!advance) return;
    hapticSelection();
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };
  const goBack = () => {
    hapticSelection();
    setStep((s) => Math.max(STEP.name, s - 1));
  };
  const jumpTo = (target: number) => {
    setConfirmNotice(null);
    setStep(target);
  };
  const openWallet = () => router.push('/(profile)/wallet');

  // ------------------------- Confirm -----------------------------------------
  const handleConfirm = async () => {
    if (confirmLatch.current) return;
    const blocker = finalizeBlocker(draft);
    if (blocker) {
      hapticError();
      setConfirmNotice(blocker);
      return;
    }
    if (!userId || !draft.archetype) {
      hapticError();
      setConfirmNotice({
        message: 'You’re signed out. Sign in again to continue.',
        step: null,
      });
      return;
    }

    confirmLatch.current = true;
    setCreationState('creating');
    setConfirmNotice(null);
    const name = draft.name.trim();
    const battleCry = draft.battleCry.trim();
    const archetype = draft.archetype;

    try {
      const { data: existingProfile, error: profileLookupError } =
        await supabase
          .from('profiles')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
      if (profileLookupError) throw new Error(profileLookupError.message);

      if (existingProfile) {
        const { error } = await supabase
          .from('profiles')
          .update({ display_name: name })
          .eq('id', userId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('profiles').insert({
          id: userId,
          username: getDefaultUsername(userId),
          display_name: name,
        });
        if (error) throw new Error(error.message);
      }

      try {
        await checkAccountEligibility({
          action: 'onboarding_credits',
          deviceFingerprint: getDeviceFingerprint(),
          platform: Platform.OS as 'ios' | 'android',
        });
      } catch (err) {
        console.warn('Account guard check failed:', err);
      }

      // Every path finalizes through the Edge Function: it is the only writer
      // of finalized_at, and the root gate now treats a row without it as an
      // abandoned draft. A direct insert with a real battle cry would create a
      // fighter the gate refuses to see.
      let characterId = draft.characterId;
      if (!characterId) {
        const { data: created, error: insertError } = await supabase
          .from('characters')
          .insert({
            profile_id: userId,
            name,
            archetype,
            battle_cry: PLACEHOLDER_BATTLE_CRY,
          })
          .select('id')
          .single();
        if (insertError || !created) {
          throw new Error(
            insertError?.message ?? 'Could not create the fighter row.',
          );
        }
        characterId = created.id as string;
        patch({ characterId });
      }

      const finalizeBody: Record<string, unknown> = {
        character_id: characterId,
        name,
        archetype,
        battle_cry: battleCry,
        signature_color: draftAccentHex(draft),
      };
      if (draft.vibe) finalizeBody.vibe = draft.vibe;
      if (draft.silhouette) finalizeBody.silhouette = draft.silhouette;
      if (draft.palette) finalizeBody.palette_key = draft.palette;
      if (draft.era) finalizeBody.era = draft.era;
      if (draft.expression) finalizeBody.expression = draft.expression;
      if (draft.signatureItem)
        finalizeBody.signature_item_id = draft.signatureItem.id;
      // Always sent; the server re-validates the pool (1–10 each, 20 total)
      // and answers `bad_request` with field 'stats' if it disagrees.
      finalizeBody.stats = draft.stats;
      // Required. finalizeBlocker refused to get here without one, so the
      // optional chain is for the type checker, not the player.
      finalizeBody.portrait_id = draft.portrait?.portraitId;

      try {
        const response = await invokeAuthenticatedFunction<{
          ok: boolean;
          error?: { code: string; message: string };
        }>('finalize-character-creation', finalizeBody);
        if (!response.ok) {
          throw new EditError(
            response.error?.code ?? 'unknown',
            response.error?.message ?? 'Failed to finalize character.',
          );
        }
      } catch (err) {
        // A 409 means an earlier tap already finalized this row (the reply
        // was lost on the way back). That is the outcome the player wanted.
        if (describeFinalizeError(err).kind !== 'already_finalized') throw err;
      }

      setCreationState('done');
      await clearDraft(userId);
      hapticSuccess();
      router.replace('/(tabs)/home');
    } catch (err) {
      console.error('Failed to create character:', err);
      hapticError();
      const outcome = describeFinalizeError(err);
      if (outcome.kind === 'moderation') {
        Alert.alert(outcome.title, outcome.message, [
          { text: 'Fix name', onPress: () => jumpTo(STEP.name) },
          { text: 'Fix battle cry', onPress: () => jumpTo(STEP.battleCry) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else if (outcome.kind === 'error') {
        setConfirmNotice(
          finalizeErrorNamesStats(err)
            ? { message: STATS_REJECTED_MESSAGE, step: STEP.stats }
            : { message: outcome.message, step: null },
        );
      }
      confirmLatch.current = false;
      setCreationState('idle');
    }
  };

  // ------------------------- Render ------------------------------------------
  if (!restored) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator
          color={colors.primary}
          size="large"
          accessibilityLabel="Loading"
        />
      </View>
    );
  }

  const busy = creation !== 'idle';
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View
        style={[
          styles.progressBar,
          // The header is transparent; sit just below its 44pt back button.
          { paddingTop: insets.top + HEADER_BUTTON_SIZE + Spacing.sm },
        ]}
      >
        <Text
          style={[
            styles.progressText,
            accessibleText,
            NumericFontVariant,
            { color: colors.textSecondary },
          ]}
        >
          {progressLabel(step)}
        </Text>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Character creation progress"
          accessibilityValue={{
            min: 0,
            max: TOTAL_STEPS,
            now: step,
            text: progressLabel(step),
          }}
          style={[styles.progressTrack, { backgroundColor: colors.border }]}
        >
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: colors.primary, width: progressWidth },
            ]}
          />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {step === STEP.name && (
          <StepName
            name={draft.name}
            onChange={(v) => patch({ name: v })}
            onSubmit={goNext}
          />
        )}
        {step === STEP.archetype && (
          <StepArchetype
            value={draft.archetype}
            onChange={(v) => patch({ archetype: v })}
          />
        )}
        {step === STEP.stats && <StepStats draft={draft} patch={patch} />}
        {step === STEP.item && (
          <StepSignatureItem draft={draft} patch={patch} />
        )}
        {step === STEP.battleCry && draft.archetype && (
          <StepBattleCry
            value={draft.battleCry}
            archetype={draft.archetype}
            onChange={(v) => patch({ battleCry: v })}
            onSubmit={goNext}
          />
        )}
        {step === STEP.color && draft.archetype && (
          <StepSignatureColor
            archetype={draft.archetype}
            value={draft.signatureColor}
            onChange={(v) => patch({ signatureColor: v })}
          />
        )}
        {step === STEP.path && (
          <StepPathChoice
            value={draft.path}
            onChange={(v) => patch({ path: v })}
          />
        )}
        {step === STEP.portrait && draft.archetype && (
          <StepPortrait
            archetype={draft.archetype}
            draft={draft}
            patch={patch}
            notice={confirmNotice}
            onFix={jumpTo}
            onStartOver={() => jumpTo(STEP.name)}
            onTopUp={openWallet}
          />
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.backgroundSecondary,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + Spacing.md,
          },
        ]}
      >
        <TouchableOpacity
          onPress={goBack}
          disabled={step === STEP.name || busy}
          accessibilityLabel="Previous step"
          accessibilityRole="button"
          accessibilityState={{ disabled: step === STEP.name || busy }}
          style={[
            styles.footerBtn,
            styles.secondaryBtn,
            { borderColor: colors.border },
            (step === STEP.name || busy) && styles.btnDisabled,
          ]}
        >
          <Text
            style={[
              styles.secondaryBtnText,
              accessibleText,
              { color: colors.text },
            ]}
          >
            Back
          </Text>
        </TouchableOpacity>
        {step < TOTAL_STEPS ? (
          <TouchableOpacity
            onPress={goNext}
            disabled={!advance}
            accessibilityLabel="Next step"
            accessibilityHint={advanceHint}
            accessibilityRole="button"
            accessibilityState={{ disabled: !advance }}
            style={[
              styles.footerBtn,
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              !advance && styles.btnDisabled,
            ]}
          >
            <Text style={[styles.primaryBtnText, accessibleText]}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={busy || !advance}
            accessibilityLabel="Enter the Arena"
            // While blocked, the hint is the reason ("Draw your portrait
            // before entering the arena."), so a screen-reader user learns
            // why without a tap that does nothing.
            accessibilityHint={advanceHint ?? 'Creates your fighter'}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !advance, busy }}
            style={[
              styles.footerBtn,
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              (busy || !advance) && styles.btnDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={Ink.onAccentLight} />
            ) : (
              <Text style={[styles.primaryBtnText, accessibleText]}>
                Enter the Arena
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <ConfirmSheet
        visible={pendingLeave !== null}
        title="Leave character creation?"
        subtitle="Your progress is saved on this device."
        confirmLabel="Leave"
        cancelLabel="Keep going"
        onConfirm={() => void confirmLeave()}
        onCancel={() => setPendingLeave(null)}
      />
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/**
 * Inline validation message. A live region plus an explicit announcement:
 * `accessibilityLiveRegion` is Android-only, and a field error that is merely
 * visible is invisible to a screen-reader user.
 */
function FieldError({ text }: { text: string | null }) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  useEffect(() => {
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
  if (!text) return null;
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.errorText, accessibleText, { color: colors.error }]}
    >
      {text}
    </Text>
  );
}

function StepHeading({ title, sub }: { title: string; sub?: string }) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  return (
    <>
      <Text
        accessibilityRole="header"
        style={[styles.h1, accessibleText, { color: colors.text }]}
      >
        {title}
      </Text>
      {sub ? (
        <Text
          style={[styles.sub, accessibleText, { color: colors.textSecondary }]}
        >
          {sub}
        </Text>
      ) : null}
    </>
  );
}

function Counter({ value, max }: { value: number; max: number }) {
  const colors = useThemedColors();
  return (
    <Text
      style={[
        styles.counter,
        NumericFontVariant,
        { color: colors.textTertiary },
      ]}
      accessibilityLabel={`${value} of ${max} characters`}
    >
      {value}/{max}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepName({
  name,
  onChange,
  onSubmit,
}: {
  name: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const trimmed = name.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_NAME_LEN;
  return (
    <View>
      <StepHeading
        title="Name your fighter"
        sub={`Between ${MIN_NAME_LEN} and ${MAX_NAME_LEN} characters.`}
      />
      <TextInput
        style={[
          styles.input,
          accessibleText,
          { backgroundColor: colors.card, color: colors.text },
        ]}
        placeholder="Enter your fighter’s name"
        placeholderTextColor={colors.textTertiary}
        value={name}
        onChangeText={onChange}
        maxLength={MAX_NAME_LEN}
        accessibilityLabel="Fighter name"
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={onSubmit}
      />
      <Counter value={name.length} max={MAX_NAME_LEN} />
      <FieldError
        text={
          tooShort ? `Names need at least ${MIN_NAME_LEN} characters.` : null
        }
      />
    </View>
  );
}

function StepArchetype({
  value,
  onChange,
}: {
  value: ArchetypeId | null;
  onChange: (v: ArchetypeId) => void;
}) {
  const colors = useThemedColors();
  return (
    <View>
      <StepHeading
        title="Choose your archetype"
        sub="All are free and balanced."
      />
      {Object.values(ARCHETYPES).map((arch) => {
        const selected = arch.id === value;
        return (
          <TouchableOpacity
            key={arch.id}
            style={[
              styles.archetypeCard,
              { backgroundColor: colors.card },
              selected && { borderColor: arch.color },
            ]}
            onPress={() => {
              hapticSelection();
              onChange(arch.id);
            }}
            accessibilityLabel={`${arch.name}. ${arch.description}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Image
              source={ARCHETYPE_ART[arch.id]}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            {/* Scrim. The art is dark and left-weighted, but the text sits on
                top of it, so it still needs a floor on contrast. Unselected
                cards are pushed further back so the chosen one reads as
                foreground. */}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: selected
                    ? 'rgba(8,8,10,0.42)'
                    : 'rgba(8,8,10,0.62)',
                },
              ]}
            />
            {selected ? (
              <View
                style={[styles.selectedBadge, { backgroundColor: arch.color }]}
              >
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={Ink.onAccentLight}
                />
              </View>
            ) : null}
            <View style={styles.archetypeTextBlock}>
              <View style={styles.archetypeHeader}>
                <View
                  style={[
                    styles.archetypeColor,
                    { backgroundColor: arch.color },
                  ]}
                />
                <Text
                  style={[styles.archetypeName, { color: Ink.onAccentLight }]}
                >
                  {arch.name}
                </Text>
              </View>
              <Text
                style={[
                  styles.archetypeDescription,
                  { color: 'rgba(255,255,255,0.82)' },
                ]}
              >
                {arch.description}
              </Text>
              <Text
                style={[
                  styles.archetypeTrait,
                  { color: 'rgba(255,255,255,0.62)' },
                ]}
              >
                Trait: {arch.trait}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StepStats({ draft, patch }: { draft: Draft; patch: Patch }) {
  return (
    <View>
      <StepHeading
        title="Shape your fighter"
        sub={`Spend ${STAT_POINT_TOTAL} points across four stats. They set your HP and damage in battle — you can’t buy more later.`}
      />
      {/* The archetype preset is a button in the allocator, never applied on
          the player's behalf: changing a value they have not touched is the
          pattern the edit-character audit banned. */}
      <StatAllocator
        value={draft.stats}
        onChange={(stats) => patch({ stats })}
        archetype={draft.archetype}
        accentColor={draftAccentHex(draft)}
      />
    </View>
  );
}

function StepPathChoice({
  value,
  onChange,
}: {
  value: CreationPath | null;
  onChange: (v: CreationPath) => void;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  return (
    <View>
      <StepHeading
        title="How do you want to build them?"
        sub="You can change details later either way."
      />
      <PathTile
        title="Describe your fighter"
        body="Type a short description. We’ll draw the portrait."
        selected={value === 'prompt'}
        onPress={() => onChange('prompt')}
      />
      <PathTile
        title="Build step-by-step"
        body="Pick vibe, silhouette, palette, era and expression."
        selected={value === 'guided'}
        onPress={() => onChange('guided')}
      />
      <Text
        style={[styles.helper, accessibleText, { color: colors.textTertiary }]}
      >
        Next you’ll draw the portrait — it’s the last step.
      </Text>
    </View>
  );
}

function PathTile({
  title,
  body,
  selected,
  onPress,
}: {
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  return (
    <TouchableOpacity
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      accessibilityState={{ selected }}
      style={[
        styles.pathTile,
        {
          backgroundColor: colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <View style={styles.pathTitleRow}>
        <Text
          style={[styles.pathTitle, accessibleText, { color: colors.text }]}
        >
          {title}
        </Text>
        {/* Slot always reserved so the title does not shift on selection. */}
        <Ionicons
          name="checkmark-circle"
          size={22}
          color={colors.primary}
          style={{ opacity: selected ? 1 : 0 }}
        />
      </View>
      <Text
        style={[
          styles.pathBody,
          accessibleText,
          { color: colors.textSecondary },
        ]}
      >
        {body}
      </Text>
    </TouchableOpacity>
  );
}

function StepPortrait({
  archetype,
  draft,
  patch,
  notice,
  onFix,
  onStartOver,
  onTopUp,
}: {
  archetype: ArchetypeId;
  draft: Draft;
  patch: Patch;
  /** Why the last Enter the Arena tap was refused, if it was. */
  notice: ConfirmNotice | null;
  onFix: (step: number) => void;
  /** Back to step 1 with every pick kept. */
  onStartOver: () => void;
  onTopUp: () => void;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<PortraitErrorCopy | null>(null);
  const [startOverOpen, setStartOverOpen] = useState(false);
  // Server-owned: the client cannot be the authority on an allowance that
  // spends credits, so this only ever mirrors what the last portrait reported.
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const runToken = useRef(0);
  const running = useRef(false);

  useEffect(() => {
    let active = true;
    // Live price for the copy; the server charges its own regardless.
    void fetchEditPrice('render_look').then((p) => {
      if (active && p) setPrice(p.credits);
    });
    return () => {
      active = false;
    };
  }, []);

  const accent = draftAccentHex(draft);
  const portraitUri =
    draft.portrait?.imageUrl ||
    getPortraitFallbackUri({
      archetype,
      signatureColor: draft.palette ?? accent,
      itemClass: draft.signatureItem?.itemClass as ItemClass | undefined,
    });

  const isPrompt = draft.path === 'prompt';
  const promptReady = draft.prompt.trim().length > 0;
  const allTraitsPicked = Boolean(
    draft.vibe &&
    draft.silhouette &&
    draft.palette &&
    draft.era &&
    draft.expression,
  );
  const canDraw = isPrompt ? promptReady : allTraitsPicked;

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    const token = ++runToken.current;
    const inputs = renderInputs(draft);
    setGenerating(true);
    setError(null);
    try {
      // generate-portrait needs an existing `characters` row owned by the
      // caller. Pre-create one on first use; confirm finalizes the same row.
      let characterId = draft.characterId;
      if (!characterId) {
        if (!user) throw new Error('You must be signed in.');
        const { data: created, error: insertError } = await supabase
          .from('characters')
          .insert({
            profile_id: user.id,
            name: draft.name.trim(),
            archetype,
            // Always the placeholder: finalize-character-creation gates on it
            // to recognise a draft row.
            battle_cry: PLACEHOLDER_BATTLE_CRY,
          })
          .select('id')
          .single();
        if (insertError || !created) {
          throw new Error(
            insertError?.message ?? 'Failed to create the draft row.',
          );
        }
        characterId = created.id as string;
        patch({ characterId });
      }

      const result = await generatePortrait({
        characterId,
        archetype,
        mode: inputs.path,
        prompt: inputs.path === 'prompt' ? inputs.prompt : undefined,
        traits:
          inputs.path === 'guided'
            ? {
                vibe: inputs.vibe,
                silhouette: inputs.silhouette,
                palette: inputs.palette,
                era: inputs.era,
                expression: inputs.expression,
              }
            : undefined,
        artStyle: inputs.artStyle,
      });
      // A result that lands after a newer run is ignored.
      if (token !== runToken.current) return;
      patch({ portrait: result, renderedWith: inputs, portraitFailed: false });
      if (typeof result.freeRendersLeft === 'number') {
        setFreeLeft(result.freeRendersLeft);
      }
      hapticSuccess();
    } catch (err) {
      if (token !== runToken.current) return;
      console.warn('Portrait generation failed:', err);
      hapticError();
      setError(describePortraitError(err));
      patch({ portraitFailed: true });
    } finally {
      if (token === runToken.current) {
        running.current = false;
        setGenerating(false);
      }
    }
  }, [archetype, draft, patch, user]);

  // Three free, then the same price as any other portrait. The count comes
  // back from the server; the client only repeats it.
  const outOfFree = freeLeft === 0;
  const regenerate = () => {
    if (!outOfFree) {
      void run();
      return;
    }
    const copy = outOfFreePortraitsCopy(price);
    Alert.alert(copy.title, copy.message, [
      { text: copy.cancelLabel, style: 'cancel' },
      { text: copy.confirmLabel, style: 'default', onPress: () => void run() },
    ]);
  };

  // Guided path: draw automatically once all five traits are picked, while it
  // is still free. Paid portraits are always an explicit tap.
  useEffect(() => {
    if (draft.path !== 'guided' || !allTraitsPicked) return;
    if (
      draft.portrait ||
      draft.portraitFailed ||
      generating ||
      freeLeft === 0
    ) {
      return;
    }
    void run();
  }, [
    allTraitsPicked,
    draft.path,
    draft.portrait,
    draft.portraitFailed,
    generating,
    freeLeft,
    run,
  ]);

  const stale = !generating && portraitIsStale(draft);
  const caption = generating
    ? 'Drawing your portrait…'
    : draft.portrait
      ? 'Looking sharp.'
      : draft.portraitFailed
        ? 'Placeholder shown — no portrait yet.'
        : undefined;

  const drawLabel = generating
    ? 'Drawing…'
    : draft.portrait
      ? regenerateLabel(outOfFree, price)
      : isPrompt
        ? 'Generate portrait'
        : 'Draw portrait';

  // Mirrors the footer's disabled Enter the Arena so the reason is on screen,
  // not only in that button's accessibility hint.
  const blocker = finalizeBlocker(draft);

  return (
    <View>
      <StepHeading
        title={isPrompt ? 'Describe your fighter' : 'Pick your traits'}
        sub={
          isPrompt
            ? 'A sentence or two. We’ll draw the portrait.'
            : 'Five picks. We’ll draw the portrait once they’re all set.'
        }
      />

      <PortraitPreview
        uri={portraitUri}
        variant="fullBody"
        size={200}
        loading={generating}
        accentColor={accent}
        caption={caption}
        accessibilityLabel={
          draft.portrait ? 'Your fighter’s portrait' : 'Placeholder portrait'
        }
      />

      {/* Said before the first one is drawn, not after the last free one is
          spent: a player who discovers the allowance by hitting the end of it
          has already made a decision they were not told they were making. */}
      {!draft.portrait && freeLeft === null ? (
        <Text
          style={[
            styles.allowance,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          {freePortraitsIntro(price)}
        </Text>
      ) : null}
      {draft.portrait && freeLeft !== null && !generating ? (
        <Text
          style={[
            styles.allowance,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          {freePortraitsLeft(freeLeft, price)}
        </Text>
      ) : null}

      <View style={styles.section}>
        <ArtStylePicker
          value={draft.artStyle}
          onChange={(s) => patch({ artStyle: s })}
          disabled={generating}
        />
      </View>

      {isPrompt ? (
        <View style={styles.promptSection}>
          <TextInput
            style={[
              styles.input,
              styles.multiline,
              accessibleText,
              { backgroundColor: colors.card, color: colors.text },
            ]}
            placeholder="A cyberpunk monk with a brass kettle"
            placeholderTextColor={colors.textTertiary}
            value={draft.prompt}
            onChangeText={(v) => patch({ prompt: v })}
            maxLength={MAX_PROMPT_LEN}
            multiline
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (promptReady && !generating) void run();
            }}
            editable={!generating}
            accessibilityLabel="Portrait description"
          />
          <Counter value={draft.prompt.length} max={MAX_PROMPT_LEN} />
        </View>
      ) : (
        <View style={styles.section}>
          {/* Each control sets exactly one draft key, and only on a tap: the
              auto-draw effect above fires the moment all five are picked. */}
          <OptionGrid
            title="Vibe"
            label="Vibe"
            options={traitOptions('vibe')}
            value={draft.vibe}
            onChange={(v) => patch({ vibe: v as Vibe })}
            disabled={generating}
          />
          <OptionGrid
            title="Silhouette"
            label="Silhouette"
            options={traitOptions('silhouette')}
            value={draft.silhouette}
            onChange={(v) => patch({ silhouette: v as Silhouette })}
            disabled={generating}
          />
          <View>
            <Text
              accessibilityRole="header"
              style={[
                styles.fieldTitle,
                accessibleText,
                { color: colors.text },
              ]}
            >
              Palette
            </Text>
            <ColorSwatchGrid
              groupLabel="Palette"
              options={PALETTE_SWATCH_OPTIONS}
              value={draft.palette}
              onChange={(v) => patch({ palette: v as PaletteKey })}
              disabled={generating}
            />
          </View>
          <OptionGrid
            title="Era"
            label="Era"
            options={traitOptions('era')}
            value={draft.era}
            onChange={(v) => patch({ era: v as Era })}
            disabled={generating}
          />
          <OptionGrid
            title="Expression"
            label="Expression"
            options={traitOptions('expression')}
            value={draft.expression}
            onChange={(v) => patch({ expression: v as Expression })}
            disabled={generating}
          />
        </View>
      )}

      {stale ? (
        <View style={styles.bannerWrap}>
          <InlineBanner
            tone="info"
            icon="refresh-outline"
            text={PORTRAIT_STALE_NOTICE}
          />
        </View>
      ) : null}

      {canDraw || draft.portrait ? (
        <View style={styles.row}>
          <TouchableOpacity
            onPress={draft.portrait ? regenerate : () => void run()}
            disabled={generating || !canDraw}
            accessibilityRole="button"
            accessibilityLabel={
              draft.portrait ? 'Regenerate portrait' : 'Generate portrait'
            }
            accessibilityHint={
              draft.portrait && outOfFree
                ? `Costs ${price === null ? 'credits' : `${price} credits`}`
                : undefined
            }
            accessibilityState={{
              disabled: generating || !canDraw,
              busy: generating,
            }}
            style={[
              styles.primaryBtn,
              styles.flexBtn,
              { backgroundColor: colors.primary },
              (generating || !canDraw) && styles.btnDisabled,
            ]}
          >
            <Text style={[styles.primaryBtnText, accessibleText]}>
              {drawLabel}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {error && !generating ? (
        <View style={styles.bannerWrap}>
          <InlineBanner
            tone="error"
            text={error.message}
            actionLabel={
              error.topUp
                ? 'Top up'
                : error.retry && canDraw
                  ? 'Retry'
                  : undefined
            }
            onAction={
              error.topUp
                ? onTopUp
                : error.retry && canDraw
                  ? () => void run()
                  : undefined
            }
          />
        </View>
      ) : null}

      <RecapCard draft={draft} onFix={onFix} />

      {notice ? (
        <View style={styles.bannerWrap}>
          <InlineBanner
            tone="error"
            text={notice.message}
            actionLabel={notice.step !== null ? 'Fix it' : undefined}
            onAction={
              notice.step !== null
                ? () => onFix(notice.step as number)
                : undefined
            }
          />
        </View>
      ) : blocker && !generating ? (
        <Text
          style={[
            styles.helper,
            accessibleText,
            { color: colors.textTertiary },
          ]}
        >
          {blocker.message}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={() => {
          hapticSelection();
          setStartOverOpen(true);
        }}
        disabled={generating}
        accessibilityRole="button"
        accessibilityLabel="Start over"
        accessibilityHint="Walk through every step again with your picks kept"
        accessibilityState={{ disabled: generating }}
        style={[
          styles.secondaryBtn,
          styles.startOverBtn,
          { borderColor: colors.border },
          generating && styles.btnDisabled,
        ]}
      >
        <Text
          style={[
            styles.secondaryBtnText,
            accessibleText,
            { color: colors.text },
          ]}
        >
          Start over
        </Text>
      </TouchableOpacity>

      {/* The draft is untouched: every pick, and the portrait, is preselected
          on the way back through. */}
      <ConfirmSheet
        visible={startOverOpen}
        title="Start over?"
        subtitle="Your picks are kept — you’ll walk through them again and can change any of them."
        confirmLabel="Start over"
        cancelLabel="Keep going"
        onConfirm={() => {
          setStartOverOpen(false);
          onStartOver();
        }}
        onCancel={() => setStartOverOpen(false)}
      />
    </View>
  );
}

function StepSignatureItem({ draft, patch }: { draft: Draft; patch: Patch }) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const [items, setItems] = useState<ItemGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const list = await listSignatureItemsCatalog();
      setItems(list.filter((item) => !item.isCustom).slice(0, 15));
    } catch (err) {
      console.warn('Could not load signature items:', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const skip = () => {
    hapticSelection();
    patch({ signatureItem: undefined, itemSkipped: true });
  };

  return (
    <View>
      <StepHeading
        title="Pick a signature item"
        sub="Part of who your fighter is; shown next to your name on every result."
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator
            color={colors.primary}
            accessibilityLabel="Loading items"
          />
        </View>
      ) : loadFailed ? (
        <InlineBanner
          tone="error"
          text="Couldn’t load signature items."
          actionLabel="Retry"
          onAction={() => void load()}
        />
      ) : (
        <ItemGrid
          items={items}
          selectedId={draft.signatureItem?.id}
          onSelect={(id) => {
            const item = items.find((i) => i.id === id);
            if (item) patch({ signatureItem: item, itemSkipped: false });
          }}
        />
      )}

      {/* Never a dead end: the skip is available in every load state. The
          insert trigger gives a skipped draft a default catalogue item. */}
      <TouchableOpacity
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel="Skip signature item"
        accessibilityHint="A catalogue item is assigned; you can change it later from your profile"
        accessibilityState={{ selected: draft.itemSkipped }}
        style={[
          styles.secondaryBtn,
          styles.skipBtn,
          { borderColor: draft.itemSkipped ? colors.primary : colors.border },
        ]}
      >
        <Text
          style={[
            styles.secondaryBtnText,
            accessibleText,
            { color: colors.text },
          ]}
        >
          {draft.itemSkipped
            ? 'Skipped — the arena assigns one'
            : 'Skip — the arena assigns one'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function StepBattleCry({
  value,
  archetype,
  onChange,
  onSubmit,
}: {
  value: string;
  archetype: ArchetypeId;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const suggestions = BATTLE_CRY_SUGGESTIONS[archetype];
  const tint = ARCHETYPES[archetype].color;

  const applySuggestion = (s: string) => {
    hapticSelection();
    const typed = value.trim();
    if (typed.length === 0 || typed === s || suggestions.includes(typed)) {
      onChange(s);
      return;
    }
    Alert.alert('Replace your battle cry?', 'This replaces what you typed.', [
      { text: 'Keep mine', style: 'cancel' },
      { text: 'Replace', onPress: () => onChange(s) },
    ]);
  };

  return (
    <View>
      <StepHeading
        title="Battle cry"
        sub={`Shown on every result. Max ${MAX_BATTLE_CRY_LEN} characters.`}
      />
      <View style={styles.suggestionRow}>
        {suggestions.map((s) => {
          const selected = value === s;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => applySuggestion(s)}
              accessibilityRole="button"
              accessibilityLabel={`Use suggestion: ${s}`}
              accessibilityState={{ selected }}
              style={[
                styles.suggestionChip,
                {
                  borderColor: tint,
                  backgroundColor: selected ? tint : colors.card,
                },
              ]}
            >
              <Text
                style={[
                  styles.suggestionText,
                  accessibleText,
                  { color: selected ? Ink.onAccentLight : tint },
                ]}
              >
                {s}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TextInput
        style={[
          styles.input,
          accessibleText,
          { backgroundColor: colors.card, color: colors.text },
        ]}
        placeholder="Victory through wisdom!"
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChange}
        maxLength={MAX_BATTLE_CRY_LEN}
        returnKeyType="next"
        onSubmitEditing={onSubmit}
        accessibilityLabel="Battle cry"
      />
      <Counter value={value.length} max={MAX_BATTLE_CRY_LEN} />
    </View>
  );
}

function StepSignatureColor({
  archetype,
  value,
  onChange,
}: {
  archetype: ArchetypeId;
  value: PaletteKey | undefined;
  onChange: (v: PaletteKey | undefined) => void;
}) {
  const arch = ARCHETYPES[archetype];
  const options = useMemo<ColorSwatchOption[]>(
    () => [
      {
        value: ARCHETYPE_DEFAULT_COLOR,
        label: 'Archetype default',
        hex: arch.color,
      },
      ...PALETTE_SWATCH_OPTIONS,
    ],
    [arch.color],
  );
  return (
    <View>
      <StepHeading
        title="Signature colour"
        sub={`Frames your portrait and tints your card. Defaults to ${arch.name}’s colour.`}
      />
      <ColorSwatchGrid
        groupLabel="Signature colour"
        options={options}
        value={value ?? ARCHETYPE_DEFAULT_COLOR}
        onChange={(v) =>
          onChange(
            v === ARCHETYPE_DEFAULT_COLOR ? undefined : (v as PaletteKey),
          )
        }
      />
    </View>
  );
}

/**
 * The recap on the last step: one row per earlier decision, each a way back
 * to the step that set it. Rows the portrait step sets itself (art style,
 * look) have no link; their controls are just above.
 */
function RecapCard({
  draft,
  onFix,
}: {
  draft: Draft;
  onFix: (step: number) => void;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const accent = draftAccentHex(draft);
  return (
    <View
      style={[
        styles.recap,
        { backgroundColor: colors.backgroundSecondary, borderColor: accent },
      ]}
    >
      <Text
        accessibilityRole="header"
        style={[styles.recapTitle, accessibleText, { color: colors.text }]}
      >
        Your fighter
      </Text>
      {summaryRows(draft).map((row) => {
        const target = stepForSummaryLabel(row.label);
        const cells = (
          <>
            <Text
              style={[
                styles.summaryLabel,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              {row.label}
            </Text>
            <Text
              style={[
                styles.summaryValue,
                accessibleText,
                { color: colors.text },
              ]}
            >
              {row.value}
            </Text>
          </>
        );
        if (target === null) {
          return (
            <View key={row.label} style={styles.summaryRow}>
              {cells}
            </View>
          );
        }
        return (
          <TouchableOpacity
            key={row.label}
            onPress={() => {
              hapticSelection();
              onFix(target);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${row.label}: ${row.value}`}
            accessibilityHint={`Change ${row.label.toLowerCase()}`}
            style={[styles.summaryRow, styles.summaryRowTappable]}
          >
            {cells}
            <View style={styles.summaryChange}>
              <Text
                style={[
                  styles.summaryChangeText,
                  accessibleText,
                  { color: colors.primary },
                ]}
              >
                Change
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.primary}
              />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  progressBar: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  progressText: {
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.xs,
  },
  progressTrack: {
    height: PROGRESS_TRACK_HEIGHT,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: PROGRESS_TRACK_HEIGHT,
    borderRadius: BorderRadius.full,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  h1: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  h2: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  sub: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  helper: {
    fontSize: Typography.sizes.xs,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  input: {
    minHeight: Layout.buttonHeight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.xs,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  counter: {
    fontSize: Typography.sizes.xs,
    textAlign: 'right',
    marginBottom: Spacing.sm,
  },
  errorText: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.xs,
  },
  archetypeCard: {
    // Matches the 16:9 key art so the whole illustration is visible -- a fixed
    // pixel height would centre-crop and clip the figure's head.
    aspectRatio: 16 / 9,
    justifyContent: 'flex-end',
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  selectedBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archetypeTextBlock: {
    // The art puts the figure in the left third; the copy sits in the space
    // deliberately left open on the right.
    marginLeft: '36%',
    padding: Spacing.md,
  },
  archetypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  archetypeColor: {
    width: Spacing.md,
    height: Spacing.md,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  archetypeName: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  archetypeDescription: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.xs,
  },
  archetypeTrait: {
    fontSize: Typography.sizes.xs,
  },
  pathTile: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    marginBottom: Spacing.md,
  },
  pathTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  pathTitle: {
    flex: 1,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  pathBody: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
  },
  section: {
    marginTop: Spacing.lg,
    // Separates the trait grids from one another; the prompt path has its own
    // style because its input and counter belong together.
    gap: Spacing.lg,
  },
  promptSection: {
    marginTop: Spacing.lg,
  },
  fieldTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  flexBtn: { flex: 1 },
  primaryBtn: {
    minHeight: Layout.buttonHeight,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryBtnText: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  secondaryBtn: {
    minHeight: Layout.buttonHeight,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
  },
  secondaryBtnText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  skipBtn: {
    marginTop: Spacing.md,
  },
  btnDisabled: { opacity: 0.5 },
  allowance: {
    marginTop: Spacing.sm,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
  bannerWrap: {
    marginTop: Spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: { flex: 1 },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  suggestionChip: {
    minHeight: Layout.inputHeight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  suggestionText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  recap: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    // Framed in the signature colour, like the fighter's card will be.
    borderWidth: 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  recapTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    minHeight: 24,
  },
  // Rows that lead somewhere are targets, so they get the 44pt floor.
  summaryRowTappable: {
    minHeight: Layout.inputHeight,
  },
  summaryLabel: {
    fontSize: Typography.sizes.sm,
    width: 120,
  },
  summaryValue: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    textAlign: 'right',
  },
  summaryChange: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryChangeText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  startOverBtn: {
    marginTop: Spacing.md,
  },
});
