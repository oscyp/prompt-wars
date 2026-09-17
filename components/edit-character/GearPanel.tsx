import { useMemo, useRef, useState } from 'react';
import {
  View,
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { GameButton, GameField, GamePanel, GameText } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useSheetReturnFocus } from '@/hooks/useSheetReturnFocus';
import type { CatalogSignatureItem } from '@/utils/characters';
import InlineBanner from '../InlineBanner';
import ItemDetailSheet from './ItemDetailSheet';
import EditorItemArt from './EditorItemArt';
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
  return (
    <GamePanel
      tone={selected ? 'selected' : 'quiet'}
      style={{
        width: width >= 390 && fontScale <= 1.15 ? '48%' : '100%',
        alignItems: 'center',
        gap: 7,
        padding: 10,
      }}
    >
      <EditorItemArt item={item} size={82} onError={() => setArtFailed(true)} />
      <GameText variant="fighter" style={{ fontSize: 22, textAlign: 'center' }}>
        {item.name}
      </GameText>
      <GameText variant="caption" style={{ color: colors.textSecondary }}>
        {selected ? 'Selected' : 'Signature item'}
      </GameText>
      {artFailed && (
        <GameButton
          label="Retry artwork"
          chrome="text"
          onPress={() => {
            setArtFailed(false);
            onRetry();
          }}
        />
      )}
      <GameButton
        ref={ref}
        label="Preview"
        accessibilityLabel={'Preview ' + item.name}
        accessibilityState={{ expanded: previewing || undefined, selected }}
        gameIcon="look"
        chrome="text"
        tone="secondary"
        disabled={busy}
        onPress={() => onPreview(ref)}
        style={{ alignSelf: 'stretch' }}
      />
    </GamePanel>
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
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { remember, returnFocusRef } = useSheetReturnFocus();
  const predefinedItems = useMemo(
    () => items.filter((item) => !item.isCustom),
    [items],
  );
  const catalog = useMemo(
    () =>
      predefinedItems.filter((item) =>
        (item.name + ' ' + item.description)
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [predefinedItems, query],
  );
  const equipped =
    items.find((item) => item.id === equippedId) ??
    (currentItem?.id === equippedId ? currentItem : null);
  const preview = predefinedItems.find((item) => item.id === previewId) ?? null;
  const visible = showAll || query.trim() ? catalog : catalog.slice(0, 6);
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
        <GamePanel
          tone="ornate"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          {equipped && <EditorItemArt item={equipped} size={64} />}
          <View style={{ flex: 1, gap: 5 }}>
            <GameText variant="caption" style={{ color: colors.ornament }}>
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
                : (equipped?.description ??
                  'Your current item is kept. Retry to load its details.')}
            </GameText>
          </View>
        </GamePanel>
        <GameText variant="title" style={{ fontSize: 23 }}>
          Choose a signature item
        </GameText>
        <GameText variant="caption" style={{ color: colors.textSecondary }}>
          All choices are free. A new drawing brings your chosen item into the
          artwork.
        </GameText>
        {showAll && (
          <GameField
            value={query}
            onChangeText={setQuery}
            placeholder="Search the catalogue"
            accessibilityLabel="Search the item catalogue"
          />
        )}
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
          <GameText variant="body">
            {query.trim()
              ? 'No matching items.'
              : 'No catalogue items available.'}
          </GameText>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
});
