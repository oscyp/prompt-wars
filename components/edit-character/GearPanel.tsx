import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { TRAIT_LABELS } from '@/constants/CharacterTraits';
import { formatCredits } from '@/utils/credits';

import type { CatalogSignatureItem } from '@/utils/characters';
import ItemGrid from '../ItemGrid';
import InlineBanner from '../InlineBanner';
import { editStyles as s } from './styles';

/** How many catalog tiles show before "Browse all". */
const CATALOG_PREVIEW = 15;

export interface GearPanelProps {
  items: CatalogSignatureItem[];
  equippedId: string | null;
  loading: boolean;
  error: string | null;
  customCost: number;
  /** False when live prices are unknown; creating an item is paid, so it waits. */
  pricingVerified?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onRetry: () => void;
  onEquip: (id: string | null) => void;
  onCreateCustom: () => void;
}

/**
 * Equipped item first, then the player's own items, then the shared catalog.
 *
 * The old order put a 15-item slice of the shared catalog at the top with no
 * indication that more existed, the player's own creations below it, and no
 * way to see what the equipped item even was beyond a highlighted tile. Tiles
 * showed an icon and a truncated name, so class and description -- the parts
 * that say what an item does to your render -- were invisible until after it
 * was equipped.
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

  if (loading) {
    return (
      <View style={[s.panelScroll, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.panelScroll}
      contentContainerStyle={s.panel}
      keyboardShouldPersistTaps="handled"
    >
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
            <TouchableOpacity
              onPress={() => onEquip(null)}
              disabled={busy || disabled}
              accessibilityRole="button"
              accessibilityLabel="Unequip signature item"
              style={[
                s.secondaryBtn,
                { borderColor: colors.border },
                (busy || disabled) && s.btnDisabled,
              ]}
            >
              <Text style={[s.secondaryBtnText, { color: colors.text }]}>
                Unequip
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text
            style={[s.cardSub, accessibleText, { color: colors.textSecondary }]}
          >
            Nothing equipped. Your fighter renders without a signature prop.
          </Text>
        )}
      </View>

      {preview && preview.id !== equippedId ? (
        <View
          style={[
            s.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.primary,
              borderWidth: 1,
            },
          ]}
        >
          <Text style={[s.cardTitle, accessibleText, { color: colors.text }]}>
            {preview.name}
          </Text>
          <Text
            style={[s.hint, accessibleText, { color: colors.textTertiary }]}
          >
            {TRAIT_LABELS.itemClass[preview.itemClass]}
          </Text>
          <Text
            style={[s.cardSub, accessibleText, { color: colors.textSecondary }]}
          >
            {preview.description}
          </Text>
          <TouchableOpacity
            onPress={() => {
              onEquip(preview.id);
              setPreviewId(null);
            }}
            disabled={busy || disabled}
            accessibilityRole="button"
            accessibilityLabel={`Equip ${preview.name}, free`}
            style={[
              s.primaryBtn,
              { backgroundColor: colors.primary },
              (busy || disabled) && s.btnDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.primaryBtnText}>Equip · Free</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
        Your items
      </Text>
      {custom.length === 0 ? (
        <Text style={[s.hint, accessibleText, { color: colors.textSecondary }]}>
          {`You haven't made one yet. Creating an item costs ${formatCredits(customCost, 'sentence')}.`}
        </Text>
      ) : null}
      <ItemGrid
        items={custom}
        selectedId={equippedId ?? undefined}
        onSelect={(id) => !busy && setPreviewId(id)}
        onCreateCustom={
          disabled || !pricingVerified ? undefined : onCreateCustom
        }
      />

      <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
        Catalog · free to equip
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search the catalog"
        placeholderTextColor={colors.textTertiary}
        style={[s.input, { backgroundColor: colors.card, color: colors.text }]}
        accessibilityLabel="Search the item catalog"
      />
      {visibleCatalog.length === 0 ? (
        <Text style={[s.hint, accessibleText, { color: colors.textSecondary }]}>
          {searching
            ? `Nothing matches “${query.trim()}”.`
            : 'No catalog items yet.'}
        </Text>
      ) : (
        <ItemGrid
          items={visibleCatalog}
          selectedId={equippedId ?? undefined}
          onSelect={(id) => !busy && setPreviewId(id)}
        />
      )}
      {hiddenCount > 0 ? (
        <TouchableOpacity
          onPress={() => setShowAll(true)}
          accessibilityRole="button"
          accessibilityLabel={`Browse all ${catalog.length} catalog items`}
          style={[s.secondaryBtn, { borderColor: colors.border }]}
        >
          <Text style={[s.secondaryBtnText, { color: colors.text }]}>
            {`Browse all ${catalog.length} items`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
