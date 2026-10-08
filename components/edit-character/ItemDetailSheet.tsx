import { useState } from 'react';
import { GameButton } from '@/components/game';
import { GameText } from '@/components/game';

import { View, StyleSheet } from 'react-native';
import EditorItemArt from './EditorItemArt';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { TRAIT_LABELS } from '@/constants/CharacterTraits';
import { Spacing } from '@/constants/DesignTokens';
import type { CatalogSignatureItem } from '@/utils/characters';
import BottomSheet from '../sheets/BottomSheet';
import ItemFrame from './ItemFrame';

import { editStyles as s } from './styles';

export interface ItemDetailSheetProps {
  visible: boolean;
  /** Null between openings; the sheet stays mounted so `visible` can toggle. */
  item: CatalogSignatureItem | null;
  /** True when `item` is the staged item; the button reads "Equipped". */
  equipped: boolean;
  /** A save is in flight: Choose shows a spinner and the sheet won't dismiss. */
  busy?: boolean;
  /** Editing is blocked (battle lock); Choose is disabled but details show. */
  disabled?: boolean;
  disabledReason?: string;
  disabledActionLabel?: string;
  onDisabledAction?: () => void;
  onChoose: (id: string) => void;
  onClose: () => void;
  returnFocusRef?: React.RefObject<View | null>;
}

/**
 * What a signature item is, shown where the player tapped.
 *
 * The Gear panel used to answer a tile tap by inserting a preview card near
 * the top of the panel -- usually off-screen, above the grid the player was
 * looking at, so the tap appeared to do nothing. A sheet puts the class,
 * description and Choose button under the thumb instead, and the grid tile it
 * came from stays highlighted behind it.
 */
export default function ItemDetailSheet({
  visible,
  item,
  equipped,
  busy = false,
  disabled = false,
  disabledReason,
  disabledActionLabel,
  onDisabledAction,
  onChoose,
  onClose,
  returnFocusRef,
}: ItemDetailSheetProps) {
  const colors = useThemedColors();
  const [artFailed, setArtFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const accessibleText = useAccessibleTextStyle();
  const canChoose = !equipped && !busy && !disabled;
  const canResolveDisabled = disabled && !equipped && Boolean(onDisabledAction);

  return (
    <BottomSheet
      visible={visible}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      dismissDisabled={busy}
      closeAccessibilityLabel="Close item details"
      showCloseButton
      testID="item-detail-sheet"
      footer={
        item ? (
          <GameButton
            onPress={() => {
              if (canChoose) onChoose(item.id);
              else if (canResolveDisabled) onDisabledAction?.();
            }}
            disabled={!canChoose && !canResolveDisabled}
            accessibilityRole="button"
            accessibilityLabel={
              equipped
                ? undefined
                : canResolveDisabled
                  ? (disabledActionLabel ?? 'Manage battles')
                  : `Use ${item.name}`
            }
            accessibilityState={{ disabled: !canChoose && !canResolveDisabled }}
            style={[
              s.primaryBtn,
              { backgroundColor: colors.primary },
              !canChoose && !canResolveDisabled && s.btnDisabled,
            ]}
            label={
              equipped
                ? 'Selected'
                : canResolveDisabled
                  ? (disabledActionLabel ?? 'Manage battles')
                  : 'Use this item'
            }
            busy={busy}
          />
        ) : undefined
      }
    >
      {item ? (
        <View style={styles.body}>
          <ItemFrame style={{ marginTop: 40 }}>
            <EditorItemArt
              item={item}
              presentation="plate"
              retryKey={retryKey}
              onError={() => setArtFailed(true)}
              onLoad={() => setArtFailed(false)}
            />
          </ItemFrame>
          {artFailed && (
            <GameButton
              label="Retry artwork"
              chrome="text"
              onPress={() => {
                setArtFailed(false);
                setRetryKey((key) => key + 1);
              }}
            />
          )}
          <View style={styles.header}>
            <View style={s.flex1}>
              <GameText
                variant="fighter"
                accessibilityRole="header"
                style={[styles.name, accessibleText, { color: colors.text }]}
              >
                {item.name}
              </GameText>
              <GameText
                variant="caption"
                style={[s.hint, accessibleText, { color: colors.textTertiary }]}
              >
                {TRAIT_LABELS.itemClass[item.itemClass] ?? item.itemClass}
              </GameText>
            </View>
          </View>

          <GameText
            variant="caption"
            style={[s.cardSub, accessibleText, { color: colors.textSecondary }]}
          >
            {item.description}
          </GameText>

          {item.isCustom ? (
            <GameText
              variant="caption"
              style={[s.hint, accessibleText, { color: colors.textTertiary }]}
            >
              Your creation
            </GameText>
          ) : null}

          <GameText
            variant="caption"
            style={[
              s.hint,
              styles.centered,
              accessibleText,
              { color: colors.textTertiary },
            ]}
          >
            {disabled && !equipped
              ? (disabledReason ?? 'Editing is locked during an active battle.')
              : 'Save your choices. A new drawing brings this item into your artwork.'}
          </GameText>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  name: {
    fontSize: 30,
  },
  centered: {
    textAlign: 'center',
  },
});
