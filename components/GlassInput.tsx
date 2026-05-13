import React, { useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Layout,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';

interface GlassInputProps extends TextInputProps {
  label?: string;
  helper?: string;
  errorText?: string;
  iconLeft?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  containerStyle?: StyleProp<ViewStyle>;
  multiline?: boolean;
}

/**
 * Glassmorphic text input with optional leading icon, label, and helper/error text.
 */
export default function GlassInput({
  label,
  helper,
  errorText,
  iconLeft,
  containerStyle,
  style,
  multiline,
  onFocus,
  onBlur,
  ...rest
}: GlassInputProps) {
  const colors = useThemedColors();
  const [focused, setFocused] = useState(false);
  const borderColor = errorText
    ? colors.error
    : focused
      ? colors.accent
      : colors.glassBorder;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && (
        <Text
          style={{
            color: colors.textTertiary,
            fontFamily: Typography.fonts.bodyMedium,
            fontSize: Typography.sizes.xs,
            letterSpacing: Typography.letterSpacing.widest,
            textTransform: 'uppercase',
            marginBottom: Spacing.xs,
          }}
        >
          {label}
        </Text>
      )}
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.surface2,
            borderColor,
            minHeight: multiline ? 120 : Layout.inputHeight,
            paddingVertical: multiline ? Spacing.md : 0,
          },
          focused && {
            shadowColor: colors.accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 4,
          },
        ]}
      >
        {iconLeft && (
          <MaterialCommunityIcons
            name={iconLeft}
            size={20}
            color={focused ? colors.accent : colors.textTertiary}
            style={{ marginRight: Spacing.sm }}
          />
        )}
        <TextInput
          {...rest}
          multiline={multiline}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              color: colors.text,
              fontFamily: Typography.fonts.body,
              fontSize: Typography.sizes.base,
              textAlignVertical: multiline ? 'top' : 'center',
              minHeight: multiline ? 100 : Layout.inputHeight,
              paddingVertical: 0,
            },
            style,
          ]}
        />
      </View>
      {(helper || errorText) && (
        <Text
          style={{
            color: errorText ? colors.error : colors.textTertiary,
            fontFamily: Typography.fonts.body,
            fontSize: Typography.sizes.xs,
            marginTop: Spacing.xs,
          }}
        >
          {errorText || helper}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
  },
});
