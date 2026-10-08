import { useMemo, useRef, useState } from 'react';
import {
  View,
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { GameButton, GameText } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useSheetReturnFocus } from '@/hooks/useSheetReturnFocus';
import type { CatalogSignatureItem } from '@/utils/characters';
import InlineBanner from '../InlineBanner';
import ItemDetailSheet from './ItemDetailSheet';
import EditorItemArt from './EditorItemArt';
import ItemFrame from './ItemFrame';
const FEATURED_ITEMS = ['compass', 'hourglass', 'crown fragment', 'briefcase'];
const featuredOrder = (item: CatalogSignatureItem) => {
  const index = FEATURED_ITEMS.indexOf(item.name.trim().toLowerCase());
  return index < 0 ? FEATURED_ITEMS.length : index;
};
export interface GearPanelProps {
  items: CatalogSignatureItem[];
  equippedId: string;
  currentItem?: CatalogSignatureItem | null;
  savedItemId?: string;
  loading: boolean;
  error: string | null;
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  disabledActionLabel?: string;
  onDisabledAction?: () => void;
  onRetry: () => void;
  onEquip: (id: string) => void;
}
function GearTile({
  item,
  selected,
  previewing,
  busy,
  onPreview,
  onRetry,
}: {
  item: CatalogSignatureItem;
  selected: boolean;
  previewing: boolean;
  busy: boolean;
  onPreview: (ref: React.RefObject<View | null>) => void;
  onRetry: () => void;
}) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const ref = useRef<View>(null);
  const [artFailed, setArtFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  return (
    <ItemFrame
      selected={selected}
      style={{
        width: width >= 390 && fontScale <= 1.15 ? '48%' : '100%',
      }}
    >
      <EditorItemArt
        item={item}
        presentation="plate"
        retryKey={retryKey}
        onError={() => setArtFailed(true)}
        onLoad={() => setArtFailed(false)}
      />
      <View style={[styles.tileLabel, { borderTopColor: colors.border }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <GameText variant="fighter" style={{ fontSize: 19 }}>
            {item.name}
          </GameText>
          {selected && (
            <GameText variant="caption" style={{ color: colors.primary }}>
              Selected
            </GameText>
          )}
        </View>
        <GameButton
          ref={ref}
          label="Preview"
          accessibilityLabel={'Preview ' + item.name}
          accessibilityState={{ expanded: previewing || undefined, selected }}
          endIcon="chevron-right"
          chrome="text"
          tone="secondary"
          disabled={busy}
          onPress={() => onPreview(ref)}
          style={styles.previewButton}
          labelStyle={{ fontSize: 17, textDecorationLine: 'none' }}
        />
      </View>
      {artFailed && (
        <GameButton
          label="Retry artwork"
          chrome="text"
          onPress={() => {
            setArtFailed(false);
            setRetryKey((key) => key + 1);
            onRetry();
          }}
        />
      )}
    </ItemFrame>
  );
}
export default function GearPanel({
  items,
  equippedId,
  currentItem,
  savedItemId,
  loading,
  error,
  busy = false,
  disabled = false,
  disabledReason,
  disabledActionLabel,
  onDisabledAction,
  onRetry,
  onEquip,
}: GearPanelProps) {
  const colors = useThemedColors();
  const { fontScale } = useWindowDimensions();
  const [currentArtFailed, setCurrentArtFailed] = useState(false);
  const [currentRetryKey, setCurrentRetryKey] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { remember, returnFocusRef } = useSheetReturnFocus();
  const predefinedItems = useMemo(
    () =>
      items
        .filter((item) => !item.isCustom)
        .sort((a, b) => featuredOrder(a) - featuredOrder(b)),
    [items],
  );
  const catalog = predefinedItems;
  const equipped =
    items.find((item) => item.id === equippedId) ??
    (currentItem?.id === equippedId ? currentItem : null);
  const preview = predefinedItems.find((item) => item.id === previewId) ?? null;
  const visible = showAll ? catalog : catalog.slice(0, 6);
  if (loading && !items.length && !currentItem)
    return (
      <View style={{ padding: 32 }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  return (
    <>
      <View style={styles.panel}>
        {error && (
          <InlineBanner
            tone="error"
            text={error}
            actionLabel="Retry"
            onAction={onRetry}
          />
        )}
        <ItemFrame
          style={{
            flexDirection: fontScale > 1.3 ? 'column' : 'row',
            alignItems: 'center',
          }}
        >
          {equipped && (
            <EditorItemArt
              item={equipped}
              presentation="plate"
              retryKey={currentRetryKey}
              onError={() => setCurrentArtFailed(true)}
              onLoad={() => setCurrentArtFailed(false)}
              style={{ width: fontScale > 1.3 ? '100%' : '42%' }}
            />
          )}
          <View
            style={{
              flex: fontScale > 1.3 ? undefined : 1,
              alignSelf: 'stretch',
              justifyContent: 'center',
              gap: 5,
              padding: 12,
            }}
          >
            <GameText
              variant="fighter"
              style={{
                fontSize: 14,
                letterSpacing: 0.7,
                color: colors.primary,
              }}
            >
              {savedItemId && savedItemId !== equippedId
                ? 'SELECTED · NOT SAVED'
                : 'CURRENT SIGNATURE ITEM'}
            </GameText>
            <GameText variant="fighter" style={{ fontSize: 25 }}>
              {equipped?.name ?? 'Current item unavailable'}
            </GameText>
            <GameText variant="caption" style={{ color: colors.textSecondary }}>
              {equipped?.isCustom
                ? 'Retained custom item'
                : equipped
                  ? 'Part of your fighter’s identity.'
                  : 'Your current item is kept. Retry to load its details.'}
            </GameText>
            {currentArtFailed && (
              <GameButton
                label="Retry current artwork"
                chrome="text"
                onPress={() => {
                  setCurrentArtFailed(false);
                  setCurrentRetryKey((key) => key + 1);
                  onRetry();
                }}
              />
            )}
          </View>
        </ItemFrame>
        <View style={{ gap: 4 }}>
          <View style={styles.sectionHeading}>
            <GameText
              variant="fighter"
              accessibilityRole="header"
              style={{ fontSize: 19, letterSpacing: 1, color: colors.primary }}
            >
              CHOOSE A SIGNATURE ITEM
            </GameText>
          </View>
          <GameText variant="caption" style={{ color: colors.textSecondary }}>
            A new drawing brings your choice into the artwork.
          </GameText>
        </View>
        <View style={styles.grid}>
          {visible.map((item) => (
            <GearTile
              key={item.id}
              item={item}
              selected={item.id === equippedId}
              previewing={item.id === previewId}
              busy={busy}
              onRetry={onRetry}
              onPreview={(ref) => {
                if (busy) return;
                Keyboard.dismiss();
                remember(ref);
                setPreviewId(item.id);
              }}
            />
          ))}
        </View>
        {!visible.length && (
          <GameText variant="body">No catalogue items available.</GameText>
        )}
        {!showAll && catalog.length > visible.length && (
          <GameButton
            label={'Browse all ' + catalog.length + ' items'}
            chrome="text"
            tone="secondary"
            endIcon="chevron-right"
            onPress={() => setShowAll(true)}
          />
        )}
      </View>
      <ItemDetailSheet
        visible={!!preview}
        item={preview}
        equipped={preview?.id === equippedId}
        busy={busy}
        disabled={disabled}
        disabledReason={disabledReason}
        disabledActionLabel={disabledActionLabel}
        onDisabledAction={onDisabledAction}
        returnFocusRef={returnFocusRef}
        onChoose={(id) => {
          if (disabled || busy) return;
          onEquip(id);
          setPreviewId(null);
        }}
        onClose={() => setPreviewId(null)}
      />
    </>
  );
}
const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12 },
  sectionHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: 8,
    rowGap: 4,
  },
  tileLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  previewButton: { paddingHorizontal: 0, gap: 2, flexShrink: 0 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
});
