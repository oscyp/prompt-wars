import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
  Layout,
} from '@/constants/DesignTokens';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';
import { getWalletBalanceResult } from '@/utils/monetization';
import { fetchProfileRow, type ProfileRow } from '@/utils/profileData';
import {
  listCosmetics,
  purchaseCosmetic,
  equipCosmetic,
  syncCosmetics,
  resolveEquippedCosmetics,
  CosmeticItem,
  CosmeticType,
} from '@/utils/cosmetics';
import { getPortraitFallbackUri } from '@/utils/characters';
import {
  presentationFor,
  RENDERABLE_COSMETIC_TYPES,
} from '@/constants/Cosmetics';
import { CosmeticPreview, CreditChip, Toast } from '@/components';
import ConfirmSheet from '@/components/sheets/ConfirmSheet';
import { HEADER_BUTTON_SIZE } from '@/components/HeaderBackButton';
import { spendRows } from '@/utils/editDialogCopy';
import { formatCredits, insufficientCreditsMessage } from '@/utils/credits';
import { hapticSelection, hapticSuccess } from '@/utils/haptics';
import {
  alsoEarnHint,
  buyAccessibilityLabel,
  cosmeticErrorMessage,
  earnOrBuyHint,
  lockedProgressHint,
  rarityLabel,
  type UnlockProgressCounts,
} from '@/utils/walletView';

const TYPE_ORDER: { type: CosmeticType; label: string }[] = [
  { type: 'frame', label: 'Frames' },
  { type: 'title', label: 'Titles' },
  { type: 'color', label: 'Signature Colours' },
  { type: 'reveal_style', label: 'Reveal Styles' },
  { type: 'avatar_effect', label: 'Avatar Effects' },
  { type: 'badge', label: 'Badges' },
];

type LoadState = 'loading' | 'ready' | 'error';

const TOAST_MS = 2500;

/** Types with a display surface. Mirrors the guard in the cosmetics function. */
function isRenderable(type: string): boolean {
  return (RENDERABLE_COSMETIC_TYPES as readonly string[]).includes(type);
}

function rarityColor(
  rarity: CosmeticItem['rarity'],
  colors: ReturnType<typeof useThemedColors>,
): string {
  switch (rarity) {
    case 'legendary':
      return colors.warning;
    case 'epic':
      return colors.primary;
    case 'rare':
      return colors.info;
    default:
      return colors.textSecondary;
  }
}

interface CharacterRow {
  id: string;
  cosmetic_config: Record<string, string>;
  name: string;
  archetype: string;
  signature_color: string;
  portrait_id: string | null;
}

export default function CosmeticShopScreen() {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const accessibleText = useAccessibleTextStyle();
  const { user } = useAuth();

  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [equipped, setEquipped] = useState<Record<string, string>>({});
  // The player's own counters, so a locked earned item can say "18 of 25
  // wins" instead of just the target. `null` (not loaded, or failed) falls
  // back to the bare rule -- never "0 of 25" over a read error.
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  // `null` until the balance has been read, so a failed read is never shown
  // (or compared against a price) as zero.
  const [credits, setCredits] = useState<number | null>(null);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  // The item the player is looking at. The preview shows their own fighter
  // wearing it, which is the only preview that answers "what will I get".
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<CosmeticItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [character, setCharacter] = useState<{
    name: string;
    signatureColor: string;
    portraitUri: string;
  } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  /** Catalog and balance only: what a purchase or equip can change. */
  const refreshCatalogAndBalance = useCallback(async (): Promise<boolean> => {
    const [catalog, balance] = await Promise.all([
      listCosmetics(),
      getWalletBalanceResult(),
    ]);
    if (catalog) setItems(catalog.items ?? []);
    if (balance.ok) {
      setCredits(balance.balance.credits_balance);
      setIsSubscriber(balance.balance.is_subscriber);
    }
    return catalog !== null;
  }, []);

  const load = useCallback(async () => {
    try {
      // Grant anything newly qualified before listing. sync_unlocked_cosmetics
      // is the only thing that hands out free and earned items, and it ran only
      // from daily-meta -- so a player who just hit 25 wins saw Champion as
      // locked until their next check-in. A failed sync is not fatal: the list
      // is still worth showing.
      await syncCosmetics();

      const [catalogOk, characterRes, profileRow] = await Promise.all([
        refreshCatalogAndBalance(),
        user
          ? supabase
              .from('characters')
              .select(
                'id, cosmetic_config, name, archetype, signature_color, portrait_id',
              )
              .eq('profile_id', user.id)
              .eq('is_active', true)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        user ? fetchProfileRow(user.id) : Promise.resolve(null),
      ]);

      if (!catalogOk) {
        // An empty scroller says "nothing for sale"; a failed read must not.
        setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
        return;
      }

      const row = (characterRes as { data: CharacterRow | null }).data;
      setProfile(profileRow);
      setCharacterId(row?.id ?? null);
      setEquipped(row?.cosmetic_config ?? {});

      if (row) {
        // Falls back to the generated placeholder rather than an empty frame:
        // a player who has not rendered yet still needs to see the cosmetic on
        // something shaped like their fighter.
        let portraitUri = getPortraitFallbackUri({
          archetype: row.archetype as never,
          signatureColor: row.signature_color,
        });
        if (row.portrait_id) {
          const { data: portrait } = await supabase
            .from('character_portraits')
            .select('image_path')
            .eq('id', row.portrait_id)
            .maybeSingle();
          const path = (portrait as { image_path?: string } | null)?.image_path;
          if (path) {
            const { data: signed } = await supabase.storage
              .from('character-portraits')
              .createSignedUrl(path, 600);
            if (signed?.signedUrl) portraitUri = signed.signedUrl;
          }
        }
        setCharacter({
          name: row.name,
          signatureColor: row.signature_color,
          portraitUri,
        });
      }
      setLoadState('ready');
    } catch (err) {
      console.error('Failed to load shop:', err);
      setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, [user, refreshCatalogAndBalance]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const retry = () => {
    setLoadState('loading');
    load();
  };

  const goTopUp = () => router.push('/(profile)/wallet');

  const progress: UnlockProgressCounts | null = profile
    ? {
        wins: profile.wins ?? 0,
        totalBattles: profile.total_battles ?? 0,
        bestStreak: profile.best_streak ?? 0,
      }
    : null;

  const performPurchase = async (item: CosmeticItem) => {
    setBusySlug(item.slug);
    try {
      const result = await purchaseCosmetic(item.slug);
      if (result.success) {
        setConfirmItem(null);
        hapticSuccess();
        showToast(`Unlocked ${item.name}`);
        await refreshCatalogAndBalance();
        return;
      }
      setConfirmItem(null);
      if (result.error === 'insufficient_credits') {
        const shortfall =
          credits !== null && item.price_credits
            ? Math.max(0, item.price_credits - credits)
            : undefined;
        Alert.alert(
          'Not enough credits',
          insufficientCreditsMessage(shortfall),
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Top up', onPress: goTopUp },
          ],
        );
        return;
      }
      Alert.alert('Couldn’t buy that', cosmeticErrorMessage(result.error));
    } finally {
      setBusySlug(null);
    }
  };

  const handleEquip = async (item: CosmeticItem) => {
    if (!characterId) {
      Alert.alert(
        'No active character',
        cosmeticErrorMessage('no_active_character'),
      );
      return;
    }
    setBusySlug(item.slug);
    try {
      const isEquipped = equipped[item.cosmetic_type] === item.slug;
      const result = await equipCosmetic(
        characterId,
        item.cosmetic_type,
        isEquipped ? null : item.slug,
      );
      if (result.success) {
        setEquipped((prev) => {
          const next = { ...prev };
          if (isEquipped) delete next[item.cosmetic_type];
          else next[item.cosmetic_type] = item.slug;
          return next;
        });
        hapticSelection();
        showToast(
          isEquipped ? `Removed ${item.name}` : `Equipped ${item.name}`,
        );
      } else {
        Alert.alert('Couldn’t equip that', cosmeticErrorMessage(result.error));
      }
    } finally {
      setBusySlug(null);
    }
  };

  const renderCta = (item: CosmeticItem) => {
    const busy = busySlug === item.slug;
    if (busy) {
      return <ActivityIndicator size="small" color={colors.primary} />;
    }

    // A colour cosmetic is a swatch, not a slot. Equipping it here would have
    // the server rewrite `signature_color` and mark the portrait stale -- a
    // 10-credit cosmetic turning into a 3-credit re-render nobody asked for.
    // Owning it unlocks the swatch; wearing it is a free choice on the
    // Identity tab of Edit character.
    if (item.cosmetic_type === 'color' && item.owned) {
      return (
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.backgroundTertiary }]}
          onPress={() => router.push('/(profile)/edit-character')}
          accessibilityRole="button"
          accessibilityLabel={`Wear ${item.name}. Opens Edit character`}
        >
          <Text style={[styles.ctaText, { color: colors.text }]}>
            Edit character
          </Text>
        </TouchableOpacity>
      );
    }

    if (item.owned) {
      // Equippable, but nothing renders it yet. Say so instead of letting a
      // player toggle a slot that has no effect anywhere.
      if (item.cosmetic_type === 'reveal_style') {
        return (
          <View style={[styles.lockedPill, { borderColor: colors.warning }]}>
            <Text style={[styles.lockedText, { color: colors.warning }]}>
              Coming soon
            </Text>
          </View>
        );
      }
      const isEquipped = equipped[item.cosmetic_type] === item.slug;
      return (
        <TouchableOpacity
          style={[
            styles.cta,
            {
              backgroundColor: isEquipped
                ? colors.success
                : colors.backgroundTertiary,
            },
          ]}
          onPress={() => handleEquip(item)}
          accessibilityRole="button"
          accessibilityLabel={
            isEquipped ? `Unequip ${item.name}` : `Equip ${item.name}`
          }
          accessibilityState={{ selected: isEquipped }}
        >
          <Text
            style={[
              styles.ctaText,
              { color: isEquipped ? '#FFFFFF' : colors.text },
            ]}
          >
            {isEquipped ? 'Equipped' : 'Equip'}
          </Text>
        </TouchableOpacity>
      );
    }

    // Equippable, but nothing renders it. Selling it would take credits for an
    // effect that never appears — which is how 25 credits were already spent on
    // cosmetics with no display surface at all.
    if (!isRenderable(item.cosmetic_type)) {
      return (
        <View style={[styles.lockedPill, { borderColor: colors.warning }]}>
          <Text style={[styles.lockedText, { color: colors.warning }]}>
            Coming soon
          </Text>
        </View>
      );
    }

    // A price is what makes an item buyable, whatever its acquisition type --
    // the same rule the purchase function now applies. An earned item with a
    // price can be bought as a shortcut; its unlock rule still stands and is
    // shown beneath the card, so buying never looks like the only way in.
    if (item.price_credits) {
      const price = item.price_credits;
      // Unknown balance is not "cannot afford": the server is the judge, and a
      // refused spend arrives as an alert with a Top up action.
      const affordable = credits === null || credits >= price;
      if (!affordable) {
        return (
          <View style={styles.needColumn}>
            <View
              style={[styles.lockedPill, { borderColor: colors.border }]}
              accessible
              accessibilityLabel={`${item.name} costs ${formatCredits(price, 'sentence')}. Not enough credits`}
            >
              <Text
                style={[
                  styles.lockedText,
                  NumericFontVariant,
                  { color: colors.textSecondary },
                ]}
              >
                {`Need ${formatCredits(price)}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={goTopUp}
              accessibilityRole="link"
              accessibilityLabel="Top up. Opens your wallet"
              style={styles.topUpLink}
            >
              <Text style={[styles.topUpText, { color: colors.primary }]}>
                Top up
              </Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.primary }]}
          onPress={() => setConfirmItem(item)}
          accessibilityRole="button"
          accessibilityLabel={buyAccessibilityLabel({
            name: item.name,
            price,
            earnable: item.acquisition === 'play_unlock',
            rule: item.unlock_rule,
          })}
        >
          <Text
            style={[styles.ctaText, NumericFontVariant, { color: '#FFFFFF' }]}
          >
            {`Buy · ${formatCredits(price)}`}
          </Text>
        </TouchableOpacity>
      );
    }

    if (item.acquisition === 'subscription') {
      if (isSubscriber) {
        return (
          <View style={[styles.lockedPill, { borderColor: colors.border }]}>
            <Text style={[styles.lockedText, { color: colors.textSecondary }]}>
              Included with Prompt Wars+
            </Text>
          </View>
        );
      }
      return (
        <TouchableOpacity
          onPress={goTopUp}
          accessibilityRole="link"
          accessibilityLabel={`${item.name} is included with Prompt Wars+. Opens the wallet`}
          style={[styles.lockedPill, { borderColor: colors.primary }]}
        >
          <Text style={[styles.lockedText, { color: colors.primary }]}>
            Prompt Wars+
          </Text>
        </TouchableOpacity>
      );
    }

    let lockedLabel = 'Locked';
    if (item.acquisition === 'play_unlock') {
      lockedLabel = lockedProgressHint(item.unlock_rule, progress);
    } else if (item.acquisition === 'exclusive') {
      lockedLabel = 'Launch offer only';
    }

    return (
      <View style={[styles.lockedPill, { borderColor: colors.border }]}>
        <Text style={[styles.lockedText, { color: colors.textSecondary }]}>
          {lockedLabel}
        </Text>
      </View>
    );
  };

  const topInset = insets.top + HEADER_BUTTON_SIZE;

  if (loadState === 'loading') {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background, paddingTop: topInset },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (loadState === 'error') {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background, paddingTop: topInset },
        ]}
      >
        <Ionicons
          name="color-palette-outline"
          size={32}
          color={colors.textTertiary}
        />
        <Text
          accessibilityRole="header"
          style={[styles.errorTitle, accessibleText, { color: colors.text }]}
        >
          Couldn’t load the shop
        </Text>
        <Text
          style={[
            styles.errorBody,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Balance goes where every other screen puts it. CreditChip routes to the
          wallet on tap, which is the right destination from a shop. Hidden,
          not zeroed, while the balance is unknown. */}
      <Stack.Screen
        options={{
          headerRight: () =>
            credits !== null ? <CreditChip credits={credits} /> : null,
        }}
      />

      {/* Fixed above the scroller, not inside it. The preview was the point of
          the redesign and it scrolled away the moment the player reached the
          items it exists to preview. */}
      <View style={[styles.top, { paddingTop: topInset }]}>
        <Text
          accessibilityRole="header"
          style={[styles.title, accessibleText, { color: colors.text }]}
        >
          Cosmetic Shop
        </Text>
        <Text
          style={[
            styles.subtitle,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          Pure cosmetics — they never affect scoring or matchmaking.
        </Text>

        {character ? (
          <CosmeticPreview
            portraitUri={character.portraitUri}
            characterName={character.name}
            signatureColor={character.signatureColor}
            equipped={resolveEquippedCosmetics(equipped)}
            preview={presentationFor(focusedSlug)}
          />
        ) : null}
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {TYPE_ORDER.map(({ type, label }) => {
          const typeItems = items.filter((i) => i.cosmetic_type === type);
          if (typeItems.length === 0) return null;
          return (
            <View key={type} style={styles.section}>
              <Text
                accessibilityRole="header"
                style={[
                  styles.sectionTitle,
                  accessibleText,
                  { color: colors.text },
                ]}
              >
                {label}
              </Text>
              {typeItems.map((item) => {
                const ownedColour =
                  item.cosmetic_type === 'color' && item.owned;
                return (
                  <TouchableOpacity
                    key={item.slug}
                    onPress={() => setFocusedSlug(item.slug)}
                    accessibilityRole="button"
                    accessibilityLabel={`Preview ${item.name}`}
                    accessibilityState={{ selected: focusedSlug === item.slug }}
                    style={[
                      styles.itemCard,
                      { backgroundColor: colors.card },
                      focusedSlug === item.slug && {
                        borderColor: colors.primary,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <View style={styles.itemInfo}>
                      <View style={styles.itemHeader}>
                        <Text
                          style={[
                            styles.itemName,
                            accessibleText,
                            { color: colors.text },
                          ]}
                        >
                          {item.name}
                        </Text>
                        <View
                          style={[
                            styles.rarityDot,
                            {
                              backgroundColor: rarityColor(item.rarity, colors),
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.rarityText,
                            { color: rarityColor(item.rarity, colors) },
                          ]}
                        >
                          {rarityLabel(item.rarity)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.itemDesc,
                          accessibleText,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={2}
                      >
                        {item.description}
                      </Text>
                      {ownedColour ? (
                        <Text
                          style={[styles.earnHint, { color: colors.success }]}
                        >
                          Owned · wear it from Edit character
                        </Text>
                      ) : null}
                      {/* Only for an item you can both earn and buy: without this
                          the price would quietly replace the achievement. */}
                      {!item.owned &&
                      item.acquisition === 'play_unlock' &&
                      item.price_credits ? (
                        <Text
                          style={[styles.earnHint, { color: colors.success }]}
                        >
                          {earnOrBuyHint(item.unlock_rule)}
                        </Text>
                      ) : null}
                      {!item.owned && item.acquisition === 'free' ? (
                        <Text
                          style={[styles.earnHint, { color: colors.success }]}
                        >
                          Included free
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.itemCta}>{renderCta(item)}</View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      {/* The price sits in the body with the balance beside it, never in the
          title, and the free route is named so nobody two wins away spends. */}
      <ConfirmSheet
        visible={confirmItem !== null}
        title={confirmItem ? `Buy ${confirmItem.name}?` : ''}
        subtitle={confirmItem?.description}
        lines={
          confirmItem?.acquisition === 'play_unlock'
            ? [alsoEarnHint(confirmItem.unlock_rule)]
            : []
        }
        rows={
          confirmItem ? spendRows(confirmItem.price_credits ?? 0, credits) : []
        }
        confirmLabel="Buy"
        busy={confirmItem !== null && busySlug === confirmItem.slug}
        onConfirm={() => {
          if (confirmItem) void performPurchase(confirmItem);
        }}
        onCancel={() => setConfirmItem(null)}
      />

      {toast ? <Toast text={toast} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  errorTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  errorBody: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.md,
    minHeight: Layout.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  top: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  list: { flex: 1 },
  content: { padding: Spacing.lg, paddingTop: Spacing.sm },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  earnHint: {
    marginTop: 2,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  itemInfo: { flex: 1, paddingRight: Spacing.md },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  itemName: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginRight: Spacing.sm,
  },
  rarityDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.xs,
  },
  rarityText: { fontSize: Typography.sizes.xs },
  itemDesc: { fontSize: Typography.sizes.sm },
  itemCta: { minWidth: 96, alignItems: 'flex-end' },
  cta: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 92,
    minHeight: Layout.inputHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  lockedPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
  },
  lockedText: { fontSize: Typography.sizes.xs, textAlign: 'center' },
  needColumn: { alignItems: 'flex-end', gap: Spacing.xs },
  topUpLink: {
    minHeight: Layout.inputHeight,
    minWidth: Layout.inputHeight,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.xs,
  },
  topUpText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
