import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { BattleModeInfo } from '@/constants/BattleModes';

export interface ModeCardProps {
  info: BattleModeInfo;
  onPress: (mode: BattleModeInfo['mode']) => void;
  disabled?: boolean;
}

/**
 * Illustrated battle-mode row: bundled art tile, title/description, chevron.
 * Used by the mode bottom-sheet and the fallback `(tabs)/create` screen.
 */
export default function ModeCard({ info, onPress, disabled }: ModeCardProps) {
  const colors = useThemedColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: pressed ? info.accent : colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={() => onPress(info.mode)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${info.title}. ${info.description}`}
    >
      <Image
        source={info.art}
        style={[styles.art, { borderColor: info.accent }]}
        resizeMode="cover"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text }]}>
          {info.title}
        </Text>
        <Text
          style={[styles.description, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {info.description}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    minHeight: 88,
  },
  art: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    marginBottom: 2,
  },
  description: {
    fontSize: Typography.sizes.sm,
  },
});
