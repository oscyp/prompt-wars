import React, { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { useThemedColors } from '@/hooks/useThemedColors';
import { fighterCardCopy } from '@/utils/profileView';
import type { StatBlock } from '@/types/battle';
import { NO_COSMETICS, type EquippedCosmetics } from '@/utils/cosmetics';
import CosmeticFrame from '@/components/CosmeticFrame';
import CosmeticTitle from '@/components/CosmeticTitle';
import CosmeticBadge from '@/components/CosmeticBadge';
import { GameBevel } from './GameBevel';
import { GameText } from './GameText';
import { FighterStatTray } from './FighterStatTray';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

export interface FighterCardProps {
  variant?: 'hero' | 'compact' | 'collection';
  name?: string | null;
  archetype?: string | null;
  battleCry?: string | null;
  itemName?: string | null;
  renderUri: string | null;
  avatarUri?: string | null;
  signatureColor: string;
  stats?: StatBlock | null;
  cosmetics?: EquippedCosmetics;
  onPress?: () => void;
  onImageError?: () => void;
}

/** One identity treatment across Arena, Profile and the collection. Art never carries labels. */
export default function FighterCard({
  variant = 'hero',
  name,
  archetype,
  battleCry,
  itemName,
  renderUri,
  avatarUri,
  signatureColor,
  stats,
  cosmetics = NO_COSMETICS,
  onPress,
  onImageError,
}: FighterCardProps) {
  const colors = useThemedColors();
  const { width: viewport, fontScale } = useWindowDimensions();
  const [available, setAvailable] = useState(Math.min(viewport - 48, 360));
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const compact = variant === 'compact';
  const uri = compact ? avatarUri : renderUri;
  const source =
    uri && failedUri !== uri ? { uri } : getArchetypeAvatar(archetype);
  const copy = fighterCardCopy({ name, archetype, battleCry, itemName });
  const size = compact
    ? 64
    : Math.max(48, Math.min(variant === 'hero' ? 360 : 220, available));
  const portraitFrame = cosmetics.frame?.artwork?.portrait;
  const captionOverlap = portraitFrame
    ? (size / portraitFrame.aspectRatio) * (portraitFrame.captionOverlap ?? 0)
    : 0;
  const onError = () => {
    setFailedUri(uri ?? null);
    onImageError?.();
  };
  const art =
    cosmetics.frame || compact ? (
      <CosmeticFrame
        source={source}
        frame={cosmetics.frame}
        variant={compact ? 'circle' : 'fullBody'}
        size={size}
        accentColor={colors.ornament}
        onImageError={onError}
      />
    ) : (
      <View
        testID="fighter-default-frame"
        style={{ width: size, height: size * 1.5, padding: 5 }}
      >
        <GameBevel
          color={colors.ornament}
          insetColor={colors.ornamentMuted}
          fill={colors.card}
        />
        <Image
          testID="fighter-hero-image"
          source={source}
          resizeMode="contain"
          onError={onError}
          accessible={false}
          style={{ flex: 1, width: '100%' }}
        />
      </View>
    );
  const identity = (
    <>
      <View
        style={styles.art}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {!compact && (
          <Svg
            width="100%"
            height="100%"
            style={StyleSheet.absoluteFill}
            accessible={false}
          >
            <Defs>
              <RadialGradient
                id="fighter-atmosphere"
                cx="50%"
                cy="55%"
                rx="65%"
                ry="60%"
              >
                <Stop offset="0" stopColor={signatureColor} stopOpacity={0.3} />
                <Stop offset="1" stopColor={signatureColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#fighter-atmosphere)" />
          </Svg>
        )}
        {art}
      </View>
      <View
        testID="fighter-hero-caption"
        style={[
          styles.caption,
          !compact && {
            backgroundColor: colors.card,
            marginTop: -captionOverlap,
          },
          compact && styles.compactCaption,
        ]}
      >
        {!compact && <GameBevel color={colors.ornamentMuted} cut={8} />}
        <View style={styles.nameRow}>
          <GameText
            variant="fighter"
            style={[
              styles.name,
              { color: compact ? colors.text : colors.ornament },
              compact && { fontSize: 24, lineHeight: 30 },
            ]}
          >
            {copy.name}
          </GameText>
          <CosmeticBadge badge={cosmetics.badge} size={20} />
        </View>
        <View style={{ alignItems: compact ? 'flex-start' : 'center' }}>
          <CosmeticTitle title={cosmetics.title} />
        </View>
        {!!copy.subtitle && (
          <GameText
            variant="caption"
            style={{
              color: colors.textSecondary,
              textAlign: compact ? 'left' : 'center',
            }}
          >
            {copy.subtitle}
          </GameText>
        )}
      </View>
    </>
  );
  return (
    <View
      style={styles.root}
      onLayout={(e) => setAvailable(Math.max(48, e.nativeEvent.layout.width))}
    >
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={copy.accessibilityLabel}
          style={({ pressed }) => [
            compact && styles.compact,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View
            style={compact && styles.compact}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {identity}
          </View>
        </Pressable>
      ) : (
        <View style={compact && styles.compact}>{identity}</View>
      )}
      {!compact && stats && (
        <FighterStatTray
          stats={stats}
          availableWidth={available}
          fontScale={fontScale}
        />
      )}
      {!compact && !!copy.battleCry && (
        <GameText
          variant="caption"
          style={{
            color: colors.textSecondary,
            textAlign: 'center',
            paddingTop: 10,
          }}
        >
          {copy.battleCry}
        </GameText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  art: { alignItems: 'center' },
  caption: { paddingTop: 10, paddingBottom: 10, paddingHorizontal: 12, gap: 3 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  compactCaption: { flex: 1, paddingTop: 0, paddingHorizontal: 0 },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  name: { flexShrink: 1, textAlign: 'center' },
});
