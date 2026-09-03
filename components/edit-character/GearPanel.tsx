import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  StyleSheet,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { TRAIT_LABELS } from '@/constants/CharacterTraits';
import { formatCredits } from '@/utils/credits';

import type { CatalogSignatureItem } from '@/utils/characters';
import ItemGrid from '../ItemGrid';
import InlineBanner from '../InlineBanner';
import ItemDetailSheet from './ItemDetailSheet';
import { editStyles as s } from './styles';

/** How many catalog tiles show before "Browse all". */
const CATALOG_PREVIEW = 15;

export interface GearPanelProps {
  items: CatalogSignatureItem[];
  /** Never null: a character always has an item. */
  equippedId: string;
  loading: boolean;
  error: string | null;
  customCost: number;
  /** False when live prices are unknown; creating an item is paid, so it waits. */
  pricingVerified?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onRetry: () => void;
  onEquip: (id: string) => void;
  onCreateCustom: () => void;
}

/**
 * Equipped item first, then the player's own items, then the shared catalogue.
 *
 * The old order put a 15-item slice of the shared catalogue at the top with no
 * indication that more existed, the player's own creations below it, and no
 * way to see what the equipped item even was beyond a highlighted tile. Tiles
 * showed an icon and a truncated name, so class and description -- the parts
 * that say what an item does to your render -- were invisible until after it
 * was equipped.
 *
 * Tapping a tile opens `ItemDetailSheet` rather than inserting a preview card
 * at the top of the panel: that card usually landed off-screen, above the grid
 * the player was looking at, so the tap appeared to do nothing. The tapped
 * tile stays highlighted behind the sheet, and the equipped tile opens the
 * sheet in its "Equipped" state so every tile answers a tap the same way.
 *
 * Layout only: the screen's outer scroll owns scrolling, so this renders a
 * plain `View` and never a scroll view of its own.
 */
export default function GearPanel({
  items,
  equippedId,
  loading,
  error,
  customCost,
  pricingVerified = true,
  busy = false,
  disabled = false,
  onRetry,
  onEquip,
  onCreateCustom,
}: GearPanelProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const equipped = items.find((i) => i.id === equippedId) ?? null;
  const custom = items.filter((i) => i.isCustom);
  const catalog = useMemo(() => {
    const base = items.filter((i) => !i.isCustom);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Searching is itself a request to see everything that matches.
  const searching = query.trim().length > 0;
  const visibleCatalog =
    showAll || searching ? catalog : catalog.slice(0, CATALOG_PREVIEW);
  const hiddenCount = catalog.length - visibleCatalog.length;

  const preview = items.find((i) => i.id === previewId) ?? null;

  const openPreview = (id: string) => {
    if (busy) return;
    // The search field may hold focus; a sheet over a live keyboard is cramped.
    Keyboard.dismiss();
    setPreviewId(id);
  };

  if (loading) {
    return (
      <View style={[s.panel, styles.centered, { minHeight: 200 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <View style={s.panel}>
        {error ? (
          <InlineBanner
            tone="error"
            text={error}
            actionLabel="Retry"
            onAction={onRetry}
          />
        ) : null}

        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, accessibleText, { color: colors.text }]}>
            Equipped item
          </Text>
          {/* No unequip. signature_item_id is NOT NULL and the item feeds the
              portrait prompt, so "none" only ever meant a blander render nobody
              chose. Gear is which one, not whether. */}
          {equipped ? (
            <>
              <Text style={[s.cardSub, accessibleText, { color: colors.text }]}>
                {`${equipped.name} · ${TRAIT_LABELS.itemClass[equipped.itemClass]}`}
              </Text>
              <Text
                style={[
                  s.cardSub,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                {equipped.description}
              </Text>
            </>
          ) : (
            <Text
              style={[
                s.cardSub,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              Loading…
            </Text>
          )}
        </View>

        <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
          Your items
        </Text>
        {custom.length === 0 ? (
          <Text
            style={[s.hint, accessibleText, { color: colors.textSecondary }]}
          >
            {`You haven't made one yet. Creating an item costs ${formatCredits(customCost, 'sentence')}.`}
          </Text>
        ) : null}
        <ItemGrid
          items={custom}
          selectedId={equippedId}
          previewId={previewId}
          onSelect={openPreview}
          onCreateCustom={
            disabled || !pricingVerified ? undefined : onCreateCustom
          }
        />

        <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
          Catalogue
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search the catalogue"
          placeholderTextColor={colors.textTertiary}
          style={[
            s.input,
            { backgroundColor: colors.card, color: colors.text },
          ]}
          accessibilityLabel="Search the item catalogue"
        />
        {visibleCatalog.length === 0 ? (
          <Text
            style={[s.hint, accessibleText, { color: colors.textSecondary }]}
          >
            {searching
              ? `Nothing matches “${query.trim()}”.`
              : 'No catalogue items yet.'}
          </Text>
        ) : (
          <ItemGrid
            items={visibleCatalog}
            selectedId={equippedId}
            previewId={previewId}
            onSelect={openPreview}
          />
        )}
        {hiddenCount > 0 ? (
          <TouchableOpacity
            onPress={() => setShowAll(true)}
            accessibilityRole="button"
            accessibilityLabel={`Browse all ${catalog.length} catalogue items`}
            style={[s.secondaryBtn, { borderColor: colors.border }]}
          >
            <Text style={[s.secondaryBtnText, { color: colors.text }]}>
              {`Browse all ${catalog.length} items`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ItemDetailSheet
        visible={preview !== null}
        item={preview}
        equipped={preview?.id === equippedId}
        busy={busy}
        disabled={disabled}
        onChoose={(id) => {
          onEquip(id);
          setPreviewId(null);
        }}
        onClose={() => setPreviewId(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
