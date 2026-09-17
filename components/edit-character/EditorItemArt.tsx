import { useState } from 'react';
import { Image, type ImageSourcePropType } from 'react-native';
import { GameIcon } from '@/components/game/icons/GameIcon';
import type { CatalogSignatureItem } from '@/utils/characters';
import { useThemedColors } from '@/hooks/useThemedColors';
const ART: Record<string, ImageSourcePropType> = {
  'fountain pen': require('../../assets/signature-icons/fountain_pen.png'),
  compass: require('../../assets/signature-icons/compass.png'),
  hourglass: require('../../assets/signature-icons/hourglass.png'),
  'crown fragment': require('../../assets/signature-icons/crown_fragment.png'),
  briefcase: require('../../assets/signature-icons/briefcase.png'),
  'lucky coin': require('../../assets/signature-icons/lucky_coin.png'),
  wrench: require('../../assets/signature-icons/wrench.png'),
  microphone: require('../../assets/signature-icons/microphone.png'),
  'tarot card': require('../../assets/signature-icons/tarot_card.png'),
  stopwatch: require('../../assets/signature-icons/stopwatch.png'),
  'folding chair': require('../../assets/signature-icons/folding_chair.png'),
  polaroid: require('../../assets/signature-icons/polaroid.png'),
  'tuning fork': require('../../assets/signature-icons/tuning_fork.png'),
  megaphone: require('../../assets/signature-icons/megaphone.png'),
  umbrella: require('../../assets/signature-icons/umbrella.png'),
};
export default function EditorItemArt({
  item,
  size = 72,
  onError,
}: {
  item: CatalogSignatureItem;
  size?: number;
  onError?: () => void;
}) {
  const colors = useThemedColors();
  const [failed, setFailed] = useState<string | null>(null);
  const bundled = !item.isCustom ? ART[item.name.toLowerCase()] : undefined;
  const source =
    bundled ??
    (item.iconUrl && failed !== item.iconUrl ? { uri: item.iconUrl } : null);
  return source ? (
    <Image
      source={source}
      resizeMode="contain"
      accessible={false}
      style={{ width: size, height: size }}
      onError={() => {
        setFailed(item.iconUrl ?? null);
        onError?.();
      }}
    />
  ) : (
    <GameIcon name="gear" size={size} color={colors.ornament} />
  );
}
