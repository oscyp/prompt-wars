import type { SheetFocusRef } from '@/hooks/useSheetReturnFocus';
import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { GameText as Text, GameButton, GamePanel } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { presentationFor } from '@/constants/Cosmetics';
import type { CosmeticItem } from '@/utils/cosmetics';
import type { ShopCharacter } from '@/hooks/useCosmeticShop';
import {
  buyAccessibilityLabel,
  earnOrBuyHint,
  lockedProgressHint,
  rarityLabel,
  type UnlockProgressCounts,
} from '@/utils/walletView';
import { formatCredits } from '@/utils/credits';
import PortraitPreview from '../PortraitPreview';
import CosmeticBadge from '../CosmeticBadge';
import CosmeticTitle from '../CosmeticTitle';

export function ShopButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  selected,
  primary = false,
  focusRef,
  collection = false,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  primary?: boolean;
  focusRef?: SheetFocusRef;
  collection?: boolean;
}) {
  return (
    <GameButton
      ref={focusRef}
      label={label}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      selected={selected}
      tone={primary ? 'primary' : 'secondary'}
      chrome={collection ? 'collection' : 'action'}
    />
  );
}

export function ShopItemAction({
  item,
  wearing,
  busy,
  mutationPending,
  credits,
  progress,
  onBuy,
  onEquip,
  onWallet,
  onEdit,
}: {
  item: CosmeticItem;
  wearing: boolean;
  busy: boolean;
  mutationPending: boolean;
  credits: number | null;
  progress: UnlockProgressCounts | null;
  onBuy: () => void;
  onEquip: () => void;
  onWallet: () => void;
  onEdit: () => void;
}) {
  const colors = useThemedColors();
  if (busy)
    return (
      <View style={styles.button} accessibilityLabel={`Updating ${item.name}`}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  if (item.owned)
    return item.cosmetic_type === 'color' ? (
      <ShopButton
        label="Edit character"
        accessibilityLabel={`Wear ${item.name}. Opens Edit character`}
        onPress={onEdit}
      />
    ) : (
      <ShopButton
        label={wearing ? 'Remove' : 'Equip'}
        accessibilityLabel={`${wearing ? 'Remove' : 'Equip'} ${item.name}`}
        primary={!wearing}
        onPress={onEquip}
        disabled={mutationPending}
      />
    );
  if (item.acquisition !== 'exclusive' && item.price_credits) {
    if (credits !== null && credits < item.price_credits)
      return (
        <View style={styles.details}>
          <Text style={{ color: colors.textSecondary }}>
            Need {formatCredits(item.price_credits)}
          </Text>
          <ShopButton label="Top up" onPress={onWallet} />
        </View>
      );
    return (
      <ShopButton
        label={`Buy · ${formatCredits(item.price_credits)}`}
        accessibilityLabel={buyAccessibilityLabel({
          name: item.name,
          price: item.price_credits,
          earnable: item.acquisition === 'play_unlock',
          rule: item.unlock_rule,
        })}
        primary
        onPress={onBuy}
        disabled={mutationPending}
      />
    );
  }
  if (item.acquisition === 'subscription')
    return <ShopButton label="Prompt Wars+" onPress={onWallet} />;
  return (
    <Text style={{ color: colors.textSecondary }}>
      {item.acquisition === 'exclusive'
        ? 'Launch offer only'
        : item.acquisition === 'free'
          ? 'Included free · refresh to claim'
          : lockedProgressHint(item.unlock_rule, progress)}
    </Text>
  );
}

export function ShopItemCard({
  item,
  character,
  wearing,
  onPreview,
  onImageError,
}: {
  item: CosmeticItem;
  character: ShopCharacter | null;
  wearing: boolean;
  onPreview: (opener: SheetFocusRef) => void;
  onImageError: () => void;
}) {
  const colors = useThemedColors();
  const previewRef = React.useRef<View>(null);
  const [cardWidth, setCardWidth] = useState(170);
  const presentation = presentationFor(item.slug);
  const rarityColor =
    item.rarity === 'legendary'
      ? colors.warning
      : item.rarity === 'epic'
        ? colors.primary
        : colors.textSecondary;
  return (
    <GamePanel
      tone="ornate"
      onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: wearing ? colors.primary : colors.border,
        },
      ]}
    >
      <View style={styles.visual}>
        {character &&
        (presentation?.kind === 'frame' ||
          presentation?.kind === 'avatar_effect') ? (
          <PortraitPreview
            uri={
              presentation.kind === 'frame'
                ? character.portraitUri
                : character.avatarUri
            }
            variant={presentation.kind === 'frame' ? 'fullBody' : 'circle'}
            size={Math.max(
              48,
              Math.min(
                presentation.kind === 'frame' ? 230 : 100,
                cardWidth - 24,
              ),
            )}
            frame={presentation.kind === 'frame' ? presentation : null}
            avatarEffect={
              presentation.kind === 'avatar_effect' ? presentation : null
            }
            accentColor={character.signatureColor}
            onImageError={onImageError}
            accessibilityLabel={`${item.name} on ${character.name}`}
          />
        ) : null}
        {presentation?.kind === 'color' ? (
          <View
            accessibilityLabel={`${presentation.label} colour swatch`}
            style={{
              width: 64,
              height: 48,
              borderRadius: 12,
              backgroundColor: presentation.hex,
            }}
          />
        ) : null}
        {presentation?.kind === 'badge' ? (
          <CosmeticBadge badge={presentation} size={36} />
        ) : null}
        {presentation?.kind === 'title' ? (
          <CosmeticTitle title={presentation} />
        ) : null}
      </View>
      <Text variant="title" style={[styles.name, { color: colors.text }]}>
        {item.name}
      </Text>

      <View style={styles.metadata}>
        <View style={styles.marker}>
          <GameIcon name="crystal" size={18} color={rarityColor} />
          <Text variant="caption" style={{ color: rarityColor }}>
            {rarityLabel(item.rarity)}
          </Text>
        </View>
        {wearing || item.owned ? (
          <View style={styles.marker}>
            <GameIcon name="check" size={18} color={colors.success} />
            <Text variant="caption" style={{ color: colors.success }}>
              {wearing ? 'Equipped' : 'Owned'}
            </Text>
          </View>
        ) : item.price_credits != null ? (
          <View style={styles.marker}>
            <GameIcon name="crystal" size={18} color={colors.primary} />
            <Text
              variant="label"
              style={{ color: colors.ornament, flexShrink: 1 }}
            >
              {formatCredits(item.price_credits, 'sentence')}
            </Text>
          </View>
        ) : null}
      </View>
      {!item.owned &&
      item.acquisition === 'play_unlock' &&
      item.price_credits ? (
        <Text style={{ color: colors.success }}>
          {earnOrBuyHint(item.unlock_rule)}
        </Text>
      ) : null}
      {item.cosmetic_type === 'color' && item.owned ? (
        <Text style={{ color: colors.textSecondary }}>
          Wear this swatch from Edit character.
        </Text>
      ) : null}
      <View style={styles.actions}>
        <ShopButton
          label="Preview"
          collection
          accessibilityLabel={`Preview ${item.name}`}
          focusRef={previewRef}
          onPress={() => onPreview(previewRef)}
        />
      </View>
    </GamePanel>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    minWidth: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 1,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  card: { padding: 12, gap: 10, flex: 1 },
  visual: {
    alignItems: 'center',
    gap: 12,
  },
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  marker: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  name: { fontSize: 22, lineHeight: 28 },
  actions: {
    marginTop: 'auto',
    gap: 12,
  },
  details: { gap: 8 },
});
