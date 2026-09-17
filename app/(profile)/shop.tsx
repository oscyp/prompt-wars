import { useSheetReturnFocus } from '@/hooks/useSheetReturnFocus';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  AppState,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { GameText as Text, GameHeader } from '@/components/game';
import { collectionColumns } from '@/utils/collectionLayout';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useCosmeticShop } from '@/hooks/useCosmeticShop';
import { presentationFor } from '@/constants/Cosmetics';
import {
  resolveEquippedCosmetics,
  type CosmeticItem,
  type CosmeticType,
} from '@/utils/cosmetics';
import { alsoEarnHint, cosmeticErrorMessage } from '@/utils/walletView';
import { spendRows } from '@/utils/editDialogCopy';
import { insufficientCreditsMessage } from '@/utils/credits';
import { hapticSelection, hapticSuccess } from '@/utils/haptics';
import CosmeticPreview from '@/components/CosmeticPreview';
import CreditChip from '@/components/CreditChip';
import Toast from '@/components/Toast';
import BottomSheet from '@/components/sheets/BottomSheet';
import ConfirmSheet from '@/components/sheets/ConfirmSheet';
import { GameMasthead } from '@/components/game/GameMasthead';
import { ShopCategoryTabs } from '@/components/shop/ShopCategoryTabs';
import { ShopEquippedSummary } from '@/components/shop/ShopEquippedSummary';
import { ShopFilterControl } from '@/components/shop/ShopFilterControl';
import { ShopTrustFooter } from '@/components/shop/ShopTrustFooter';
import {
  ShopButton,
  ShopItemAction,
  ShopItemCard,
} from '@/components/shop/ShopItem';

export default function CosmeticShopScreen() {
  const { user } = useAuth();
  const shop = useCosmeticShop(user?.id);
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const columns = collectionColumns(width, fontScale);
  const router = useRouter();
  const [category, setCategory] = useState<CosmeticType>('frame');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const { remember: rememberPreviewOpener, returnFocusRef } =
    useSheetReturnFocus();
  const [confirmItem, setConfirmItem] = useState<CosmeticItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const automaticArtworkRetry = useRef(false);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    setFocusedSlug(null);
    setConfirmItem(null);
    setToast(null);
    automaticArtworkRetry.current = false;
  }, [user?.id]);
  const refreshShop = shop.refresh;
  const refresh = useCallback(() => {
    automaticArtworkRetry.current = false;
    void refreshShop();
  }, [refreshShop]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  const onImageError = () => {
    shop.onArtworkError();
    if (!automaticArtworkRetry.current) {
      automaticArtworkRetry.current = true;
      void shop.refresh();
    }
  };
  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };
  const wallet = () => router.push('/(profile)/wallet');
  const progress = shop.profile
    ? {
        wins: shop.profile.wins ?? 0,
        totalBattles: shop.profile.total_battles ?? 0,
        bestStreak: shop.profile.best_streak ?? 0,
      }
    : null;
  const focused = shop.items.find((item) => item.slug === focusedSlug);
  const items = shop.items.filter(
    (item) => item.cosmetic_type === category && (!ownedOnly || item.owned),
  );
  const performPurchase = async (item: CosmeticItem) => {
    const result = await shop.purchase(item);
    if ('ignored' in result) return;
    setConfirmItem(null);
    if (result.success) {
      hapticSuccess();
      showToast(`Unlocked ${item.name}`);
      return;
    }
    if (result.error === 'insufficient_credits') {
      Alert.alert(
        'Not enough credits',
        insufficientCreditsMessage(
          shop.credits !== null
            ? Math.max(0, (item.price_credits ?? 0) - shop.credits)
            : undefined,
        ),
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Top up', onPress: wallet },
        ],
      );
      return;
    }
    Alert.alert('Couldn’t buy that', cosmeticErrorMessage(result.error));
  };
  const handleEquip = async (item: CosmeticItem) => {
    const removing = shop.equipped[item.cosmetic_type] === item.slug;
    const result = await shop.equip(item);
    if ('ignored' in result) return;
    if (result.success) {
      setFocusedSlug(null);
      hapticSelection();
      showToast(`${removing ? 'Removed' : 'Equipped'} ${item.name}`);
    } else
      Alert.alert('Couldn’t equip that', cosmeticErrorMessage(result.error));
  };
  const action = (item: CosmeticItem) => (
    <ShopItemAction
      item={item}
      wearing={shop.equipped[item.cosmetic_type] === item.slug}
      busy={shop.busySlug === item.slug}
      mutationPending={!!shop.busySlug}
      credits={shop.credits}
      progress={progress}
      onBuy={() => {
        setFocusedSlug(null);
        setConfirmItem(item);
      }}
      onEquip={() => void handleEquip(item)}
      onWallet={wallet}
      onEdit={() => {
        setFocusedSlug(null);
        router.push({
          pathname: '/(profile)/edit-character',
          params: { section: 'fighter', focus: 'signature-color' },
        });
      }}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        testID="shop-scroll"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={shop.refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
      >
        <GameMasthead
          centered
          leading={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                router.canGoBack() ? 'Go back' : 'Return to Profile'
              }
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace('/(tabs)/profile')
              }
              style={{ minHeight: 48, minWidth: 48, justifyContent: 'center' }}
            >
              <Text variant="label" style={{ color: colors.primary }}>
                ‹ {router.canGoBack() ? 'Back' : 'Profile'}
              </Text>
            </Pressable>
          }
          trailing={
            shop.credits !== null ? <CreditChip credits={shop.credits} /> : null
          }
        />
        <GameHeader
          title="Cosmetic Shop"
          subtitle="Make your fighter unmistakable."
        />
        <ShopEquippedSummary
          category={category}
          items={shop.items}
          equipped={shop.equipped}
          character={shop.character}
          characterStatus={shop.characterStatus}
          onEdit={() => router.push('/(profile)/edit-character')}
          onImageError={onImageError}
        />
        {shop.error || shop.artworkError ? (
          <View style={styles.loadout}>
            <Text accessibilityRole="alert" style={{ color: colors.warning }}>
              {shop.artworkError
                ? 'Artwork could not load. Retry restores your existing art at no charge.'
                : shop.error}
            </Text>
            <ShopButton label="Retry" onPress={refresh} />
          </View>
        ) : null}
        <ShopCategoryTabs value={category} onChange={setCategory} />
        <ShopFilterControl ownedOnly={ownedOnly} onChange={setOwnedOnly} />
        {shop.loading ? <ActivityIndicator color={colors.primary} /> : null}
        <View
          testID="shop-collection"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
          accessibilityHint={`${columns} columns`}
        >
          {items.map((item) => (
            <View
              key={item.slug}
              style={{ width: columns === 2 ? (width - 52) / 2 : '100%' }}
            >
              <ShopItemCard
                key={item.slug}
                item={item}
                character={shop.character}
                wearing={shop.equipped[item.cosmetic_type] === item.slug}
                onPreview={(opener) => {
                  rememberPreviewOpener(opener);
                  setFocusedSlug(item.slug);
                }}
                onImageError={onImageError}
              />
            </View>
          ))}
        </View>
        {!shop.loading && !items.length ? (
          <Text style={{ color: colors.textSecondary }}>
            {shop.error
              ? 'Catalog unavailable. Retry to check this category.'
              : ownedOnly
                ? 'No owned cosmetics in this category yet.'
                : 'No cosmetics in this category yet.'}
          </Text>
        ) : null}
        <ShopTrustFooter />
      </ScrollView>
      <BottomSheet
        returnFocusRef={confirmItem ? undefined : returnFocusRef}
        visible={!!focused}
        onClose={() => setFocusedSlug(null)}
        closeAccessibilityLabel="Close preview"
        footer={
          <View style={styles.sheetActions}>
            <ShopButton
              label="Clear preview"
              onPress={() => setFocusedSlug(null)}
            />
            {focused ? action(focused) : null}
          </View>
        }
      >
        <View style={styles.sheetContent}>
          <Text
            accessibilityRole="header"
            style={[styles.name, accessibleText, { color: colors.text }]}
          >
            Previewing {focused?.name}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            Preview only · your loadout changes when you equip.
          </Text>
          {shop.character ? (
            <CosmeticPreview
              portraitUri={shop.character.portraitUri}
              avatarUri={shop.character.avatarUri}
              characterName={shop.character.name}
              signatureColor={shop.character.signatureColor}
              equipped={resolveEquippedCosmetics(shop.equipped)}
              preview={presentationFor(focusedSlug)}
              onImageError={onImageError}
            />
          ) : (
            <Text style={{ color: colors.textSecondary }}>
              {shop.characterStatus === 'empty'
                ? 'Create a fighter to preview this look.'
                : 'Your fighter could not load. Retry to preview this look.'}
            </Text>
          )}
          <Text style={[accessibleText, { color: colors.textSecondary }]}>
            {focused?.description}
          </Text>
          {focused?.acquisition === 'play_unlock' ? (
            <Text style={{ color: colors.success }}>
              {alsoEarnHint(focused.unlock_rule)}
            </Text>
          ) : null}
          {shop.artworkError ? (
            <ShopButton label="Retry artwork" onPress={refresh} />
          ) : null}
        </View>
      </BottomSheet>
      <ConfirmSheet
        returnFocusRef={returnFocusRef}
        visible={confirmItem !== null}
        title={confirmItem ? `Buy ${confirmItem.name}?` : ''}
        subtitle={confirmItem?.description}
        lines={
          confirmItem?.acquisition === 'play_unlock'
            ? [alsoEarnHint(confirmItem.unlock_rule)]
            : []
        }
        rows={
          confirmItem
            ? spendRows(confirmItem.price_credits ?? 0, shop.credits)
            : []
        }
        confirmLabel="Buy"
        busy={!!shop.busySlug}
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
  content: { paddingHorizontal: 20, gap: 16 },
  name: { fontSize: 18, fontWeight: '600' },
  loadout: { gap: 6, padding: 16, borderRadius: 16 },
  sheetContent: { paddingTop: 40, gap: 12 },
  sheetActions: {
    paddingHorizontal: 20,
    paddingTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
