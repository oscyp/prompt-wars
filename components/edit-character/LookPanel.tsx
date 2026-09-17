import { useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { GameField, GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  describeLook,
  type StageTraitKey,
  type PaletteKey,
  type ArtStyle,
} from '@/constants/CharacterTraits';
import { traitOptions, PALETTE_SWATCH_OPTIONS } from '@/utils/traitOptions';
import OptionGrid from '../OptionGrid';
import ColorSwatchGrid from '../ColorSwatchGrid';
import ModeToggle, { type DescribeMode } from './ModeToggle';
import EditorArtStyles from './EditorArtStyles';
const GROUPS: { key: Exclude<StageTraitKey, 'palette'>; title: string }[] = [
  { key: 'vibe', title: 'Vibe' },
  { key: 'silhouette', title: 'Silhouette' },
  { key: 'era', title: 'Era' },
  { key: 'expression', title: 'Expression' },
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
  onStage,
  mode: controlledMode,
  writtenText,
  onModeChange,
  expandedGroups,
  onExpandedGroupChange,
}: LookPanelProps) {
  const colors = useThemedColors();
  const [localGroups, setLocalGroups] = useState<Record<string, boolean>>({});
  const cachedText = useRef(look.portraitPromptRaw ?? '');
  if (look.portraitPromptRaw !== null)
    cachedText.current = look.portraitPromptRaw;
  const mode =
    controlledMode ?? (look.portraitPromptRaw !== null ? 'prompt' : 'guided');
  const groups = expandedGroups ?? localGroups;
  const toggle = (key: string) => {
    const next = !groups[key];
    onExpandedGroupChange?.(key, next);
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
          <GameField
            label="Describe your fighter"
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
            <GameIcon name="chevron-right" size={16} color={colors.ornament} />
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
          <GameText variant="title" style={{ fontSize: 22 }}>
            Outfit palette
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
            {GROUPS.map(({ key, title }) => {
              const options = traitOptions(key);
              const label =
                options.find((o) => o.value === look[key])?.label ?? 'Choose';
              return (
                <View
                  key={key}
                  style={{ borderTopWidth: 1, borderColor: colors.border }}
                >
                  <Pressable
                    onPress={() => toggle(key)}
                    accessibilityRole="button"
                    accessibilityLabel={title + ', ' + label}
                    accessibilityState={{ expanded: !!groups[key] }}
                    style={styles.disclosure}
                  >
                    <GameText variant="label" style={{ flex: 1, fontSize: 20 }}>
                      {title}
                    </GameText>
                    <GameText
                      variant="caption"
                      style={{ color: colors.textSecondary, flexShrink: 1 }}
                    >
                      {label}
                    </GameText>
                    <GameIcon
                      name="chevron-right"
                      size={16}
                      color={colors.ornament}
                    />
                  </Pressable>
                  {groups[key] && (
                    <View style={{ paddingBottom: 12 }}>
                      <OptionGrid
                        label={title}
                        options={options}
                        value={look[key]}
                        disabled={disabled}
                        onChange={(v) => {
                          if (!disabled) onStage(key, v);
                        }}
                      />
                    </View>
                  )}
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
