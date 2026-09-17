import React, { useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { GameText, GamePanel, GameButton } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import PortraitPreview from '@/components/PortraitPreview';
import { useThemedColors } from '@/hooks/useThemedColors';
import type { ShopCharacter } from '@/hooks/useCosmeticShop';
import type {
  CosmeticConfig,
  CosmeticItem,
  CosmeticType,
} from '@/utils/cosmetics';
const SLOTS = [
  { type: 'frame', label: 'Frame' },
  { type: 'title', label: 'Title' },
  { type: 'avatar_effect', label: 'Aura' },
  { type: 'badge', label: 'Badge' },
] as const;
export function ShopEquippedSummary({
  category,
  items,
  equipped,
  character,
  characterStatus,
  onEdit,
  onImageError,
}: {
  category: CosmeticType;
  items: CosmeticItem[];
  equipped: CosmeticConfig;
  character: ShopCharacter | null;
  characterStatus: 'loading' | 'ready' | 'empty' | 'error';
  onEdit: () => void;
  onImageError: () => void;
}) {
  const colors = useThemedColors();
  const [expanded, setExpanded] = useState(false);
  const slot = SLOTS.find(({ type }) => type === category);
  const slug = equipped[category];
  const name = items.find((item) => item.slug === slug)?.name;
  const heading =
    category === 'color'
      ? 'Signature colour'
      : slug
        ? `Wearing ${name ?? 'equipped cosmetic'}`
        : `No ${slot?.label.toLowerCase() ?? 'cosmetic'} equipped`;
  return (
    <GamePanel tone="ornate" style={styles.panel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${heading}. ${expanded ? 'Hide' : 'Show'} complete loadout`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={styles.summary}
      >
        {character ? (
          <PortraitPreview
            uri={character.avatarUri}
            variant="circle"
            size={48}
            accentColor={character.signatureColor}
            onImageError={onImageError}
            accessibilityLabel={character.name}
          />
        ) : (
          <GameIcon name="hanger" size={36} color={colors.primary} />
        )}
        <View style={styles.copy}>
          <GameText variant="label">{heading}</GameText>
          <GameText variant="caption" style={{ color: colors.textSecondary }}>
            {category === 'color'
              ? 'Change in Edit character'
              : `${slot?.label ?? 'Cosmetic'} · ${slug ? 'Equipped' : 'Not equipped'}`}
          </GameText>
        </View>
        <GameIcon name="chevron-right" size={22} color={colors.primary} />
      </Pressable>
      {expanded && (
        <View style={styles.details}>
          <GameText accessibilityRole="header" variant="label">
            Currently wearing{character ? ` · ${character.name}` : ''}
          </GameText>
          {SLOTS.map((entry) => (
            <GameText key={entry.type} style={{ color: colors.textSecondary }}>
              {entry.label}:{' '}
              {items.find((item) => item.slug === equipped[entry.type])?.name ??
                (equipped[entry.type] ? 'Equipped cosmetic' : 'None')}
            </GameText>
          ))}
          <GameButton
            label="Edit character colours"
            chrome="utility"
            gameIcon="palette"
            onPress={onEdit}
          />
        </View>
      )}
      {characterStatus === 'empty' && (
        <GameText variant="caption" style={{ color: colors.textSecondary }}>
          Create a fighter to try on and equip cosmetics.
        </GameText>
      )}
      {characterStatus === 'error' && (
        <GameText variant="caption" style={{ color: colors.warning }}>
          Couldn’t refresh your fighter. Retry to check your loadout.
        </GameText>
      )}
    </GamePanel>
  );
}
const styles = StyleSheet.create({
  panel: { padding: 12, gap: 8 },
  summary: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: { flex: 1, gap: 2 },
  details: { gap: 8, paddingTop: 8 },
});
