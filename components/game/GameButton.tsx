import React, { useState } from 'react';
import {
  View,
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  TextStyle,
  StyleProp,
} from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { GameChrome } from '@/constants/DesignTokens';
import { useThemedColors } from '@/hooks/useThemedColors';
import { GameBevel } from './GameBevel';
import { GameText } from './GameText';
import { GameIcon, type GameIconName } from './icons/GameIcon';

export interface GameButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  icon?: React.ComponentProps<typeof GameSymbol>['name'];
  tone?: 'primary' | 'secondary' | 'danger';
  gameIcon?: GameIconName;
  endIcon?: GameIconName;
  chrome?: 'action' | 'collection' | 'utility' | 'text';
  busy?: boolean;
  selected?: boolean;
  unavailable?: boolean;
  unavailableHint?: string;
  labelStyle?: StyleProp<TextStyle>;
}

export const GameButton = React.forwardRef<View, GameButtonProps>(
  function GameButton(
    {
      label,
      icon,
      gameIcon,
      endIcon,
      chrome = 'action',
      tone = 'primary',
      busy = false,
      selected = false,
      unavailable = false,
      unavailableHint,
      disabled,
      style,
      labelStyle,
      accessibilityState,
      accessibilityLabel,
      accessibilityHint,
      onFocus,
      onBlur,
      ...props
    }: GameButtonProps,
    ref,
  ) {
    const colors = useThemedColors();
    const [focused, setFocused] = useState(false);
    const blocked = Boolean(
      disabled ||
      busy ||
      unavailable ||
      accessibilityState?.disabled ||
      accessibilityState?.busy,
    );
    const activeBusy = busy || Boolean(accessibilityState?.busy);
    const activeSelected = selected || Boolean(accessibilityState?.selected);
    const fill = blocked
      ? colors.disabledSurface
      : tone === 'primary'
        ? colors.actionFill
        : tone === 'danger'
          ? colors.error
          : activeSelected
            ? colors.selectedSurface
            : colors.card;
    const ink = blocked
      ? colors.disabledInk
      : chrome === 'text'
        ? tone === 'danger'
          ? colors.error
          : colors.primary
        : tone === 'primary'
          ? colors.actionInk
          : tone === 'danger'
            ? colors.dangerInk
            : colors.primary;
    return (
      <Pressable
        ref={ref}
        {...props}
        disabled={blocked}
        accessibilityRole={props.accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={
          unavailable
            ? (unavailableHint ?? accessibilityHint ?? 'Currently unavailable')
            : accessibilityHint
        }
        accessibilityState={{
          ...accessibilityState,
          disabled: blocked,
          busy: activeBusy,
          selected: activeSelected,
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={(state) => [
          styles.button,
          state.pressed && !blocked && styles.pressed,
          typeof style === 'function' ? style(state) : style,
        ]}
      >
        {(chrome !== 'text' || focused) && (
          <GameBevel
            fill={chrome === 'text' ? 'transparent' : fill}
            gradient={
              !blocked && tone === 'primary' && chrome === 'action'
                ? ['#D6C6FF', colors.actionFill]
                : undefined
            }
            color={
              focused
                ? colors.focusRing
                : activeSelected
                  ? colors.primary
                  : chrome === 'collection'
                    ? colors.primary
                    : chrome === 'utility'
                      ? colors.ornamentMuted
                      : colors.ornament
            }
            insetColor={
              tone === 'primary' && !blocked ? colors.actionInk : undefined
            }
            strokeWidth={focused || activeSelected ? 2 : 1}
          />
        )}
        {activeBusy ? (
          <ActivityIndicator color={ink} accessible={false} />
        ) : gameIcon ? (
          <GameIcon name={gameIcon} size={26} color={ink} />
        ) : icon || unavailable ? (
          <GameSymbol
            name={
              icon ?? (unavailable ? 'lock-closed-outline' : 'checkmark-circle')
            }
            size={22}
            color={ink}
            accessible={false}
          />
        ) : null}
        {activeSelected && !activeBusy && (
          <GameIcon name="check" size={18} color={ink} />
        )}
        <GameText
          variant="label"
          style={[
            styles.label,
            { color: ink },
            chrome === 'text' && { textDecorationLine: 'underline' },
            labelStyle,
          ]}
        >
          {label}
        </GameText>
        {endIcon && <GameIcon name={endIcon} size={18} color={ink} />}
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  button: {
    minHeight: GameChrome.minControlSize,
    minWidth: GameChrome.minControlSize,
    paddingHorizontal: GameChrome.controlPaddingHorizontal,
    paddingVertical: GameChrome.controlPaddingVertical,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  pressed: { opacity: 0.84 },
  label: { flexShrink: 1, textAlign: 'center' },
});
