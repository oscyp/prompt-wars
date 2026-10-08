import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Keyboard,
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
import { GameType } from '@/constants/DesignTokens';
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
  const rail = useRef<ScrollView>(null);
  const viewport = useRef(0);
  const offset = useRef(0);
  const bounds = useRef<
    Partial<Record<DraftSection, { x: number; width: number }>>
  >({});
  const [textHeight, setTextHeight] = useState({ scale: fontScale, height: 0 });
  const revealSelected = useCallback(() => {
    const tab = bounds.current[value];
    if (!tab || !viewport.current) return;
    let next = offset.current;
    if (tab.x < next) next = Math.max(0, tab.x - 16);
    else if (tab.x + tab.width > next + viewport.current)
      next = Math.max(0, tab.x + tab.width + 16 - viewport.current);
    if (next !== offset.current) {
      offset.current = next;
      rail.current?.scrollTo({ x: next, animated: false });
    }
  }, [value]);
  useEffect(revealSelected, [revealSelected, fontScale]);
  const railHeight = Math.max(
    52,
    GameType.label.lineHeight * fontScale + 22,
    (textHeight.scale === fontScale ? textHeight.height : 0) + 22,
  );
  const items: { key: DraftSection; label: string; icon: GameIconName }[] = [
    { key: 'look', label: 'Look', icon: 'palette' },
    { key: 'identity', label: 'Fighter', icon: 'profile' },
    { key: 'gear', label: 'Gear', icon: 'gear' },
  ];
  return (
    <ScrollView
      ref={rail}
      horizontal
      onLayout={({ nativeEvent: { layout } }) => {
        viewport.current = layout.width;
        revealSelected();
      }}
      onContentSizeChange={revealSelected}
      onScroll={({ nativeEvent }) => {
        offset.current = nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
      style={{
        flexGrow: 0,
        flexShrink: 0,
        height: railHeight,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
      contentContainerStyle={styles.tabRail}
      accessibilityRole="tablist"
      accessibilityLabel="Editing category"
    >
      {items.map((item) => (
        <Pressable
          key={item.key}
          onLayout={({ nativeEvent: { layout } }) => {
            bounds.current[item.key] = { x: layout.x, width: layout.width };
            if (item.key === value) revealSelected();
          }}
          onPress={() => onChange(item.key)}
          accessibilityRole="tab"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: item.key === value }}
          accessibilityHint={dirty[item.key] ? 'Unsaved changes' : undefined}
          style={[
            styles.tab,
            {
              flex: fontScale <= 1.3 ? 1 : undefined,
              minWidth: fontScale > 1.3 ? 96 * fontScale : 96,
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
            onTextLayout={({ nativeEvent }) => {
              const height = nativeEvent.lines.reduce(
                (sum, line) => sum + line.height,
                0,
              );
              setTextHeight((old) =>
                old.scale === fontScale && old.height >= height
                  ? old
                  : { scale: fontScale, height },
              );
            }}
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
        {!compact && dirty && (
          <GameText
            variant="fighter"
            style={{ color: colors.primary, fontSize: 13, letterSpacing: 0.8 }}
          >
            DRAFT CHANGES
          </GameText>
        )}
        <GameText
          variant="fighter"
          style={{ fontSize: compact ? 22 : 29, color: colors.text }}
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
              endIcon="chevron-right"
              chrome="text"
              tone="secondary"
              labelStyle={{ fontSize: 16, textDecorationLine: 'none' }}
              style={styles.link}
              onPress={() => onView(viewRef)}
            />
            <GameButton
              ref={historyRef}
              label="Previous looks"
              endIcon="chevron-right"
              chrome="text"
              tone="secondary"
              labelStyle={{ fontSize: 16, textDecorationLine: 'none' }}
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
  const stacked = !keyboardVisible && (width < 360 || fontScale > 1.3);
  const save = useRef<View>(null),
    draw = useRef<View>(null);
  return (
    <GameFooter
      keyboardVisible={keyboardVisible}
      onLayout={onLayout}
      style={{ paddingHorizontal: 16, gap: 6 }}
    >
      {!!status && !keyboardVisible && fontScale <= 1.3 && (
        <GameText
          variant="caption"
          accessibilityLiveRegion="polite"
          style={{ color: colors.textSecondary, flexShrink: 0 }}
        >
          {status}
        </GameText>
      )}
      <View
        style={{
          flexDirection: stacked ? 'column' : 'row',
          gap: 8,
        }}
      >
        <GameButton
          ref={save}
          label="Save changes"
          tone={savePrimary ? 'primary' : 'secondary'}
          disabled={saveDisabled}
          busy={saveBusy}
          onPress={() => onSave(save)}
          style={stacked ? undefined : { flex: keyboardVisible ? 2 : 1 }}
          labelStyle={{ fontSize: 18 }}
        />
        {keyboardVisible ? (
          <GameButton
            label="Done"
            tone="secondary"
            onPress={() => Keyboard.dismiss()}
            labelStyle={{ fontSize: 18 }}
            style={stacked ? undefined : { flex: 1 }}
          />
        ) : (
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
        )}
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
