import { useState } from 'react';
import {
  Image,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GameIcon } from '@/components/game/icons/GameIcon';
import type { CatalogSignatureItem } from '@/utils/characters';
import { useThemedColors } from '@/hooks/useThemedColors';
const ART: Record<string, ImageSourcePropType> = {
  'fountain pen': require('../../assets/signature-icons/fountain_pen.jpg'),
  compass: require('../../assets/signature-icons/compass.jpg'),
  hourglass: require('../../assets/signature-icons/hourglass.jpg'),
  'crown fragment': require('../../assets/signature-icons/crown_fragment.jpg'),
  briefcase: require('../../assets/signature-icons/briefcase.jpg'),
  'lucky coin': require('../../assets/signature-icons/lucky_coin.jpg'),
  wrench: require('../../assets/signature-icons/wrench.jpg'),
  microphone: require('../../assets/signature-icons/microphone.jpg'),
  'tarot card': require('../../assets/signature-icons/tarot_card.jpg'),
  stopwatch: require('../../assets/signature-icons/stopwatch.jpg'),
  'folding chair': require('../../assets/signature-icons/folding_chair.jpg'),
  polaroid: require('../../assets/signature-icons/polaroid.jpg'),
  'tuning fork': require('../../assets/signature-icons/tuning_fork.jpg'),
  megaphone: require('../../assets/signature-icons/megaphone.jpg'),
  umbrella: require('../../assets/signature-icons/umbrella.jpg'),
};
export default function EditorItemArt({
  item,
  size = 72,
  onError,
  onLoad,
  presentation = 'icon',
  retryKey = 0,
  style,
}: {
  item: CatalogSignatureItem;
  size?: number;
  onError?: () => void;
  onLoad?: () => void;
  presentation?: 'icon' | 'plate';
  retryKey?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemedColors();
  const [failed, setFailed] = useState<string | null>(null);
  const bundled = !item.isCustom
    ? ART[item.name.trim().toLowerCase()]
    : undefined;
  const identity = `${item.id}:${bundled ? 'bundled' : item.iconUrl}:${retryKey}`;
  const source =
    failed === identity
      ? null
      : (bundled ?? (item.iconUrl ? { uri: item.iconUrl } : null));
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        presentation === 'plate'
          ? { width: '100%', aspectRatio: 1.5 }
          : { width: size, height: size },
        { alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      {source ? (
        <Image
          key={identity}
          source={source}
          resizeMode="contain"
          accessible={false}
          onLoad={onLoad}
          style={{ width: '100%', height: '100%' }}
          onError={() => {
            setFailed(identity);
            onError?.();
          }}
        />
      ) : (
        <GameIcon name="gear" size={size} color={colors.ornament} />
      )}
    </View>
  );
}
