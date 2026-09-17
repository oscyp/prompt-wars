import React, { forwardRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { GameChrome, GameType } from '@/constants/DesignTokens';
import { useThemedColors } from '@/hooks/useThemedColors';
import { GameText } from './GameText';

export interface GameFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  disabled?: boolean;
  busy?: boolean;
  unavailable?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export const GameField = forwardRef<TextInput, GameFieldProps>(
  function GameField(
    {
      label,
      error,
      disabled = false,
      busy = false,
      unavailable = false,
      editable = true,
      style,
      containerStyle,
      onFocus,
      onBlur,
      accessibilityHint,
      accessibilityState,
      ...props
    },
    ref,
  ) {
    const colors = useThemedColors();
    const [focused, setFocused] = useState(false);
    const blocked =
      disabled ||
      busy ||
      unavailable ||
      !editable ||
      Boolean(accessibilityState?.disabled) ||
      Boolean(accessibilityState?.busy);
    const hint = [
      accessibilityHint,
      error,
      unavailable ? 'Currently unavailable' : undefined,
    ]
      .filter(Boolean)
      .join('. ');
    return (
      <View style={[styles.container, containerStyle]}>
        {label && <GameText variant="label">{label}</GameText>}
        <TextInput
          {...props}
          ref={ref}
          editable={!blocked}
          allowFontScaling
          accessibilityLabel={props.accessibilityLabel ?? label}
          accessibilityHint={hint || undefined}
          accessibilityState={{
            ...accessibilityState,
            disabled: blocked,
            busy: busy || Boolean(accessibilityState?.busy),
          }}
          aria-invalid={Boolean(error)}
          placeholderTextColor={
            props.placeholderTextColor ?? colors.textTertiary
          }
          selectionColor={props.selectionColor ?? colors.primary}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            {
              color: blocked ? colors.disabledInk : colors.text,
              backgroundColor: blocked
                ? colors.disabledSurface
                : colors.fieldSurface,
              borderColor: error
                ? colors.error
                : focused
                  ? colors.focusRing
                  : colors.fieldBorder,
              borderWidth: focused || error ? 2 : 1,
            },
            props.multiline && styles.multiline,
            style,
          ]}
        />
        {error && (
          <GameText
            variant="caption"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ color: colors.error }}
          >
            {error}
          </GameText>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: { gap: 8 },
  input: {
    ...GameType.body,
    minHeight: GameChrome.minControlSize,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 4,
  },
  multiline: { textAlignVertical: 'top' },
});
