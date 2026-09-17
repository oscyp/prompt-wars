import { useCallback, useEffect, useRef, useState } from 'react';
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import { supabase } from '@/utils/supabase';
import { getWalletBalanceResult } from '@/utils/monetization';
import { fetchProfileRow, type ProfileRow } from '@/utils/profileData';
import {
  listCosmetics,
  syncCosmetics,
  purchaseCosmetic,
  equipCosmetic,
  type CosmeticItem,
  type CosmeticConfig,
} from '@/utils/cosmetics';
import {
  getPortraitFallbackUri,
  resolvePortraitImageUrl,
  resolveSignatureHex,
} from '@/utils/characters';

interface CharacterRow {
  id: string;
  name: string;
  archetype: string;
  signature_color: string;
  cosmetic_config: CosmeticConfig;
  portrait_id: string | null;
  avatar_portrait_id: string | null;
  starter_asset_key?: string | null;
}
export interface ShopCharacter {
  id: string;
  name: string;
  signatureColor: string;
  portraitUri: string;
  avatarUri: string;
  portraitId?: string | null;
  avatarId?: string | null;
  /** Actual source used by each context, including cross-context fallbacks. */
  portraitSourceId?: string | null;
  avatarSourceId?: string | null;
}
const initial = () => ({
  items: [] as CosmeticItem[],
  equipped: {} as CosmeticConfig,
  character: null as ShopCharacter | null,
  characterStatus: 'loading' as 'loading' | 'ready' | 'empty' | 'error',
  profile: null as ProfileRow | null,
  credits: null as number | null,
  isSubscriber: false,
  loading: true,
  refreshing: false,
  error: null as string | null,
  artworkError: false,
});
const fulfilled = <T>(result: PromiseSettledResult<T>): T | null =>
  result.status === 'fulfilled' ? result.value : null;

/** Keep a previously decoded source when re-signing that same source fails.
 * A new successful higher-priority reference always wins over a cached fallback. */
function preserveArtwork(
  previous: ShopCharacter | null,
  next: ShopCharacter | null,
  failedIds: Set<string>,
  starter: boolean,
): ShopCharacter | null {
  if (!next || previous?.id !== next.id) return next;
  const result = { ...next };
  const contexts = [
    {
      uri: 'portraitUri',
      source: 'portraitSourceId',
      candidates: [next.portraitId, next.avatarId],
    },
    {
      uri: 'avatarUri',
      source: 'avatarSourceId',
      candidates: [next.avatarId, starter ? null : next.portraitId],
    },
  ] as const;
  for (const { uri, source, candidates } of contexts) {
    const oldSource = previous[source];
    if (!oldSource || !failedIds.has(oldSource)) continue;
    const oldPriority = candidates.indexOf(oldSource);
    if (oldPriority < 0) continue; // It is no longer a source for this context.
    const newSource = next[source];
    const newPriority = newSource ? candidates.indexOf(newSource) : -1;
    if (newPriority >= 0 && newPriority < oldPriority) continue;
    result[uri] = previous[uri];
    result[source] = oldSource;
  }
  return result;
}

/** Owns account-scoped reads and serialized server mutations; never writes player state directly. */
export function useCosmeticShop(userId: string | undefined) {
  const [state, setState] = useState(initial);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const account = useRef(userId);
  const epoch = useRef(0);
  const readSequence = useRef(0);
  const mutation = useRef<symbol | null>(null);
  const acknowledged = useRef(new Set<string>());
  const mounted = useRef(true);
  // Invalidate during render: an old request must not land between render and effects.
  if (account.current !== userId) {
    account.current = userId;
    epoch.current++;
    readSequence.current++;
    acknowledged.current = new Set();
    mutation.current = null;
  }
  useEffect(() => {
    setState(initial());
    setBusySlug(null);
  }, [userId]);
  useEffect(() => {
    mounted.current = true;
    const lifecycleEpoch = epoch;
    return () => {
      mounted.current = false;
      lifecycleEpoch.current++;
    };
  }, []);

  const refresh = useCallback(
    async (authoritative?: CosmeticConfig, fromMutation = false) => {
      if (mutation.current && !fromMutation) return;
      const generation = epoch.current;
      const sequence = ++readSequence.current;
      const current = () =>
        mounted.current &&
        epoch.current === generation &&
        readSequence.current === sequence;
      if (!userId) {
        setState({ ...initial(), loading: false, characterStatus: 'empty' });
        return;
      }
      setState((prev) => ({ ...prev, refreshing: true }));
      try {
        await syncCosmetics().catch(() => null);
        if (!current()) return;
        const [catalogResult, balanceResult, fighterResult, profileResult] =
          await Promise.allSettled([
            listCosmetics(),
            getWalletBalanceResult(),
            supabase
              .from('characters')
              .select(
                'id, cosmetic_config, name, archetype, signature_color, portrait_id, avatar_portrait_id, starter_asset_key',
              )
              .eq('profile_id', userId)
              .eq('is_active', true)
              .maybeSingle(),
            fetchProfileRow(userId),
          ]);
        if (!current()) return;
        const catalog = fulfilled(catalogResult),
          balance = fulfilled(balanceResult),
          fighter = fulfilled(fighterResult),
          profile = fulfilled(profileResult);
        const fighterOk = fighter !== null && !fighter.error;
        const row = fighterOk ? (fighter.data as CharacterRow | null) : null;
        let character: ShopCharacter | null = null;
        let artworkError = false;
        const failedAssetIds = new Set<string>();
        if (row) {
          const fallback =
            archetypeIllustrationUri(
              row.starter_asset_key?.replace('bundled:', '') ?? row.archetype,
            ) ??
            getPortraitFallbackUri({
              archetype: row.archetype as never,
              signatureColor: row.signature_color,
            });
          const [portrait, avatar] = await Promise.allSettled([
            row.portrait_id
              ? resolvePortraitImageUrl(row.portrait_id)
              : Promise.resolve(null),
            row.avatar_portrait_id
              ? resolvePortraitImageUrl(row.avatar_portrait_id)
              : Promise.resolve(null),
          ]);
          if (portrait.status === 'rejected' && row.portrait_id)
            failedAssetIds.add(row.portrait_id);
          if (avatar.status === 'rejected' && row.avatar_portrait_id)
            failedAssetIds.add(row.avatar_portrait_id);
          artworkError = failedAssetIds.size > 0;
          character = {
            id: row.id,
            portraitId: row.portrait_id,
            avatarId: row.avatar_portrait_id,
            portraitSourceId: fulfilled(portrait)
              ? row.portrait_id
              : fulfilled(avatar)
                ? row.avatar_portrait_id
                : null,
            avatarSourceId: fulfilled(avatar)
              ? row.avatar_portrait_id
              : !row.starter_asset_key && fulfilled(portrait)
                ? row.portrait_id
                : null,
            name: row.name,
            signatureColor: resolveSignatureHex(row.signature_color),
            portraitUri: fulfilled(portrait) ?? fulfilled(avatar) ?? fallback,
            avatarUri:
              fulfilled(avatar) ??
              (row.starter_asset_key
                ? fallback
                : (fulfilled(portrait) ?? fallback)),
          };
        }
        if (!current()) return;
        setState((prev) => ({
          ...prev,
          items: catalog?.success
            ? catalog.items.map((item) => ({
                ...item,
                owned: item.owned || acknowledged.current.has(item.slug),
              }))
            : prev.items,
          credits: balance?.ok ? balance.balance.credits_balance : prev.credits,
          isSubscriber: balance?.ok
            ? balance.balance.is_subscriber
            : prev.isSubscriber,
          profile: profile ?? prev.profile,
          character: fighterOk
            ? preserveArtwork(
                prev.character,
                character,
                failedAssetIds,
                !!row?.starter_asset_key,
              )
            : prev.character,
          characterStatus: fighterOk ? (row ? 'ready' : 'empty') : 'error',
          equipped:
            authoritative ??
            (fighterOk ? (row?.cosmetic_config ?? {}) : prev.equipped),
          artworkError: fighterOk ? artworkError : prev.artworkError,
          loading: false,
          refreshing: false,
          error:
            !catalog?.success || !balance?.ok || !fighterOk
              ? 'Some shop details could not refresh. Your last known data is still shown.'
              : null,
        }));
      } catch {
        if (current())
          setState((prev) => ({
            ...prev,
            loading: false,
            refreshing: false,
            error: 'Shop refresh failed. Your last known data is still shown.',
            characterStatus: prev.character ? prev.characterStatus : 'error',
          }));
      }
    },
    [userId],
  );

  const runMutation = async (
    item: CosmeticItem,
    kind: 'purchase' | 'equip',
  ) => {
    if (mutation.current || !userId) return { success: false, ignored: true };
    if (kind === 'equip' && !state.character)
      return {
        success: false,
        error:
          state.characterStatus === 'empty'
            ? 'no_active_character'
            : 'Could not load your fighter. Retry first.',
      };
    const token = Symbol();
    mutation.current = token;
    const generation = epoch.current;
    ++readSequence.current;
    // The invalidated read can no longer finish its spinner. Mutation progress
    // now belongs to busySlug; a successful mutation starts a fresh read below.
    setState((prev) => ({ ...prev, refreshing: false }));
    const current = () => mounted.current && generation === epoch.current;
    setBusySlug(item.slug);
    try {
      if (kind === 'purchase') {
        const result = await purchaseCosmetic(item.slug);
        if (!current()) return { success: false, ignored: true };
        if (result.success) {
          acknowledged.current.add(item.slug);
          setState((prev) => ({
            ...prev,
            items: (result.items.length ? result.items : prev.items).map(
              (entry) => ({
                ...entry,
                owned: entry.owned || acknowledged.current.has(entry.slug),
              }),
            ),
          }));
          await refresh(undefined, true);
        }
        return current() ? result : { success: false, ignored: true };
      }
      const removing = state.equipped[item.cosmetic_type] === item.slug;
      const result = await equipCosmetic(
        state.character!.id,
        item.cosmetic_type,
        removing ? null : item.slug,
      );
      if (!current()) return { success: false, ignored: true };
      if (result.success) {
        const config = result.cosmetic_config ?? {
          ...state.equipped,
          [result.type ?? item.cosmetic_type]: result.equipped ?? null,
        };
        setState((prev) => ({ ...prev, equipped: config }));
        await refresh(config, true);
      }
      return current() ? result : { success: false, ignored: true };
    } catch {
      return current()
        ? {
            success: false,
            error:
              'Connection interrupted. Retry to check your latest ownership and balance.',
          }
        : { success: false, ignored: true };
    } finally {
      if (mutation.current === token) mutation.current = null;
      if (current()) setBusySlug(null);
    }
  };
  return {
    ...state,
    busySlug,
    refresh,
    purchase: (item: CosmeticItem) => runMutation(item, 'purchase'),
    equip: (item: CosmeticItem) => runMutation(item, 'equip'),
    onArtworkError: () => setState((prev) => ({ ...prev, artworkError: true })),
  };
}
