import { useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { GameField, GameText } from '@/components/game';
import { GameIcon, type GameIconName } from '@/components/game/icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  describeLook,
  type StageTraitKey,
  type PaletteKey,
  type ArtStyle,
} from '@/constants/CharacterTraits';
import { traitOptions, PALETTE_SWATCH_OPTIONS } from '@/utils/traitOptions';
import TraitChoiceSheet from './TraitChoiceSheet';
import { useSheetReturnFocus } from '@/hooks/useSheetReturnFocus';
import ColorSwatchGrid from '../ColorSwatchGrid';
import ModeToggle, { type DescribeMode } from './ModeToggle';
import EditorArtStyles from './EditorArtStyles';
const GROUPS: {
  key: Exclude<StageTraitKey, 'palette'>;
  title: string;
  icon: GameIconName;
}[] = [
  { key: 'vibe', title: 'Vibe', icon: 'aura' },
  { key: 'silhouette', title: 'Silhouette', icon: 'profile' },
  { key: 'era', title: 'Era', icon: 'clock' },
  { key: 'expression', title: 'Expression', icon: 'look' },
];
export interface LookPanelProps {
  look: {
    artStyle: ArtStyle;
    palette: PaletteKey | null;
    vibe: string | null;
    silhouette: string | null;
    era: string | null;
    expression: string | null;
    portraitPromptRaw: string | null;
  };
  changedKeys: Set<string>;
  disabled?: boolean;
  onInputFocus?: () => void;
  onStage: (key: string, value: string | null) => void;
  mode?: DescribeMode;
  writtenText?: string;
  onModeChange?: (mode: DescribeMode) => void;
  expandedGroups?: Record<string, boolean>;
  onExpandedGroupChange?: (key: string, value: boolean) => void;
}
export default function LookPanel({
  look,
  disabled = false,
  onInputFocus,
  onStage,
  mode: controlledMode,
  writtenText,
  onModeChange,
}: LookPanelProps) {
  const colors = useThemedColors();
  const [localGroups, setLocalGroups] = useState<Record<string, boolean>>({});
  const cachedText = useRef(look.portraitPromptRaw ?? '');
  if (look.portraitPromptRaw !== null)
    cachedText.current = look.portraitPromptRaw;
  const mode =
    controlledMode ?? (look.portraitPromptRaw !== null ? 'prompt' : 'guided');
  const groups = localGroups;
  const [activeTrait, setActiveTrait] = useState<
    (typeof GROUPS)[number] | null
  >(null);
  const openers = useRef<Record<string, View | null>>({});
  const { remember, returnFocusRef } = useSheetReturnFocus();
  const toggle = (key: string) => {
    const next = !groups[key];
    setLocalGroups((prev) => ({ ...prev, [key]: next }));
  };
  const setMode = (next: DescribeMode) => {
    if (disabled) return;
    if (onModeChange) onModeChange(next);
    else
      onStage(
        'portraitPromptRaw',
        next === 'prompt' ? cachedText.current : null,
      );
  };
  const text = writtenText ?? look.portraitPromptRaw ?? cachedText.current;
  return (
    <View style={styles.panel}>
      <ModeToggle value={mode} onChange={setMode} disabled={disabled} />
      {mode === 'prompt' ? (
        <>
          <GameText
            variant="fighter"
            accessibilityRole="header"
            style={{ fontSize: 19, color: colors.primary, letterSpacing: 0.8 }}
          >
            DESCRIBE YOUR FIGHTER
          </GameText>
          <GameField
            onFocus={onInputFocus}
            onSelectionChange={onInputFocus}
            accessibilityLabel="Your portrait description"
            value={text}
            multiline
            maxLength={200}
            disabled={disabled}
            onChangeText={(v) => {
              if (!disabled) {
                cachedText.current = v;
                onStage('portraitPromptRaw', v);
              }
            }}
            style={styles.input}
          />
          <View style={styles.caption}>
            <GameText
              variant="caption"
              style={{ flex: 1, color: colors.textSecondary }}
            >
              Use this description for your next drawing.
            </GameText>
            <GameText variant="caption">{text.length}/200</GameText>
          </View>
          <EditorArtStyles
            value={look.artStyle}
            disabled={disabled}
            compact
            onChange={(v) => onStage('artStyle', v)}
          />
          <Pressable
            onPress={() => toggle('inactive')}
            accessibilityRole="button"
            accessibilityState={{ expanded: !!groups.inactive }}
            style={styles.disclosure}
          >
            <GameText
              variant="caption"
              style={{ color: colors.textSecondary, flex: 1 }}
            >
              Your guided choices are kept
            </GameText>
            <View
              style={{
                transform: [{ rotate: groups.inactive ? '90deg' : '0deg' }],
              }}
            >
              <GameIcon
                name="chevron-right"
                size={16}
                color={colors.ornament}
              />
            </View>
          </Pressable>
          {groups.inactive && (
            <GameText variant="caption" style={{ color: colors.textSecondary }}>
              Switch to Choose traits to use them again. Your written
              description stays in this device’s draft.
            </GameText>
          )}
        </>
      ) : (
        <>
          <EditorArtStyles
            value={look.artStyle}
            disabled={disabled}
            onChange={(v) => onStage('artStyle', v)}
          />
          <GameText
            variant="fighter"
            accessibilityRole="header"
            style={{ fontSize: 19, color: colors.primary, letterSpacing: 0.8 }}
          >
            OUTFIT PALETTE
          </GameText>
          <ColorSwatchGrid
            groupLabel="Outfit palette"
            options={PALETTE_SWATCH_OPTIONS}
            value={look.palette ?? undefined}
            disabled={disabled}
            onChange={(v) => {
              if (!disabled) onStage('palette', v);
            }}
          />
          <View>
            {GROUPS.map(({ key, title, icon }) => {
              const options = traitOptions(key);
              const label =
                options.find((o) => o.value === look[key])?.label ?? 'Choose';
              return (
                <View
                  key={key}
                  style={{ borderTopWidth: 1, borderColor: colors.border }}
                >
                  <Pressable
                    ref={(node) => {
                      openers.current[key] = node;
                    }}
                    onPress={() => {
                      remember({
                        get current() {
                          return openers.current[key];
                        },
                      });
                      setActiveTrait({ key, title, icon });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={title + ', ' + label}
                    accessibilityState={{ expanded: activeTrait?.key === key }}
                    style={styles.disclosure}
                  >
                    <GameIcon name={icon} size={24} color={colors.primary} />
                    <GameText variant="label" style={{ flex: 1, fontSize: 20 }}>
                      {title}
                    </GameText>
                    <GameText
                      variant="caption"
                      style={{ color: colors.textSecondary, flexShrink: 1 }}
                    >
                      {label}
                    </GameText>
                    <View
                      style={{
                        transform: [
                          {
                            rotate: activeTrait?.key === key ? '90deg' : '0deg',
                          },
                        ],
                      }}
                    >
                      <GameIcon
                        name="chevron-right"
                        size={16}
                        color={colors.ornament}
                      />
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
          <GameText variant="caption" style={{ color: colors.textSecondary }}>
            {describeLook({
              ...look,
              vibe: look.vibe as never,
              silhouette: look.silhouette as never,
              era: look.era as never,
              expression: look.expression as never,
            })}
          </GameText>
        </>
      )}
      <TraitChoiceSheet
        group={activeTrait?.key ?? 'vibe'}
        title={activeTrait?.title ?? 'Vibe'}
        visible={activeTrait !== null}
        value={activeTrait ? look[activeTrait.key] : null}
        disabled={disabled}
        returnFocusRef={returnFocusRef}
        onClose={() => setActiveTrait(null)}
        onChoose={(value) => {
          if (!disabled && activeTrait) {
            onStage(activeTrait.key, value);
            setActiveTrait(null);
          }
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12 },
  input: { minHeight: 144, textAlignVertical: 'top' },
  caption: { flexDirection: 'row', gap: 12 },
  disclosure: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
});
