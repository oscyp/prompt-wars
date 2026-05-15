import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import {
  ART_STYLES,
  ART_STYLE_LABELS,
  ART_STYLE_DESCRIPTIONS,
  ART_STYLE_GLYPHS,
  ART_STYLE_GRADIENTS,
  ArtStyle,
} from '@/constants/CharacterTraits';

interface ArtStylePickerProps {
  value: ArtStyle | undefined;
  onChange: (style: ArtStyle) => void;
  title?: string;
  /**
   * When true, renders compact circular tiles (used in dense layouts).
   * Default false → larger card tiles with label + glyph.
   */
  compact?: boolean;
  /**
   * Disables interaction. Use while a portrait render is in flight.
   */
  disabled?: boolean;
}

/**
 * Horizontal style picker. Tiles use a 2-stop gradient + emoji glyph as a
 * lightweight thumbnail until reference assets are bundled.
 */
export default function ArtStylePicker({
  value,
  onChange,
  title = 'Art style',
  compact = false,
  disabled = false,
}: ArtStylePickerProps) {
  const colors = useThemedColors();
  const tileSize = compact ? 64 : 96;
  const selected = value ?? 'painterly';
  const description = ART_STYLE_DESCRIPTIONS[selected];

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {!compact ? (
          <Text
            style={[styles.description, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {description}
          </Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {ART_STYLES.map((key) => {
          const isSelected = key === value;
          const [c1, c2] = ART_STYLE_GRADIENTS[key];
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onChange(key)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Art style: ${ART_STYLE_LABELS[key]}`}
              accessibilityHint={ART_STYLE_DESCRIPTIONS[key]}
              accessibilityState={{ selected: isSelected, disabled }}
              style={[
                styles.tileWrapper,
                {
                  width: tileSize,
                  opacity: disabled && !isSelected ? 0.5 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.tile,
                  {
                    width: tileSize,
                    height: tileSize,
                    borderRadius: compact ? tileSize / 2 : BorderRadius.lg,
                    borderColor: isSelected ? colors.primary : 'transparent',
                    backgroundColor: c1,
                  },
                ]}
              >
                {/* Cheap two-stop fake gradient via overlay */}
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      backgroundColor: c2,
                      opacity: 0.55,
                      borderRadius: compact ? tileSize / 2 : BorderRadius.lg,
                    },
                  ]}
                />
                <Text style={styles.glyph}>{ART_STYLE_GLYPHS[key]}</Text>
                {isSelected ? (
                  <View
                    style={[
                      styles.selectedBadge,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={styles.selectedBadgeText}>✓</Text>
                  </View>
                ) : null}
              </View>
              {!compact ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    {
                      color: isSelected ? colors.primary : colors.text,
                      fontWeight: isSelected
                        ? Typography.weights.semibold
                        : Typography.weights.medium,
                    },
                  ]}
                >
                  {ART_STYLE_LABELS[key]}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  headerRow: {
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  description: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  row: {
    paddingRight: Spacing.lg,
    gap: Spacing.md,
  },
  tileWrapper: {
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
  },
  glyph: {
    fontSize: 36,
  },
  label: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.xs,
    maxWidth: 96,
    textAlign: 'center',
  },
  selectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
