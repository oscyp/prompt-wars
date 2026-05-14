import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ARCHETYPES, ArchetypeId } from '@/constants/Archetypes';
import {
  VIBES,
  SILHOUETTES,
  ERAS,
  EXPRESSIONS,
  PALETTES,
  ITEM_CLASSES,
  TRAIT_LABELS,
  BATTLE_CRY_SUGGESTIONS,
  PaletteKey,
  Vibe,
  Silhouette,
  Era,
  Expression,
  ItemClass,
  PALETTE_HEX,
} from '@/constants/CharacterTraits';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';
import { checkAccountEligibility, getDeviceFingerprint } from '@/utils/safety';
import {
  TraitPicker,
  TraitOption,
  PortraitPreview,
  ItemGrid,
  ItemGridItem,
} from '@/components';
import {
  generatePortrait,
  createCustomSignatureItem,
  listSignatureItemsCatalog,
  getPortraitFallbackUri,
  PortraitJobResult,
  CatalogSignatureItem,
} from '@/utils/characters';

const getDefaultUsername = (userId: string) =>
  `user_${userId.replace(/-/g, '').slice(0, 15)}`;

const FREE_REGENS = 2;
const MAX_PROMPT_LEN = 120;
const MAX_NAME_LEN = 20;
const MIN_NAME_LEN = 3;
const MAX_BATTLE_CRY_LEN = 60;
const MAX_ITEM_NAME_LEN = 32;
const MAX_ITEM_DESC_LEN = 140;

interface Draft {
  name: string;
  archetype: ArchetypeId | null;
  path: 'prompt' | 'guided' | null;
  prompt: string;
  vibe?: Vibe;
  silhouette?: Silhouette;
  palette?: PaletteKey;
  era?: Era;
  expression?: Expression;
  portrait?: PortraitJobResult;
  portraitFailed: boolean;
  signatureItem?: CatalogSignatureItem;
  battleCry: string;
  signatureColor?: PaletteKey;
}

const INITIAL_DRAFT: Draft = {
  name: '',
  archetype: null,
  path: null,
  prompt: '',
  battleCry: '',
  portraitFailed: false,
};

const TOTAL_STEPS = 9;

export default function CreateCharacterScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [isCreating, setIsCreating] = useState(false);

  const patch = useCallback((p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
  }, []);

  const goNext = () =>
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  // ------------------------- Confirm ----------------------------------------
  const handleConfirm = async () => {
    if (!user || !draft.archetype) return;
    const name = draft.name.trim();
    const battleCry = draft.battleCry.trim();
    if (name.length < MIN_NAME_LEN || battleCry.length < 3) return;

    setIsCreating(true);
    try {
      const { data: existingProfile, error: profileLookupError } =
        await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();
      if (profileLookupError) {
        throw new Error(profileLookupError.message);
      }

      if (existingProfile) {
        const { error } = await supabase
          .from('profiles')
          .update({ display_name: name })
          .eq('id', user.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('profiles').insert({
          id: user.id,
          username: getDefaultUsername(user.id),
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

      const signatureColorHex =
        draft.signatureColor != null
          ? PALETTE_HEX[draft.signatureColor]
          : ARCHETYPES[draft.archetype].color;

      const insertPayload: Record<string, unknown> = {
        profile_id: user.id,
        name,
        archetype: draft.archetype,
        battle_cry: battleCry,
        signature_color: signatureColorHex,
      };

      if (draft.vibe) insertPayload.vibe = draft.vibe;
      if (draft.silhouette) insertPayload.silhouette = draft.silhouette;
      if (draft.palette) insertPayload.palette_key = draft.palette;
      if (draft.era) insertPayload.era = draft.era;
      if (draft.expression) insertPayload.expression = draft.expression;
      if (draft.portrait) {
        insertPayload.portrait_id = draft.portrait.portraitId;
        insertPayload.portrait_seed = draft.portrait.seed;
      }
      if (draft.signatureItem) {
        insertPayload.signature_item_id = draft.signatureItem.id;
      }

      const { error: characterError } = await supabase
        .from('characters')
        .insert(insertPayload)
        .select()
        .single();

      if (characterError) throw new Error(characterError.message);

      router.replace('/(tabs)/home');
    } catch (err) {
      console.error('Failed to create character:', err);
      Alert.alert(
        'Error',
        err instanceof Error
          ? err.message
          : 'Failed to create character. Please try again.',
      );
    } finally {
      setIsCreating(false);
    }
  };

  // ---------------------- Step gating ---------------------------------------
  const canAdvance = useMemo(() => {
    switch (step) {
      case 1:
        return (
          draft.name.trim().length >= MIN_NAME_LEN &&
          draft.name.trim().length <= MAX_NAME_LEN
        );
      case 2:
        return Boolean(draft.archetype);
      case 3:
        return Boolean(draft.path);
      case 4:
        // Portrait step always advances (fallback allowed)
        return true;
      case 5:
        return Boolean(draft.signatureItem);
      case 6:
        return draft.battleCry.trim().length >= 3;
      case 7:
        return true;
      case 8:
        return true;
      default:
        return false;
    }
  }, [step, draft]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.progressBar}>
        <Text style={[styles.progressText, { color: colors.textSecondary }]}>
          Step {step} of {TOTAL_STEPS}
        </Text>
        <View
          style={[styles.progressTrack, { backgroundColor: colors.border }]}
        >
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: `${(step / TOTAL_STEPS) * 100}%`,
              },
            ]}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {step === 1 && (
          <StepName name={draft.name} onChange={(v) => patch({ name: v })} />
        )}
        {step === 2 && (
          <StepArchetype
            value={draft.archetype}
            onChange={(v) => patch({ archetype: v })}
          />
        )}
        {step === 3 && (
          <StepPathChoice
            value={draft.path}
            onChange={(v) => patch({ path: v })}
          />
        )}
        {step === 4 && draft.archetype && (
          <StepPortrait
            archetype={draft.archetype}
            draft={draft}
            patch={patch}
          />
        )}
        {step === 5 && (
          <StepSignatureItem
            value={draft.signatureItem}
            onChange={(item) => patch({ signatureItem: item })}
          />
        )}
        {step === 6 && draft.archetype && (
          <StepBattleCry
            value={draft.battleCry}
            archetype={draft.archetype}
            onChange={(v) => patch({ battleCry: v })}
          />
        )}
        {step === 7 && draft.archetype && (
          <StepSignatureColor
            archetype={draft.archetype}
            value={draft.signatureColor}
            onChange={(v) => patch({ signatureColor: v })}
          />
        )}
        {step === 8 && draft.archetype && (
          <StepPreview draft={draft} />
        )}
        {step === 9 && draft.archetype && (
          <StepConfirm draft={draft} />
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.backgroundSecondary,
            borderTopColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={goBack}
          disabled={step === 1 || isCreating}
          accessibilityLabel="Go to previous step"
          accessibilityRole="button"
          style={[
            styles.footerBtn,
            styles.secondaryBtn,
            { borderColor: colors.border },
            (step === 1 || isCreating) && styles.btnDisabled,
          ]}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
            Back
          </Text>
        </TouchableOpacity>
        {step < TOTAL_STEPS ? (
          <TouchableOpacity
            onPress={goNext}
            disabled={!canAdvance}
            accessibilityLabel="Go to next step"
            accessibilityRole="button"
            style={[
              styles.footerBtn,
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              !canAdvance && styles.btnDisabled,
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {step === 8 ? 'Looks good' : 'Next'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={isCreating}
            accessibilityLabel="Create character and enter the arena"
            accessibilityRole="button"
            style={[
              styles.footerBtn,
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              isCreating && styles.btnDisabled,
            ]}
          >
            {isCreating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Enter the Arena</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepName({
  name,
  onChange,
}: {
  name: string;
  onChange: (v: string) => void;
}) {
  const colors = useThemedColors();
  const trimmed = name.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_NAME_LEN;
  return (
    <View>
      <Text style={[styles.h1, { color: colors.text }]}>
        Name your fighter
      </Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Between {MIN_NAME_LEN} and {MAX_NAME_LEN} characters.
      </Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: colors.card, color: colors.text },
        ]}
        placeholder="Enter your warrior name"
        placeholderTextColor={colors.textTertiary}
        value={name}
        onChangeText={onChange}
        maxLength={MAX_NAME_LEN}
        accessibilityLabel="Character name input"
        autoCapitalize="words"
      />
      <Text
        style={[styles.counter, { color: colors.textTertiary }]}
      >
        {name.length}/{MAX_NAME_LEN}
      </Text>
      {tooShort && (
        <Text style={[styles.errorText, { color: colors.error }]}>
          Names need at least {MIN_NAME_LEN} characters.
        </Text>
      )}
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
      <Text style={[styles.h1, { color: colors.text }]}>
        Choose your archetype
      </Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        All are free and balanced.
      </Text>
      {Object.values(ARCHETYPES).map((arch) => {
        const selected = arch.id === value;
        return (
          <TouchableOpacity
            key={arch.id}
            style={[
              styles.archetypeCard,
              { backgroundColor: colors.card },
              selected && { borderColor: arch.color, borderWidth: 2 },
            ]}
            onPress={() => onChange(arch.id)}
            accessibilityLabel={`Select ${arch.name} archetype`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <View style={styles.archetypeHeader}>
              <View
                style={[
                  styles.archetypeColor,
                  { backgroundColor: arch.color },
                ]}
              />
              <Text style={[styles.archetypeName, { color: colors.text }]}>
                {arch.name}
              </Text>
            </View>
            <Text
              style={[
                styles.archetypeDescription,
                { color: colors.textSecondary },
              ]}
            >
              {arch.description}
            </Text>
            <Text
              style={[
                styles.archetypeTrait,
                { color: colors.textTertiary },
              ]}
            >
              Trait: {arch.trait}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StepPathChoice({
  value,
  onChange,
}: {
  value: 'prompt' | 'guided' | null;
  onChange: (v: 'prompt' | 'guided') => void;
}) {
  const colors = useThemedColors();
  return (
    <View>
      <Text style={[styles.h1, { color: colors.text }]}>
        How do you want to build them?
      </Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        You can change details later either way.
      </Text>
      <PathTile
        title="Describe your fighter"
        body="Type a short description. We'll create the portrait."
        selected={value === 'prompt'}
        onPress={() => onChange('prompt')}
      />
      <PathTile
        title="Build step-by-step"
        body="Pick vibe, silhouette, palette, era and expression."
        selected={value === 'guided'}
        onPress={() => onChange('guided')}
      />
      <Text style={[styles.helper, { color: colors.textTertiary }]}>
        You can skip portrait generation at any time.
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
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      style={[
        styles.pathTile,
        {
          backgroundColor: colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.pathTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.pathBody, { color: colors.textSecondary }]}>
        {body}
      </Text>
    </TouchableOpacity>
  );
}

function StepPortrait({
  archetype,
  draft,
  patch,
}: {
  archetype: ArchetypeId;
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
}) {
  const colors = useThemedColors();
  const [generating, setGenerating] = useState(false);
  const [regens, setRegens] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const portraitUri =
    draft.portrait?.imageUrl ??
    getPortraitFallbackUri({
      archetype,
      signatureColor: draft.palette ?? draft.signatureColor,
      itemClass: draft.signatureItem?.itemClass as ItemClass | undefined,
    });

  const run = useCallback(
    async (overrides?: Partial<Draft>) => {
      if (generating) return;
      const merged = { ...draft, ...overrides };
      setGenerating(true);
      setErrorMsg(null);
      try {
        const result = await generatePortrait({
          archetype,
          mode: merged.path ?? 'prompt',
          prompt: merged.path === 'prompt' ? merged.prompt : undefined,
          traits:
            merged.path === 'guided'
              ? {
                  vibe: merged.vibe,
                  silhouette: merged.silhouette,
                  palette: merged.palette,
                  era: merged.era,
                  expression: merged.expression,
                }
              : undefined,
        });
        patch({ portrait: result, portraitFailed: false });
      } catch (err) {
        console.warn('Portrait generation failed:', err);
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Could not generate portrait right now.',
        );
        patch({ portraitFailed: true });
      } finally {
        setGenerating(false);
      }
    },
    [archetype, draft, generating, patch],
  );

  const skip = () => {
    patch({ portraitFailed: true, portrait: undefined });
  };

  const regenerate = () => {
    setRegens((r) => r + 1);
    run();
  };

  const isPrompt = draft.path === 'prompt';
  const allTraitsPicked = Boolean(
    draft.vibe &&
      draft.silhouette &&
      draft.palette &&
      draft.era &&
      draft.expression,
  );

  // Auto-trigger generation for guided path
  useEffect(() => {
    if (
      draft.path === 'guided' &&
      allTraitsPicked &&
      !draft.portrait &&
      !generating &&
      !draft.portraitFailed
    ) {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTraitsPicked, draft.path]);

  return (
    <View>
      <Text style={[styles.h1, { color: colors.text }]}>
        {isPrompt ? 'Describe your fighter' : 'Pick your traits'}
      </Text>

      <PortraitPreview
        uri={portraitUri}
        loading={generating}
        caption={
          generating
            ? 'Conjuring your character…'
            : draft.portrait
              ? 'Looking sharp.'
              : draft.portraitFailed
                ? "We'll keep working on this one."
                : undefined
        }
      />

      {isPrompt ? (
        <View style={styles.section}>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.card, color: colors.text },
            ]}
            placeholder="A cyberpunk monk with a brass kettle"
            placeholderTextColor={colors.textTertiary}
            value={draft.prompt}
            onChangeText={(v) => patch({ prompt: v })}
            maxLength={MAX_PROMPT_LEN}
            multiline
            accessibilityLabel="Portrait prompt"
          />
          <Text style={[styles.counter, { color: colors.textTertiary }]}>
            {draft.prompt.length}/{MAX_PROMPT_LEN}
          </Text>
        </View>
      ) : (
        <View style={styles.section}>
          <TraitPicker
            title="Vibe"
            value={draft.vibe}
            onChange={(v) => patch({ vibe: v as Vibe })}
            options={VIBES.map<TraitOption>((v) => ({
              value: v,
              label: TRAIT_LABELS.vibe[v],
            }))}
          />
          <TraitPicker
            title="Silhouette"
            value={draft.silhouette}
            onChange={(v) => patch({ silhouette: v as Silhouette })}
            options={SILHOUETTES.map<TraitOption>((v) => ({
              value: v,
              label: TRAIT_LABELS.silhouette[v],
            }))}
          />
          <TraitPicker
            title="Palette"
            value={draft.palette}
            onChange={(v) => patch({ palette: v as PaletteKey })}
            options={PALETTES.map<TraitOption>((p) => ({
              value: p.key,
              label: TRAIT_LABELS.palette[p.key],
              swatch: p.hex,
            }))}
          />
          <TraitPicker
            title="Era"
            value={draft.era}
            onChange={(v) => patch({ era: v as Era })}
            options={ERAS.map<TraitOption>((v) => ({
              value: v,
              label: TRAIT_LABELS.era[v],
            }))}
          />
          <TraitPicker
            title="Expression"
            value={draft.expression}
            onChange={(v) => patch({ expression: v as Expression })}
            options={EXPRESSIONS.map<TraitOption>((v) => ({
              value: v,
              label: TRAIT_LABELS.expression[v],
            }))}
          />
        </View>
      )}

      <View style={styles.row}>
        {isPrompt && (
          <TouchableOpacity
            onPress={() => run()}
            disabled={generating || draft.prompt.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="Generate portrait"
            style={[
              styles.primaryBtn,
              styles.flexBtn,
              { backgroundColor: colors.primary },
              (generating || draft.prompt.trim().length === 0) &&
                styles.btnDisabled,
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {generating ? 'Generating…' : 'Generate'}
            </Text>
          </TouchableOpacity>
        )}
        {draft.portrait && regens < FREE_REGENS && (
          <TouchableOpacity
            onPress={regenerate}
            disabled={generating}
            accessibilityRole="button"
            accessibilityLabel="Regenerate portrait"
            style={[
              styles.secondaryBtn,
              styles.flexBtn,
              { borderColor: colors.border },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
              Regenerate ({FREE_REGENS - regens} left)
            </Text>
          </TouchableOpacity>
        )}
        {generating && (
          <TouchableOpacity
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel="Skip portrait generation"
            style={[
              styles.secondaryBtn,
              styles.flexBtn,
              { borderColor: colors.border },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
              Skip
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {errorMsg && (
        <View
          style={[styles.banner, { backgroundColor: colors.backgroundTertiary }]}
        >
          <Text style={[styles.bannerText, { color: colors.text }]}>
            Portrait will be ready soon. {errorMsg}
          </Text>
        </View>
      )}
      {draft.portraitFailed && !errorMsg && (
        <View
          style={[styles.banner, { backgroundColor: colors.backgroundTertiary }]}
        >
          <Text style={[styles.bannerText, { color: colors.text }]}>
            Portrait will be ready soon.
          </Text>
        </View>
      )}
    </View>
  );
}

function StepSignatureItem({
  value,
  onChange,
}: {
  value: CatalogSignatureItem | undefined;
  onChange: (item: CatalogSignatureItem | undefined) => void;
}) {
  const colors = useThemedColors();
  const [items, setItems] = useState<ItemGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customClass, setCustomClass] = useState<ItemClass>('tool');
  const [customIcon, setCustomIcon] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listSignatureItemsCatalog();
        if (!cancelled) setItems(list.slice(0, 15));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load signature items.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitCustom = async () => {
    const name = customName.trim();
    const desc = customDesc.trim();
    if (name.length === 0 || desc.length === 0) return;
    setCreating(true);
    try {
      const item = await createCustomSignatureItem({
        name,
        description: desc,
        itemClass: customClass,
        generateIcon: customIcon,
      });
      onChange(item);
      setCustomOpen(false);
    } catch (err) {
      Alert.alert(
        'Could not create item',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.h1, { color: colors.text }]}>
        Pick a signature item
      </Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Shown next to your name on every result.
      </Text>
      {error && (
        <Text style={[styles.errorText, { color: colors.error }]}>
          {error}
        </Text>
      )}
      <ItemGrid
        items={items}
        selectedId={value?.id}
        onSelect={(id) => {
          const item = items.find((i) => i.id === id);
          if (item) onChange(item);
        }}
        onCreateCustom={() => setCustomOpen(true)}
      />

      {customOpen && (
        <View style={[styles.customForm, { backgroundColor: colors.card }]}>
          <Text style={[styles.h2, { color: colors.text }]}>
            Create your own
          </Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.background, color: colors.text },
            ]}
            placeholder="Item name"
            placeholderTextColor={colors.textTertiary}
            value={customName}
            onChangeText={setCustomName}
            maxLength={MAX_ITEM_NAME_LEN}
            accessibilityLabel="Custom item name"
          />
          <TextInput
            style={[
              styles.input,
              styles.multiline,
              { backgroundColor: colors.background, color: colors.text },
            ]}
            placeholder="Short description"
            placeholderTextColor={colors.textTertiary}
            value={customDesc}
            onChangeText={setCustomDesc}
            maxLength={MAX_ITEM_DESC_LEN}
            multiline
            accessibilityLabel="Custom item description"
          />
          <TraitPicker
            title="Class"
            value={customClass}
            onChange={(v) => setCustomClass(v as ItemClass)}
            options={ITEM_CLASSES.map<TraitOption>((c) => ({
              value: c,
              label: TRAIT_LABELS.itemClass[c],
            }))}
          />
          <View style={styles.switchRow}>
            <Text style={{ color: colors.text }}>Generate icon</Text>
            <Switch value={customIcon} onValueChange={setCustomIcon} />
          </View>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setCustomOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel custom item"
              style={[
                styles.secondaryBtn,
                styles.flexBtn,
                { borderColor: colors.border },
              ]}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submitCustom}
              disabled={
                creating ||
                customName.trim().length === 0 ||
                customDesc.trim().length === 0
              }
              accessibilityRole="button"
              accessibilityLabel="Save custom item"
              style={[
                styles.primaryBtn,
                styles.flexBtn,
                { backgroundColor: colors.primary },
                (creating ||
                  customName.trim().length === 0 ||
                  customDesc.trim().length === 0) &&
                  styles.btnDisabled,
              ]}
            >
              <Text style={styles.primaryBtnText}>
                {creating ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function StepBattleCry({
  value,
  archetype,
  onChange,
}: {
  value: string;
  archetype: ArchetypeId;
  onChange: (v: string) => void;
}) {
  const colors = useThemedColors();
  const suggestions = BATTLE_CRY_SUGGESTIONS[archetype];
  const tint = ARCHETYPES[archetype].color;
  return (
    <View>
      <Text style={[styles.h1, { color: colors.text }]}>Battle cry</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Shown on every result. Max {MAX_BATTLE_CRY_LEN} characters.
      </Text>
      <View style={styles.suggestionRow}>
        {suggestions.map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => onChange(s)}
            accessibilityRole="button"
            accessibilityLabel={`Use suggestion: ${s}`}
            style={[
              styles.suggestionChip,
              { borderColor: tint, backgroundColor: colors.card },
            ]}
          >
            <Text style={[styles.suggestionText, { color: tint }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: colors.card, color: colors.text },
        ]}
        placeholder="Victory through wisdom!"
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChange}
        maxLength={MAX_BATTLE_CRY_LEN}
        accessibilityLabel="Battle cry input"
      />
      <Text style={[styles.counter, { color: colors.textTertiary }]}>
        {value.length}/{MAX_BATTLE_CRY_LEN}
      </Text>
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
  onChange: (v: PaletteKey) => void;
}) {
  const colors = useThemedColors();
  return (
    <View>
      <Text style={[styles.h1, { color: colors.text }]}>Signature color</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        Used to tint your card. Defaults to your archetype color (
        {ARCHETYPES[archetype].name}).
      </Text>
      <View style={styles.swatchGrid}>
        {PALETTES.map((p) => {
          const selected = value === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => onChange(p.key)}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${TRAIT_LABELS.palette[p.key]}`}
              accessibilityState={{ selected }}
              style={[
                styles.swatchTile,
                {
                  borderColor: selected ? colors.text : colors.border,
                  backgroundColor: colors.card,
                },
              ]}
            >
              <View
                style={[
                  styles.swatchCircle,
                  { backgroundColor: p.hex },
                ]}
              />
              <Text style={[styles.swatchLabel, { color: colors.text }]}>
                {TRAIT_LABELS.palette[p.key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function StepPreview({ draft }: { draft: Draft }) {
  const colors = useThemedColors();
  if (!draft.archetype) return null;
  const arch = ARCHETYPES[draft.archetype];
  const tint =
    draft.signatureColor != null
      ? PALETTE_HEX[draft.signatureColor]
      : arch.color;
  const portraitUri =
    draft.portrait?.imageUrl ??
    getPortraitFallbackUri({
      archetype: draft.archetype,
      signatureColor: draft.signatureColor ?? draft.palette,
      itemClass: draft.signatureItem?.itemClass as ItemClass | undefined,
    });
  return (
    <View>
      <Text style={[styles.h1, { color: colors.text }]}>Preview</Text>
      <View
        style={[
          styles.previewCard,
          { borderColor: tint, backgroundColor: colors.card },
        ]}
      >
        <PortraitPreview uri={portraitUri} size={180} />
        <Text style={[styles.previewName, { color: colors.text }]}>
          {draft.name}
        </Text>
        <Text style={[styles.previewArch, { color: tint }]}>
          {arch.name}
        </Text>
        {draft.signatureItem && (
          <Text
            style={[styles.previewItem, { color: colors.textSecondary }]}
          >
            ✦ {draft.signatureItem.name}
          </Text>
        )}
        <Text style={[styles.previewCry, { color: colors.text }]}>
          “{draft.battleCry}”
        </Text>
      </View>
    </View>
  );
}

function StepConfirm({ draft }: { draft: Draft }) {
  const colors = useThemedColors();
  return (
    <View>
      <Text style={[styles.h1, { color: colors.text }]}>Ready?</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        We'll create {draft.name} and drop you into the arena. You can edit
        portraits, items, and battle cry later from your profile.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  progressText: {
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.xs,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
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
    marginBottom: Spacing.lg,
  },
  helper: {
    fontSize: Typography.sizes.xs,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  input: {
    minHeight: 48,
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
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  archetypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  archetypeColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
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
  pathTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  pathBody: {
    fontSize: Typography.sizes.sm,
  },
  section: {
    marginTop: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  flexBtn: { flex: 1 },
  primaryBtn: {
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  secondaryBtn: {
    height: 48,
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
  btnDisabled: { opacity: 0.5 },
  banner: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  bannerText: {
    fontSize: Typography.sizes.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
  },
  footerBtn: { flex: 1 },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  customForm: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Spacing.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  suggestionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  suggestionText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  swatchTile: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  swatchCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginBottom: Spacing.xs,
  },
  swatchLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  previewCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 3,
    alignItems: 'center',
  },
  previewName: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    marginTop: Spacing.md,
  },
  previewArch: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginTop: Spacing.xs,
  },
  previewItem: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.sm,
  },
  previewCry: {
    fontSize: Typography.sizes.base,
    fontStyle: 'italic',
    marginTop: Spacing.md,
    textAlign: 'center',
  },
});
