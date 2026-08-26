import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
  Animated,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useCredits } from '@/hooks/useCredits';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { supabase } from '@/utils/supabase';
import {
  editCharacter,
  generatePortrait,
  regeneratePortrait,
  listSignatureItemsCatalog,
  createCustomSignatureItem,
  getPortraitFallbackUri,
  CatalogSignatureItem,
} from '@/utils/characters';
import {
  PALETTES,
  PALETTE_HEX,
  TRAIT_LABELS,
  TRAIT_DESCRIPTIONS,
  PaletteKey,
  ItemClass,
  ITEM_CLASSES,
  VIBES,
  SILHOUETTES,
  ERAS,
  EXPRESSIONS,
  Vibe,
  Silhouette,
  Era,
  Expression,
  ArtStyle,
  ART_STYLE_LABELS,
} from '@/constants/CharacterTraits';
import { ArchetypeId } from '@/constants/Archetypes';
import {
  computeStagedTraits,
  StageTraitKey,
} from '@/utils/characterEditPricing';
import {
  PortraitPreview,
  ItemGrid,
  TraitPicker,
  TraitOption,
  TraitStepper,
  StepperOption,
  ArtStylePicker,
  AnimatedCounter,
  SegmentedCategoryBar,
} from '@/components';

/**
 * Hardcoded mirror of backend seed pricing. Backend remains source of truth
 * and will reject mismatched calls — these values are display-only.
 */
const EDIT_PRICES = {
  battleCry: 0,
  signatureColor: 0,
  signatureItem: 0,
  customizeItem: 0,
  regeneratePortrait: 1,
  rePromptPortrait: 2,
  changeArtStyle: 2,
  swapTrait: 1,
  rerollAllTraits: 2,
} as const;

type Category = 'identity' | 'item' | 'traits' | 'portrait';

/** All stageable trait keys, in display order (palette first). */
const TRAIT_DEFS: { key: StageTraitKey }[] = [
  { key: 'palette' },
  { key: 'vibe' },
  { key: 'silhouette' },
  { key: 'era' },
  { key: 'expression' },
];

/** Abstract traits shown as steppers (palette is a swatch grid instead). */
const STEPPER_DEFS: { key: StageTraitKey; title: string }[] = [
  { key: 'vibe', title: 'Vibe' },
  { key: 'silhouette', title: 'Silhouette' },
  { key: 'era', title: 'Era' },
  { key: 'expression', title: 'Expression' },
];

const FIELD_BY_KEY: Record<StageTraitKey, keyof CharacterRow> = {
  palette: 'palette_key',
  vibe: 'vibe',
  silhouette: 'silhouette',
  era: 'era',
  expression: 'expression',
};

function stepperOptions(key: StageTraitKey): StepperOption[] {
  switch (key) {
    case 'palette':
      return PALETTES.map((p) => ({
        value: p.key,
        label: TRAIT_LABELS.palette[p.key],
        swatch: p.hex,
      }));
    case 'vibe':
      return VIBES.map((v) => ({
        value: v,
        label: TRAIT_LABELS.vibe[v],
        description: TRAIT_DESCRIPTIONS.vibe[v],
      }));
    case 'silhouette':
      return SILHOUETTES.map((v) => ({
        value: v,
        label: TRAIT_LABELS.silhouette[v],
        description: TRAIT_DESCRIPTIONS.silhouette[v],
      }));
    case 'era':
      return ERAS.map((v) => ({
        value: v,
        label: TRAIT_LABELS.era[v],
        description: TRAIT_DESCRIPTIONS.era[v],
      }));
    case 'expression':
      return EXPRESSIONS.map((v) => ({
        value: v,
        label: TRAIT_LABELS.expression[v],
        description: TRAIT_DESCRIPTIONS.expression[v],
      }));
  }
}

function traitLabel(
  key: StageTraitKey,
  value: string | null | undefined,
): string {
  if (!value) return '—';
  switch (key) {
    case 'palette':
      return TRAIT_LABELS.palette[value as PaletteKey] ?? value;
    case 'vibe':
      return TRAIT_LABELS.vibe[value as Vibe] ?? value;
    case 'silhouette':
      return TRAIT_LABELS.silhouette[value as Silhouette] ?? value;
    case 'era':
      return TRAIT_LABELS.era[value as Era] ?? value;
    case 'expression':
      return TRAIT_LABELS.expression[value as Expression] ?? value;
  }
}

const CATEGORIES: { key: Category; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'identity', label: 'Identity', icon: 'person-outline' },
  { key: 'item', label: 'Item', icon: 'cube-outline' },
  { key: 'traits', label: 'Traits', icon: 'color-palette-outline' },
  { key: 'portrait', label: 'Portrait', icon: 'image-outline' },
];

interface CharacterRow {
  id: string;
  name: string;
  archetype: ArchetypeId;
  battle_cry: string;
  signature_color: string;
  signature_item_id: string | null;
  portrait_id: string | null;
  portrait_seed: number | null;
  vibe: Vibe | null;
  silhouette: Silhouette | null;
  palette_key: PaletteKey | null;
  era: Era | null;
  expression: Expression | null;
  art_style: ArtStyle | null;
  last_edited_at: string | null;
}

export default function EditCharacterScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { credits, refresh: refreshCredits } = useCredits();

  const [character, setCharacter] = useState<CharacterRow | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>('identity');
  const [pendingTraits, setPendingTraits] = useState<
    Partial<Record<StageTraitKey, string>>
  >({});
  // True after staged traits are applied but the portrait hasn't been
  // re-rendered yet — drives the persistent "See new look" CTA on the Stage.
  const [portraitStale, setPortraitStale] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const loadCharacter = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('characters')
        .select(
          'id,name,archetype,battle_cry,signature_color,signature_item_id,portrait_id,portrait_seed,vibe,silhouette,palette_key,era,expression,art_style,last_edited_at',
        )
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      setCharacter(data as CharacterRow | null);

      if (data?.portrait_id) {
        const { data: portrait } = await supabase
          .from('character_portraits')
          .select('image_path')
          .eq('id', data.portrait_id)
          .maybeSingle();
        const imagePath =
          (portrait as { image_path: string } | null)?.image_path ?? null;
        if (imagePath) {
          const { data: signed, error: signedError } = await supabase.storage
            .from('character-portraits')
            .createSignedUrl(imagePath, 600);
          setPortraitUrl(signedError ? null : (signed?.signedUrl ?? null));
        } else {
          setPortraitUrl(null);
        }
      } else {
        setPortraitUrl(null);
      }
    } catch (err) {
      console.error('Failed to load character:', err);
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to load character.',
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadCharacter();
  }, [loadCharacter]);

  const runEdit = useCallback(
    async (
      key: string,
      changes: Parameters<typeof editCharacter>[0]['changes'],
      successMsg: string,
    ) => {
      if (!character) return;
      setBusyKey(key);
      try {
        const result = await editCharacter({
          characterId: character.id,
          changes,
        });
        const creditsLabel =
          result.credits_spent === 0
            ? 'free'
            : `${result.credits_spent} credit${result.credits_spent === 1 ? '' : 's'} spent`;
        showToast(`${successMsg} · ${creditsLabel}`);
        await loadCharacter();
        await refreshCredits();
      } catch (err) {
        console.error('Failed to edit character', { key, changes, err });
        Alert.alert(
          'Edit failed',
          err instanceof Error ? err.message : 'Try again.',
        );
      } finally {
        setBusyKey(null);
      }
    },
    [character, loadCharacter, refreshCredits, showToast],
  );

  const runPortraitRender = useCallback(async () => {
    if (!character) return;
    setBusyKey('regeneratePortrait');
    try {
      if (character.portrait_seed === null) {
        await generatePortrait({
          characterId: character.id,
          archetype: character.archetype,
          mode: 'guided',
          traits: {
            vibe: character.vibe ?? undefined,
            silhouette: character.silhouette ?? undefined,
            palette: character.palette_key ?? undefined,
            era: character.era ?? undefined,
            expression: character.expression ?? undefined,
          },
        });
        showToast('Portrait generated');
      } else {
        await regeneratePortrait({
          characterId: character.id,
          paid: true,
        });
        showToast('Portrait regenerated · 1 credit spent');
      }
      setPortraitStale(false);
      await loadCharacter();
      await refreshCredits();
    } catch (err) {
      console.error('Failed to render portrait from edit screen', {
        characterId: character.id,
        hasPortraitSeed: character.portrait_seed !== null,
        portraitId: character.portrait_id,
        err,
      });
      Alert.alert(
        character.portrait_seed === null
          ? 'Could not generate portrait'
          : 'Edit failed',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setBusyKey(null);
    }
  }, [character, loadCharacter, refreshCredits, showToast]);

  const runRePromptPortrait = useCallback(
    async (prompt: string) => {
      if (!character) return;
      setBusyKey('rePromptPortrait');
      try {
        await regeneratePortrait({
          characterId: character.id,
          paid: true,
          portraitPromptRaw: prompt,
        });
        showToast(`Portrait re-prompted · ${EDIT_PRICES.rePromptPortrait} credits spent`);
        await loadCharacter();
        await refreshCredits();
      } catch (err) {
        console.error('Failed to re-prompt portrait', {
          characterId: character.id,
          prompt,
          err,
        });
        Alert.alert(
          'Edit failed',
          err instanceof Error ? err.message : 'Try again.',
        );
      } finally {
        setBusyKey(null);
      }
    },
    [character, loadCharacter, refreshCredits, showToast],
  );

  const runChangeArtStyle = useCallback(
    async (style: ArtStyle) => {
      if (!character) return;
      setBusyKey('changeArtStyle');
      try {
        await regeneratePortrait({
          characterId: character.id,
          paid: true,
          artStyle: style,
        });
        showToast(
          `Style changed · ${EDIT_PRICES.changeArtStyle} credits spent`,
        );
        await loadCharacter();
        await refreshCredits();
      } catch (err) {
        console.error('Failed to change art style', {
          characterId: character.id,
          style,
          err,
        });
        Alert.alert(
          'Edit failed',
          err instanceof Error ? err.message : 'Try again.',
        );
      } finally {
        setBusyKey(null);
      }
    },
    [character, loadCharacter, refreshCredits, showToast],
  );

  const hasInitialPortraitSeed = character?.portrait_seed !== null;

  /**
   * Shared entry point for (re)rendering the portrait. Free first generation
   * runs immediately; paid regeneration always confirms the credit cost first.
   */
  const promptPortraitRender = useCallback(() => {
    if (!character) return;
    if (character.portrait_seed !== null) {
      Alert.alert(
        'Regenerate portrait',
        `Spend ${EDIT_PRICES.regeneratePortrait} credit?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Spend',
            style: 'destructive',
            onPress: runPortraitRender,
          },
        ],
      );
    } else {
      runPortraitRender();
    }
  }, [character, runPortraitRender]);

  // --- Trait staging (batched apply) ------------------------------------

  const {
    changed: pendingChanged,
    cost: pendingCost,
    useBatch: pendingUseBatch,
  } = useMemo(
    () =>
      character
        ? computeStagedTraits(
            character as unknown as Record<string, unknown>,
            pendingTraits,
          )
        : {
            changed: [] as StageTraitKey[],
            cost: 0,
            useBatch: false,
            paidCount: 0,
          },
    [pendingTraits, character],
  );

  // Human-readable summary of staged (not-yet-applied) trait changes, shown as
  // chips on the Stage so the paid preview is a deliberate, visible decision.
  const stagedDiff = useMemo(
    () =>
      pendingChanged.map((key) => ({
        key,
        to: traitLabel(key, pendingTraits[key]),
      })),
    [pendingChanged, pendingTraits],
  );

  const regenCost =
    character && character.portrait_seed === null
      ? 0
      : EDIT_PRICES.regeneratePortrait;

  const doApplyStagedTraits = useCallback(async () => {
    if (!character) return;
    const toApply = TRAIT_DEFS.filter((d) => pendingChanged.includes(d.key));
    setBusyKey('applyTraits');
    try {
      // Palette is free and lives on its own edit kind, so it is always applied
      // separately regardless of which route the paid traits take.
      const paletteChange = toApply.find((d) => d.key === 'palette');
      if (paletteChange) {
        const value = pendingTraits.palette;
        if (value != null) {
          await editCharacter({
            characterId: character.id,
            changes: { swapTrait: { key: 'palette', value } },
          });
        }
      }

      if (pendingUseBatch) {
        // One charged call instead of N. Looping single swaps cost 1 credit
        // each, so four staged traits cost 4 where the batch costs 2 -- and a
        // mid-loop failure left the player charged for the swaps that landed.
        // Unstaged traits are sent at their current value so this sets exactly
        // what the player sees staged.
        const current = character as unknown as Record<string, string | null>;
        await editCharacter({
          characterId: character.id,
          changes: {
            setAllTraits: {
              vibe: pendingTraits.vibe ?? current.vibe ?? '',
              silhouette: pendingTraits.silhouette ?? current.silhouette ?? '',
              era: pendingTraits.era ?? current.era ?? '',
              expression: pendingTraits.expression ?? current.expression ?? '',
            },
          },
        });
      } else {
        for (const d of toApply) {
          if (d.key === 'palette') continue;
          const value = pendingTraits[d.key];
          if (value == null) continue;
          await editCharacter({
            characterId: character.id,
            changes: { swapTrait: { key: d.key, value } },
          });
        }
      }
      setPendingTraits({});
      setPortraitStale(true);
      await loadCharacter();
      await refreshCredits();
      showToast('Traits updated · regenerate to see your new look');
    } catch (err) {
      console.error('Failed to apply staged traits', { pendingChanged, err });
      Alert.alert(
        'Edit failed',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setBusyKey(null);
    }
  }, [
    character,
    pendingChanged,
    pendingTraits,
    loadCharacter,
    refreshCredits,
    showToast,
  ]);

  const applyStagedTraits = useCallback(() => {
    if (pendingChanged.length === 0) return;
    if (pendingCost > credits) {
      Alert.alert(
        'Not enough credits',
        `You need ${pendingCost} credit${pendingCost === 1 ? '' : 's'} to apply these changes.`,
      );
      return;
    }
    Alert.alert(
      'Apply changes',
      `Apply ${pendingChanged.length} change${pendingChanged.length === 1 ? '' : 's'}${
        pendingCost > 0 ? ` · ${pendingCost} cr` : ' · free'
      }?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Apply', onPress: doApplyStagedTraits },
      ],
    );
  }, [pendingChanged, pendingCost, credits, doApplyStagedTraits]);

  const randomizeTraits = useCallback(() => {
    Alert.alert(
      'Randomize traits',
      `Spend ${EDIT_PRICES.rerollAllTraits} credits for a fresh random set?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Randomize',
          style: 'destructive',
          onPress: async () => {
            setPendingTraits({});
            await runEdit(
              'rerollAllTraits',
              { rerollAllTraits: true },
              'Traits rerolled',
            );
          },
        },
      ],
    );
  }, [runEdit]);

  const fallbackUri = useMemo(() => {
    if (!character) return '';
    return getPortraitFallbackUri({
      archetype: character.archetype,
      signatureColor: character.signature_color,
    });
  }, [character]);

  const portraitBusy =
    busyKey === 'regeneratePortrait' ||
    busyKey === 'rePromptPortrait' ||
    busyKey === 'changeArtStyle';

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!character) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background },
        ]}
      >
        <Text style={[styles.h1, { color: colors.text }]}>
          No character yet.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(onboarding)/create-character')}
          accessibilityRole="button"
          style={[
            styles.primaryBtn,
            { backgroundColor: colors.primary, marginTop: Spacing.lg },
          ]}
        >
          <Text style={styles.primaryBtnText}>Create your character</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const categoryItems = CATEGORIES.map((c) => ({
    ...c,
    badge: c.key === 'traits' && pendingChanged.length > 0,
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{ headerRight: () => <CreditChip credits={credits} /> }}
      />
      <View style={[styles.top, { paddingTop: insets.top + 44 }]}>
        <Stage
          character={character}
          portraitUri={portraitUrl ?? fallbackUri}
          portraitBusy={portraitBusy}
          hasPortrait={!!portraitUrl}
          hasStaged={stagedDiff.length > 0}
          portraitStale={portraitStale}
          regenCost={regenCost}
          onGenerate={promptPortraitRender}
          onSeeNewLook={promptPortraitRender}
        />
        {stagedDiff.length > 0 && (
          <StagedStrip
            diff={stagedDiff}
            cost={pendingCost}
            onReview={() => setActiveCategory('traits')}
          />
        )}
        <SegmentedCategoryBar
          items={categoryItems}
          value={activeCategory}
          onChange={(k) => setActiveCategory(k as Category)}
        />
      </View>

      <View style={styles.dock}>
        {activeCategory === 'identity' && (
          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={styles.panel}
            keyboardShouldPersistTaps="handled"
          >
            <BattleCryRow
              character={character}
              busy={busyKey === 'battleCry'}
              onSave={(v) =>
                runEdit('battleCry', { battleCry: v }, 'Battle cry updated')
              }
            />
            <SignatureColorRow
              character={character}
              busy={busyKey === 'signatureColor'}
              onSave={(v) =>
                runEdit('signatureColor', { signatureColor: v }, 'Color updated')
              }
            />
          </ScrollView>
        )}

        {activeCategory === 'item' && (
          <ItemPanel
            character={character}
            busy={busyKey === 'signatureItem'}
            onSelect={(id) =>
              runEdit(
                'signatureItem',
                { signatureItemId: id },
                'Signature item updated',
              )
            }
          />
        )}

        {activeCategory === 'traits' && (
          <TraitsPanel
            character={character}
            pendingTraits={pendingTraits}
            onStage={(key, value) =>
              setPendingTraits((prev) => ({ ...prev, [key]: value }))
            }
            pendingChanged={pendingChanged}
            pendingCost={pendingCost}
            credits={credits}
            busy={busyKey === 'applyTraits'}
            onApply={applyStagedTraits}
            onRandomize={randomizeTraits}
            onClear={() => setPendingTraits({})}
          />
        )}

        {activeCategory === 'portrait' && (
          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={styles.panel}
          >
            <ArtStyleRow
              currentStyle={character.art_style ?? 'painterly'}
              busy={busyKey === 'changeArtStyle'}
              onApply={(style) =>
                Alert.alert(
                  'Change art style',
                  `Re-render in ${ART_STYLE_LABELS[style]} for ${EDIT_PRICES.changeArtStyle} credits?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Spend',
                      style: 'destructive',
                      onPress: () => runChangeArtStyle(style),
                    },
                  ],
                )
              }
            />
            <ActionRow
              title={
                hasInitialPortraitSeed
                  ? 'Regenerate portrait'
                  : 'Generate portrait'
              }
              subtitle={
                hasInitialPortraitSeed
                  ? 'Keep your traits, get a new render.'
                  : 'Create your first character render.'
              }
              cost={hasInitialPortraitSeed ? EDIT_PRICES.regeneratePortrait : 0}
              busy={busyKey === 'regeneratePortrait'}
              onPress={promptPortraitRender}
            />
            <RePromptRow
              busy={busyKey === 'rePromptPortrait'}
              onSave={(prompt) =>
                Alert.alert(
                  'Re-prompt portrait',
                  `Spend ${EDIT_PRICES.rePromptPortrait} credits?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Spend',
                      style: 'destructive',
                      onPress: () => runRePromptPortrait(prompt),
                    },
                  ],
                )
              }
            />
          </ScrollView>
        )}
      </View>

      {toast && <Toast text={toast} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Header credit chip
// ---------------------------------------------------------------------------

function CreditChip({ credits }: { credits: number }) {
  const colors = useThemedColors();
  return (
    <View
      style={[
        styles.creditChip,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Ionicons name="sparkles" size={13} color={colors.primary} />
      <AnimatedCounter
        value={credits}
        style={[styles.creditText, { color: colors.text }]}
        accessibilityLabel={`${credits} credits`}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stage (sticky hero)
// ---------------------------------------------------------------------------

function Stage({
  character,
  portraitUri,
  portraitBusy,
  hasPortrait,
  hasStaged,
  portraitStale,
  regenCost,
  onGenerate,
  onSeeNewLook,
}: {
  character: CharacterRow;
  portraitUri: string;
  portraitBusy: boolean;
  hasPortrait: boolean;
  hasStaged: boolean;
  portraitStale: boolean;
  regenCost: number;
  onGenerate: () => void;
  onSeeNewLook: () => void;
}) {
  const colors = useThemedColors();
  const costLabel = regenCost === 0 ? 'free' : `${regenCost} cr`;
  return (
    <View style={styles.stage}>
      <PortraitPreview
        uri={portraitUri}
        variant="fullBody"
        size={116}
        loading={portraitBusy}
      />
      <View style={styles.stageMeta}>
        <Text numberOfLines={1} style={[styles.stageName, { color: colors.text }]}>
          {character.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.stageCaption, { color: colors.textSecondary }]}
        >
          {ART_STYLE_LABELS[character.art_style ?? 'painterly']} style
        </Text>
        <View style={styles.stageColorRow}>
          <View
            style={[
              styles.stageColorDot,
              { backgroundColor: character.signature_color },
            ]}
          />
          <Text style={[styles.stageColorText, { color: colors.textTertiary }]}>
            Signature color
          </Text>
        </View>
        {/* Staged (unpaid) changes take priority and are summarized in the
            StagedStrip below, so the Stage CTA only handles rendering. */}
        {!hasStaged && portraitStale ? (
          <TouchableOpacity
            onPress={onSeeNewLook}
            accessibilityRole="button"
            accessibilityLabel={`See your new look, ${costLabel}`}
            style={[styles.stageCta, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="sparkles" size={13} color="#FFFFFF" />
            <Text style={styles.stageCtaText}>See new look · {costLabel}</Text>
          </TouchableOpacity>
        ) : !hasStaged && !hasPortrait ? (
          <TouchableOpacity
            onPress={onGenerate}
            accessibilityRole="button"
            style={[styles.stageCta, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="sparkles" size={13} color="#FFFFFF" />
            <Text style={styles.stageCtaText}>
              {regenCost === 0 ? 'Generate now · free' : `Generate · ${regenCost} cr`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StagedStrip — full-width summary of staged (not-yet-applied) trait changes
// ---------------------------------------------------------------------------

function StagedStrip({
  diff,
  cost,
  onReview,
}: {
  diff: { key: StageTraitKey; to: string }[];
  cost: number;
  onReview: () => void;
}) {
  const colors = useThemedColors();
  const shown = diff.slice(0, 3);
  const extra = diff.length - shown.length;
  return (
    <TouchableOpacity
      onPress={onReview}
      accessibilityRole="button"
      accessibilityLabel={`${diff.length} staged trait changes, review and apply`}
      style={[
        styles.stagedStrip,
        { backgroundColor: colors.card, borderColor: colors.primary },
      ]}
    >
      <View style={[styles.pendingDot, { backgroundColor: colors.primary }]} />
      <View style={styles.stagedChips}>
        {shown.map((d) => (
          <View
            key={d.key}
            style={[styles.stagedChip, { backgroundColor: colors.background }]}
          >
            <Text
              numberOfLines={1}
              style={[styles.stagedChipText, { color: colors.text }]}
            >
              {d.to}
            </Text>
          </View>
        ))}
        {extra > 0 ? (
          <Text style={[styles.stagedMore, { color: colors.textSecondary }]}>
            +{extra}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.stagedReview, { color: colors.primary }]}>
        {cost > 0 ? `${cost} cr · Review` : 'Review'}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function ItemPanel({
  character,
  busy,
  onSelect,
}: {
  character: CharacterRow;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const colors = useThemedColors();
  const [items, setItems] = useState<CatalogSignatureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customClass, setCustomClass] = useState<ItemClass>('tool');
  const [customIcon, setCustomIcon] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await listSignatureItemsCatalog();
        if (active) setItems(list);
      } catch (err) {
        console.error('Failed to load signature items', err);
        if (active) {
          Alert.alert(
            'Could not load items',
            err instanceof Error ? err.message : 'Try again.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const submitCustom = async () => {
    const name = customName.trim();
    const desc = customDesc.trim();
    if (!name || !desc) return;
    setCreating(true);
    try {
      const item = await createCustomSignatureItem({
        name,
        description: desc,
        itemClass: customClass,
        generateIcon: customIcon,
      });
      setCustomOpen(false);
      setCustomName('');
      setCustomDesc('');
      onSelect(item.id);
    } catch (err) {
      console.error('Failed to create custom signature item', {
        err,
        name,
        description: desc,
        itemClass: customClass,
        generateIcon: customIcon,
      });
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
      <View style={[styles.panelScroll, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.panelScroll}
      contentContainerStyle={styles.panel}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.panelHint, { color: colors.textSecondary }]}>
        Free swap from catalog
      </Text>
      <ItemGrid
        items={items.slice(0, 15)}
        selectedId={character.signature_item_id ?? undefined}
        onSelect={(id) => !busy && onSelect(id)}
        onCreateCustom={() => setCustomOpen(true)}
      />
      {customOpen && (
        <View style={[styles.customForm, { backgroundColor: colors.card }]}>
          <TextInput
            value={customName}
            onChangeText={setCustomName}
            placeholder="Item name"
            placeholderTextColor={colors.textTertiary}
            maxLength={32}
            style={[
              styles.input,
              { backgroundColor: colors.background, color: colors.text },
            ]}
            accessibilityLabel="Custom item name"
          />
          <TextInput
            value={customDesc}
            onChangeText={setCustomDesc}
            placeholder="Description"
            placeholderTextColor={colors.textTertiary}
            maxLength={140}
            multiline
            style={[
              styles.input,
              styles.multiline,
              { backgroundColor: colors.background, color: colors.text },
            ]}
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
          <TouchableOpacity
            onPress={submitCustom}
            disabled={creating || !customName.trim() || !customDesc.trim()}
            accessibilityRole="button"
            accessibilityLabel="Save custom item"
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              (creating || !customName.trim() || !customDesc.trim()) &&
                styles.btnDisabled,
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {creating ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function TraitsPanel({
  character,
  pendingTraits,
  onStage,
  pendingChanged,
  pendingCost,
  credits,
  busy,
  onApply,
  onRandomize,
  onClear,
}: {
  character: CharacterRow;
  pendingTraits: Partial<Record<StageTraitKey, string>>;
  onStage: (key: StageTraitKey, value: string) => void;
  pendingChanged: StageTraitKey[];
  pendingCost: number;
  credits: number;
  busy: boolean;
  onApply: () => void;
  onRandomize: () => void;
  onClear: () => void;
}) {
  const colors = useThemedColors();
  const insufficient = pendingCost > credits;
  const staged = pendingChanged.length;
  return (
    <View style={styles.panelScroll}>
      <ScrollView
        contentContainerStyle={styles.panel}
        showsVerticalScrollIndicator={false}
      >
        <PaletteRow
          value={pendingTraits.palette ?? character.palette_key ?? undefined}
          changed={pendingChanged.includes('palette')}
          onSelect={(key) => onStage('palette', key)}
        />
        {STEPPER_DEFS.map((def) => (
          <TraitStepper
            key={def.key}
            title={def.title}
            costLabel={`${EDIT_PRICES.swapTrait} cr`}
            options={stepperOptions(def.key)}
            value={
              pendingTraits[def.key] ??
              (character[FIELD_BY_KEY[def.key]] as string | null) ??
              undefined
            }
            onChange={(v) => onStage(def.key, v)}
            changed={pendingChanged.includes(def.key)}
            disabled={busy}
          />
        ))}
        <TouchableOpacity
          onPress={onRandomize}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Randomize all traits"
          style={[
            styles.secondaryBtn,
            { borderColor: colors.border, marginTop: Spacing.sm },
            busy && styles.btnDisabled,
          ]}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
            Randomize all ({EDIT_PRICES.rerollAllTraits} cr)
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {staged > 0 && (
        <View
          style={[
            styles.applyBar,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.flex1}>
            <Text style={[styles.applyTitle, { color: colors.text }]}>
              {staged} staged change{staged === 1 ? '' : 's'}
            </Text>
            <Text
              style={[
                styles.applySub,
                { color: insufficient ? colors.error : colors.textSecondary },
              ]}
            >
              {insufficient
                ? `Need ${pendingCost} credits`
                : pendingCost > 0
                  ? `${pendingCost} cr`
                  : 'Free'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClear}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Clear staged changes"
            style={styles.clearBtn}
          >
            <Text style={{ color: colors.textSecondary }}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onApply}
            disabled={busy || insufficient}
            accessibilityRole="button"
            accessibilityLabel={`Apply ${staged} changes`}
            style={[
              styles.applyBtn,
              { backgroundColor: colors.primary },
              (busy || insufficient) && styles.btnDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Apply</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function PaletteRow({
  value,
  changed,
  onSelect,
}: {
  value: string | undefined;
  changed: boolean;
  onSelect: (key: PaletteKey) => void;
}) {
  const colors = useThemedColors();
  return (
    <View style={styles.traitBlock}>
      <View style={styles.traitBlockHeader}>
        <View style={styles.titleWrap}>
          <Text style={[styles.traitBlockTitle, { color: colors.text }]}>
            Palette
          </Text>
          {changed ? (
            <View
              style={[styles.changedDot, { backgroundColor: colors.primary }]}
            />
          ) : null}
        </View>
        <Text style={[styles.costText, { color: colors.success }]}>Free</Text>
      </View>
      <View style={styles.swatchRow}>
        {PALETTES.map((p) => {
          const selected = p.key === value;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => onSelect(p.key)}
              accessibilityRole="button"
              accessibilityLabel={`Palette: ${TRAIT_LABELS.palette[p.key]}`}
              accessibilityState={{ selected }}
              style={[
                styles.swatch,
                {
                  backgroundColor: p.hex,
                  borderColor: selected ? colors.text : 'transparent',
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rows (reused inside panels)
// ---------------------------------------------------------------------------

function formatCooldown(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

function CardShell({
  title,
  subtitle,
  cost,
  cooldownMs,
  children,
}: {
  title: string;
  subtitle?: string;
  cost: number;
  cooldownMs?: number;
  children?: React.ReactNode;
}) {
  const colors = useThemedColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.cardHeader}>
        <View style={styles.flex1}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.costBadge}>
          <Text
            style={[
              styles.costText,
              { color: cost === 0 ? colors.success : colors.primary },
            ]}
          >
            {cost === 0 ? 'Free' : `${cost} cr`}
          </Text>
        </View>
      </View>
      {cooldownMs && cooldownMs > 0 ? (
        <Text style={[styles.cooldown, { color: colors.warning }]}>
          Available in {formatCooldown(cooldownMs)}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function BattleCryRow({
  character,
  busy,
  onSave,
}: {
  character: CharacterRow;
  busy: boolean;
  onSave: (v: string) => void;
}) {
  const colors = useThemedColors();
  const [value, setValue] = useState(character.battle_cry);
  const disabled = busy || value.trim() === character.battle_cry;
  return (
    <CardShell
      title="Battle cry"
      subtitle="Free · 24h cooldown"
      cost={EDIT_PRICES.battleCry}
    >
      <TextInput
        value={value}
        onChangeText={setValue}
        maxLength={60}
        style={[
          styles.input,
          { backgroundColor: colors.background, color: colors.text },
        ]}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Battle cry input"
      />
      <TouchableOpacity
        onPress={() => onSave(value.trim())}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Save battle cry"
        style={[
          styles.primaryBtn,
          { backgroundColor: colors.primary },
          disabled && styles.btnDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>Save</Text>
        )}
      </TouchableOpacity>
    </CardShell>
  );
}

function SignatureColorRow({
  character,
  busy,
  onSave,
}: {
  character: CharacterRow;
  busy: boolean;
  onSave: (v: PaletteKey) => void;
}) {
  const colors = useThemedColors();
  return (
    <CardShell
      title="Signature color"
      subtitle="Free · 24h cooldown"
      cost={EDIT_PRICES.signatureColor}
    >
      <View style={styles.swatchRow}>
        {PALETTES.map((p) => {
          const selected =
            PALETTE_HEX[p.key].toLowerCase() ===
            character.signature_color.toLowerCase();
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => onSave(p.key)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${TRAIT_LABELS.palette[p.key]}`}
              accessibilityState={{ selected }}
              style={[
                styles.swatch,
                {
                  backgroundColor: p.hex,
                  borderColor: selected ? colors.text : 'transparent',
                  opacity: busy ? 0.5 : 1,
                },
              ]}
            />
          );
        })}
      </View>
    </CardShell>
  );
}

function ActionRow({
  title,
  subtitle,
  cost,
  busy,
  onPress,
}: {
  title: string;
  subtitle?: string;
  cost: number;
  busy: boolean;
  onPress: () => void;
}) {
  const colors = useThemedColors();
  return (
    <CardShell title={title} subtitle={subtitle} cost={cost}>
      <TouchableOpacity
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={[
          styles.primaryBtn,
          { backgroundColor: colors.primary },
          busy && styles.btnDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>Continue</Text>
        )}
      </TouchableOpacity>
    </CardShell>
  );
}

function ArtStyleRow({
  currentStyle,
  busy,
  onApply,
}: {
  currentStyle: ArtStyle;
  busy: boolean;
  onApply: (style: ArtStyle) => void;
}) {
  const colors = useThemedColors();
  const [selected, setSelected] = useState<ArtStyle>(currentStyle);
  const dirty = selected !== currentStyle;
  return (
    <CardShell
      title="Art style"
      subtitle={`Currently: ${ART_STYLE_LABELS[currentStyle]}. Re-renders your portrait.`}
      cost={EDIT_PRICES.changeArtStyle}
    >
      <ArtStylePicker
        title=""
        value={selected}
        onChange={setSelected}
        disabled={busy}
      />
      <TouchableOpacity
        onPress={() => onApply(selected)}
        disabled={busy || !dirty}
        accessibilityRole="button"
        accessibilityLabel="Apply new art style"
        style={[
          styles.primaryBtn,
          { backgroundColor: colors.primary },
          (busy || !dirty) && styles.btnDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {dirty ? 'Apply style' : 'Pick a different style'}
          </Text>
        )}
      </TouchableOpacity>
    </CardShell>
  );
}

function RePromptRow({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (prompt: string) => void;
}) {
  const colors = useThemedColors();
  const [value, setValue] = useState('');
  const disabled = busy || value.trim().length === 0;
  return (
    <CardShell
      title="Re-prompt portrait"
      subtitle="Write a new description for your portrait."
      cost={EDIT_PRICES.rePromptPortrait}
    >
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="A new vision for your fighter"
        placeholderTextColor={colors.textTertiary}
        maxLength={120}
        multiline
        style={[
          styles.input,
          styles.multiline,
          { backgroundColor: colors.background, color: colors.text },
        ]}
        accessibilityLabel="Re-prompt portrait input"
      />
      <TouchableOpacity
        onPress={() => onSave(value.trim())}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Submit new portrait prompt"
        style={[
          styles.primaryBtn,
          { backgroundColor: colors.primary },
          disabled && styles.btnDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>Submit</Text>
        )}
      </TouchableOpacity>
    </CardShell>
  );
}

function Toast({ text }: { text: string }) {
  const colors = useThemedColors();
  const opacity = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: colors.card, opacity, borderColor: colors.border },
      ]}
    >
      <Text style={{ color: colors.text }}>{text}</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  h1: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.md,
  },
  top: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  dock: { flex: 1 },
  panelScroll: { flex: 1 },
  panel: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  panelHint: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.sm,
  },
  // Stage
  stage: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  stageMeta: {
    flex: 1,
    marginLeft: Spacing.md,
    justifyContent: 'center',
  },
  stageName: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  stageCaption: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  stageColorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  stageColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: Spacing.sm,
  },
  stageColorText: {
    fontSize: Typography.sizes.xs,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  stageCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  stageCtaText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  // Staged strip
  stagedStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  stagedChips: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stagedChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    maxWidth: 96,
  },
  stagedChipText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  stagedMore: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  stagedReview: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    marginRight: Spacing.xs,
  },
  // Trait blocks (palette grid)
  traitBlock: {
    marginBottom: Spacing.lg,
  },
  traitBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  traitBlockTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  changedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: Spacing.sm,
  },
  // Credit chip
  creditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginRight: Spacing.md,
  },
  creditText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    marginLeft: Spacing.xs,
  },
  // Apply bar
  applyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  applyTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  applySub: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  clearBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  applyBtn: {
    height: 44,
    minWidth: 96,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  // Cards
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  flex1: { flex: 1 },
  cardTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  cardSub: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  costBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  costText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  cooldown: {
    fontSize: Typography.sizes.xs,
    marginBottom: Spacing.sm,
  },
  input: {
    minHeight: 44,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.sm,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  primaryBtn: {
    height: 44,
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
    height: 44,
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
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Spacing.sm,
  },
  customForm: {
    marginTop: Spacing.md,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  toast: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: Spacing.lg,
    right: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
});
