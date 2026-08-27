import React, { useCallback, useEffect, useState } from 'react';
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
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';
import { getWalletBalance } from '@/utils/monetization';
import {
  listCosmetics,
  purchaseCosmetic,
  equipCosmetic,
  resolveEquippedCosmetics,
  CosmeticItem,
  CosmeticType,
} from '@/utils/cosmetics';
import { getPortraitFallbackUri } from '@/utils/characters';
import {
  presentationFor,
  RENDERABLE_COSMETIC_TYPES,
} from '@/constants/Cosmetics';
import { CosmeticPreview } from '@/components';

const TYPE_ORDER: { type: CosmeticType; label: string }[] = [
  { type: 'frame', label: 'Frames' },
  { type: 'title', label: 'Titles' },
  { type: 'color', label: 'Signature Colors' },
  { type: 'reveal_style', label: 'Reveal Styles' },
  { type: 'avatar_effect', label: 'Avatar Effects' },
  { type: 'badge', label: 'Badges' },
];

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

function unlockHint(rule: Record<string, number> | null): string {
  if (!rule) return 'Earned through play';
  if (rule.wins) return `Unlock: ${rule.wins} wins`;
  if (rule.total_battles) return `Unlock: ${rule.total_battles} battles`;
  if (rule.level) return `Unlock: level ${rule.level}`;
  if (rule.best_streak) return `Unlock: ${rule.best_streak}-win streak`;
  if (rule.daily_login_streak) return `Unlock: ${rule.daily_login_streak}-day login`;
  return 'Earned through play';
}

export default function CosmeticShopScreen() {
  const colors = useThemedColors();
  const { user } = useAuth();

  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [equipped, setEquipped] = useState<Record<string, string>>({});
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(0);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  // The item the player is looking at. The preview shows their own fighter
  // wearing it, which is the only preview that answers "what will I get".
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const [character, setCharacter] = useState<{
    name: string;
    signatureColor: string;
    portraitUri: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [catalog, balance, characterRes] = await Promise.all([
        listCosmetics(),
        getWalletBalance(),
        user
          ? supabase
              .from('characters')
              .select('id, cosmetic_config, name, archetype, signature_color, portrait_id')
              .eq('profile_id', user.id)
              .eq('is_active', true)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setItems(catalog?.items ?? []);
      setCredits(balance?.credits_balance ?? 0);
      setIsSubscriber(balance?.is_subscriber ?? false);

      const row = (
        characterRes as {
          data: {
            id: string;
            cosmetic_config: Record<string, string>;
            name: string;
            archetype: string;
            signature_color: string;
            portrait_id: string | null;
          } | null;
        }
      ).data;
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
    } catch (err) {
      console.error('Failed to load shop:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleBuy = (item: CosmeticItem) => {
    if (!item.price_credits) return;
    Alert.alert(
      'Confirm purchase',
      `Buy "${item.name}" for ${item.price_credits} credits?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Buy (${item.price_credits})`,
          onPress: async () => {
            setBusySlug(item.slug);
            try {
              const result = await purchaseCosmetic(item.slug);
              if (result.success) {
                await load();
              } else {
                Alert.alert(
                  'Could not purchase',
                  result.error === 'insufficient_credits'
                    ? 'Not enough credits. Earn more from daily quests and streaks, or top up in your wallet.'
                    : result.error ?? 'Purchase failed.',
                );
              }
            } finally {
              setBusySlug(null);
            }
          },
        },
      ],
    );
  };

  const handleEquip = async (item: CosmeticItem) => {
    if (!characterId) {
      Alert.alert('No active character', 'Create a character before equipping cosmetics.');
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
      } else {
        Alert.alert('Could not equip', result.error ?? 'Equip failed.');
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

    if (item.owned) {
      const isEquipped = equipped[item.cosmetic_type] === item.slug;
      return (
        <TouchableOpacity
          style={[
            styles.cta,
            {
              backgroundColor: isEquipped ? colors.success : colors.backgroundTertiary,
            },
          ]}
          onPress={() => handleEquip(item)}
          accessibilityRole="button"
          accessibilityLabel={isEquipped ? `Unequip ${item.name}` : `Equip ${item.name}`}
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

    if (item.acquisition === 'credits' && item.price_credits) {
      const affordable = credits >= item.price_credits;
      return (
        <TouchableOpacity
          style={[
            styles.cta,
            { backgroundColor: affordable ? colors.primary : colors.border },
          ]}
          onPress={() => handleBuy(item)}
          accessibilityRole="button"
          accessibilityLabel={`Buy ${item.name} for ${item.price_credits} credits`}
        >
          <Text style={[styles.ctaText, { color: '#FFFFFF' }]}>
            {affordable ? `Buy · ${item.price_credits}` : `Need ${item.price_credits}`}
          </Text>
        </TouchableOpacity>
      );
    }

    let lockedLabel = 'Locked';
    if (item.acquisition === 'subscription') {
      lockedLabel = isSubscriber ? 'Syncing…' : 'Prompt Wars+';
    } else if (item.acquisition === 'play_unlock') {
      lockedLabel = unlockHint(item.unlock_rule);
    } else if (item.acquisition === 'exclusive') {
      lockedLabel = 'Launch offer only';
    }

    return (
      <View style={[styles.lockedPill, { borderColor: colors.border }]}>
        <Text style={[styles.lockedText, { color: colors.textSecondary }]}>{lockedLabel}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <Text style={[styles.title, { color: colors.text }]}>Cosmetic Shop</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Pure cosmetics — they never affect scoring or matchmaking.
      </Text>

      <View style={[styles.balanceCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Your credits</Text>
        <Text style={[styles.balanceValue, { color: colors.primary }]}>{credits}</Text>
      </View>

      {character ? (
        <CosmeticPreview
          portraitUri={character.portraitUri}
          characterName={character.name}
          signatureColor={character.signatureColor}
          equipped={resolveEquippedCosmetics(equipped)}
          preview={presentationFor(focusedSlug)}
        />
      ) : null}

      {TYPE_ORDER.map(({ type, label }) => {
        const typeItems = items.filter((i) => i.cosmetic_type === type);
        if (typeItems.length === 0) return null;
        return (
          <View key={type} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{label}</Text>
            {typeItems.map((item) => (
              <TouchableOpacity
                key={item.slug}
                onPress={() => setFocusedSlug(item.slug)}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${item.name}`}
                accessibilityState={{ selected: focusedSlug === item.slug }}
                style={[
                  styles.itemCard,
                  { backgroundColor: colors.card },
                  focusedSlug === item.slug && { borderColor: colors.primary, borderWidth: 1 },
                ]}
              >
                <View style={styles.itemInfo}>
                  <View style={styles.itemHeader}>
                    <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                    <View
                      style={[styles.rarityDot, { backgroundColor: rarityColor(item.rarity, colors) }]}
                    />
                    <Text style={[styles.rarityText, { color: rarityColor(item.rarity, colors) }]}>
                      {item.rarity}
                    </Text>
                  </View>
                  <Text style={[styles.itemDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>
                <View style={styles.itemCta}>{renderCta(item)}</View>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.lg, paddingTop: Spacing.xxl },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  balanceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  balanceLabel: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.medium },
  balanceValue: { fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.bold },
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
  itemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
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
  rarityText: { fontSize: Typography.sizes.xs, textTransform: 'capitalize' },
  itemDesc: { fontSize: Typography.sizes.sm },
  itemCta: { minWidth: 96, alignItems: 'flex-end' },
  cta: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    minWidth: 92,
    alignItems: 'center',
  },
  ctaText: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold },
  lockedPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  lockedText: { fontSize: Typography.sizes.xs, textAlign: 'center' },
});
