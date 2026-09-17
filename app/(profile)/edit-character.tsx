import {
  EditorPreview,
  EditorTabs,
  EditorFooter,
} from '@/components/edit-character/EditorChrome';
import BottomSheet from '@/components/sheets/BottomSheet';
import FighterCard from '@/components/game/FighterCard';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';
import {
  useSheetReturnFocus,
  type SheetFocusRef,
} from '@/hooks/useSheetReturnFocus';
import { GameButton } from '@/components/game';
import { GameText } from '@/components/game';
import { loadEquippedSignatureItem } from '@/utils/equippedSignatureItem';
import { usePortraitOperationRecovery } from '@/hooks/usePortraitOperationRecovery';
import { useInitialPortraitRecovery } from '@/hooks/useInitialPortraitRecovery';
import CharacterRespec from '@/components/CharacterRespec';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  AppState,
  TextInput,
  findNodeHandle,
  Image,
} from 'react-native';
import {
  useRouter,
  useNavigation,
  Stack,
  useLocalSearchParams,
  useFocusEffect,
} from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImpactFeedbackStyle } from 'expo-haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useCredits } from '@/hooks/useCredits';
import { useCharacterEditLock } from '@/hooks/useCharacterEditLock';
import {
  useCharacterEditDraft,
  DRAFT_FIELDS,
  type DraftKey,
  type DraftSection,
} from '@/hooks/useCharacterEditDraft';
import { describeEditError, EditError } from '@/utils/editErrors';
import { fetchEditPricing, type EditPricing } from '@/utils/editCooldowns';
import { formatCredits } from '@/utils/credits';
import {
  saveConfirmCopy,
  renderConfirmCopy,
  randomConfirmCopy,
  topUpCopy,
  renderButtonCopy,
  randomButtonCopy,
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
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import { supabase } from '@/utils/supabase';
import {
  editCharacter,
  generatePortrait,
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
  Toast,
  CreditChip,
  ConfirmSheet,
  IdentityPanel,
  LookPanel,
  GearPanel,
} from '@/components';
import RenderRevealSheet, {
  type RevealAvatar,
} from '@/components/RenderRevealSheet';
type Category = DraftSection;
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
  cosmetic_config: CosmeticConfig | null;
  starter_asset_key: string | null;
  draft_portrait_renders: number;
}

const CHARACTER_COLUMNS =
  'id,name,archetype,battle_cry,signature_color,signature_item_id,portrait_id,avatar_portrait_id,portrait_seed,vibe,silhouette,palette_key,era,expression,art_style,portrait_prompt_raw,appearance_version,last_edited_at,cosmetic_config,starter_asset_key,draft_portrait_renders';

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
  const { user } = useAuth();
  return <CharacterEditor key={user?.id ?? 'signed-out'} />;
}
function CharacterEditor() {
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ section?: string; focus?: string }>();
  const { user } = useAuth();
  const {
    credits,
    loading: creditsLoading,
    refresh: refreshCredits,
  } = useCredits();

  const window = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollPosition = useRef(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const panelOffset = useRef(0);
  const colorOffset = useRef<number | null>(null);
  const colorFocused = useRef(false);
  const entryApplied = useRef<string | null>(null);
  const currentAccount = useRef(user?.id);
  currentAccount.current = user?.id;
  useEffect(
    () => () => {
      currentAccount.current = undefined;
    },
    [],
  );
  const characterRef = useRef<CharacterRow | null>(null);
  const lastLoad = useRef(0);
  const [allowRemove, setAllowRemove] = useState(false);
  const mutationBusy = useRef(false);
  const battleLockRef = useRef(false);
  const pendingNavigation = useRef<
    Parameters<typeof navigation.dispatch>[0] | null
  >(null);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const [character, setCharacter] = useState<CharacterRow | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitVersion, setPortraitVersion] = useState<number | null>(null);
  const [portraitSnapshot, setPortraitSnapshot] =
    useState<PortraitPromptSnapshot | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [artLoadError, setArtLoadError] = useState(false);
  const [busyKey, setBusyKey] = useState<
    'save' | 'render' | 'restore' | 'retryAvatar' | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pricing, setPricing] = useState<EditPricing>(EMPTY_PRICING);
  // Until live prices arrive, or if they cannot be read, the paid actions stay
  // disabled rather than quoting a constant the server may not agree with.
  const [pricingVerified, setPricingVerified] = useState(false);
  const [history, setHistory] = useState<PortraitHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [viewerPortraitId, setViewerPortraitId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [items, setItems] = useState<CatalogSignatureItem[]>([]);
  const [currentItem, setCurrentItem] = useState<CatalogSignatureItem | null>(
    null,
  );
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  // Signature colours the player has bought. Owning one unlocks the swatch; it
  // never applies itself (see IdentityPanel).
  const [unlockedColors, setUnlockedColors] = useState<ColorSwatchOption[]>([]);

  const walletFocusRef = useRef<View>(null);
  const compactHistoryRef = useRef<View>(null);
  const { remember: rememberSheetOpener, returnFocusRef: sheetReturnFocusRef } =
    useSheetReturnFocus(walletFocusRef);
  const {
    remember: rememberRenderOpener,
    returnFocusRef: renderReturnFocusRef,
  } = useSheetReturnFocus(walletFocusRef);
  const {
    remember: rememberPortraitOpener,
    returnFocusRef: portraitReturnFocusRef,
  } = useSheetReturnFocus(walletFocusRef);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  // Sticks after a render whose avatar leg failed, until a retry lands.
  const [avatarNeedsRetry, setAvatarNeedsRetry] = useState(false);

  const {
    locked: battleLocked,
    activeBattleCount,
    primaryBattleRoute,
    refresh: refreshLock,
  } = useCharacterEditLock(character?.id);

  battleLockRef.current = battleLocked;
  const itemName = useCallback(
    (id: string) =>
      items.find((i) => i.id === id)?.name ??
      (currentItem?.id === id ? currentItem.name : 'that item'),
    [items, currentItem],
  );

  const draft = useCharacterEditDraft(
    character as unknown as Record<string, unknown> | null,
    pricing,
    itemName,
    { accountId: user?.id, characterId: character?.id, initialSection: 'look' },
  );
  const activeCategory = draft.section;
  const entrySection: Category =
    params.section === 'fighter'
      ? 'identity'
      : params.section === 'gear'
        ? 'gear'
        : 'look';
  useEffect(() => {
    if (!draft.ready || !character) return;
    const entry = [character.id, params.section, params.focus].join(':');
    if (entryApplied.current === entry) return;
    entryApplied.current = entry;
    draft.setSection(
      params.focus === 'signature-color' ? 'identity' : entrySection,
    );
    if (params.section || params.focus) {
      setHistoryOpen(false);
      setViewerOpen(false);
      setSheet(null);
      const section =
        params.focus === 'signature-color' ? 'identity' : entrySection;
      draft.setSection(section);
      draft.setScrollPosition(section, 0);
      colorFocused.current = false;
    }
  }, [
    draft.ready,
    character,
    params.section,
    params.focus,
    entrySection,
    draft,
  ]);
  const positionsRef = useRef(draft.scrollPositions);
  positionsRef.current = draft.scrollPositions;
  useEffect(() => {
    if (!draft.ready) return;
    const id = requestAnimationFrame(() => {
      const position = positionsRef.current[activeCategory] ?? 0;
      scrollPosition.current = position;
      scrollRef.current?.scrollTo({ y: position, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [activeCategory, draft.ready]);
  const setActiveCategory = (section: Category) => {
    draft.setScrollPosition(activeCategory, scrollPosition.current);
    Keyboard.dismiss();
    draft.setSection(section);
  };

  const alertEditError = useCallback((err: unknown, fallbackTitle: string) => {
    const { title, message } = describeEditError(err, fallbackTitle);
    Alert.alert(title, message);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const navigateWithDraft = useCallback(
    (action: () => void) => {
      if (!character) {
        action();
        return;
      }
      draft.setScrollPosition(activeCategory, scrollPosition.current);
      void draft
        .flush()
        .then(action)
        .catch(() =>
          Alert.alert(
            'Draft not saved on this device',
            'Keep editing and retry, or explicitly discard this draft to leave.',
            [
              { text: 'Keep editing', style: 'cancel' },
              {
                text: 'Discard and leave',
                style: 'destructive',
                onPress: () =>
                  void draft
                    .discard()
                    .then(action)
                    .catch(() => undefined),
              },
            ],
          ),
        );
    },
    [character, draft, activeCategory],
  );
  const goToWallet = useCallback(() => {
    hapticWarning();
    navigateWithDraft(() => router.push('/(profile)/wallet'));
  }, [router, navigateWithDraft]);

  // --- Loading -------------------------------------------------------------

  const loadCharacter = useCallback(
    async (initial = false) => {
      if (!user) return;
      const accountId = user.id;
      const loadId = ++lastLoad.current;
      if (initial) setLoading(true);
      setLoadError(false);
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
        if (currentAccount.current !== accountId || loadId !== lastLoad.current)
          return;
        const previous = characterRef.current;
        characterRef.current = row;
        setCharacter(row);

        const [fighter, avatar] = await Promise.all([
          row?.portrait_id ? loadPortraitRef(row.portrait_id) : null,
          row?.avatar_portrait_id
            ? loadPortraitRef(row.avatar_portrait_id)
            : null,
        ]);
        if (currentAccount.current !== accountId || loadId !== lastLoad.current)
          return;
        setPortraitUrl(
          (known) =>
            fighter?.url ??
            (previous?.portrait_id === row?.portrait_id ? known : null),
        );
        setPortraitVersion(
          (known) =>
            fighter?.appearanceVersion ??
            (previous?.portrait_id === row?.portrait_id ? known : null),
        );
        setPortraitSnapshot(
          (known) =>
            fighter?.snapshot ??
            (previous?.portrait_id === row?.portrait_id ? known : null),
        );
        setAvatarUrl(
          (known) =>
            avatar?.url ??
            (previous?.avatar_portrait_id === row?.avatar_portrait_id
              ? known
              : null),
        );
        setAvatarVersion(
          (known) =>
            avatar?.appearanceVersion ??
            (previous?.avatar_portrait_id === row?.avatar_portrait_id
              ? known
              : null),
        );
      } catch (err) {
        if (currentAccount.current !== accountId || loadId !== lastLoad.current)
          return;
        setLoadError(true);
        console.error('Failed to load character:', err);
      } finally {
        if (currentAccount.current === accountId && loadId === lastLoad.current)
          setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    setCharacter(null);
    characterRef.current = null;
    setPortraitUrl(null);
    setAvatarUrl(null);
    void loadCharacter(true);
  }, [loadCharacter]);

  const loadPricing = useCallback(async (characterId: string) => {
    try {
      const accountId = currentAccount.current;
      const next = await fetchEditPricing(characterId);
      if (
        accountId !== currentAccount.current ||
        characterRef.current?.id !== characterId
      )
        return;
      setPricing(next);
      setPricingVerified(true);
    } catch (err) {
      console.warn('Could not load live edit pricing', err);
      if (characterRef.current?.id === characterId) setPricingVerified(false);
    }
  }, []);

  useEffect(() => {
    if (character?.id) void loadPricing(character.id);
  }, [character?.id, character?.last_edited_at, loadPricing]);

  const loadHistory = useCallback(async () => {
    if (!character?.id) return;
    const accountId = user?.id;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const entries = await listPortraitHistory(character.id);
      if (currentAccount.current === accountId) setHistory(entries);
    } catch {
      if (currentAccount.current === accountId)
        setHistoryError('Could not load previous looks. Retry.');
    } finally {
      if (currentAccount.current === accountId) setHistoryLoading(false);
    }
  }, [character?.id, user?.id]);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory, character?.portrait_id]);

  const loadItems = useCallback(async () => {
    const accountId = currentAccount.current;
    setItemsLoading(true);
    try {
      const next = await listSignatureItemsCatalog();
      if (currentAccount.current !== accountId) return;
      setItems(next);
      setItemsError(null);
    } catch (err) {
      console.error('Failed to load signature items', err);
      if (currentAccount.current === accountId)
        setItemsError(describeEditError(err, 'Could not load items').message);
    } finally {
      if (currentAccount.current === accountId) setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (character?.id && user?.id)
      void loadEquippedSignatureItem(character.id, user.id)
        .then((item) => {
          if (active) setCurrentItem(item);
        })
        .catch(() => {
          if (active)
            setItemsError('Could not refresh your current item. Retry.');
        });
    return () => {
      active = false;
    };
  }, [character?.id, character?.signature_item_id, user?.id, items]);
  useEffect(() => {
    void loadItems();
  }, [loadItems, user?.id]);

  useEffect(() => {
    let active = true;
    setUnlockedColors([]);
    void listCosmetics()
      .then((catalog) => {
        if (active && catalog?.items) {
          setUnlockedColors(unlockedColorSwatches(catalog.items));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user?.id]);

  // --- Derived -------------------------------------------------------------

  const accentColor = useMemo(
    () =>
      resolveSignatureHex(
        (draft.values.signatureColor as string) ?? character?.signature_color,
      ),
    [character?.signature_color, draft.values.signatureColor],
  );

  const fallbackUri = useMemo(() => {
    if (!character) return '';
    if (character.starter_asset_key?.startsWith('bundled:')) {
      const bundled = archetypeIllustrationUri(
        character.starter_asset_key.slice('bundled:'.length),
      );
      if (bundled) return bundled;
    }
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

  const refreshEditorRef = useRef<() => void>(() => undefined);
  const leaveEditorRef = useRef<() => void>(() => undefined);
  refreshEditorRef.current = () => {
    if (!characterRef.current) return;
    void loadCharacter();
    void refreshCredits();
    void refreshLock();
    void loadPricing(characterRef.current.id);
    void loadHistory();
  };
  leaveEditorRef.current = () => {
    if (!characterRef.current) return;
    draft.setScrollPosition(activeCategory, scrollPosition.current);
    void draft.flush().catch(() => undefined);
  };
  useFocusEffect(
    useCallback(() => {
      setAllowRemove(false);
      refreshEditorRef.current();
      return () => leaveEditorRef.current();
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshEditorRef.current();
      else leaveEditorRef.current();
    });
    return () => sub.remove();
  }, []);

  const afterEdit = useCallback(async () => {
    const accountId = user?.id;
    if (!accountId || currentAccount.current !== accountId) return;
    await loadCharacter();
    if (currentAccount.current !== accountId) return;
    await refreshCredits();
    await refreshLock();
  }, [loadCharacter, refreshCredits, refreshLock, user?.id]);

  const initialRecovery = useInitialPortraitRecovery(
    character?.id ?? null,
    afterEdit,
  );

  const {
    blocked: initialRecoveryBlocked,
    runOrRecover: recoverOrRun,
    refresh: refreshInitialRecovery,
  } = initialRecovery;

  const paidRecovery = usePortraitOperationRecovery(
    user?.id ?? null,
    character?.id ?? null,
  );
  const handledPaidResult = useRef<string | null>(null);
  const paidSettlementRef = useRef<() => Promise<void>>(async () => undefined);
  paidSettlementRef.current = async () => {
    const operation = paidRecovery.operation,
      result = paidRecovery.result;
    if (
      !operation ||
      !result ||
      operation.status !== 'succeeded' ||
      !draft.ready
    )
      return;
    if (handledPaidResult.current === operation.requestKey) {
      setReveal((current) =>
        current
          ? {
              ...current,
              fighterUri: result.imageUrl,
              avatar: result.avatarImageUrl
                ? { status: 'ready', uri: result.avatarImageUrl }
                : current.avatar,
            }
          : current,
      );
      return;
    }
    handledPaidResult.current = operation.requestKey;
    try {
      await afterEdit();
      if (currentAccount.current !== operation.accountId) return;
      if (operation.mode === 'random') await draft.discard();
      setReveal({
        fighterUri: result.imageUrl,
        avatar: result.avatarImageUrl
          ? { status: 'ready', uri: result.avatarImageUrl }
          : { status: 'failed' },
        mode: operation.mode,
        creditsSpent: result.creditsSpent ?? operation.creditsSpent ?? 0,
        previousFighterId: operation.previousFighterId ?? null,
        previousAvatarId: operation.previousAvatarId ?? null,
      });
      setAvatarNeedsRetry(!result.avatarImageUrl);
    } catch {
      handledPaidResult.current = null;
      showToast(
        'Your drawing finished. Retry saving the local draft before continuing.',
      );
    }
  };
  useEffect(() => {
    void paidSettlementRef.current();
  }, [paidRecovery.operation, paidRecovery.result, draft.ready]);

  const initialPortraitsLeft = character?.starter_asset_key
    ? Math.max(0, 3 - character.draft_portrait_renders)
    : character?.portrait_seed === null
      ? 1
      : 0;
  const renderCost =
    initialPortraitsLeft > 0 ? 0 : (pricing.prices.render_look?.credits ?? 0);
  const randomCost = pricing.prices.random_character?.credits ?? 0;
  const cooldownChanges = draft.changes.filter((change) => {
    const field = DRAFT_FIELDS.find((f) => f.key === change.key);
    return field?.priceKey && (pricing.cooldownMs[field.priceKey] ?? 0) > 0;
  });
  const saveBlocked =
    !!draft.conflicts.length ||
    !!cooldownChanges.length ||
    (!!draft.identityPayload && !pricingVerified);
  const editingDisabled =
    battleLocked || busyKey !== null || !draft.ready || paidRecovery.blocked;
  const resultMutationDisabled =
    battleLocked ||
    busyKey !== null ||
    !draft.ready ||
    paidRecovery.loading ||
    paidRecovery.checking ||
    paidRecovery.dispatching ||
    paidRecovery.operation?.status === 'pending';
  const balance = creditsLoading ? null : credits;
  const canRetryAvatar = Boolean(pricing.prices.avatar_retry);

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

  const renderButton = useMemo(
    () =>
      initialRecoveryBlocked
        ? {
            label:
              initialRecovery.loading || initialRecovery.checking
                ? 'Checking render…'
                : 'Check render',
            accessibilityLabel: 'Check your previous initial portrait render',
            intent:
              initialRecovery.loading || initialRecovery.checking
                ? ('disabled' as const)
                : ('render' as const),
          }
        : initialPortraitsLeft > 0
          ? {
              label: `Draw portrait · Free (${initialPortraitsLeft} left)`,
              accessibilityLabel: `Draw portrait free. ${initialPortraitsLeft} initial portraits remaining.`,
              intent: editingDisabled
                ? ('disabled' as const)
                : ('render' as const),
            }
          : renderButtonCopy({
              dirty: draft.dirty,
              price: renderCost,
              balance,
              hasPortrait: initialPortraitsLeft === 0,
              pricingVerified,
              locked: editingDisabled,
            }),
    [
      draft.dirty,
      renderCost,
      balance,
      initialPortraitsLeft,
      initialRecoveryBlocked,
      initialRecovery.loading,
      initialRecovery.checking,
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
        locked: editingDisabled || initialRecoveryBlocked,
      }),
    [
      randomCost,
      balance,
      pricingVerified,
      editingDisabled,
      initialRecoveryBlocked,
    ],
  );

  // --- Mutations -----------------------------------------------------------

  /** Commits the draft. Free, so the only risk is a cooldown rejection. */
  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!character || !draft.dirty) return true;
    if (battleLocked || saveBlocked) return false;
    const accountId = user?.id;
    const submitted = { ...draft.values };
    const landed: string[] = [];
    try {
      await draft.flush();
      if (currentAccount.current !== accountId || battleLockRef.current)
        return false;
      // Two calls, not one: the Edge Function accepts a single edit kind per
      // request, so identity and look cannot travel together.
      if (draft.identityPayload) {
        await editCharacter({
          characterId: character.id,
          changes: { identity: draft.identityPayload },
        });
        landed.push('identity');
        await draft.acknowledge(
          draft.changes
            .filter((c) => c.section === 'identity')
            .map((c) => c.key),
          submitted,
        );
      }
      if (currentAccount.current !== accountId || battleLockRef.current)
        return false;
      if (draft.lookPayload) {
        await editCharacter({
          characterId: character.id,
          changes: { look: draft.lookPayload },
        });
        landed.push('look');
        await draft.acknowledge(
          draft.changes
            .filter((c) => c.section !== 'identity')
            .map((c) => c.key),
          submitted,
        );
      }
      return true;
    } catch (err) {
      if (currentAccount.current !== accountId) return false;
      console.error('Failed to save character edits', { landed, err });
      await afterEdit();
      if (currentAccount.current !== accountId) return false;
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
  }, [
    character,
    draft,
    afterEdit,
    alertEditError,
    battleLocked,
    saveBlocked,
    user?.id,
  ]);

  const runSave = useCallback(async () => {
    if (editingDisabled || saveBlocked || mutationBusy.current) return;
    mutationBusy.current = true;
    setBusyKey('save');
    try {
      const ok = await saveDraft();
      if (ok) {
        await afterEdit();
        showToast('Changes saved · free');
      }
    } finally {
      mutationBusy.current = false;
      setBusyKey(null);
    }
  }, [saveDraft, afterEdit, showToast, editingDisabled, saveBlocked]);

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
      if (
        !character ||
        editingDisabled ||
        mutationBusy.current ||
        (mode === 'render' && saveBlocked)
      )
        return;
      if (initialRecoveryBlocked) {
        await recoverOrRun(() => undefined);
        return;
      }
      const firstRender = mode === 'render' && initialPortraitsLeft > 0;
      const cost = firstRender
        ? 0
        : mode === 'random'
          ? randomCost
          : renderCost;
      if (!firstRender && !pricingVerified) {
        showToast(
          'Drawing prices are unavailable. Retry prices before drawing.',
        );
        return;
      }
      if (balance !== null && cost > balance) {
        setSheet({ kind: 'topUp', price: cost });
        return;
      }
      const previousFighterId = character.portrait_id;
      const previousAvatarId = character.avatar_portrait_id;
      const fighterVersion = character.appearance_version ?? 0;

      mutationBusy.current = true;
      const accountId = user?.id;
      setBusyKey('render');
      try {
        // Save first. Rendering a staged-but-unsaved look would draw the
        // character as it was BEFORE the edits, which reads as the render
        // having silently failed.
        if (mode === 'render' && draft.dirty) {
          const saved = await saveDraft();
          if (!saved) return;
        }

        if (currentAccount.current !== accountId || battleLockRef.current)
          return;
        let result: PortraitJobResult;
        if (firstRender) {
          result = await generatePortrait({
            characterId: character.id,
            archetype: character.archetype,
            mode: 'guided',
            freeOnly: true,
            traits: {
              vibe: character.vibe ?? undefined,
              silhouette: character.silhouette ?? undefined,
              palette: character.palette_key ?? undefined,
              era: character.era ?? undefined,
              expression: character.expression ?? undefined,
            },
          });
        } else {
          await paidRecovery.start(mode, {
            previousFighterId,
            previousAvatarId,
          });
          await afterEdit();
          return;
        }
        if (currentAccount.current !== accountId) return;

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
            void awaitAvatarJob(result.avatarJobId)
              .then((a) => {
                if (currentAccount.current !== accountId) return;
                setReveal((r) =>
                  r
                    ? { ...r, avatar: { status: 'ready', uri: a.imageUrl } }
                    : r,
                );
              })
              .catch(() => {
                if (currentAccount.current !== accountId) return;
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
        mutationBusy.current = false;
        if (currentAccount.current === accountId) setBusyKey(null);
        await refreshInitialRecovery();
      }
    },
    [
      character,
      user?.id,
      draft,
      editingDisabled,
      saveBlocked,
      saveDraft,
      afterEdit,
      showToast,
      alertEditError,
      renderCost,
      initialPortraitsLeft,
      initialRecoveryBlocked,
      recoverOrRun,
      refreshInitialRecovery,
      randomCost,
      pricingVerified,
      balance,
      readAvatarState,
      paidRecovery,
    ],
  );

  const onRenderPress = useCallback(
    (opener: SheetFocusRef) => {
      rememberSheetOpener(opener);
      rememberRenderOpener(opener);
      if (!character) return;
      if (paidRecovery.blocked) {
        void paidRecovery.checkStatus();
        return;
      }
      if (initialRecoveryBlocked) {
        void recoverOrRun(() => undefined);
        return;
      }
      if (editingDisabled || saveBlocked) return;
      switch (renderButton.intent) {
        case 'topUp':
          goToWallet();
          return;
        case 'render':
          hapticSelection();
          setSheet({ kind: 'render' });
          return;
        default:
          return;
      }
    },
    [
      character,
      rememberSheetOpener,
      rememberRenderOpener,
      renderButton.intent,
      initialRecoveryBlocked,
      recoverOrRun,
      goToWallet,
      editingDisabled,
      saveBlocked,
      paidRecovery,
    ],
  );

  const onRandomPress = useCallback(
    (opener: SheetFocusRef) => {
      rememberSheetOpener(opener);
      rememberRenderOpener(opener);
      if (initialRecoveryBlocked) {
        void recoverOrRun(() => undefined);
        return;
      }
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
    },
    [
      randomButton.intent,
      goToWallet,
      initialRecoveryBlocked,
      recoverOrRun,
      rememberSheetOpener,
      rememberRenderOpener,
    ],
  );

  const onSavePress = useCallback(
    (opener: SheetFocusRef) => {
      rememberSheetOpener(opener);
      if (!draft.dirty || editingDisabled || saveBlocked) return;
      hapticSelection();
      setSheet({ kind: 'save' });
    },
    [draft.dirty, saveBlocked, editingDisabled, rememberSheetOpener],
  );

  const onClearPress = useCallback(() => {
    hapticWarning();
    Alert.alert(
      'Discard changes?',
      'Remove this device’s editing draft? Your saved fighter and artwork stay unchanged.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard changes',
          style: 'destructive',
          onPress: () => void draft.discard().catch(() => undefined),
        },
      ],
    );
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
        goToWallet();
        return;
    }
  }, [sheet, runSave, runRender, goToWallet]);

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
      if (!character || resultMutationDisabled || mutationBusy.current) return;
      mutationBusy.current = true;
      const accountId = user?.id;
      setRestoringId(portraitId);
      setBusyKey('restore');
      try {
        const result = await restorePortrait({
          characterId: character.id,
          portraitId,
          fallbackAvatarId,
        });
        if (currentAccount.current !== accountId) return;
        setViewerOpen(false);
        setViewerPortraitId(null);
        setReveal(null);
        showToast(
          result.avatarRestored || !fallbackAvatarId
            ? 'Previous look restored · free'
            : 'Previous fighter restored · avatar unchanged',
        );
        await afterEdit();
        if (paidRecovery.operation) await paidRecovery.dismiss();
      } catch (err) {
        console.error('Failed to restore portrait', { portraitId, err });
        alertEditError(err, 'Could not restore that render');
      } finally {
        mutationBusy.current = false;
        setRestoringId(null);
        setBusyKey(null);
      }
    },
    [
      character,
      afterEdit,
      showToast,
      alertEditError,
      resultMutationDisabled,
      paidRecovery,
      user?.id,
    ],
  );

  const runRetryAvatar = useCallback(async () => {
    if (
      !character ||
      !canRetryAvatar ||
      resultMutationDisabled ||
      mutationBusy.current
    )
      return;
    mutationBusy.current = true;
    const accountId = user?.id;
    setBusyKey('retryAvatar');
    try {
      const result = await retryAvatar({ characterId: character.id });
      if (currentAccount.current !== accountId) return;
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
      mutationBusy.current = false;
      setBusyKey(null);
    }
  }, [
    character,
    canRetryAvatar,
    showToast,
    afterEdit,
    alertEditError,
    resultMutationDisabled,
    user?.id,
  ]);

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
    if (paidRecovery.operation) {
      void paidRecovery.dismiss().then((ok) => {
        if (ok) setReveal(null);
      });
    } else setReveal(null);
  }, [reveal, showToast, paidRecovery]);

  // Navigation is a local draft save, never a fighter mutation.
  usePreventRemove(!allowRemove && !!character, ({ data }) => {
    draft.setScrollPosition(activeCategory, scrollPosition.current);
    void draft
      .flush()
      .then(() => {
        pendingNavigation.current = data.action;
        setAllowRemove(true);
      })
      .catch(() =>
        Alert.alert(
          'Draft not saved on this device',
          'Keep editing and retry, or explicitly discard this draft to leave.',
          [
            { text: 'Keep editing', style: 'cancel' },
            {
              text: 'Discard and leave',
              style: 'destructive',
              onPress: () =>
                void draft
                  .discard()
                  .then(() => {
                    pendingNavigation.current = data.action;
                    setAllowRemove(true);
                  })
                  .catch(() => undefined),
            },
          ],
        ),
      );
  });
  useEffect(() => {
    if (allowRemove && pendingNavigation.current) {
      const action = pendingNavigation.current;
      pendingNavigation.current = null;
      navigation.dispatch(action);
    }
  }, [allowRemove, navigation]);
  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        minHeight: 56,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          router.canGoBack() ? 'Go back' : 'Return to Profile'
        }
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')
        }
        style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}
      >
        <GameIcon name="chevron-left" size={24} color={colors.ornament} />
        {!router.canGoBack() && <GameText variant="caption">Profile</GameText>}
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <GameDisplayTitle
          style={{
            fontSize: window.fontScale > 1.3 ? 24 : 30,
            textAlign: 'center',
          }}
        >
          EDIT LOOK
        </GameDisplayTitle>
      </View>
      <CreditChip
        focusRef={walletFocusRef}
        credits={credits}
        unavailable={creditsLoading}
        onPress={goToWallet}
      />
    </View>
  );

  // --- Render --------------------------------------------------------------

  if (loading || !character || !stagedLook)
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <View style={[styles.centered, { flex: 1, gap: 16 }]}>
          {loading ? (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <GameText variant="body">Loading your fighter…</GameText>
            </>
          ) : loadError ? (
            <>
              <GameText variant="body">Could not load your fighter.</GameText>
              <GameButton
                label="Retry"
                onPress={() => void loadCharacter(true)}
              />
            </>
          ) : (
            <>
              <GameDisplayTitle>No fighter yet</GameDisplayTitle>
              <GameButton
                label="Create your fighter"
                onPress={() => router.push('/(onboarding)/create-character')}
              />
            </>
          )}
        </View>
      </View>
    );

  const fighterUri = portraitUrl ?? fallbackUri;
  const stagedName = (draft.values.name as string) ?? character.name;
  const compactPreview =
    keyboardVisible || window.fontScale > 1.3 || window.height < 740;
  const viewerUri = viewerPortraitId
    ? (history.find((h) => h.portraitId === viewerPortraitId)?.imageUrl ?? null)
    : fighterUri;
  const openViewer = (opener: SheetFocusRef) => {
    rememberPortraitOpener(opener);
    Keyboard.dismiss();
    setViewerPortraitId(null);
    setViewerOpen(true);
  };
  const historyFocus = () => {
    setHistoryOpen(false);
  };
  const rendering = busyKey === 'render';
  const footerStatus = paidRecovery.blocked
    ? paidRecovery.dispatching
      ? 'Drawing · you can leave and return'
      : paidRecovery.loading || paidRecovery.checking
        ? 'Checking your saved drawing…'
        : paidRecovery.operation?.status === 'failed'
          ? 'Drawing failed · your choices are kept'
          : paidRecovery.operation?.status === 'succeeded'
            ? 'Drawing complete · recovering artwork'
            : 'Still processing · Check status'
    : battleLocked
      ? 'View only during an active battle'
      : (draft.persistenceError ??
        (!draft.ready
          ? 'Restoring draft…'
          : draft.conflicts.length
            ? 'Review conflicting changes before saving'
            : rendering
              ? 'Drawing your look…'
              : draft.dirty
                ? 'Unsaved changes · artwork unchanged'
                : portraitStale
                  ? 'Choices saved · artwork not updated'
                  : 'Current artwork · drawing is optional'));
  const footerRenderLabel = paidRecovery.blocked
    ? paidRecovery.loading || paidRecovery.checking
      ? 'Checking status…'
      : paidRecovery.dispatching
        ? 'Drawing…'
        : paidRecovery.operation?.status === 'succeeded'
          ? 'Retry artwork'
          : 'Check status'
    : initialRecoveryBlocked
      ? renderButton.label
      : initialPortraitsLeft > 0
        ? 'Review & draw · Free (' + initialPortraitsLeft + ' left)'
        : !pricingVerified
          ? renderButton.label
          : renderButton.intent === 'topUp'
            ? renderButton.label
            : (draft.dirty
                ? 'Review & draw'
                : portraitStale
                  ? 'Draw updated look'
                  : 'Draw another version') +
              ' · ' +
              formatCredits(renderCost, 'sentence');

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
        onColorLayout={(event) => {
          colorOffset.current = event.nativeEvent.layout.y;
          if (params.focus === 'signature-color' && !colorFocused.current) {
            requestAnimationFrame(() => {
              scrollRef.current?.scrollTo({
                y: panelOffset.current + (colorOffset.current ?? 0),
                animated: false,
              });
              colorFocused.current = true;
            });
          }
        }}
      />
    ) : activeCategory === 'look' ? (
      <LookPanel
        mode={draft.activeMode}
        writtenText={draft.writtenText}
        onModeChange={draft.setMode}
        expandedGroups={draft.expandedGroups}
        onExpandedGroupChange={draft.setExpandedGroup}
        look={stagedLook}
        changedKeys={changedKeys}
        disabled={editingDisabled}
        onStage={(key, value) => draft.stage(key as DraftKey, value)}
      />
    ) : (
      <GearPanel
        items={items}
        currentItem={currentItem}
        equippedId={stagedItemId}
        savedItemId={character.signature_item_id}
        loading={itemsLoading}
        error={itemsError}
        disabled={editingDisabled}
        disabledReason={`View only while this fighter is in ${Math.max(1, activeBattleCount)} active ${activeBattleCount === 1 ? 'battle' : 'battles'}.`}
        disabledActionLabel={`Manage ${Math.max(1, activeBattleCount)} ${activeBattleCount === 1 ? 'battle' : 'battles'}`}
        onDisabledAction={() =>
          navigateWithDraft(() =>
            router.push(primaryBattleRoute ?? '/(tabs)/battles'),
          )
        }
        onRetry={() => {
          setItemsError(null);
          void loadItems();
        }}
        onEquip={(id) => draft.stage('signatureItemId', id)}
      />
    );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {header}
      <EditorPreview
        name={stagedName}
        archetype={stagedArchetype}
        avatarUri={avatarUrl ?? fallbackUri}
        cosmetics={cosmetics}
        accentColor={accentColor}
        compact={compactPreview}
        dirty={draft.dirty}
        onImageError={() => setArtLoadError(true)}
        onView={openViewer}
        onHistory={(opener) => {
          rememberSheetOpener(opener);
          Keyboard.dismiss();
          setHistoryOpen(true);
          void loadHistory();
        }}
      />
      <EditorTabs
        value={activeCategory}
        dirty={draft.dirtySections}
        onChange={setActiveCategory}
      />
      <ScrollView
        ref={scrollRef}
        testID="edit-look-scroll"
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
        onScroll={(event) => {
          scrollPosition.current = event.nativeEvent.contentOffset.y;
        }}
        onScrollEndDrag={() =>
          draft.setScrollPosition(activeCategory, scrollPosition.current)
        }
        onMomentumScrollEnd={() =>
          draft.setScrollPosition(activeCategory, scrollPosition.current)
        }
        scrollEventThrottle={32}
        onLayout={() => {
          if (keyboardVisible && footerHeight > 0) {
            const node = scrollRef.current as ScrollView & {
              scrollResponderScrollNativeHandleToKeyboard?: (
                node: number,
                offset: number,
                prevent: boolean,
              ) => void;
            };
            // ScrollView owns field scrolling; the outer avoider owns keyboard height.
            const focused = TextInput.State.currentlyFocusedInput?.();
            if (focused) {
              const handle = findNodeHandle(
                focused as unknown as Parameters<typeof findNodeHandle>[0],
              );
              if (handle)
                node?.scrollResponderScrollNativeHandleToKeyboard?.(
                  handle,
                  12,
                  true,
                );
            }
          }
        }}
      >
        {paidRecovery.blocked && !paidRecovery.loading && (
          <View style={styles.notice}>
            <GameText variant="body" accessibilityLiveRegion="polite">
              {paidRecovery.error ??
                (paidRecovery.operation?.status === 'failed'
                  ? 'The server could not complete this drawing. Your draft is kept.'
                  : paidRecovery.operation?.status === 'pending' &&
                      paidRecovery.operation?.portraitId
                    ? 'Fighter drawn. The avatar is still processing.'
                    : 'This drawing is saved for recovery. Checking never starts another drawing or spends credits.')}
            </GameText>
            <GameButton
              label={
                paidRecovery.operation?.status === 'succeeded'
                  ? 'Retry loading artwork'
                  : 'Check status'
              }
              tone="secondary"
              disabled={paidRecovery.checking || paidRecovery.dispatching}
              onPress={() => void paidRecovery.checkStatus()}
            />
            {paidRecovery.operation?.status === 'failed' && (
              <GameButton
                label="Return to editing"
                onPress={() => void paidRecovery.dismiss()}
              />
            )}
          </View>
        )}
        {artLoadError && (
          <View style={styles.notice}>
            <GameText variant="caption">
              Artwork could not load. Your fighter is unchanged.
            </GameText>
            <GameButton
              label="Retry artwork"
              tone="secondary"
              onPress={() => {
                setArtLoadError(false);
                void loadCharacter();
                void loadHistory();
              }}
            />
          </View>
        )}
        {battleLocked && (
          <View style={styles.notice}>
            <GameText variant="body">
              View only while this fighter is in{' '}
              {Math.max(1, activeBattleCount)} active{' '}
              {activeBattleCount === 1 ? 'battle' : 'battles'}.
            </GameText>
            <GameButton
              label="Manage battles"
              tone="secondary"
              onPress={() =>
                navigateWithDraft(() =>
                  router.push(primaryBattleRoute ?? '/(tabs)/battles'),
                )
              }
            />
          </View>
        )}
        {loadError && (
          <View style={styles.notice}>
            <GameText variant="body">
              Could not refresh your fighter. Your known artwork and draft are
              kept.
            </GameText>
            <GameButton
              label="Retry fighter"
              onPress={() => void loadCharacter()}
            />
          </View>
        )}
        {compactPreview && (
          <GameButton
            ref={compactHistoryRef}
            label="Previous looks"
            labelStyle={{ fontSize: 16 }}
            chrome="text"
            tone="secondary"
            onPress={() => {
              rememberSheetOpener(compactHistoryRef);
              setHistoryOpen(true);
              void loadHistory();
            }}
          />
        )}
        {draft.persistenceError && (
          <View style={styles.notice}>
            <GameText variant="body" accessibilityRole="alert">
              {draft.persistenceError}
            </GameText>
            <GameButton
              label="Retry saving draft"
              onPress={() => void draft.flush().catch(() => undefined)}
            />
          </View>
        )}
        {draft.restored && (
          <GameText variant="caption" style={styles.notice}>
            Draft restored
          </GameText>
        )}
        {cooldownChanges.length > 0 && (
          <GameText variant="body" style={styles.notice}>
            Wait for the cooldown before saving:{' '}
            {cooldownChanges.map((c) => c.label).join(', ')}.
          </GameText>
        )}
        {portraitStale && changedFields.length > 0 && (
          <GameText variant="caption" style={styles.notice}>
            Saved since this artwork: {changedFields.join(', ')}. Drawing is
            optional.
          </GameText>
        )}
        {draft.conflicts.map((conflict) => (
          <View key={conflict.key} style={styles.notice}>
            <GameText variant="title">
              {conflict.label} changed elsewhere
            </GameText>
            <GameText variant="body">
              Saved: {conflict.saved ?? 'None'}
            </GameText>
            <GameText variant="body">
              Your draft: {conflict.draft ?? 'None'}
            </GameText>
            <GameButton
              label="Use saved value"
              tone="secondary"
              onPress={() => draft.resolveConflict(conflict.key, 'saved')}
            />
            <GameButton
              label="Keep my edit"
              onPress={() => draft.resolveConflict(conflict.key, 'draft')}
            />
          </View>
        ))}
        {!pricingVerified && (
          <View style={styles.notice}>
            <GameText variant="caption">
              Drawing prices are unavailable. Editing your look is free.
            </GameText>
            <GameButton
              label="Retry prices"
              chrome="text"
              onPress={() => void loadPricing(character.id)}
            />
          </View>
        )}
        {initialRecovery.request || initialRecovery.error ? (
          <GameText variant="body" style={styles.notice}>
            {initialRecovery.error ??
              'Your initial portrait request is saved. Check render to recover its result or returned allowance.'}
          </GameText>
        ) : null}
        <View
          onLayout={(event) => {
            panelOffset.current = event.nativeEvent.layout.y;
          }}
        >
          {panel}
        </View>
        {activeCategory === 'identity' && (
          <CharacterRespec
            characterId={character.id}
            disabled={editingDisabled}
          />
        )}
        {avatarPending && canRetryAvatar && (
          <GameButton
            label="Repair avatar · Free"
            tone="secondary"
            disabled={editingDisabled}
            onPress={() => void runRetryAvatar()}
          />
        )}
        <View style={styles.notice}>
          <GameButton
            label={
              pricingVerified
                ? randomButton.label.replace(/^.*?·/, 'Shuffle & draw ·')
                : 'Shuffle & draw · Price unavailable'
            }
            accessibilityLabel={randomButton.accessibilityLabel.replace(
              'Generate a random character',
              'Shuffle and draw',
            )}
            gameIcon="replay"
            tone="secondary"
            disabled={randomButton.intent === 'disabled' || rendering}
            onPress={() => onRandomPress(walletFocusRef)}
          />
          {draft.dirty && (
            <GameButton
              label="Discard changes"
              chrome="text"
              tone="danger"
              onPress={onClearPress}
              disabled={busyKey !== null}
            />
          )}
        </View>
      </ScrollView>
      <View style={{ paddingBottom: keyboardVisible ? 0 : insets.bottom }}>
        <EditorFooter
          status={footerStatus}
          renderLabel={footerRenderLabel}
          saveDisabled={!draft.dirty || editingDisabled || saveBlocked}
          renderDisabled={
            paidRecovery.blocked
              ? paidRecovery.loading ||
                paidRecovery.checking ||
                paidRecovery.dispatching
              : renderButton.intent === 'disabled' ||
                rendering ||
                (!initialRecoveryBlocked && saveBlocked)
          }
          saveBusy={busyKey === 'save'}
          renderBusy={rendering}
          savePrimary={
            draft.dirty &&
            !draft.dirtySections.look &&
            !draft.dirtySections.gear
          }
          keyboardVisible={keyboardVisible}
          onSave={onSavePress}
          onRender={onRenderPress}
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        />
      </View>
      <BottomSheet
        visible={historyOpen}
        onClose={historyFocus}
        title="Previous looks"
        closeAccessibilityLabel="Close previous looks"
        returnFocusRef={sheetReturnFocusRef}
        footer={<GameButton label="Back to editing" onPress={historyFocus} />}
      >
        {historyLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : historyError ? (
          <View style={{ gap: 12 }}>
            <GameText variant="body">{historyError}</GameText>
            <GameButton
              label="Retry previous looks"
              onPress={() => void loadHistory()}
            />
          </View>
        ) : history.length === 0 ? (
          <GameText variant="body">No previous looks available yet.</GameText>
        ) : (
          history.map((entry) => (
            <View key={entry.portraitId} style={{ gap: 8, marginBottom: 16 }}>
              {entry.imageUrl ? (
                <Image
                  source={{ uri: entry.imageUrl }}
                  resizeMode="contain"
                  style={{ width: '100%', height: 180 }}
                  onError={() => setArtLoadError(true)}
                />
              ) : (
                <GameButton
                  label="Retry this artwork"
                  tone="secondary"
                  onPress={() => void loadHistory()}
                />
              )}
              <GameText variant="caption">
                {new Date(entry.createdAt).toLocaleString()}
              </GameText>
              <GameButton
                label="Preview this look"
                tone="secondary"
                onPress={() => {
                  setHistoryOpen(false);
                  setViewerPortraitId(entry.portraitId);
                  setViewerOpen(true);
                }}
              />
            </View>
          ))
        )}
      </BottomSheet>
      <ConfirmSheet
        visible={sheet !== null}
        title={sheetCopy?.title ?? ''}
        confirmLabel={sheetCopy?.confirmLabel ?? 'Confirm'}
        confirmDisabled={
          sheet?.kind !== 'topUp' &&
          (editingDisabled ||
            ((sheet?.kind === 'save' || sheet?.kind === 'render') &&
              saveBlocked) ||
            ((sheet?.kind === 'random' ||
              (sheet?.kind === 'render' && initialPortraitsLeft === 0)) &&
              !pricingVerified))
        }
        {...sheetCopy}
        returnFocusRef={
          rendering || reveal !== null ? undefined : sheetReturnFocusRef
        }
        thumbnailUri={sheet?.kind === 'render' ? portraitUrl : undefined}
        accentColor={accentColor}
        onConfirm={onSheetConfirm}
        onCancel={() => setSheet(null)}
      />

      <RenderRevealSheet
        returnFocusRef={renderReturnFocusRef}
        visible={reveal !== null}
        characterName={character.name}
        accentColor={accentColor}
        fighterUri={reveal?.fighterUri ?? null}
        frame={cosmetics.frame}
        avatar={reveal?.avatar ?? { status: 'pending' }}
        mode={reveal?.mode ?? 'render'}
        creditsSpent={reveal?.creditsSpent ?? 0}
        canRetryAvatar={canRetryAvatar && !resultMutationDisabled}
        retryingAvatar={busyKey === 'retryAvatar'}
        canRestorePrevious={
          Boolean(reveal?.previousFighterId) && !resultMutationDisabled
        }
        restoring={busyKey === 'restore'}
        onImageError={() => setArtLoadError(true)}
        mediaError={artLoadError}
        onRetryMedia={() => {
          if (paidRecovery.operation) {
            const accountId = user?.id;
            void paidRecovery
              .checkStatus()
              .then((outcome) => {
                if (currentAccount.current === accountId)
                  setArtLoadError(
                    !!outcome?.error || !outcome?.result?.imageUrl,
                  );
              })
              .catch(() => {
                if (currentAccount.current === accountId) setArtLoadError(true);
              });
          } else {
            const accountId = user?.id;
            void Promise.all([
              character.portrait_id
                ? loadPortraitRef(character.portrait_id)
                : Promise.resolve({ url: null }),
              character.avatar_portrait_id
                ? loadPortraitRef(character.avatar_portrait_id)
                : Promise.resolve({ url: null }),
            ])
              .then(([fighter, avatar]) => {
                if (currentAccount.current !== accountId) return;
                setArtLoadError(!fighter.url);
                setReveal((current) =>
                  current
                    ? {
                        ...current,
                        fighterUri: fighter.url ?? current.fighterUri,
                        avatar: avatar.url
                          ? { status: 'ready', uri: avatar.url }
                          : current.avatar,
                      }
                    : current,
                );
              })
              .catch(() => {
                if (currentAccount.current === accountId) setArtLoadError(true);
              });
          }
        }}
        onKeep={onKeep}
        onRestorePrevious={() => {
          if (reveal?.previousFighterId) {
            void runRestore(reveal.previousFighterId, reveal.previousAvatarId);
          }
        }}
        onRetryAvatar={() => void runRetryAvatar()}
      />

      <BottomSheet
        visible={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          setViewerPortraitId(null);
        }}
        title={stagedName}
        closeAccessibilityLabel="Close full-screen portrait"
        returnFocusRef={portraitReturnFocusRef}
        footer={
          <View style={{ gap: 8 }}>
            {viewerPortraitId && (
              <GameButton
                label="Restore this look · Free"
                disabled={editingDisabled}
                busy={restoringId === viewerPortraitId}
                onPress={() => void runRestore(viewerPortraitId)}
              />
            )}
            <GameButton
              label="Back to editing"
              tone="secondary"
              onPress={() => {
                setViewerOpen(false);
                setViewerPortraitId(null);
              }}
            />
          </View>
        }
      >
        <GameText variant="caption">
          {viewerPortraitId ? 'Previous artwork' : 'Current artwork'}
        </GameText>
        {viewerUri ? (
          <FighterCard
            name={stagedName}
            archetype={stagedArchetype}
            renderUri={viewerUri}
            avatarUri={avatarUrl}
            signatureColor={accentColor}
            cosmetics={cosmetics}
            onImageError={() => setArtLoadError(true)}
          />
        ) : (
          <GameText variant="body">This artwork could not load.</GameText>
        )}
        {(artLoadError || !viewerUri) && (
          <GameButton
            label="Retry artwork"
            tone="secondary"
            onPress={() => {
              setArtLoadError(false);
              void loadCharacter();
              void loadHistory();
            }}
          />
        )}
      </BottomSheet>

      {toast && <Toast text={toast} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  notice: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
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
