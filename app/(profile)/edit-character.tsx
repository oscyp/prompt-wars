import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useNavigation, Stack } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useCredits } from '@/hooks/useCredits';
import { useCharacterEditLock } from '@/hooks/useCharacterEditLock';
import {
  useCharacterEditDraft,
  type IdentityKey,
} from '@/hooks/useCharacterEditDraft';
import { describeEditError } from '@/utils/editErrors';
import { fetchEditPricing, type EditPricing } from '@/utils/editCooldowns';
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
  getPortraitFallbackUri,
  resolveSignatureHex,
  type PortraitHistoryEntry,
  type CatalogSignatureItem,
} from '@/utils/characters';
import {
  TRAIT_LABELS,
  PALETTE_HEX,
  type PaletteKey,
  type Vibe,
  type Silhouette,
  type Era,
  type Expression,
  type ArtStyle,
  type ItemClass,
  ART_STYLE_LABELS,
} from '@/constants/CharacterTraits';
import { ARCHETYPES, type ArchetypeId } from '@/constants/Archetypes';
import type { StageTraitKey } from '@/utils/characterEditPricing';
import {
  SegmentedCategoryBar,
  PortraitViewer,
  Toast,
  CreditChip,
  InlineBanner,
  CharacterHero,
  IdentityPanel,
  LookPanel,
  GearPanel,
  PortraitsPanel,
  SaveBar,
  CustomItemSheet,
} from '@/components';

type Category = 'identity' | 'look' | 'gear' | 'portraits';

const CATEGORIES: {
  key: Category;
  label: string;
  icon:
    | 'person-outline'
    | 'color-palette-outline'
    | 'cube-outline'
    | 'image-outline';
}[] = [
  { key: 'identity', label: 'Identity', icon: 'person-outline' },
  // "Look" over "Traits": this tab changes how the fighter is drawn, and
  // "trait" reads like a stat. "Gear" over "Item" for the same reason -- the
  // section holds a catalog, not a single field.
  { key: 'look', label: 'Look', icon: 'color-palette-outline' },
  { key: 'gear', label: 'Gear', icon: 'cube-outline' },
  { key: 'portraits', label: 'Portraits', icon: 'image-outline' },
];

const EMPTY_PRICING: EditPricing = { prices: {}, cooldownMs: {} };

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
  appearance_version: number | null;
  last_edited_at: string | null;
}

const CHARACTER_COLUMNS =
  'id,name,archetype,battle_cry,signature_color,signature_item_id,portrait_id,avatar_portrait_id,portrait_seed,vibe,silhouette,palette_key,era,expression,art_style,appearance_version,last_edited_at';

function traitLabel(key: StageTraitKey, value: string): string {
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

function identityLabel(key: IdentityKey, value: string): string {
  if (key === 'archetype') {
    return ARCHETYPES[value as ArchetypeId]?.name ?? value;
  }
  if (key === 'signatureColor') {
    const preset = Object.entries(PALETTE_HEX).find(
      ([, hex]) => hex.toLowerCase() === value.toLowerCase(),
    );
    return preset ? TRAIT_LABELS.palette[preset[0] as PaletteKey] : 'Custom';
  }
  return value;
}

export default function EditCharacterScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { credits, refresh: refreshCredits } = useCredits();

  const [character, setCharacter] = useState<CharacterRow | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitVersion, setPortraitVersion] = useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>('identity');
  const [pricing, setPricing] = useState<EditPricing>(EMPTY_PRICING);
  // Prices come from the database. Until they arrive, or if they cannot be
  // read, paid actions stay disabled rather than quoting a stale constant --
  // this screen used to promise a total from compile-time values while the
  // server charged something else.
  const [pricingVerified, setPricingVerified] = useState(false);
  const [history, setHistory] = useState<PortraitHistoryEntry[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [viewerPortraitId, setViewerPortraitId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [items, setItems] = useState<CatalogSignatureItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const { locked: battleLocked, refresh: refreshLock } = useCharacterEditLock(
    character?.id,
  );

  const draft = useCharacterEditDraft(
    character as unknown as Record<string, unknown> | null,
    pricing,
    useMemo(() => ({ traitLabel, identityLabel }), []),
  );

  const alertEditError = useCallback((err: unknown, fallbackTitle: string) => {
    const { title, message } = describeEditError(err, fallbackTitle);
    Alert.alert(title, message);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // --- Loading -------------------------------------------------------------

  const signPortrait = useCallback(async (portraitId: string) => {
    const { data } = await supabase
      .from('character_portraits')
      .select('image_path, appearance_version')
      .eq('id', portraitId)
      .maybeSingle();
    const row = data as {
      image_path: string;
      appearance_version: number | null;
    } | null;
    if (!row?.image_path) return { url: null, version: null };
    const { data: signed, error } = await supabase.storage
      .from('character-portraits')
      .createSignedUrl(row.image_path, 600);
    return {
      url: error ? null : (signed?.signedUrl ?? null),
      version: row.appearance_version,
    };
  }, []);

  const loadCharacter = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('characters')
        .select(CHARACTER_COLUMNS)
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as CharacterRow | null;
      setCharacter(row);

      if (row?.portrait_id) {
        const { url, version } = await signPortrait(row.portrait_id);
        setPortraitUrl(url);
        setPortraitVersion(version);
      } else {
        setPortraitUrl(null);
        setPortraitVersion(null);
      }

      if (row?.avatar_portrait_id) {
        const { url } = await signPortrait(row.avatar_portrait_id);
        setAvatarUrl(url);
      } else {
        setAvatarUrl(null);
      }
    } catch (err) {
      console.error('Failed to load character:', err);
      alertEditError(err, 'Could not load your character');
    } finally {
      setLoading(false);
    }
  }, [user, alertEditError, signPortrait]);

  useEffect(() => {
    void loadCharacter();
  }, [loadCharacter]);

  const loadPricing = useCallback(async (characterId: string) => {
    try {
      setPricing(await fetchEditPricing(characterId));
      setPricingVerified(true);
    } catch (err) {
      console.warn('Could not load live edit pricing', err);
      setPricingVerified(false);
    }
  }, []);

  useEffect(() => {
    if (character?.id) void loadPricing(character.id);
  }, [character?.id, character?.last_edited_at, loadPricing]);

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

  const loadItems = useCallback(async () => {
    try {
      setItems(await listSignatureItemsCatalog());
      setItemsError(null);
    } catch (err) {
      console.error('Failed to load signature items', err);
      setItemsError(describeEditError(err, 'Could not load items').message);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // --- Derived -------------------------------------------------------------

  const accentColor = useMemo(
    () => resolveSignatureHex(character?.signature_color),
    [character?.signature_color],
  );

  const fallbackUri = useMemo(() => {
    if (!character) return '';
    return getPortraitFallbackUri({
      archetype: character.archetype,
      signatureColor: character.signature_color,
    });
  }, [character]);

  /**
   * True when the live render predates the character's current look.
   *
   * Compares appearance versions rather than timestamps. The old check used
   * `last_edited_at`, which the database touches on ANY column change, so
   * renaming a fighter or fixing a typo in a battle cry produced a nudge to
   * spend a credit on a render that would have come back identical.
   *
   * A render with no stamped version predates the column; treat it as current
   * rather than inventing a reason to charge for a new one.
   */
  const portraitStale = useMemo(() => {
    if (!character || portraitVersion == null) return false;
    return (character.appearance_version ?? 0) > portraitVersion;
  }, [character, portraitVersion]);

  const editingDisabled = battleLocked;

  // --- Mutations -----------------------------------------------------------

  const afterEdit = useCallback(async () => {
    await loadCharacter();
    await refreshCredits();
    await refreshLock();
  }, [loadCharacter, refreshCredits, refreshLock]);

  const doSave = useCallback(async () => {
    if (!character) return;
    setBusyKey('save');
    const landed: string[] = [];
    try {
      if (draft.identityPayload) {
        await editCharacter({
          characterId: character.id,
          changes: { identity: draft.identityPayload },
        });
        landed.push('identity');
      }

      // Palette is free and lives on its own edit kind, so it is always applied
      // separately regardless of which route the paid traits take. It goes
      // LAST: palette carries a 24h cooldown, and running it first meant a
      // cooldown rejection aborted the whole apply before the paid traits were
      // ever sent. Paid work first, then the free extra.
      const paidTraits = draft.traitsChanged.filter((k) => k !== 'palette');
      const current = character as unknown as Record<string, string | null>;

      if (draft.traitsUseBatch) {
        // One charged call instead of N. Looping single swaps cost 1 credit
        // each, so four staged traits cost 4 where the batch costs 2 -- and a
        // mid-loop failure left the player charged for the swaps that landed.
        await editCharacter({
          characterId: character.id,
          changes: {
            setAllTraits: {
              vibe: draft.traits.vibe ?? current.vibe ?? '',
              silhouette: draft.traits.silhouette ?? current.silhouette ?? '',
              era: draft.traits.era ?? current.era ?? '',
              expression: draft.traits.expression ?? current.expression ?? '',
            },
          },
        });
        landed.push('traits');
      } else {
        for (const key of paidTraits) {
          const value = draft.traits[key];
          if (value == null) continue;
          await editCharacter({
            characterId: character.id,
            changes: { swapTrait: { key, value } },
          });
          landed.push(key);
        }
      }

      let paletteFailed = false;
      if (draft.traitsChanged.includes('palette') && draft.traits.palette) {
        try {
          await editCharacter({
            characterId: character.id,
            changes: {
              swapTrait: { key: 'palette', value: draft.traits.palette },
            },
          });
          landed.push('palette');
        } catch (paletteErr) {
          // The rest already landed, so this is not a failed save.
          paletteFailed = true;
          console.warn(
            'Palette change rejected after other edits applied',
            paletteErr,
          );
          const { message } = describeEditError(
            paletteErr,
            'Palette unchanged',
          );
          Alert.alert('Palette unchanged', message);
        }
      }

      draft.clear();
      await afterEdit();
      if (!paletteFailed) {
        showToast(
          draft.totalCost > 0
            ? `Changes saved · ${formatCredits(draft.totalCost, 'sentence')} spent`
            : 'Changes saved · free',
        );
      }
    } catch (err) {
      console.error('Failed to save character edits', { landed, err });
      await afterEdit();
      if (landed.length > 0) {
        // Naming what survived matters: a partial save otherwise leaves the
        // player unable to tell which half of their edit is now live.
        const { message } = describeEditError(err, 'Save failed');
        Alert.alert(
          'Only part of your changes saved',
          `${message}\n\nAlready saved: ${landed.join(', ')}.`,
        );
      } else {
        alertEditError(err, 'Save failed');
      }
    } finally {
      setBusyKey(null);
    }
  }, [character, draft, afterEdit, showToast, alertEditError]);

  const confirmSave = useCallback(() => {
    if (!draft.dirty) return;
    const lines = draft.changes.map((c) => `• ${c.label}: ${c.to}`);
    const locks = draft.changes
      .filter((c) => c.locksFor)
      .map((c) => `${c.label} locks for ${c.locksFor}`);
    const cost =
      draft.totalCost > 0 ? formatCredits(draft.totalCost, 'sentence') : 'Free';
    Alert.alert(
      'Save changes',
      [lines.join('\n'), `Cost: ${cost}`, locks.join('. ')]
        .filter(Boolean)
        .join('\n\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => void doSave() },
      ],
    );
  }, [draft, doSave]);

  const runPortraitRender = useCallback(async () => {
    if (!character) return;
    setBusyKey('renderPortrait');
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
        showToast('Portrait generated · free');
      } else {
        await regeneratePortrait({ characterId: character.id, paid: true });
        const spent = pricing.prices.regenerate_portrait?.credits ?? 0;
        showToast(
          `Portrait rendered · ${formatCredits(spent, 'sentence')} spent`,
        );
      }
      await afterEdit();
    } catch (err) {
      console.error('Failed to render portrait', {
        characterId: character.id,
        err,
      });
      alertEditError(err, 'Could not render portrait');
    } finally {
      setBusyKey(null);
    }
  }, [character, pricing, afterEdit, showToast, alertEditError]);

  const promptPortraitRender = useCallback(() => {
    if (!character) return;
    if (character.portrait_seed === null) {
      void runPortraitRender();
      return;
    }
    const cost = pricing.prices.regenerate_portrait?.credits ?? 0;
    Alert.alert(
      'Render your look',
      `Spend ${formatCredits(cost, 'sentence')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Spend',
          style: 'destructive',
          onPress: () => void runPortraitRender(),
        },
      ],
    );
  }, [character, pricing, runPortraitRender]);

  const runAvatarRender = useCallback(async () => {
    if (!character) return;
    setBusyKey('renderAvatar');
    try {
      await regeneratePortrait({ characterId: character.id, kind: 'avatar' });
      const spent = avatarUrl
        ? (pricing.prices.regenerate_avatar?.credits ?? 0)
        : 0;
      showToast(
        avatarUrl
          ? `Avatar rendered · ${formatCredits(spent, 'sentence')} spent`
          : 'Avatar created · free',
      );
      await afterEdit();
    } catch (err) {
      console.error('Failed to render avatar', {
        characterId: character.id,
        err,
      });
      alertEditError(err, 'Could not render avatar');
    } finally {
      setBusyKey(null);
    }
  }, [character, avatarUrl, pricing, afterEdit, showToast, alertEditError]);

  const promptAvatarRender = useCallback(() => {
    if (!avatarUrl) {
      void runAvatarRender();
      return;
    }
    const cost = pricing.prices.regenerate_avatar?.credits ?? 0;
    Alert.alert(
      'Regenerate avatar',
      `Spend ${formatCredits(cost, 'sentence')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Spend',
          style: 'destructive',
          onPress: () => void runAvatarRender(),
        },
      ],
    );
  }, [avatarUrl, pricing, runAvatarRender]);

  const runRegenerate = useCallback(
    async (
      key: string,
      payload: { artStyle?: ArtStyle; portraitPromptRaw?: string },
      successMsg: string,
    ) => {
      if (!character) return;
      setBusyKey(key);
      try {
        await regeneratePortrait({
          characterId: character.id,
          paid: true,
          ...payload,
        });
        const spent = pricing.prices.new_portrait?.credits ?? 0;
        showToast(`${successMsg} · ${formatCredits(spent, 'sentence')} spent`);
        await afterEdit();
      } catch (err) {
        console.error('Failed to re-render portrait', { key, payload, err });
        alertEditError(err, 'Could not render that');
      } finally {
        setBusyKey(null);
      }
    },
    [character, pricing, afterEdit, showToast, alertEditError],
  );

  const confirmArtStyle = useCallback(
    (style: ArtStyle) => {
      const cost = pricing.prices.new_portrait?.credits ?? 0;
      Alert.alert(
        'Change art style',
        `Re-render in ${ART_STYLE_LABELS[style]} for ${formatCredits(cost, 'sentence')}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Spend',
            style: 'destructive',
            onPress: () =>
              void runRegenerate(
                'changeArtStyle',
                { artStyle: style },
                'Style changed',
              ),
          },
        ],
      );
    },
    [pricing, runRegenerate],
  );

  const confirmDescribeNew = useCallback(
    (prompt: string) => {
      if (!prompt) return;
      const cost = pricing.prices.new_portrait?.credits ?? 0;
      Alert.alert(
        'Render this description',
        `Spend ${formatCredits(cost, 'sentence')}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Spend',
            style: 'destructive',
            onPress: () =>
              void runRegenerate(
                'describeNew',
                { portraitPromptRaw: prompt },
                'Portrait rendered',
              ),
          },
        ],
      );
    },
    [pricing, runRegenerate],
  );

  const confirmRandomize = useCallback(() => {
    if (!character) return;
    const cost = pricing.prices.traits_full_reroll?.credits ?? 0;
    Alert.alert(
      'Randomize traits',
      `Spend ${formatCredits(cost, 'sentence')} for a fresh random set? This does not include a new portrait render.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Randomize',
          style: 'destructive',
          onPress: async () => {
            draft.clear();
            setBusyKey('randomize');
            try {
              await editCharacter({
                characterId: character.id,
                changes: { rerollAllTraits: true },
              });
              showToast(
                `Traits rerolled · ${formatCredits(cost, 'sentence')} spent`,
              );
              await afterEdit();
            } catch (err) {
              console.error('Failed to reroll traits', err);
              alertEditError(err, 'Could not randomize traits');
            } finally {
              setBusyKey(null);
            }
          },
        },
      ],
    );
  }, [character, pricing, draft, afterEdit, showToast, alertEditError]);

  const runEquip = useCallback(
    async (itemId: string | null) => {
      if (!character) return;
      setBusyKey('equip');
      try {
        await editCharacter({
          characterId: character.id,
          changes: { signatureItemId: itemId },
        });
        showToast(itemId ? 'Item equipped · free' : 'Item unequipped · free');
        await afterEdit();
      } catch (err) {
        console.error('Failed to equip signature item', { itemId, err });
        alertEditError(err, 'Could not equip that item');
      } finally {
        setBusyKey(null);
      }
    },
    [character, afterEdit, showToast, alertEditError],
  );

  const submitCustomItem = useCallback(
    (input: { name: string; description: string; itemClass: ItemClass }) => {
      const cost = pricing.prices.custom_item_image?.credits ?? 0;
      Alert.alert(
        'Create signature item',
        `Create this item with a generated icon for ${formatCredits(cost, 'sentence')}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Spend',
            style: 'destructive',
            onPress: async () => {
              setBusyKey('createItem');
              try {
                const item = await createCustomSignatureItem({
                  ...input,
                  generateIcon: true,
                });
                setCustomOpen(false);
                await loadItems();
                await runEquip(item.id);
              } catch (err) {
                console.error('Failed to create custom signature item', {
                  input,
                  err,
                });
                const { title, message } = describeEditError(
                  err,
                  'Could not create item',
                );
                Alert.alert(title, message);
              } finally {
                setBusyKey(null);
              }
            },
          },
        ],
      );
    },
    [pricing, loadItems, runEquip],
  );

  const runRestore = useCallback(
    async (portraitId: string) => {
      if (!character) return;
      setRestoringId(portraitId);
      try {
        await restorePortrait({ characterId: character.id, portraitId });
        setViewerOpen(false);
        setViewerPortraitId(null);
        showToast('Earlier render restored · free');
        await afterEdit();
      } catch (err) {
        console.error('Failed to restore portrait', { portraitId, err });
        alertEditError(err, 'Could not restore that render');
      } finally {
        setRestoringId(null);
      }
    },
    [character, afterEdit, showToast, alertEditError],
  );

  // --- Leave guard ---------------------------------------------------------

  // Staged edits live only in memory, so leaving used to discard them with no
  // warning -- including the ones the player had spent a while composing.
  usePreventRemove(draft.dirty && busyKey === null, ({ data }) => {
    Alert.alert(
      'Discard changes?',
      `You have ${draft.changeCount} unsaved change${draft.changeCount === 1 ? '' : 's'}.`,
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            draft.clear();
            navigation.dispatch(data.action);
          },
        },
      ],
    );
  });

  // --- Render --------------------------------------------------------------

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
          accessibilityLabel="Create your character"
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
    badge:
      (c.key === 'identity' && draft.identityDirty) ||
      (c.key === 'look' && draft.lookDirty),
  }));

  const viewerUri = viewerPortraitId
    ? (history.find((h) => h.portraitId === viewerPortraitId)?.imageUrl ?? null)
    : portraitUrl;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{ headerRight: () => <CreditChip credits={credits} /> }}
      />
      <View style={[styles.top, { paddingTop: insets.top + 44 }]}>
        {battleLocked ? (
          <View style={styles.bannerWrap}>
            <InlineBanner
              tone="warning"
              text="Editing is unavailable while this fighter is in an active battle."
            />
          </View>
        ) : null}
        {!pricingVerified ? (
          <View style={styles.bannerWrap}>
            <InlineBanner
              tone="error"
              text="Couldn't check credit prices, so paid actions are paused."
              actionLabel="Retry"
              onAction={() => void loadPricing(character.id)}
            />
          </View>
        ) : null}
        <CharacterHero
          name={character.name}
          subtitle={`${ARCHETYPES[character.archetype]?.name ?? character.archetype} · ${ART_STYLE_LABELS[character.art_style ?? 'painterly']}`}
          portraitUri={portraitUrl ?? fallbackUri}
          accentColor={accentColor}
          busy={busyKey === 'renderPortrait'}
          hasPortrait={!!portraitUrl}
          portraitStale={portraitStale}
          onOpenViewer={() => {
            setViewerPortraitId(null);
            setViewerOpen(true);
          }}
        />
        <View style={styles.tabs}>
          <SegmentedCategoryBar
            items={categoryItems}
            value={activeCategory}
            onChange={(k) => setActiveCategory(k as Category)}
          />
        </View>
      </View>

      <View style={styles.dock}>
        {activeCategory === 'identity' && (
          <IdentityPanel
            character={character}
            staged={draft.identity}
            changed={draft.identityChanged}
            pricing={pricing}
            disabled={editingDisabled}
            onStage={draft.stageIdentity}
          />
        )}

        {activeCategory === 'look' && (
          <LookPanel
            character={character as unknown as Record<string, unknown>}
            staged={draft.traits}
            changed={draft.traitsChanged}
            pricing={pricing}
            pricingVerified={pricingVerified}
            disabled={editingDisabled}
            busy={busyKey !== null}
            onStage={draft.stageTrait}
            onRandomize={confirmRandomize}
          />
        )}

        {activeCategory === 'gear' && (
          <GearPanel
            items={items}
            equippedId={character.signature_item_id}
            loading={itemsLoading}
            error={itemsError}
            customCost={pricing.prices.custom_item_image?.credits ?? 0}
            pricingVerified={pricingVerified}
            busy={busyKey === 'equip' || busyKey === 'createItem'}
            disabled={editingDisabled}
            onRetry={() => {
              setItemsError(null);
              void loadItems();
            }}
            onEquip={runEquip}
            onCreateCustom={() => setCustomOpen(true)}
          />
        )}

        {activeCategory === 'portraits' && (
          <PortraitsPanel
            portraitUri={portraitUrl ?? fallbackUri}
            avatarUri={avatarUrl ?? fallbackUri}
            accentColor={accentColor}
            hasPortrait={!!portraitUrl}
            hasAvatar={!!avatarUrl}
            hasPortraitSeed={character.portrait_seed !== null}
            portraitStale={portraitStale}
            artStyle={character.art_style ?? 'painterly'}
            pricing={pricing}
            pricingVerified={pricingVerified}
            history={history}
            restoringId={restoringId}
            busyKey={busyKey}
            disabled={editingDisabled}
            onRenderPortrait={promptPortraitRender}
            onRenderAvatar={promptAvatarRender}
            onChangeArtStyle={confirmArtStyle}
            onDescribeNew={confirmDescribeNew}
            onPreviewHistory={(id) => {
              setViewerPortraitId(id);
              setViewerOpen(true);
            }}
            onOpenViewer={() => {
              setViewerPortraitId(null);
              setViewerOpen(true);
            }}
          />
        )}
      </View>

      {draft.dirty && !editingDisabled ? (
        <SaveBar
          changeCount={draft.changeCount}
          cost={draft.totalCost}
          credits={credits}
          busy={busyKey === 'save'}
          onSave={confirmSave}
          onClear={draft.clear}
          onGetCredits={() => router.push('/(profile)/wallet')}
        />
      ) : null}

      <PortraitViewer
        visible={viewerOpen}
        uri={viewerUri}
        caption={character.name}
        onClose={() => {
          setViewerOpen(false);
          setViewerPortraitId(null);
        }}
        footerAction={
          viewerPortraitId
            ? {
                label: 'Restore this render · Free',
                busy: restoringId === viewerPortraitId,
                disabled: editingDisabled,
                onPress: () => void runRestore(viewerPortraitId),
              }
            : undefined
        }
      />

      <CustomItemSheet
        visible={customOpen}
        cost={pricing.prices.custom_item_image?.credits ?? 0}
        busy={busyKey === 'createItem'}
        onClose={() => setCustomOpen(false)}
        onSubmit={submitCustomItem}
      />

      {toast && <Toast text={toast} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  top: { paddingBottom: Spacing.md, gap: Spacing.md },
  bannerWrap: { paddingHorizontal: Spacing.lg },
  tabs: { paddingHorizontal: Spacing.lg },
  dock: { flex: 1 },
  h1: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
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
});
