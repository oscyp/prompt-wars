import React from 'react';
import { StyleSheet, View } from 'react-native';
import SegmentedCategoryBar, {
  type SegmentedCategoryItem,
} from '@/components/SegmentedCategoryBar';
import { GamePanel } from '@/components/game/GamePanel';
import { GameText } from '@/components/game/GameText';
import { useThemedColors } from '@/hooks/useThemedColors';

type ComposerMode = 'build' | 'write';

const OPTIONS: (SegmentedCategoryItem & { key: ComposerMode })[] = [
  {
    key: 'build',
    label: 'Build move',
    gameIcon: 'ideas',
    accessibilityHint: 'Choose an action, intention and approach.',
  },
  {
    key: 'write',
    label: 'Write your own',
    gameIcon: 'quill',
    accessibilityLabel: 'Write your own prompt',
    accessibilityHint: 'Write one complete prompt in your own words.',
  },
];

export function ComposerModeSwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: ComposerMode;
  onChange: (mode: ComposerMode) => void;
  disabled?: boolean;
}) {
  const colors = useThemedColors();
  return (
    <View style={styles.container}>
      <SegmentedCategoryBar
        items={OPTIONS}
        value={value}
        onChange={(mode) => {
          if (mode !== value && (mode === 'build' || mode === 'write')) {
            onChange(mode);
          }
        }}
        disabled={disabled}
        itemRole="button"
      />
      <GamePanel>
        <GameText
          accessibilityLiveRegion="polite"
          style={{ color: colors.textSecondary }}
        >
          {OPTIONS.find((option) => option.key === value)?.accessibilityHint}
        </GameText>
      </GamePanel>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
});
