import { useCallback, useEffect, useReducer, useRef } from 'react';
import { invokeFunctionResult, supabase } from '@/utils/supabase';
import {
  PlayerAvatarCache,
  type AvatarReference,
  type PlayerAvatar,
} from '@/utils/playerAvatarCache';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';

export const playerAvatarCache = new PlayerAvatarCache(
  async (account, body) => {
    const session = await supabase.auth.getSession();
    if (session.data.session?.user.id !== account)
      throw new Error('Account changed');
    const { data, error } = await invokeFunctionResult<{
      players?: Record<string, PlayerAvatar>;
      battles?: Record<string, PlayerAvatar>;
    }>('sign-player-avatars', { ...body });
    if (error || !data) throw new Error('Avatar lookup unavailable');
    return data;
  },
);

/** Lists continue rendering independently. Focus and foreground revalidate
 * approval, while the expiry timer refreshes only visible surfaces. */
export function usePlayerAvatars(
  account: string | null | undefined,
  refs: readonly AvatarReference[],
  enabled = true,
) {
  const focused = useBattlePresentationActive();
  const active = focused && enabled;
  const previouslyFocused = useRef(focused);
  const [, render] = useReducer((n) => n + 1, 0);
  const signature = JSON.stringify(refs);
  const refresh = useCallback(
    (force = true) => {
      if (account)
        void playerAvatarCache.request(account, JSON.parse(signature), force);
    },
    [account, signature],
  );
  const current = useRef({ account, refs, enabled });
  current.current = { account, refs, enabled };
  useEffect(() => playerAvatarCache.subscribe(render), []);
  useEffect(() => {
    if (
      focused &&
      !previouslyFocused.current &&
      current.current.account &&
      current.current.enabled
    ) {
      void playerAvatarCache.request(
        current.current.account,
        current.current.refs,
        true,
      );
    }
    previouslyFocused.current = focused;
  }, [focused]);
  useEffect(() => {
    if (!account) {
      playerAvatarCache.setAccount(null);
      return;
    }
    if (!active) return;
    refresh(false);
    const timer = setInterval(() => refresh(false), 60_000);
    return () => clearInterval(timer);
  }, [account, active, refresh]);
  return {
    get: (ref: AvatarReference) => playerAvatarCache.get(account, ref),
    refresh,
  };
}
