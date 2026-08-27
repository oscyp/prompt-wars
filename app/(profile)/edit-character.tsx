import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Animated,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useCredits } from '@/hooks/useCredits';
import { describeEditError } from '@/utils/editErrors';
import { fetchEditPricing, type EditPriceKey } from '@/utils/editCooldowns';
import { formatCredits } from '@/utils/credits';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { supabase } from '@/utils/supabase';
import {
  editCharacter,
  generatePortrait,
  regeneratePortrait,
  listSignatureItemsCatalog,
  createCustomSignatureItem,
  listPortraitHistory,
  restorePortrait,
  type PortraitHistoryEntry,
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
  PortraitHistoryStrip,
  PortraitViewer,
  AnimatedCounter,
  SegmentedCategoryBar,
} from '@/components';

/**
 * Fallback pricing, used only until `fetchEditPricing` returns.
 *
 * This used to be the sole source of prices on this screen, and it drifted:
 * it claimed custom items were free while the server charged 3 credits. Live
 * values now come from `character_edit_prices`; keep this table in step, but
 * it is no longer what the player is quoted.
 */
const EDIT_PRICES = {
  battleCry: 0,
  signatureColor: 0,
  signatureItem: 0,
  // Creating a signature item is NOT free, and these two differ: the server
  // charges `custom_item_text` for a name+description and `custom_item_image`
  // when it also renders an icon. The old single `customizeItem: 0` was both
  // wrong and unused, so the form spent 3 credits without ever saying so.
  customItemText: 1,
  customItemImage: 3,
  regeneratePortrait: 1,
  regenerateAvatar: 1,
  rePromptPortrait: 2,
  changeArtStyle: 2,
  swapTrait: 1,
  rerollAllTraits: 2,
} as const;

type EditPriceShape = typeof EDIT_PRICES;

/** Which `character_edit_prices` row backs each name used on this screen. */
const PRICE_KEY_BY_FIELD: Record<keyof EditPriceShape, EditPriceKey> = {
  battleCry: 'battle_cry',
  signatureColor: 'signature_color',
  signatureItem: 'signature_item_swap',
  customItemText: 'custom_item_text',
  customItemImage: 'custom_item_image',
  regeneratePortrait: 'regenerate_portrait',
  regenerateAvatar: 'regenerate_avatar',
  rePromptPortrait: 'new_portrait',
  changeArtStyle: 'new_portrait',
  swapTrait: 'traits_single_swap',
  rerollAllTraits: 'traits_full_reroll',
};

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
  avatar_portrait_id: string | null;
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>('identity');
  const [pendingTraits, setPendingTraits] = useState<
    Partial<Record<StageTraitKey, string>>
  >({});
  // True after staged traits are applied but the portrait hasn't been
  // re-rendered yet — drives the persistent "See new look" CTA on the Stage.
  const [portraitCreatedAt, setPortraitCreatedAt] = useState<string | null>(null);
  // Live prices + cooldowns from the database, falling back to EDIT_PRICES
  // until the fetch lands so the first paint never shows a blank price.
  const [prices, setPrices] = useState<EditPriceShape>(EDIT_PRICES);
  const [history, setHistory] = useState<PortraitHistoryEntry[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [cooldowns, setCooldowns] = useState<
    Partial<Record<EditPriceKey, number>>
  >({});

  const loadPricing = useCallback(async (characterId: string) => {
    try {
      const { prices: live, cooldownMs } = await fetchEditPricing(characterId);
      setCooldowns(cooldownMs);
      setPrices((prev) => {
        const next = { ...prev } as Record<string, number>;
        for (const [field, key] of Object.entries(PRICE_KEY_BY_FIELD)) {
          const row = live[key];
          if (row) next[field] = row.credits;
        }
        return next as EditPriceShape;
      });
    } catch (err) {
      // Non-fatal: the fallback table still gives every control a price, and
      // the server rejects any mismatch anyway.
      console.warn('Could not load live edit pricing', err);
    }
  }, []);

  /** Alert with player-facing copy. Never surfaces a raw server string. */
  const alertEditError = useCallback((err: unknown, fallbackTitle: string) => {
    const { title, message } = describeEditError(err, fallbackTitle);
    Alert.alert(title, message);
  }, []);

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
          'id,name,archetype,battle_cry,signature_color,signature_item_id,portrait_id,avatar_portrait_id,portrait_seed,vibe,silhouette,palette_key,era,expression,art_style,last_edited_at',
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
          .select('image_path, created_at')
          .eq('id', data.portrait_id)
          .maybeSingle();
        const portraitRow = portrait as
          | { image_path: string; created_at: string }
          | null;
        const imagePath = portraitRow?.image_path ?? null;
        setPortraitCreatedAt(portraitRow?.created_at ?? null);
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
        setPortraitCreatedAt(null);
      }

      // Avatar is a separate row keyed by its own pointer; characters created
      // before avatars existed simply have none, which is the normal state.
      if (data?.avatar_portrait_id) {
        const { data: avatarRow } = await supabase
          .from('character_portraits')
          .select('image_path')
          .eq('id', data.avatar_portrait_id)
          .maybeSingle();
        const avatarPath =
          (avatarRow as { image_path: string } | null)?.image_path ?? null;
        if (avatarPath) {
          const { data: signed, error: signedError } = await supabase.storage
            .from('character-portraits')
            .createSignedUrl(avatarPath, 600);
          setAvatarUrl(signedError ? null : (signed?.signedUrl ?? null));
        } else {
          setAvatarUrl(null);
        }
      } else {
        setAvatarUrl(null);
      }
    } catch (err) {
      console.error('Failed to load character:', err);
      alertEditError(err, 'Could not load your character');
    } finally {
      setLoading(false);
    }
  }, [user, alertEditError]);

  useEffect(() => {
    loadCharacter();
  }, [loadCharacter]);

  // Prices and cooldowns depend on the character, so this waits for the load.
  // Re-runs on every edit (character.last_edited_at changes), which is exactly
  // when a cooldown starts.
  useEffect(() => {
    if (character?.id) void loadPricing(character.id);
  }, [character?.id, character?.last_edited_at, loadPricing]);

  // Re-read after every render change so a fresh regeneration immediately
  // pushes the previous look into the strip.
  useEffect(() => {
    if (!character?.id) {
      setHistory([]);
      return;
    }
    let active = true;
    void listPortraitHistory(character.id).then((entries) => {
      if (active) setHistory(entries);
    });
    return () => {
      active = false;
    };
  }, [character?.id, character?.portrait_id]);

  const runRestorePortrait = useCallback(
    async (portraitId: string) => {
      if (!character) return;
      setRestoringId(portraitId);
      try {
        await restorePortrait({ characterId: character.id, portraitId });
        await loadCharacter();
        // The restored render matches whatever traits produced it, so the
        // "see your new look" nudge no longer applies.
        showToast('Earlier render restored · free');
      } catch (err) {
        console.error('Failed to restore portrait', { portraitId, err });
        alertEditError(err, 'Could not restore that render');
      } finally {
        setRestoringId(null);
      }
    },
    [character, loadCharacter, showToast, alertEditError],
  );

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
            : `${formatCredits(result.credits_spent, 'sentence')} spent`;
        showToast(`${successMsg} · ${creditsLabel}`);
        await loadCharacter();
        await refreshCredits();
      } catch (err) {
        console.error('Failed to edit character', { key, changes, err });
        alertEditError(err, 'Edit failed');
      } finally {
        setBusyKey(null);
      }
    },
    [character, loadCharacter, refreshCredits, showToast, alertEditError],
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
      await loadCharacter();
      await refreshCredits();
    } catch (err) {
      console.error('Failed to render portrait from edit screen', {
        characterId: character.id,
        hasPortraitSeed: character.portrait_seed !== null,
        portraitId: character.portrait_id,
        err,
      });
      alertEditError(
        err,
        character.portrait_seed === null
          ? 'Could not generate portrait'
          : 'Could not regenerate portrait',
      );
    } finally {
      setBusyKey(null);
    }
  }, [character, loadCharacter, refreshCredits, showToast, alertEditError]);

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
        showToast(`Portrait re-prompted · ${formatCredits(prices.rePromptPortrait, 'sentence')} spent`);
        await loadCharacter();
        await refreshCredits();
      } catch (err) {
        console.error('Failed to re-prompt portrait', {
          characterId: character.id,
          prompt,
          err,
        });
        alertEditError(err, 'Edit failed');
      } finally {
        setBusyKey(null);
      }
    },
    [character, loadCharacter, refreshCredits, showToast, alertEditError, prices.rePromptPortrait],
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
          `Style changed · ${formatCredits(prices.changeArtStyle, 'sentence')} spent`,
        );
        await loadCharacter();
        await refreshCredits();
      } catch (err) {
        console.error('Failed to change art style', {
          characterId: character.id,
          style,
          err,
        });
        alertEditError(err, 'Edit failed');
      } finally {
        setBusyKey(null);
      }
    },
    [character, loadCharacter, refreshCredits, showToast, alertEditError, prices.changeArtStyle],
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
        `Spend ${formatCredits(prices.regeneratePortrait, 'sentence')}?`,
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
  }, [character, runPortraitRender, prices.regeneratePortrait]);

  /**
   * Avatar (re)render. Mirrors the fighter flow: the first one is free and runs
   * immediately, regenerations confirm the credit cost first.
   */
  const runAvatarRender = useCallback(async () => {
    if (!character) return;
    setBusyKey('regenerateAvatar');
    try {
      await regeneratePortrait({
        characterId: character.id,
        kind: 'avatar',
      });
      showToast(
        avatarUrl
          ? `Avatar regenerated · ${formatCredits(prices.regenerateAvatar, 'sentence')} spent`
          : 'Avatar created',
      );
      await loadCharacter();
      await refreshCredits();
    } catch (err) {
      console.error('Failed to render avatar', {
        characterId: character.id,
        err,
      });
      alertEditError(err, 'Could not regenerate avatar');
    } finally {
      setBusyKey(null);
    }
  }, [character, avatarUrl, loadCharacter, refreshCredits, showToast, alertEditError, prices.regenerateAvatar]);

  const promptAvatarRender = useCallback(() => {
    if (!character) return;
    if (avatarUrl) {
      Alert.alert(
        'Regenerate avatar',
        `Spend ${formatCredits(prices.regenerateAvatar, 'sentence')}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Spend', style: 'destructive', onPress: runAvatarRender },
        ],
      );
    } else {
      runAvatarRender();
    }
  }, [character, avatarUrl, runAvatarRender, prices.regenerateAvatar]);

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

  /**
   * True when traits have been edited since the live render was produced.
   *
   * Derived rather than remembered: this was session state, so applying traits
   * and then leaving the screen silently dropped the nudge, and the player came
   * back to a portrait that no longer matched their character with nothing
   * saying so.
   */
  const portraitStale = useMemo(() => {
    if (!character?.last_edited_at || !portraitCreatedAt) return false;
    const edited = new Date(character.last_edited_at).getTime();
    const rendered = new Date(portraitCreatedAt).getTime();
    if (!Number.isFinite(edited) || !Number.isFinite(rendered)) return false;
    // A second of slack: the edit and its render land in the same request.
    return edited > rendered + 1000;
  }, [character?.last_edited_at, portraitCreatedAt]);

  const regenCost =
    character && character.portrait_seed === null
      ? 0
      : prices.regeneratePortrait;

  const doApplyStagedTraits = useCallback(async () => {
    if (!character) return;
    const toApply = TRAIT_DEFS.filter((d) => pendingChanged.includes(d.key));
    setBusyKey('applyTraits');
    try {
      // Palette is free and lives on its own edit kind, so it is always applied
      // separately regardless of which route the paid traits take. It goes
      // LAST: palette carries a 24h cooldown, and running it first meant a
      // cooldown rejection aborted the whole apply before the paid traits were
      // ever sent. Paid work first, then the free extra -- and if only the
      // palette fails, say so instead of reporting a total failure.
      const paletteChange = toApply.find((d) => d.key === 'palette');

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

      let paletteFailed = false;
      if (paletteChange) {
        const value = pendingTraits.palette;
        if (value != null) {
          try {
            await editCharacter({
              characterId: character.id,
              changes: { swapTrait: { key: 'palette', value } },
            });
          } catch (paletteErr) {
            // The paid traits already landed, so this is not a failed apply.
            paletteFailed = true;
            console.warn('Palette change rejected after traits applied', paletteErr);
            const { message } = describeEditError(paletteErr, 'Palette unchanged');
            Alert.alert('Palette unchanged', message);
          }
        }
      }

      setPendingTraits({});
      await loadCharacter();
      await refreshCredits();
      if (!paletteFailed) {
        showToast('Traits updated · regenerate to see your new look');
      }
    } catch (err) {
      console.error('Failed to apply staged traits', { pendingChanged, err });
      alertEditError(err, 'Edit failed');
    } finally {
      setBusyKey(null);
    }
  }, [
    character,
    pendingChanged,
    pendingTraits,
    pendingUseBatch,
    loadCharacter,
    refreshCredits,
    showToast,
    alertEditError,
  ]);

  const applyStagedTraits = useCallback(() => {
    if (pendingChanged.length === 0) return;
    if (pendingCost > credits) {
      Alert.alert(
        'Not enough credits',
        `You need ${formatCredits(pendingCost, 'sentence')} to apply these changes.`,
      );
      return;
    }
    Alert.alert(
      'Apply changes',
      `Apply ${pendingChanged.length} change${pendingChanged.length === 1 ? '' : 's'}${
        pendingCost > 0 ? ` · ${formatCredits(pendingCost)}` : ' · free'
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
      `Spend ${formatCredits(prices.rerollAllTraits, 'sentence')} for a fresh random set?`,
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
  }, [runEdit, prices.rerollAllTraits]);

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
          expanded={activeCategory === 'portrait'}
          onOpenViewer={() => setViewerOpen(true)}
          onGenerate={promptPortraitRender}
          onSeeNewLook={promptPortraitRender}
        />
        {stagedDiff.length === 0 && (
          <PortraitHistoryStrip
            entries={history}
            restoringId={restoringId}
            onRestore={runRestorePortrait}
          />
        )}
        {stagedDiff.length > 0 && (
          <StagedStrip
            diff={stagedDiff}
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
              cost={prices.battleCry}
              cooldownMs={cooldowns.battle_cry}
              busy={busyKey === 'battleCry'}
              onSave={(v) =>
                runEdit('battleCry', { battleCry: v }, 'Battle cry updated')
              }
            />
            <SignatureColorRow
              character={character}
              cost={prices.signatureColor}
              cooldownMs={cooldowns.signature_color}
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
            customCost={prices.customItemImage}
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
            swapCost={prices.swapTrait}
            rerollCost={prices.rerollAllTraits}
            paletteCooldownMs={cooldowns.palette}
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
              cost={prices.changeArtStyle}
              busy={busyKey === 'changeArtStyle'}
              onApply={(style) =>
                Alert.alert(
                  'Change art style',
                  `Re-render in ${ART_STYLE_LABELS[style]} for ${formatCredits(prices.changeArtStyle, 'sentence')}?`,
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
              cost={hasInitialPortraitSeed ? prices.regeneratePortrait : 0}
              actionLabel={
                hasInitialPortraitSeed ? 'Regenerate' : 'Generate portrait'
              }
              busy={busyKey === 'regeneratePortrait'}
              onPress={promptPortraitRender}
            />
            {/* Avatar: the head/bust render used in battle strips and rings.
                Separate from the fighter render above, which stays full-body
                for the reveal poster and the video reference. */}
            <View style={styles.avatarRow}>
              <PortraitPreview
                uri={avatarUrl ?? fallbackUri}
                variant="circle"
                size={72}
                loading={busyKey === 'regenerateAvatar'}
                accessibilityLabel="Character avatar"
              />
              <View style={styles.avatarCopy}>
                <Text style={[styles.avatarTitle, { color: colors.text }]}>
                  Avatar
                </Text>
                <Text
                  style={[styles.avatarSubtitle, { color: colors.textSecondary }]}
                >
                  {avatarUrl
                    ? 'Head-and-shoulders render used in battle strips.'
                    : 'No avatar yet — strips crop your full render instead.'}
                </Text>
              </View>
            </View>
            <ActionRow
              title={avatarUrl ? 'Regenerate avatar' : 'Generate avatar'}
              subtitle={
                avatarUrl
                  ? 'A fresh head-and-shoulders render.'
                  : 'Free — a portrait made for small contexts.'
              }
              cost={avatarUrl ? prices.regenerateAvatar : 0}
              actionLabel={avatarUrl ? 'Regenerate avatar' : 'Generate avatar'}
              busy={busyKey === 'regenerateAvatar'}
              onPress={promptAvatarRender}
            />
            <RePromptRow
              cost={prices.rePromptPortrait}
              busy={busyKey === 'rePromptPortrait'}
              onSave={(prompt) =>
                Alert.alert(
                  'Re-prompt portrait',
                  `Spend ${formatCredits(prices.rePromptPortrait, 'sentence')}?`,
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

      <PortraitViewer
        visible={viewerOpen}
        uri={portraitUrl}
        caption={character.name}
        onClose={() => setViewerOpen(false)}
      />
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
  expanded,
  onOpenViewer,
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
  /** True on the Portrait tab, where the render is the subject, not a label. */
  expanded: boolean;
  onOpenViewer: () => void;
  onGenerate: () => void;
  onSeeNewLook: () => void;
}) {
  const colors = useThemedColors();
  const costLabel = formatCredits(regenCost);
  // No portrait yet -> first render. Traits changed since the last render ->
  // nudge toward seeing them. Otherwise a plain re-roll.
  const ctaVerb = !hasPortrait
    ? 'Generate'
    : portraitStale
      ? 'See new look'
      : 'Regenerate';
  return (
    <View style={expanded ? styles.stageExpanded : styles.stage}>
      <TouchableOpacity
        onPress={onOpenViewer}
        disabled={!hasPortrait}
        accessibilityRole="button"
        accessibilityLabel="View portrait full screen"
      >
        <PortraitPreview
          uri={portraitUri}
          variant="fullBody"
          size={expanded ? 208 : 116}
          loading={portraitBusy}
        />
      </TouchableOpacity>
      <View style={expanded ? styles.stageMetaExpanded : styles.stageMeta}>
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
            StagedStrip below, so the Stage CTA only handles rendering.
            Otherwise there is ALWAYS a CTA here: the settled state used to
            fall through to null, which meant a player happy with their traits
            had no way to simply re-roll the render from anywhere on the
            screen. Only the wording changes with state. */}
        {hasStaged ? null : (
          <TouchableOpacity
            onPress={hasPortrait ? onSeeNewLook : onGenerate}
            accessibilityRole="button"
            accessibilityLabel={`${ctaVerb}, ${costLabel}`}
            style={[styles.stageCta, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="sparkles" size={13} color="#FFFFFF" />
            <Text style={styles.stageCtaText}>
              {ctaVerb} · {costLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StagedStrip — full-width summary of staged (not-yet-applied) trait changes
// ---------------------------------------------------------------------------

/**
 * A pointer to the staged changes, not a transaction.
 *
 * This and the apply bar at the bottom of the Traits panel both summarise the
 * same state at opposite ends of the screen. The strip used to show a price
 * too, which implied tapping it would charge -- it only navigates. The count,
 * the total and the irreversible tap all belong to the apply bar.
 */
function StagedStrip({
  diff,
  onReview,
}: {
  diff: { key: StageTraitKey; to: string }[];
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
        Review
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
  customCost,
  busy,
  onSelect,
}: {
  character: CharacterRow;
  customCost: number;
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
  const [creating, setCreating] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const list = await listSignatureItemsCatalog();
      setItems(list);
      setItemsError(null);
    } catch (err) {
      console.error('Failed to load signature items', err);
      // Inline, not an alert: an alert is dismissed and leaves an empty grid
      // with no explanation of why it is empty.
      setItemsError(describeEditError(err, 'Could not load items').message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await loadItems();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadItems]);

  // Custom items always get a generated icon -- an item with no art is a blank
  // tile in the grid, so the text-only tier is not offered. Price arrives from
  // `character_edit_prices`, not a local constant.

  // Every other paid action here confirms first. This one charged silently.
  const confirmCustom = () => {
    if (!customName.trim() || !customDesc.trim()) return;
    Alert.alert(
      'Create signature item',
      `Create this item with a generated icon for ${formatCredits(customCost, 'sentence')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Spend', style: 'destructive', onPress: submitCustom },
      ],
    );
  };

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
        generateIcon: true,
      });
      setCustomOpen(false);
      setCustomName('');
      setCustomDesc('');
      // The list is fetched once on mount; without this the item the player
      // just paid for would not appear until the screen was remounted.
      await loadItems();
      onSelect(item.id);
    } catch (err) {
      console.error('Failed to create custom signature item', {
        err,
        name,
        description: desc,
        itemClass: customClass,
        generateIcon: true,
      });
      const { title, message } = describeEditError(err, 'Could not create item');
      Alert.alert(title, message);
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

  const catalogItems = items.filter((i) => !i.isCustom);
  const customItems = items.filter((i) => i.isCustom);

  return (
    <ScrollView
      style={styles.panelScroll}
      contentContainerStyle={styles.panel}
      keyboardShouldPersistTaps="handled"
    >
      {itemsError ? (
        <View style={[styles.itemsError, { borderColor: colors.border }]}>
          <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
            {itemsError}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setItemsError(null);
              void loadItems();
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading items"
            style={[styles.secondaryBtn, { borderColor: colors.primary }]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={[styles.panelHint, { color: colors.textSecondary }]}>
        Free swap from catalog
      </Text>
      <ItemGrid
        items={catalogItems.slice(0, 15)}
        selectedId={character.signature_item_id ?? undefined}
        onSelect={(id) => !busy && onSelect(id)}
        // The tile belongs with "Your items" once that section exists, so it
        // sits here only while the player has none.
        onCreateCustom={
          customItems.length === 0 ? () => setCustomOpen(true) : undefined
        }
      />
      {customItems.length > 0 && (
        <>
          <Text style={[styles.panelHint, { color: colors.textSecondary }]}>
            Your items
          </Text>
          <ItemGrid
            items={customItems}
            selectedId={character.signature_item_id ?? undefined}
            onSelect={(id) => !busy && onSelect(id)}
            onCreateCustom={() => setCustomOpen(true)}
          />
        </>
      )}
      <Modal
        visible={customOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCustomOpen(false)}
      >
        <View style={styles.sheetBackdrop} accessibilityViewIsModal>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setCustomOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Create a signature item
              </Text>
              <TouchableOpacity
                onPress={() => setCustomOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
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
          <Text style={[styles.panelHint, { color: colors.textTertiary }]}>
            {`Includes a generated icon · ${formatCredits(customCost, 'sentence')}`}
          </Text>
          <TouchableOpacity
            onPress={confirmCustom}
            disabled={creating || !customName.trim() || !customDesc.trim()}
            accessibilityRole="button"
            accessibilityLabel={`Save custom item for ${formatCredits(customCost, 'sentence')}`}
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              (creating || !customName.trim() || !customDesc.trim()) &&
                styles.btnDisabled,
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {creating ? 'Saving…' : `Save · ${formatCredits(customCost)}`}
            </Text>
          </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function TraitsPanel({
  character,
  swapCost,
  rerollCost,
  paletteCooldownMs,
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
  swapCost: number;
  rerollCost: number;
  paletteCooldownMs?: number;
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
            costLabel={formatCredits(swapCost)}
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
            Randomize all ({formatCredits(rerollCost)})
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
                ? `Need ${formatCredits(pendingCost, 'sentence')}`
                : formatCredits(pendingCost)}
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
  // Cooldowns here run from 24 hours to 14 days, so hours-and-minutes alone
  // produced things like "312h 0m".
  const totalMinutes = Math.max(0, Math.ceil(ms / (60 * 1000)));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
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
  // While a cooldown is running the action cannot succeed, so the badge shows
  // the wait instead of a price and the controls stop taking taps. Previously
  // this prop was never passed and the player learned about the block only by
  // tapping and receiving a server error.
  const cooling = typeof cooldownMs === 'number' && cooldownMs > 0;
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
              {
                color: cooling
                  ? colors.warning
                  : cost === 0
                    ? colors.success
                    : colors.primary,
              },
            ]}
          >
            {cooling ? formatCooldown(cooldownMs) : formatCredits(cost)}
          </Text>
        </View>
      </View>
      {cooling ? (
        <Text style={[styles.cooldown, { color: colors.warning }]}>
          Available in {formatCooldown(cooldownMs)}
        </Text>
      ) : null}
      <View
        pointerEvents={cooling ? 'none' : 'auto'}
        style={cooling ? styles.cooledDown : undefined}
      >
        {children}
      </View>
    </View>
  );
}

function BattleCryRow({
  character,
  cost,
  cooldownMs,
  busy,
  onSave,
}: {
  character: CharacterRow;
  cost: number;
  cooldownMs?: number;
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
      cost={cost}
      cooldownMs={cooldownMs}
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
  cost,
  cooldownMs,
  busy,
  onSave,
}: {
  character: CharacterRow;
  cost: number;
  cooldownMs?: number;
  busy: boolean;
  onSave: (v: PaletteKey) => void;
}) {
  const colors = useThemedColors();
  return (
    <CardShell
      title="Signature color"
      subtitle="Free · 24h cooldown"
      cost={cost}
      cooldownMs={cooldownMs}
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
  actionLabel,
  cooldownMs,
  busy,
  onPress,
}: {
  title: string;
  subtitle?: string;
  cost: number;
  /**
   * The verb on the button. Every action used to read "Continue" -- a
   * navigation word on a control that spends currency, telling the player
   * neither what happens nor what it costs.
   */
  actionLabel: string;
  cooldownMs?: number;
  busy: boolean;
  onPress: () => void;
}) {
  const colors = useThemedColors();
  const priced = cost > 0;
  const label = priced ? `${actionLabel} · ${formatCredits(cost)}` : actionLabel;
  return (
    <CardShell
      title={title}
      subtitle={subtitle}
      cost={cost}
      cooldownMs={cooldownMs}
    >
      <TouchableOpacity
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={
          priced
            ? `${actionLabel}, ${formatCredits(cost, 'sentence')}`
            : `${actionLabel}, free`
        }
        style={[
          styles.primaryBtn,
          { backgroundColor: colors.primary },
          busy && styles.btnDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryBtnText}>{label}</Text>
        )}
      </TouchableOpacity>
    </CardShell>
  );
}

function ArtStyleRow({
  currentStyle,
  cost,
  busy,
  onApply,
}: {
  currentStyle: ArtStyle;
  cost: number;
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
      cost={cost}
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
  cost,
  busy,
  onSave,
}: {
  cost: number;
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
      cost={cost}
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
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  avatarCopy: { flex: 1 },
  avatarTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  avatarSubtitle: { fontSize: Typography.sizes.xs, marginTop: 2 },
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
  // On the Portrait tab the render is the subject of the screen, so it gets
  // real size and the metadata sits under it rather than beside it.
  stageExpanded: {
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  stageMetaExpanded: {
    alignItems: 'center',
    marginTop: Spacing.md,
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
  cooledDown: { opacity: 0.45 },
  itemsError: {
    gap: Spacing.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  // The form used to render inline after the grid inside the same ScrollView,
  // with no scroll-into-view, so opening it stranded the player mid-list with
  // a screenful of dead space above the fields.
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(6,6,9,0.6)',
  },
  sheet: {
    padding: Spacing.lg,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
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
