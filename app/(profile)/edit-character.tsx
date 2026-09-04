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
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useRouter, useNavigation, Stack } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImpactFeedbackStyle } from 'expo-haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useCredits } from '@/hooks/useCredits';
import { useCharacterEditLock } from '@/hooks/useCharacterEditLock';
import {
  useCharacterEditDraft,
  type DraftKey,
} from '@/hooks/useCharacterEditDraft';
import { describeEditError, EditError } from '@/utils/editErrors';
import { fetchEditPricing, type EditPricing } from '@/utils/editCooldowns';
import { formatCredits } from '@/utils/credits';
import {
  saveConfirmCopy,
  renderConfirmCopy,
  randomConfirmCopy,
  topUpCopy,
  discardDraftCopy,
  renderButtonCopy,
  randomButtonCopy,
  renderingCaption,
  RENDER_EXPECTED_DURATION,
  type RenderPhase,
  type SheetCopy,
} from '@/utils/editDialogCopy';
import { changedSinceRender } from '@/utils/lookDiff';
import {
  hapticSelection,
  hapticImpact,
  hapticWarning,
  hapticError,
} from '@/utils/haptics';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { supabase } from '@/utils/supabase';
import {
  editCharacter,
  generatePortrait,
  renderLook,
  retryAvatar,
  awaitAvatarJob,
  loadPortraitRef,
  listSignatureItemsCatalog,
  listPortraitHistory,
  restorePortrait,
  getPortraitFallbackUri,
  resolveSignatureHex,
  type PortraitHistoryEntry,
  type CatalogSignatureItem,
  type PortraitJobResult,
  type PortraitPromptSnapshot,
} from '@/utils/characters';
import {
  ART_STYLE_LABELS,
  type PaletteKey,
  type ArtStyle,
  type Vibe,
  type Silhouette,
  type Era,
  type Expression,
} from '@/constants/CharacterTraits';
import type { ArchetypeId } from '@/constants/Archetypes';
import {
  listCosmetics,
  unlockedColorSwatches,
  resolveEquippedCosmetics,
  type CosmeticConfig,
} from '@/utils/cosmetics';
import type { ColorSwatchOption } from '@/components/ColorSwatchGrid';
import {
  SegmentedCategoryBar,
  PortraitViewer,
  Toast,
  CreditChip,
  ConfirmSheet,
  CharacterHero,
  StageExpanded,
  CollapsingStage,
  ArchetypeChip,
  ArchetypeSheet,
  IdentityPanel,
  LookPanel,
  GearPanel,
  SaveBar,
} from '@/components';
import RenderRevealSheet, {
  type RevealAvatar,
} from '@/components/RenderRevealSheet';
import {
  mergeEditNotices,
  compactStatusLabel,
} from '@/components/edit-character/editNotices';
import {
  fighterHeight as computeFighterHeight,
  estimateMetrics,
  type StageMetrics,
} from '@/components/edit-character/stageMath';

type Category = 'identity' | 'look' | 'gear';

const CATEGORIES: {
  key: Category;
  label: string;
  icon: 'person-outline' | 'color-palette-outline' | 'cube-outline';
}[] = [
  // "Fighter", not "Identity": who you are in battle (name, class, cry,
  // colour). "Identity" read as account settings.
  { key: 'identity', label: 'Fighter', icon: 'person-outline' },
  { key: 'look', label: 'Look', icon: 'color-palette-outline' },
  { key: 'gear', label: 'Gear', icon: 'cube-outline' },
];

const EMPTY_PRICING: EditPricing = { prices: {}, cooldownMs: {} };

/** SaveBar's height without the safe-area inset (SaveBar.tsx padding + row). */
const SAVE_BAR_BASE_HEIGHT = 76;

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
  cosmetic_config: CosmeticConfig | null;
}

const CHARACTER_COLUMNS =
  'id,name,archetype,battle_cry,signature_color,signature_item_id,portrait_id,avatar_portrait_id,portrait_seed,vibe,silhouette,palette_key,era,expression,art_style,portrait_prompt_raw,appearance_version,last_edited_at,cosmetic_config';

type SheetState =
  | null
  | { kind: 'save' }
  | { kind: 'render' }
  | { kind: 'random' }
  | { kind: 'topUp'; price: number };

interface RevealState {
  fighterUri: string;
  avatar: RevealAvatar;
  mode: 'render' | 'random';
  creditsSpent: number;
  previousFighterId: string | null;
  previousAvatarId: string | null;
}

export default function EditCharacterScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();
  const {
    credits,
    loading: creditsLoading,
    refresh: refreshCredits,
  } = useCredits();

  // Captured once: Android's `resize` keyboard mode shrinks the window while
  // typing, and the fighter must not resize under the player's thumb.
  const windowHeightRef = useRef(useWindowDimensions().height);

  const [character, setCharacter] = useState<CharacterRow | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitVersion, setPortraitVersion] = useState<number | null>(null);
  const [portraitSnapshot, setPortraitSnapshot] =
    useState<PortraitPromptSnapshot | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<
    'save' | 'render' | 'restore' | 'retryAvatar' | null
  >(null);
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
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  // Signature colours the player has bought. Owning one unlocks the swatch; it
  // never applies itself (see IdentityPanel).
  const [unlockedColors, setUnlockedColors] = useState<ColorSwatchOption[]>([]);

  const [sheet, setSheet] = useState<SheetState>(null);
  const [renderPhase, setRenderPhase] = useState<RenderPhase | null>(null);
  const [renderStartedAt, setRenderStartedAt] = useState<number | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  // Sticks after a render whose avatar leg failed, until a retry lands.
  const [avatarNeedsRetry, setAvatarNeedsRetry] = useState(false);

  const [metrics, setMetrics] = useState<StageMetrics | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const {
    locked: battleLocked,
    activeBattleCount,
    primaryBattleRoute,
    refresh: refreshLock,
  } = useCharacterEditLock(character?.id);

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

  const goToWallet = useCallback(() => {
    hapticWarning();
    router.push('/(profile)/wallet');
  }, [router]);

  // --- Loading -------------------------------------------------------------

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

      const [fighter, avatar] = await Promise.all([
        row?.portrait_id ? loadPortraitRef(row.portrait_id) : null,
        row?.avatar_portrait_id
          ? loadPortraitRef(row.avatar_portrait_id)
          : null,
      ]);
      setPortraitUrl(fighter?.url ?? null);
      setPortraitVersion(fighter?.appearanceVersion ?? null);
      setPortraitSnapshot(fighter?.snapshot ?? null);
      setAvatarUrl(avatar?.url ?? null);
      setAvatarVersion(avatar?.appearanceVersion ?? null);
    } catch (err) {
      console.error('Failed to load character:', err);
      alertEditError(err, 'Could not load your character');
    } finally {
      setLoading(false);
    }
  }, [user, alertEditError]);

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

  useEffect(() => {
    let active = true;
    void listCosmetics().then((catalog) => {
      if (active && catalog?.items) {
        setUnlockedColors(unlockedColorSwatches(catalog.items));
      }
    });
    return () => {
      active = false;
    };
  }, []);

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

  const cosmetics = useMemo(
    () => resolveEquippedCosmetics(character?.cosmetic_config),
    [character?.cosmetic_config],
  );

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

  const changedFields = useMemo(
    () =>
      portraitStale && character
        ? changedSinceRender(
            character as unknown as Record<string, unknown>,
            portraitSnapshot,
          )
        : [],
    [portraitStale, character, portraitSnapshot],
  );

  const renderCost = pricing.prices.render_look?.credits ?? 0;
  const randomCost = pricing.prices.random_character?.credits ?? 0;
  const editingDisabled = battleLocked;
  const balance = creditsLoading ? null : credits;
  const canRetryAvatar = Boolean(pricing.prices.avatar_retry);
  const hasRender =
    character?.portrait_seed !== null && character?.portrait_seed !== undefined;

  /** No avatar, or one drawn for an earlier look than the fighter. */
  const avatarPending = useMemo(() => {
    if (!character || !character.portrait_id) return false;
    if (avatarNeedsRetry) return true;
    if (!character.avatar_portrait_id) return true;
    if (
      avatarVersion !== null &&
      portraitVersion !== null &&
      avatarVersion < portraitVersion
    ) {
      return true;
    }
    return false;
  }, [character, avatarNeedsRetry, avatarVersion, portraitVersion]);

  /** Saved values with anything staged laid over the top. */
  const stagedLook = useMemo(() => {
    if (!character) return null;
    const v = draft.values;
    const pick = <T,>(key: DraftKey, saved: T) =>
      key in v ? (v[key] as unknown as T) : saved;
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

  const stagedArchetype =
    (draft.values.archetype as ArchetypeId | undefined) ??
    character?.archetype ??
    'strategist';
  const archetypeLocked = (pricing.cooldownMs.archetype ?? 0) > 0;

  const renderButton = useMemo(
    () =>
      renderButtonCopy({
        dirty: draft.dirty,
        price: renderCost,
        balance,
        hasPortrait: hasRender,
        pricingVerified,
        locked: editingDisabled,
      }),
    [
      draft.dirty,
      renderCost,
      balance,
      hasRender,
      pricingVerified,
      editingDisabled,
    ],
  );

  const randomButton = useMemo(
    () =>
      randomButtonCopy({
        price: randomCost,
        balance,
        pricingVerified,
        locked: editingDisabled,
      }),
    [randomCost, balance, pricingVerified, editingDisabled],
  );

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
      // Two calls, not one: the Edge Function accepts a single edit kind per
      // request, so identity and look cannot travel together.
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

  const runSave = useCallback(async () => {
    setBusyKey('save');
    try {
      const ok = await saveDraft();
      if (ok) {
        await afterEdit();
        showToast('Changes saved · free');
      }
    } finally {
      setBusyKey(null);
    }
  }, [saveDraft, afterEdit, showToast]);

  /**
   * Avatar state for a server too old to report it: read the reloaded row and
   * compare the avatar's stamped version with the fighter's.
   */
  const readAvatarState = useCallback(
    async (
      characterId: string,
      fighterVersion: number,
    ): Promise<RevealAvatar> => {
      const { data } = await supabase
        .from('characters')
        .select('avatar_portrait_id')
        .eq('id', characterId)
        .maybeSingle();
      const id =
        (data as { avatar_portrait_id: string | null } | null)
          ?.avatar_portrait_id ?? null;
      if (!id) return { status: 'failed' };
      const ref = await loadPortraitRef(id);
      if (!ref.url) return { status: 'failed' };
      if (
        ref.appearanceVersion !== null &&
        ref.appearanceVersion < fighterVersion
      ) {
        return { status: 'failed' };
      }
      return { status: 'ready', uri: ref.url };
    },
    [],
  );

  const runRender = useCallback(
    async (mode: 'render' | 'random') => {
      if (!character) return;
      const firstRender = character.portrait_seed === null;
      const cost = firstRender
        ? 0
        : mode === 'random'
          ? randomCost
          : renderCost;
      const previousFighterId = character.portrait_id;
      const previousAvatarId = character.avatar_portrait_id;
      const fighterVersion = character.appearance_version ?? 0;

      setBusyKey('render');
      setRenderStartedAt(Date.now());
      try {
        // Save first. Rendering a staged-but-unsaved look would draw the
        // character as it was BEFORE the edits, which reads as the render
        // having silently failed.
        if (mode === 'render' && draft.dirty) {
          setRenderPhase('saving');
          const saved = await saveDraft();
          if (!saved) return;
        }
        setRenderPhase('fighter');

        let result: PortraitJobResult;
        if (firstRender) {
          result = await generatePortrait({
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
        } else {
          result = await renderLook({ characterId: character.id, mode });
        }
        // The staged draft goes only once the shuffle has actually landed.
        if (mode === 'random') draft.clear();

        let avatar: RevealAvatar = result.avatarImageUrl
          ? { status: 'ready', uri: result.avatarImageUrl }
          : result.avatarJobId
            ? { status: 'pending' }
            : result.avatarPending === true
              ? { status: 'failed' }
              : { status: 'pending' };

        setReveal({
          fighterUri: result.imageUrl,
          avatar,
          mode,
          creditsSpent: result.creditsSpent ?? cost,
          previousFighterId,
          previousAvatarId,
        });
        await afterEdit();

        if (avatar.status === 'pending') {
          if (result.avatarJobId) {
            setRenderPhase('avatar');
            void awaitAvatarJob(result.avatarJobId)
              .then((a) => {
                setReveal((r) =>
                  r
                    ? { ...r, avatar: { status: 'ready', uri: a.imageUrl } }
                    : r,
                );
              })
              .catch(() => {
                setReveal((r) =>
                  r ? { ...r, avatar: { status: 'failed' } } : r,
                );
                setAvatarNeedsRetry(true);
              });
          } else {
            avatar = await readAvatarState(character.id, fighterVersion);
            setReveal((r) => (r ? { ...r, avatar } : r));
            if (avatar.status === 'failed') setAvatarNeedsRetry(true);
          }
        } else if (avatar.status === 'failed') {
          setAvatarNeedsRetry(true);
        }
      } catch (err) {
        console.error('Failed to render look', {
          characterId: character.id,
          mode,
          err,
        });
        hapticError();
        if (err instanceof EditError && err.code === 'timeout') {
          // The charge and the render may both have landed; say so rather
          // than reporting a failure over a portrait that is about to appear.
          await afterEdit();
          showToast('Still drawing — your new look will appear when it lands.');
        } else if (
          err instanceof EditError &&
          err.code === 'insufficient_credits'
        ) {
          setSheet({ kind: 'topUp', price: err.price ?? cost });
        } else {
          alertEditError(err, 'Could not draw');
        }
      } finally {
        setBusyKey(null);
        setRenderPhase(null);
        setRenderStartedAt(null);
      }
    },
    [
      character,
      draft,
      saveDraft,
      afterEdit,
      showToast,
      alertEditError,
      renderCost,
      randomCost,
      readAvatarState,
    ],
  );

  const onRenderPress = useCallback(() => {
    if (!character) return;
    switch (renderButton.intent) {
      case 'topUp':
        goToWallet();
        return;
      case 'render':
        if (character.portrait_seed === null) {
          // The first portrait is free and needs no confirmation.
          void runRender('render');
          return;
        }
        hapticSelection();
        setSheet({ kind: 'render' });
        return;
      default:
        return;
    }
  }, [character, renderButton.intent, goToWallet, runRender]);

  const onRandomPress = useCallback(() => {
    switch (randomButton.intent) {
      case 'topUp':
        goToWallet();
        return;
      case 'render':
        hapticSelection();
        setSheet({ kind: 'random' });
        return;
      default:
        return;
    }
  }, [randomButton.intent, goToWallet]);

  const onSavePress = useCallback(() => {
    if (!draft.dirty) return;
    hapticSelection();
    setSheet({ kind: 'save' });
  }, [draft.dirty]);

  const onClearPress = useCallback(() => {
    hapticWarning();
    draft.clear();
  }, [draft]);

  const onSheetConfirm = useCallback(() => {
    if (!sheet) return;
    const current = sheet;
    setSheet(null);
    switch (current.kind) {
      case 'save':
        hapticImpact(ImpactFeedbackStyle.Heavy);
        void runSave();
        return;
      case 'render':
        hapticImpact(ImpactFeedbackStyle.Heavy);
        void runRender('render');
        return;
      case 'random':
        hapticImpact(ImpactFeedbackStyle.Heavy);
        void runRender('random');
        return;
      case 'topUp':
        router.push('/(profile)/wallet');
        return;
    }
  }, [sheet, runSave, runRender, router]);

  const sheetCopy = useMemo<SheetCopy | null>(() => {
    if (!sheet) return null;
    switch (sheet.kind) {
      case 'save':
        return saveConfirmCopy({ changes: draft.changes });
      case 'render':
        return renderConfirmCopy({
          price: renderCost,
          balance,
          changes: draft.changes,
        });
      case 'random':
        return randomConfirmCopy({
          price: randomCost,
          balance,
          changes: draft.changes,
        });
      case 'topUp':
        return topUpCopy({ price: sheet.price, balance });
    }
  }, [sheet, draft.changes, renderCost, randomCost, balance]);

  const runRestore = useCallback(
    async (portraitId: string, fallbackAvatarId?: string | null) => {
      if (!character) return;
      setRestoringId(portraitId);
      setBusyKey('restore');
      try {
        const result = await restorePortrait({
          characterId: character.id,
          portraitId,
          fallbackAvatarId,
        });
        setViewerOpen(false);
        setViewerPortraitId(null);
        setReveal(null);
        showToast(
          result.avatarRestored || !fallbackAvatarId
            ? 'Previous look restored · free'
            : 'Previous fighter restored · avatar unchanged',
        );
        await afterEdit();
      } catch (err) {
        console.error('Failed to restore portrait', { portraitId, err });
        alertEditError(err, 'Could not restore that render');
      } finally {
        setRestoringId(null);
        setBusyKey(null);
      }
    },
    [character, afterEdit, showToast, alertEditError],
  );

  const runRetryAvatar = useCallback(async () => {
    if (!character || !canRetryAvatar) return;
    setBusyKey('retryAvatar');
    try {
      const result = await retryAvatar({ characterId: character.id });
      if (result.avatarImageUrl) {
        const uri = result.avatarImageUrl;
        setReveal((r) => (r ? { ...r, avatar: { status: 'ready', uri } } : r));
      }
      setAvatarNeedsRetry(false);
      showToast('Avatar drawn · free');
      await afterEdit();
    } catch (err) {
      console.error('Failed to retry avatar', {
        characterId: character.id,
        err,
      });
      hapticError();
      alertEditError(err, 'Could not draw the avatar');
    } finally {
      setBusyKey(null);
    }
  }, [character, canRetryAvatar, showToast, afterEdit, alertEditError]);

  const onKeep = useCallback(() => {
    if (!reveal) return;
    hapticSelection();
    const spent =
      reveal.creditsSpent > 0
        ? ` · ${formatCredits(reveal.creditsSpent, 'sentence')} spent`
        : ' · free';
    showToast(
      `${reveal.mode === 'random' ? 'New character kept' : 'New look kept'}${spent}`,
    );
    setReveal(null);
  }, [reveal, showToast]);

  // --- Leave guard ---------------------------------------------------------

  usePreventRemove(draft.dirty && busyKey === null, ({ data }) => {
    const copy = discardDraftCopy(draft.changeCount);
    Alert.alert(copy.title, copy.message, [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: copy.confirmLabel,
        style: 'destructive',
        onPress: () => {
          hapticWarning();
          draft.clear();
          navigation.dispatch(data.action);
        },
      },
    ]);
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

  if (!character || !stagedLook) {
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

  const notice = mergeEditNotices({
    battleLocked,
    activeBattleCount,
    pricingVerified,
    avatarPending,
    canRetryAvatar,
    onRetryPricing: () => void loadPricing(character.id),
    onRetryAvatar: () => void runRetryAvatar(),
    onManageBattles: () => router.push(primaryBattleRoute ?? '/(tabs)/battles'),
  });
  const statusLabel = compactStatusLabel({
    battleLocked,
    pricingVerified,
    avatarPending,
  });
  const compactStatus = battleLocked
    ? `View only · Manage ${Math.max(1, activeBattleCount)} ${activeBattleCount === 1 ? 'battle' : 'battles'}`
    : statusLabel;

  const fighterHeight = computeFighterHeight({
    windowHeight: windowHeightRef.current,
    headerHeight,
    saveBarHeight: insets.bottom + SAVE_BAR_BASE_HEIGHT,
    hasNotice: notice !== null,
    isStale: portraitStale,
  });
  const initialMetrics = estimateMetrics({
    headerHeight,
    fighterHeight,
    hasNotice: notice !== null,
    isStale: portraitStale,
  });
  const liveMetrics = metrics ?? initialMetrics;

  const categoryItems = CATEGORIES.map((c) => ({
    ...c,
    badge: draft.dirtySections[c.key],
  }));

  // The archetype has its own chip under the name, so the subtitle carries
  // only the art style.
  const subtitle = `${ART_STYLE_LABELS[character.art_style ?? 'painterly']} style`;
  const fighterUri = portraitUrl ?? fallbackUri;
  const rendering = busyKey === 'render';

  const openArchetype = () => {
    hapticSelection();
    setArchetypeOpen(true);
  };
  const archetypeChipProps = {
    archetype: stagedArchetype,
    staged: changedKeys.has('archetype'),
    locked: archetypeLocked,
    onPress: openArchetype,
  };

  const viewerUri = viewerPortraitId
    ? (history.find((h) => h.portraitId === viewerPortraitId)?.imageUrl ?? null)
    : portraitUrl;

  const openViewer = () => {
    setViewerPortraitId(null);
    setViewerOpen(true);
  };

  const panel =
    activeCategory === 'identity' ? (
      <IdentityPanel
        character={character}
        staged={draft.values}
        changedKeys={changedKeys}
        pricing={pricing}
        disabled={editingDisabled}
        unlockedColors={unlockedColors}
        onStage={draft.stage}
      />
    ) : activeCategory === 'look' ? (
      <LookPanel
        look={stagedLook}
        changedKeys={changedKeys}
        disabled={editingDisabled}
        onStage={(key, value) => draft.stage(key as DraftKey, value)}
      />
    ) : (
      <GearPanel
        items={items}
        equippedId={stagedItemId}
        loading={itemsLoading}
        error={itemsError}
        disabled={editingDisabled}
        disabledReason={`View only while this fighter is in ${Math.max(1, activeBattleCount)} active ${activeBattleCount === 1 ? 'battle' : 'battles'}.`}
        disabledActionLabel={`Manage ${Math.max(1, activeBattleCount)} ${activeBattleCount === 1 ? 'battle' : 'battles'}`}
        onDisabledAction={() =>
          router.push(primaryBattleRoute ?? '/(tabs)/battles')
        }
        onRetry={() => {
          setItemsError(null);
          void loadItems();
        }}
        onEquip={(id) => draft.stage('signatureItemId', id)}
      />
    );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{ headerRight: () => <CreditChip credits={credits} /> }}
      />

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingTop: liveMetrics.expandedHeight }}
        scrollIndicatorInsets={{ top: liveMetrics.compactHeight }}
        onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
        style={styles.scroll}
      >
        {/* Keeps the collapsed offset reachable on every tab, so switching
            from a long panel to a short one does not bounce the Stage open. */}
        <View
          style={{
            minHeight: Math.max(0, viewportHeight - liveMetrics.compactHeight),
          }}
        >
          {panel}
        </View>
      </Animated.ScrollView>

      <CollapsingStage
        scrollY={scrollY}
        headerHeight={headerHeight}
        backgroundColor={colors.background}
        onMetrics={setMetrics}
        initialMetrics={initialMetrics}
        expanded={
          <StageExpanded
            name={character.name}
            subtitle={subtitle}
            archetypeChip={
              <ArchetypeChip variant="stage" {...archetypeChipProps} />
            }
            fighterUri={fighterUri}
            avatarUri={avatarUrl ?? fighterUri}
            hasPortrait={!!portraitUrl}
            accentColor={accentColor}
            cosmetics={cosmetics}
            fighterHeight={fighterHeight}
            busy={rendering}
            portraitStale={portraitStale}
            changedFields={changedFields}
            notice={notice}
            history={history}
            restoringId={restoringId}
            renderButton={renderButton}
            randomButton={randomButton}
            rendering={rendering}
            renderPhase={renderPhase}
            renderStartedAt={renderStartedAt}
            renderExpectedCopy={RENDER_EXPECTED_DURATION}
            renderingCaption={renderingCaption(stagedLook as never)}
            onRender={onRenderPress}
            onRandom={onRandomPress}
            onOpenViewer={openViewer}
            onSelectHistory={(id) => {
              setViewerPortraitId(id);
              setViewerOpen(true);
            }}
          />
        }
        compact={
          <CharacterHero
            name={character.name}
            subtitle={subtitle}
            archetypeChip={
              <ArchetypeChip variant="compact" {...archetypeChipProps} />
            }
            portraitUri={fighterUri}
            accentColor={accentColor}
            busy={rendering}
            hasPortrait={!!portraitUrl}
            portraitStale={portraitStale}
            changedFields={changedFields}
            cosmetics={cosmetics}
            renderButton={renderButton}
            randomButton={randomButton}
            rendering={rendering}
            statusLabel={compactStatus}
            onStatusPress={
              battleLocked
                ? () => router.push(primaryBattleRoute ?? '/(tabs)/battles')
                : !pricingVerified
                  ? () => void loadPricing(character.id)
                  : avatarPending && canRetryAvatar
                    ? () => void runRetryAvatar()
                    : undefined
            }
            onRender={onRenderPress}
            onRandom={onRandomPress}
            onOpenViewer={openViewer}
          />
        }
        tabBar={
          <SegmentedCategoryBar
            items={categoryItems}
            value={activeCategory}
            onChange={(k) => setActiveCategory(k as Category)}
          />
        }
      />

      {draft.dirty && !editingDisabled ? (
        <SaveBar
          changeCount={draft.changeCount}
          busy={busyKey === 'save'}
          onSave={onSavePress}
          onClear={onClearPress}
        />
      ) : null}

      {sheetCopy ? (
        <ConfirmSheet
          visible={sheet !== null}
          {...sheetCopy}
          thumbnailUri={sheet?.kind === 'render' ? portraitUrl : undefined}
          accentColor={accentColor}
          onConfirm={onSheetConfirm}
          onCancel={() => setSheet(null)}
        />
      ) : null}

      <RenderRevealSheet
        visible={reveal !== null}
        characterName={character.name}
        accentColor={accentColor}
        fighterUri={reveal?.fighterUri ?? null}
        avatar={reveal?.avatar ?? { status: 'pending' }}
        mode={reveal?.mode ?? 'render'}
        creditsSpent={reveal?.creditsSpent ?? 0}
        canRetryAvatar={canRetryAvatar}
        retryingAvatar={busyKey === 'retryAvatar'}
        canRestorePrevious={Boolean(reveal?.previousFighterId)}
        restoring={busyKey === 'restore'}
        onKeep={onKeep}
        onRestorePrevious={() => {
          if (reveal?.previousFighterId) {
            void runRestore(reveal.previousFighterId, reveal.previousAvatarId);
          }
        }}
        onRetryAvatar={() => void runRetryAvatar()}
      />

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

      <ArchetypeSheet
        visible={archetypeOpen}
        value={stagedArchetype}
        savedValue={character.archetype}
        pricing={pricing}
        disabled={editingDisabled}
        onStage={(id) => draft.stage('archetype', id)}
        onClose={() => setArchetypeOpen(false)}
      />

      {toast && <Toast text={toast} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
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
