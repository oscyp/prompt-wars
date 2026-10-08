import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, View, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useArenaFighter } from '@/hooks/useArenaFighter';
import { useThemedColors } from '@/hooks/useThemedColors';
import { resolveSignatureHex } from '@/utils/characters';
import { resolveEquippedCosmetics } from '@/utils/cosmetics';
import FighterCard from './FighterCard';
import { GameButton, GameHeader, GamePanel, GameText } from './index';
import { GameMasthead } from './GameMasthead';
import CosmeticFrame from '@/components/CosmeticFrame';
import { useHeroArtworkBudget } from '@/hooks/useHeroArtworkBudget';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabClearance } from '@/hooks/useTabClearance';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';

export default function ArenaFighter({
  account,
  refreshVersion = 0,
  mastheadTrailing,
  beforeHero,
  viewportHeight,
}: {
  account: string | undefined;
  refreshVersion?: number;
  mastheadTrailing?: React.ReactNode;
  beforeHero?: React.ReactNode;
  viewportHeight?: number;
}) {
  const { fighter, loading, error, refresh, onArtworkError } =
    useArenaFighter(account);
  const router = useRouter();
  const colors = useThemedColors();
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const lastRefresh = useRef(refreshVersion);
  useEffect(() => {
    if (lastRefresh.current === refreshVersion) return;
    lastRefresh.current = refreshVersion;
    void refresh();
  }, [refreshVersion, refresh]);
  const insets = useSafeAreaInsets();
  const clearance = useTabClearance();
  const budget = useHeroArtworkBudget(
    (viewportHeight ? 0 : insets.top) + clearance + 48,
    viewportHeight,
  );
  const c = fighter?.character;
  return (
    <View style={{ gap: 10, marginBottom: 24 }}>
      <View onLayout={budget.measure('header')}>
        {mastheadTrailing && (
          <GameMasthead
            trailing={mastheadTrailing}
            avatar={
              fighter && c ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="View Profile"
                  onPress={() => router.push('/(tabs)/profile')}
                  style={{
                    minWidth: 48,
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CosmeticFrame
                    source={
                      fighter.avatarUri
                        ? { uri: fighter.avatarUri }
                        : getArchetypeAvatar(c.archetype)
                    }
                    frame={resolveEquippedCosmetics(c.cosmetic_config).frame}
                    variant="circle"
                    size={42}
                    onImageError={onArtworkError}
                  />
                </Pressable>
              ) : undefined
            }
          />
        )}
        <GameHeader
          style={{ paddingVertical: 4 }}
          title="Enter the Arena"
          subtitle="Your words. Your fighter."
        />
      </View>
      <View onLayout={budget.measure('urgent')}>{beforeHero}</View>
      {fighter && c ? (
        <FighterCard
          onImageError={onArtworkError}
          name={c.name}
          archetype={c.archetype}
          maxArtworkHeight={budget.maxArtworkHeight}
          onBodyHeight={budget.onCardBodyHeight}
          itemName={fighter.itemName}
          renderUri={fighter.renderUri}
          avatarUri={fighter.avatarUri}
          signatureColor={resolveSignatureHex(c.signature_color)}
          cosmetics={resolveEquippedCosmetics(c.cosmetic_config)}
          stats={
            c.stat_strength != null &&
            c.stat_stamina != null &&
            c.stat_agility != null &&
            c.stat_focus != null
              ? {
                  strength: c.stat_strength,
                  stamina: c.stat_stamina,
                  agility: c.stat_agility,
                  focus: c.stat_focus,
                }
              : null
          }
        />
      ) : loading ? (
        <GamePanel accessibilityLabel="Loading your fighter">
          <ActivityIndicator color={colors.primary} />
          <GameText style={{ textAlign: 'center' }}>
            Loading your fighter…
          </GameText>
        </GamePanel>
      ) : null}
      {error && (
        <GamePanel style={{ gap: 12 }}>
          <GameText>
            {fighter
              ? 'Couldn’t refresh your fighter. Your last artwork is still here.'
              : 'Couldn’t load your fighter.'}
          </GameText>
          <GameButton
            label="Retry fighter"
            tone="secondary"
            onPress={refresh}
            busy={loading}
          />
        </GamePanel>
      )}
      <View
        onLayout={budget.measure('actions')}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
      >
        <GameButton
          label="Customize"
          gameIcon="hanger"
          endIcon="chevron-right"
          tone="secondary"
          onPress={() => router.push('/(profile)/edit-character')}
          style={{ flexGrow: 1, flexBasis: 145, paddingHorizontal: 12 }}
        />
        <GameButton
          label="Cosmetics"
          gameIcon="mask"
          endIcon="chevron-right"
          tone="secondary"
          onPress={() => router.push('/(profile)/shop')}
          style={{ flexGrow: 1, flexBasis: 145, paddingHorizontal: 12 }}
        />
      </View>
      {!!c?.battle_cry && (
        <GameText
          variant="caption"
          style={{ textAlign: 'center', color: colors.textSecondary }}
        >
          {c.battle_cry}
        </GameText>
      )}
      <GameText
        variant="caption"
        style={{ textAlign: 'center', color: colors.textSecondary }}
      >
        Your theme is revealed after matching.
      </GameText>
    </View>
  );
}
