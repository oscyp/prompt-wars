import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GameText } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';

const STEPS = ['action', 'intent', 'approach', 'review'] as const;
const LABELS = {
  action: 'Action',
  intent: 'Intention',
  approach: 'Approach',
  review: 'Your move',
};

export function composerProgressLabel(step: (typeof STEPS)[number]) {
  return `${LABELS[step]}. Step ${STEPS.indexOf(step) + 1} of ${STEPS.length}.`;
}

/** The owning focusable header announces progress; this content is visual only. */
export function ComposerProgress({ step }: { step: (typeof STEPS)[number] }) {
  const colors = useThemedColors();
  const index = STEPS.indexOf(step);
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.progress}
    >
      <View style={styles.heading}>
        <GameText
          variant="label"
          style={[styles.current, { color: colors.primary }]}
        >
          {LABELS[step]}
        </GameText>
        <GameText
          variant="label"
          style={[styles.count, { color: colors.textSecondary }]}
        >
          {index + 1} of {STEPS.length}
        </GameText>
      </View>
      <View
        style={styles.tracks}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {STEPS.map((name, position) => (
          <View
            key={name}
            style={[
              styles.segment,
              {
                backgroundColor:
                  position === index
                    ? colors.primary
                    : position < index
                      ? colors.textTertiary
                      : colors.border,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { gap: 10 },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  current: { flex: 1, fontSize: 20 },
  count: { fontSize: 16, flexShrink: 0 },
  tracks: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 1 },
});
