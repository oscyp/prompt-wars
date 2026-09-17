import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import PortraitPreview from './PortraitPreview';
import { resolveEquippedCosmetics } from '@/utils/cosmetics';
import { invokeFunctionResult } from '@/utils/supabase';
import type { BattleIdentitySnapshot } from '@/types/battle';
const cache = new Map<string, { uri: string; expires: number }>();
interface Props {
  accountId: string | undefined;
  battleId: string;
  side: 'player_one' | 'player_two';
  snapshot?: BattleIdentitySnapshot | null;
  visible: boolean;
  fallbackUri: string;
  accentColor: string;
  name: string;
  size: number;
}
/** Sign only visible rows, and only their frozen avatar, never the current fighter. */
export default function BattleListPortrait({
  accountId,
  battleId,
  side,
  snapshot,
  visible,
  fallbackUri,
  accentColor,
  name,
  size,
}: Props) {
  const avatar = snapshot?.[side]?.avatar;
  const cosmetics = resolveEquippedCosmetics(snapshot?.[side]?.cosmetic_config);
  const reference = avatar?.thumb_path ?? avatar?.image_path;
  const key =
    accountId && reference
      ? `${accountId}:${battleId}:${side}:${reference}`
      : null;
  const [signed, setSigned] = useState<{ key: string; uri: string } | null>(
    null,
  );
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && visible) setRefresh((value) => value + 1);
    });
    return () => subscription.remove();
  }, [visible]);
  useEffect(() => {
    if (!visible || !key) return;
    let active = true;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      setSigned({ key, uri: cached.uri });
      return;
    }
    void invokeFunctionResult<{
      player_one?: { portrait_url?: string };
      player_two?: { portrait_url?: string };
    }>('sign-battle-portraits', { battle_id: battleId })
      .then(({ data, error }) => {
        const uri = data?.[side]?.portrait_url;
        if (!active || error || !uri) return;
        cache.set(key, { uri, expires: Date.now() + 45 * 60 * 1000 });
        if (cache.size > 100) cache.delete(cache.keys().next().value!);
        setSigned({ key, uri });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible, key, battleId, side, refresh]);
  if (signed?.key !== key || !signed?.uri)
    return (
      <PortraitPreview
        uri={fallbackUri}
        variant="circle"
        size={size}
        accentColor={accentColor}
        frame={cosmetics.frame}
        avatarEffect={cosmetics.avatarEffect}
        accessibilityLabel={`${name}'s archetype`}
      />
    );
  return (
    <PortraitPreview
      size={size}
      variant="circle"
      frame={cosmetics.frame}
      avatarEffect={cosmetics.avatarEffect}
      accentColor={accentColor}
      uri={signed.uri}
      onImageError={() => {
        const failed = signed;
        if (cache.get(failed.key)?.uri === failed.uri) cache.delete(failed.key);
        setSigned((current) =>
          current?.key === failed.key && current.uri === failed.uri
            ? null
            : current,
        );
        // Retry on foreground or a later visible visit, never in an error loop.
      }}
      accessibilityLabel={`${name}'s avatar`}
    />
  );
}
