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
  type DraftKey,
} from '@/hooks/useCharacterEditDraft';
import { describeEditError } from '@/utils/editErrors';
import { fetchEditPricing, type EditPricing } from '@/utils/editCooldowns';
import { formatCredits } from '@/utils/credits';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { supabase } from '@/utils/supabase';
import {
  editCharacter,
  generatePortrait,
  renderLook,
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
  ART_STYLE_LABELS,
  type PaletteKey,
  type ArtStyle,
  type ItemClass,
  type Vibe,
  type Silhouette,
  type Era,
  type Expression,
} from '@/constants/CharacterTraits';
import { ARCHETYPES, type ArchetypeId } from '@/constants/Archetypes';
import {
  SegmentedCategoryBar,
  PortraitViewer,
  PortraitHistoryStrip,
  Toast,
  CreditChip,
  InlineBanner,
  CharacterHero,
  IdentityPanel,
  LookPanel,
  GearPanel,
  SaveBar,
  CustomItemSheet,
} from '@/components';

type Category = 'identity' | 'look' | 'gear';

const CATEGORIES: {
  key: Category;
  label: string;
  icon: 'person-outline' | 'color-palette-outline' | 'cube-outline';
}[] = [
  { key: 'identity', label: 'Identity', icon: 'person-outline' },
  { key: 'look', label: 'Look', icon: 'color-palette-outline' },
  { key: 'gear', label: 'Gear', icon: 'cube-outline' },
];

const EMPTY_PRICING: EditPricing = { prices: {}, cooldownMs: {} };

interface CharacterRow {
  id: string;
  name: string;
  archetype: ArchetypeId;
  battle_cry: string;
  signature_color: string;
  signature_item_id: string;
  portrait_id: string | null;
  avatar_portrait_id: string | null;
  portrait_seed: number | null;
  vibe: Vibe | null;
  silhouette: Silhouette | null;
  palette_key: PaletteKey | null;
  era: Era | null;
  expression: Expression | null;
  art_style: ArtStyle | null;
  portrait_prompt_raw: string | null;
  appearance_version: number | null;
  last_edited_at: string | null;
}

const CHARACTER_COLUMNS =
  'id,name,archetype,battle_cry,signature_color,signature_item_id,portrait_id,avatar_portrait_id,portrait_seed,vibe,silhouette,palette_key,era,expression,art_style,portrait_prompt_raw,appearance_version,last_edited_at';

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
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>('identity');
  const [pricing, setPricing] = useState<EditPricing>(EMPTY_PRICING);
  // Until live prices arrive, or if they cannot be read, the paid actions stay
  // disabled rather than quoting a constant the server may not agree with.
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

  const itemName = useCallback(
    (id: string) => items.find((i) => i.id === id)?.name ?? 'that item',
    [items],
  );

  const draft = useCharacterEditDraft(
    character as unknown as Record<string, unknown> | null,
    pricing,
    itemName,
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
    const row = data as
      | { image_path: string; appearance_version: number | null }
      | null;
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
   * Compares appearance versions rather than timestamps: `last_edited_at` is
   * touched by any column change, so it once reported a stale portrait after a
   * battle-cry typo fix. A render with no stamped version predates the column
   * and is treated as current rather than as a reason to charge for a new one.
   */
  const portraitStale = useMemo(() => {
    if (!character || portraitVersion == null) return false;
    return (character.appearance_version ?? 0) > portraitVersion;
  }, [character, portraitVersion]);

  const renderCost = pricing.prices.render_look?.credits ?? 0;
  const randomCost = pricing.prices.random_character?.credits ?? 0;
  const editingDisabled = battleLocked;

  /** Saved values with anything staged laid over the top. */
  const stagedLook = useMemo(() => {
    if (!character) return null;
    const v = draft.values;
    const pick = <T,>(key: DraftKey, saved: T) =>
      (key in v ? (v[key] as unknown as T) : saved);
    return {
      artStyle: pick<ArtStyle>('artStyle', character.art_style ?? 'painterly'),
      palette: pick<PaletteKey | null>('palette', character.palette_key),
      vibe: pick<string | null>('vibe', character.vibe),
      silhouette: pick<string | null>('silhouette', character.silhouette),
      era: pick<string | null>('era', character.era),
      expression: pick<string | null>('expression', character.expression),
      portraitPromptRaw: pick<string | null>(
        'portraitPromptRaw',
        character.portrait_prompt_raw,
      ),
    };
  }, [character, draft.values]);

  const changedKeys = useMemo(
    () => new Set(draft.changes.map((c) => c.key as string)),
    [draft.changes],
  );

  const stagedItemId =
    (draft.values.signatureItemId as string | undefined) ??
    character?.signature_item_id ??
    '';

  // --- Mutations -----------------------------------------------------------

  const afterEdit = useCallback(async () => {
    await loadCharacter();
    await refreshCredits();
    await refreshLock();
  }, [loadCharacter, refreshCredits, refreshLock]);

  /** Commits the draft. Free, so the only risk is a cooldown rejection. */
  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!character || !draft.dirty) return true;
    const landed: string[] = [];
    try {
      if (draft.identityPayload) {
        await editCharacter({
          characterId: character.id,
          changes: { identity: draft.identityPayload },
        });
        landed.push('identity');
      }
      if (draft.lookPayload) {
        await editCharacter({
          characterId: character.id,
          changes: { look: draft.lookPayload },
        });
        landed.push('look');
      }
      draft.clear();
      return true;
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
      return false;
    }
  }, [character, draft, afterEdit, alertEditError]);

  const confirmSave = useCallback(() => {
    if (!draft.dirty) return;
    const lines = draft.changes.map((c) => `• ${c.label}: ${c.to}`);
    const locks = draft.changes
      .filter((c) => c.locksFor)
      .map((c) => `${c.label} locks for ${c.locksFor}`);
    Alert.alert(
      'Save changes',
      [lines.join('\n'), locks.join('. ')].filter(Boolean).join('\n\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async () => {
            setBusyKey('save');
            const ok = await saveDraft();
            if (ok) {
              await afterEdit();
              showToast('Changes saved · free');
            }
            setBusyKey(null);
          },
        },
      ],
    );
  }, [draft, saveDraft, afterEdit, showToast]);

  const runRender = useCallback(
    async (mode: 'render' | 'random') => {
      if (!character) return;
      setBusyKey('render');
      try {
        // Save first. Rendering a staged-but-unsaved look would draw the
        // character as it was BEFORE the edits, which reads as the render
        // having silently failed.
        if (mode === 'render' && draft.dirty) {
          const saved = await saveDraft();
          if (!saved) return;
        }
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
          if (mode === 'random') draft.clear();
          await renderLook({ characterId: character.id, mode });
          const spent = mode === 'random' ? randomCost : renderCost;
          showToast(
            `${mode === 'random' ? 'New character drawn' : 'New look drawn'} · ${formatCredits(spent, 'sentence')} spent`,
          );
        }
        await afterEdit();
      } catch (err) {
        console.error('Failed to render look', { characterId: character.id, mode, err });
        alertEditError(err, 'Could not render');
      } finally {
        setBusyKey(null);
      }
    },
    [character, draft, saveDraft, afterEdit, showToast, alertEditError, renderCost, randomCost],
  );

  const confirmRender = useCallback(() => {
    if (!character) return;
    if (character.portrait_seed === null) {
      void runRender('render');
      return;
    }
    Alert.alert(
      draft.dirty ? 'Save and render' : 'Render new look',
      `Draws your portrait and avatar for ${formatCredits(renderCost, 'sentence')}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Render', style: 'destructive', onPress: () => void runRender('render') },
      ],
    );
  }, [character, draft.dirty, renderCost, runRender]);

  const confirmRandom = useCallback(() => {
    Alert.alert(
      'Generate a random character',
      `Shuffles every trait and draws the result for ${formatCredits(randomCost, 'sentence')}.${
        draft.dirty ? ' Your staged changes will be discarded.' : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate', style: 'destructive', onPress: () => void runRender('random') },
      ],
    );
  }, [randomCost, draft.dirty, runRender]);

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
                // Staged like any other choice; the save bar commits it.
                draft.stage('signatureItemId', item.id);
                await refreshCredits();
                showToast(`Item created · ${formatCredits(cost, 'sentence')} spent`);
              } catch (err) {
                console.error('Failed to create custom signature item', { input, err });
                const { title, message } = describeEditError(err, 'Could not create item');
                Alert.alert(title, message);
              } finally {
                setBusyKey(null);
              }
            },
          },
        ],
      );
    },
    [pricing, loadItems, draft, refreshCredits, showToast],
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
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!character || !stagedLook) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.h1, { color: colors.text }]}>No character yet.</Text>
        <TouchableOpacity
          onPress={() => router.push('/(onboarding)/create-character')}
          accessibilityRole="button"
          accessibilityLabel="Create your character"
          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: Spacing.lg }]}
        >
          <Text style={styles.primaryBtnText}>Create your character</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const categoryItems = CATEGORIES.map((c) => ({
    ...c,
    badge: draft.dirtySections[c.key],
  }));

  const viewerUri = viewerPortraitId
    ? (history.find((h) => h.portraitId === viewerPortraitId)?.imageUrl ?? null)
    : portraitUrl;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerRight: () => <CreditChip credits={credits} /> }} />
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
          busy={busyKey === 'render'}
          hasPortrait={!!portraitUrl}
          portraitStale={portraitStale}
          renderCost={character.portrait_seed === null ? 0 : renderCost}
          hasUnsaved={draft.dirty}
          rendering={busyKey === 'render'}
          renderDisabled={editingDisabled || !pricingVerified}
          onRender={confirmRender}
          onOpenViewer={() => {
            setViewerPortraitId(null);
            setViewerOpen(true);
          }}
        />
        {history.length > 0 ? (
          <View style={styles.bannerWrap}>
            <PortraitHistoryStrip
              entries={history}
              restoringId={restoringId}
              onSelect={(id) => {
                setViewerPortraitId(id);
                setViewerOpen(true);
              }}
            />
          </View>
        ) : null}
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
            staged={draft.values}
            changedKeys={changedKeys}
            pricing={pricing}
            disabled={editingDisabled}
            onStage={draft.stage}
          />
        )}

        {activeCategory === 'look' && (
          <LookPanel
            look={stagedLook}
            changedKeys={changedKeys}
            randomCost={randomCost}
            disabled={editingDisabled || !pricingVerified}
            onStage={(key, value) => draft.stage(key as DraftKey, value)}
            onRandomCharacter={confirmRandom}
          />
        )}

        {activeCategory === 'gear' && (
          <GearPanel
            items={items}
            equippedId={stagedItemId}
            loading={itemsLoading}
            error={itemsError}
            customCost={pricing.prices.custom_item_image?.credits ?? 0}
            pricingVerified={pricingVerified}
            busy={busyKey === 'createItem'}
            disabled={editingDisabled}
            onRetry={() => {
              setItemsError(null);
              void loadItems();
            }}
            onEquip={(id) => draft.stage('signatureItemId', id)}
            onCreateCustom={() => setCustomOpen(true)}
          />
        )}
      </View>

      {draft.dirty && !editingDisabled ? (
        <SaveBar
          changeCount={draft.changeCount}
          busy={busyKey === 'save'}
          onSave={confirmSave}
          onClear={draft.clear}
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
  centered: { alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
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
