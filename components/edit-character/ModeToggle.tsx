import { View, StyleSheet } from 'react-native';
import { GameButton } from '@/components/game';
import { hapticSelection } from '@/utils/haptics';
export type DescribeMode = 'guided' | 'prompt';
export interface ModeToggleProps {
  value: DescribeMode;
  onChange: (mode: DescribeMode) => void;
  disabled?: boolean;
}
export default function ModeToggle({
  value,
  onChange,
  disabled = false,
}: ModeToggleProps) {
  return (
    <View
      style={styles.row}
      accessibilityRole="tablist"
      accessibilityLabel="Description mode"
    >
      {(['guided', 'prompt'] as const).map((mode) => (
        <GameButton
          key={mode}
          label={mode === 'guided' ? 'Choose traits' : 'Write my own'}
          gameIcon={mode === 'guided' ? 'palette' : 'quill'}
          chrome="utility"
          tone="secondary"
          selected={value === mode}
          disabled={disabled}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === mode, disabled }}
          onPress={() => {
            if (!disabled) {
              hapticSelection();
              onChange(mode);
            }
          }}
          style={styles.button}
          labelStyle={{ fontSize: 16 }}
        />
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  button: { flex: 1, paddingHorizontal: 8, gap: 6 },
});
