import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { ITEM_CLASS_GLYPH, ItemClass } from '@/constants/CharacterTraits';
import { CatalogSignatureItem } from '@/utils/characters';

export interface ItemGridItem extends CatalogSignatureItem {}

interface ItemGridProps {
  items: ItemGridItem[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onCreateCustom: () => void;
}

export default function ItemGrid({
  items,
  selectedId,
  onSelect,
  onCreateCustom,
}: ItemGridProps) {
  const colors = useThemedColors();
  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onSelect(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Signature item: ${item.name}`}
            accessibilityState={{ selected }}
            style={[
              styles.tile,
              {
                backgroundColor: colors.card,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
          >
            {item.iconUrl ? (
              <Image
                source={{ uri: item.iconUrl }}
                style={styles.icon}
                accessibilityLabel=""
              />
            ) : (
              <Text style={[styles.glyph, { color: colors.primary }]}>
                {ITEM_CLASS_GLYPH[item.itemClass as ItemClass] ?? '✦'}
              </Text>
            )}
            <Text
              numberOfLines={1}
              style={[styles.name, { color: colors.text }]}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        onPress={onCreateCustom}
        accessibilityRole="button"
        accessibilityLabel="Create your own signature item"
        style={[
          styles.tile,
          styles.customTile,
          { borderColor: colors.primary },
        ]}
      >
        <Text style={[styles.glyph, { color: colors.primary }]}>＋</Text>
        <Text style={[styles.name, { color: colors.primary }]}>
          Create your own
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const TILE_SIZE = '31%';

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tile: {
    width: TILE_SIZE,
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  customTile: {
    borderStyle: 'dashed',
  },
  glyph: {
    fontSize: 32,
    marginBottom: Spacing.xs,
  },
  icon: {
    width: 40,
    height: 40,
    marginBottom: Spacing.xs,
    resizeMode: 'contain',
  },
  name: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
    textAlign: 'center',
  },
});
