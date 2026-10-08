import PlayerListAvatar from './PlayerListAvatar';
import { resolveEquippedCosmetics } from '@/utils/cosmetics';
import type { BattleIdentitySnapshot } from '@/types/battle';
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
/** Frozen artwork and equipment travel together; signing is batched by the shared cache. */
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
  const cosmetics = resolveEquippedCosmetics(snapshot?.[side]?.cosmetic_config);
  return (
    <PlayerListAvatar
      accountId={accountId}
      reference={{ kind: 'battles', id: battleId }}
      visible={visible}
      fallbackUri={fallbackUri}
      size={size}
      accentColor={accentColor}
      frame={cosmetics.frame}
      avatarEffect={cosmetics.avatarEffect}
      accessibilityLabel={`${name}'s fighter portrait`}
    />
  );
}
