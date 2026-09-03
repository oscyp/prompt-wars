import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { ItemClass, TRAIT_LABELS } from '@/constants/CharacterTraits';
import { CatalogSignatureItem } from '@/utils/characters';
import { hapticSelection } from '@/utils/haptics';

/**
 * Designed vector fallback per item class (used when a catalog item has no
 * icon). Exported so the detail sheet shows the same glyph the tile did.
 */
export const ITEM_CLASS_ICON: Record<
  ItemClass,
  React.ComponentProps<typeof MaterialCommunityIcons>['name']
> = {
  tool: 'hammer-wrench',
  symbol: 'star-four-points',
  weaponized_mundane: 'lightning-bolt',
  relic: 'diamond-stone',
  instrument: 'music',
};

export type ItemGridItem = CatalogSignatureItem;

interface ItemGridProps {
  items: ItemGridItem[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /**
   * Item whose details are open (the editor's detail sheet) but which is not
   * equipped. Its tile is highlighted and filled so the player can see which
   * tile the sheet belongs to. Onboarding omits it: there, a tap equips.
   */
  previewId?: string | null;
  /**
   * Renders the "Create your own" tile when provided. Optional because the
   * panel shows two grids (catalog + the player's own items) and the tile must
   * appear exactly once across both.
   */
  onCreateCustom?: () => void;
}

export default function ItemGrid({
  items,
  selectedId,
  onSelect,
  previewId = null,
  onCreateCustom,
}: ItemGridProps) {
  const colors = useThemedColors();
  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const equipped = item.id === selectedId;
        const previewing = !equipped && item.id === previewId;
        const classLabel =
          TRAIT_LABELS.itemClass[item.itemClass] ?? item.itemClass;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => {
              hapticSelection();
              onSelect(item.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Signature item: ${item.name}, ${classLabel}`}
            // `expanded` only while previewing: a present-but-false value is
            // read aloud as "collapsed" on every other tile.
            accessibilityState={
              previewing
                ? { selected: false, expanded: true }
                : { selected: equipped }
            }
            style={[
              styles.tile,
              {
                backgroundColor: previewing
                  ? colors.backgroundTertiary
                  : colors.card,
                borderColor:
                  equipped || previewing ? colors.primary : colors.border,
              },
            ]}
          >
            {equipped ? (
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={colors.primary}
                style={styles.badge}
              />
            ) : null}
            {item.iconUrl ? (
              <Image
                source={{ uri: item.iconUrl }}
                style={styles.icon}
                accessibilityLabel=""
              />
            ) : (
              <MaterialCommunityIcons
                name={ITEM_CLASS_ICON[item.itemClass] ?? 'star-four-points'}
                size={32}
                color={colors.primary}
                style={styles.glyph}
              />
            )}
            <Text
              numberOfLines={1}
              style={[styles.name, { color: colors.text }]}
            >
              {item.name}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.caption, { color: colors.textTertiary }]}
            >
              {classLabel}
            </Text>
          </TouchableOpacity>
        );
      })}
      {onCreateCustom ? (
        <TouchableOpacity
          onPress={() => {
            hapticSelection();
            onCreateCustom();
          }}
          accessibilityRole="button"
          accessibilityLabel="Create your own signature item"
          style={[
            styles.tile,
            styles.customTile,
            { borderColor: colors.primary },
          ]}
        >
          <Ionicons
            name="add"
            size={32}
            color={colors.primary}
            style={styles.glyph}
          />
          <Text style={[styles.name, { color: colors.primary }]}>
            Create your own
          </Text>
        </TouchableOpacity>
      ) : null}
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
  badge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
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
  caption: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
    marginTop: 1,
  },
});
