import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchActiveCharacter,
  fetchSignatureItemName,
  type ActiveCharacterRow,
} from '@/utils/profileData';
import { loadPortraitRef } from '@/utils/characters';

interface Fighter {
  character: ActiveCharacterRow;
  renderUri: string | null;
  avatarUri: string | null;
  itemName: string | null;
}
interface State {
  account: string | undefined;
  fighter: Fighter | null;
  loading: boolean;
  error: boolean;
}

/** Presentation read only. Refresh failures retain this account's known identity and artwork. */
export function useArenaFighter(account: string | undefined) {
  const [state, setState] = useState<State>({
    account,
    fighter: null,
    loading: true,
    error: false,
  });
  const currentAccount = useRef(account);
  currentAccount.current = account;
  const request = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const seq = ++request.current;
    if (!account) return;
    const valid = () =>
      mounted.current &&
      currentAccount.current === account &&
      request.current === seq;
    setState((previous) => ({
      account,
      fighter: previous.account === account ? previous.fighter : null,
      loading: true,
      error: false,
    }));
    try {
      const character = await fetchActiveCharacter(account);
      if (!valid()) return;
      if (!character) throw new Error('Fighter unavailable');
      const [render, avatar, itemName] = await Promise.all([
        character.portrait_id
          ? loadPortraitRef(character.portrait_id).catch(() => null)
          : null,
        character.avatar_portrait_id
          ? loadPortraitRef(character.avatar_portrait_id).catch(() => null)
          : null,
        fetchSignatureItemName(character.signature_item_id).catch(() => null),
      ]);
      if (!valid()) return;
      setState((previous) => {
        const known =
          previous.account === account &&
          previous.fighter?.character.id === character.id
            ? previous.fighter
            : null;
        return {
          account,
          loading: false,
          error: !!(
            (character.portrait_id && !render?.url) ||
            (character.avatar_portrait_id && !avatar?.url)
          ),
          fighter: {
            character,
            itemName:
              itemName ??
              (known?.character.signature_item_id ===
              character.signature_item_id
                ? known?.itemName
                : null) ??
              null,
            renderUri:
              render?.url ??
              (known?.character.portrait_id === character.portrait_id
                ? known?.renderUri
                : null) ??
              null,
            avatarUri:
              avatar?.url ??
              (known?.character.avatar_portrait_id ===
              character.avatar_portrait_id
                ? known?.avatarUri
                : null) ??
              null,
          },
        };
      });
    } catch {
      if (valid())
        setState((previous) => ({
          account,
          fighter: previous.account === account ? previous.fighter : null,
          loading: false,
          error: true,
        }));
    }
  }, [account]);
  const onArtworkError = useCallback(() => {
    setState((previous) =>
      previous.account === account ? { ...previous, error: true } : previous,
    );
  }, [account]);
  const own = state.account === account;
  return {
    fighter: own ? state.fighter : null,
    error: own && state.error,
    loading: !own || state.loading,
    refresh,
    onArtworkError,
  };
}
