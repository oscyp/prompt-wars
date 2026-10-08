import { useState, useRef, type ComponentProps } from 'react';
import PortraitPreview from './PortraitPreview';
import { usePlayerAvatars } from '@/hooks/usePlayerAvatars';
import type { AvatarReference } from '@/utils/playerAvatarCache';

type Props = Omit<ComponentProps<typeof PortraitPreview>, 'uri'> & {
  accountId?: string | null;
  reference?: AvatarReference;
  fallbackUri: string;
  visible?: boolean;
};
export default function PlayerListAvatar({
  accountId,
  reference,
  fallbackUri,
  visible = true,
  ...props
}: Props) {
  const avatars = usePlayerAvatars(
    accountId,
    reference ? [reference] : [],
    visible,
  );
  const avatar = reference ? avatars.get(reference) : undefined;
  const identity = `${accountId}:${reference?.kind}:${reference?.id}:${avatar?.asset_id}`;
  const retried = useRef<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const imageKey = `${identity}:${avatar?.signed_url}`;
  const uri =
    avatar?.signed_url && failed !== imageKey ? avatar.signed_url : fallbackUri;
  return (
    <PortraitPreview
      {...props}
      variant="circle"
      uri={uri}
      onImageError={() => {
        if (uri === fallbackUri || failed === imageKey) return;
        setFailed(imageKey);
        // Re-sign once for a failed URL. Later focus/foreground visits retry again.
        if (retried.current !== identity) {
          retried.current = identity;
          avatars.refresh();
        }
      }}
    />
  );
}
