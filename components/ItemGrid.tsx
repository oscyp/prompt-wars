import { GameText } from '@/components/game';
import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing } from '@/constants/DesignTokens';
import { TRAIT_LABELS } from '@/constants/CharacterTraits';
import { CatalogSignatureItem } from '@/utils/characters';
import { hapticSelection } from '@/utils/haptics';
import EditorItemArt from '@/components/edit-character/EditorItemArt';
import ItemFrame from '@/components/edit-character/ItemFrame';

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
}

export default function ItemGrid({
  items,
  selectedId,
  onSelect,
  previewId = null,
}: ItemGridProps) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const singleColumn = width < 390 || fontScale > 1.15;
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
            style={[styles.tile, { width: singleColumn ? '100%' : '48%' }]}
          >
            <ItemFrame
              selected={equipped || previewing}
              style={{ width: '100%' }}
            >
              <EditorItemArt item={item} presentation="plate" />
              <View style={styles.captionArea}>
                <GameText
                  variant="fighter"
                  style={[styles.name, { color: colors.text }]}
                >
                  {item.name}
                </GameText>
                <GameText
                  variant="caption"
                  style={{ color: colors.textSecondary }}
                >
                  {classLabel}
                </GameText>
              </View>
              {equipped ? (
                <GameSymbol
                  name="checkmark-circle"
                  size={18}
                  color={colors.primary}
                  style={styles.badge}
                />
              ) : null}
            </ItemFrame>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const TILE_SIZE = '48%';

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  tile: {
    width: TILE_SIZE,
    minHeight: 128,
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
  },
  captionArea: { padding: 10, gap: 4 },
  name: {
    fontSize: 22,
  },
});
