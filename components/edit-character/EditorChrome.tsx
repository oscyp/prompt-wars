import React, { useRef } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { GameButton, GameFooter, GameText } from '@/components/game';
import { GameIcon, type GameIconName } from '@/components/game/icons/GameIcon';
import CosmeticFrame from '@/components/CosmeticFrame';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { ARCHETYPES, type ArchetypeId } from '@/constants/Archetypes';
import { useThemedColors } from '@/hooks/useThemedColors';
import type { DraftSection } from '@/hooks/useCharacterEditDraft';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import type { SheetFocusRef } from '@/hooks/useSheetReturnFocus';

export function EditorTabs({
  value,
  dirty,
  onChange,
}: {
  value: DraftSection;
  dirty: Record<DraftSection, boolean>;
  onChange: (section: DraftSection) => void;
}) {
  const colors = useThemedColors();
  const { fontScale } = useWindowDimensions();
  const items: { key: DraftSection; label: string; icon: GameIconName }[] = [
    { key: 'look', label: 'Look', icon: 'palette' },
    { key: 'identity', label: 'Fighter', icon: 'profile' },
    { key: 'gear', label: 'Gear', icon: 'gear' },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={styles.tabRail}
      accessibilityRole="tablist"
      accessibilityLabel="Editing category"
    >
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onChange(item.key)}
          accessibilityRole="tab"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: item.key === value }}
          accessibilityHint={dirty[item.key] ? 'Unsaved changes' : undefined}
          style={[
            styles.tab,
            {
              flex: fontScale <= 1.3 ? 1 : undefined,
              minWidth: fontScale > 1.3 ? 130 : 96,
              borderBottomColor:
                item.key === value ? colors.ornament : 'transparent',
            },
          ]}
        >
          <GameIcon
            name={item.icon}
            size={22}
            color={item.key === value ? colors.ornament : colors.textSecondary}
          />
          <GameText
            variant="label"
            style={{
              color:
                item.key === value ? colors.ornament : colors.textSecondary,
            }}
          >
            {item.label}
          </GameText>
          {dirty[item.key] && (
            <View
              accessible={false}
              style={[styles.dot, { backgroundColor: colors.primary }]}
            />
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function EditorPreview({
  name,
  archetype,
  avatarUri,
  cosmetics,
  accentColor,
  compact = false,
  dirty = false,
  onView,
  onHistory,
  onImageError,
}: {
  name: string;
  archetype: string;
  avatarUri: string | null;
  cosmetics: EquippedCosmetics;
  accentColor: string;
  compact?: boolean;
  dirty?: boolean;
  onView: (ref: SheetFocusRef) => void;
  onHistory: (ref: SheetFocusRef) => void;
  onImageError?: () => void;
}) {
  const colors = useThemedColors();
  const viewRef = useRef<View>(null),
    historyRef = useRef<View>(null);
  const archetypeName = ARCHETYPES[archetype as ArchetypeId]?.name ?? archetype;
  return (
    <View
      style={[
        styles.preview,
        {
          borderColor: colors.ornamentMuted,
          backgroundColor: colors.card,
          paddingVertical: compact ? 4 : 8,
        },
      ]}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <CosmeticFrame
          source={
            avatarUri ? { uri: avatarUri } : getArchetypeAvatar(archetype)
          }
          frame={cosmetics.frame}
          variant="circle"
          size={compact ? 48 : 88}
          accentColor={accentColor}
          onImageError={onImageError}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {!compact && (
          <GameText
            variant="caption"
            style={{ color: colors.textSecondary, fontSize: 12 }}
          >
            Current artwork{dirty ? ' · draft changes' : ''}
          </GameText>
        )}
        <GameText
          variant="fighter"
          style={{ fontSize: compact ? 22 : 29, color: colors.ornament }}
        >
          {name}
        </GameText>
        {!compact && (
          <GameText variant="caption" style={{ color: colors.textSecondary }}>
            {archetypeName}
          </GameText>
        )}
        {!compact && (
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 }}
          >
            <GameButton
              ref={viewRef}
              label="View card"
              gameIcon="look"
              chrome="text"
              tone="secondary"
              labelStyle={{ fontSize: 16 }}
              style={styles.link}
              onPress={() => onView(viewRef)}
            />
            <GameButton
              ref={historyRef}
              label="Previous looks"
              chrome="text"
              tone="secondary"
              labelStyle={{ fontSize: 16 }}
              style={styles.link}
              onPress={() => onHistory(historyRef)}
            />
          </View>
        )}
      </View>
      {compact && (
        <GameButton
          ref={viewRef}
          label="View card"
          chrome="text"
          tone="secondary"
          labelStyle={{ fontSize: 16 }}
          style={styles.link}
          onPress={() => onView(viewRef)}
        />
      )}
    </View>
  );
}

export function EditorFooter({
  status,
  renderLabel,
  saveDisabled,
  renderDisabled,
  saveBusy = false,
  renderBusy = false,
  savePrimary = false,
  keyboardVisible = false,
  onSave,
  onRender,
  onLayout,
}: {
  status: string;
  renderLabel: string;
  saveDisabled: boolean;
  renderDisabled: boolean;
  saveBusy?: boolean;
  renderBusy?: boolean;
  savePrimary?: boolean;
  keyboardVisible?: boolean;
  onSave: (ref: SheetFocusRef) => void;
  onRender: (ref: SheetFocusRef) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const save = useRef<View>(null),
    draw = useRef<View>(null);
  return (
    <GameFooter
      keyboardVisible={keyboardVisible}
      onLayout={onLayout}
      style={{ paddingHorizontal: 16, gap: 6 }}
    >
      <GameText
        variant="caption"
        accessibilityLiveRegion="polite"
        style={{ color: colors.textSecondary }}
      >
        {status}
      </GameText>
      <View
        style={{
          flexDirection: stacked ? 'column' : 'row',
          gap: 8,
        }}
      >
        <GameButton
          ref={save}
          label="Save changes · Free"
          tone={savePrimary ? 'primary' : 'secondary'}
          disabled={saveDisabled}
          busy={saveBusy}
          onPress={() => onSave(save)}
          style={stacked ? undefined : { flex: 1 }}
          labelStyle={{ fontSize: 18 }}
        />
        <GameButton
          ref={draw}
          label={renderLabel}
          tone={savePrimary ? 'secondary' : 'primary'}
          gameIcon="quill"
          disabled={renderDisabled}
          busy={renderBusy}
          onPress={() => onRender(draw)}
          style={stacked ? undefined : { flex: 1.35 }}
          labelStyle={{ fontSize: 18 }}
        />
      </View>
    </GameFooter>
  );
}
const styles = StyleSheet.create({
  tabRail: { flexGrow: 1, paddingHorizontal: 16, gap: 4 },
  tab: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 2,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  preview: {
    marginHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  link: { paddingHorizontal: 0, gap: 5 },
});
