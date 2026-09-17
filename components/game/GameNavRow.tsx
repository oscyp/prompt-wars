import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { GameBevel } from './GameBevel';
import { GameText } from './GameText';
import { GameIcon, type GameIconName } from './icons/GameIcon';

export interface GameNavRowProps {
  title: string;
  description?: string;
  icon?: React.ComponentProps<typeof GameSymbol>['name'];
  gameIcon?: GameIconName;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  role?: 'button' | 'link';
  inline?: boolean;
  last?: boolean;
  color?: string;
  disabled?: boolean;
  busy?: boolean;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Navigation chrome only; callers retain routing, confirmation and async work. */
export function GameNavRow({
  title,
  description,
  icon,
  gameIcon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  role = 'button',
  inline = false,
  last = false,
  color,
  disabled = false,
  busy = false,
  trailing,
  style,
}: GameNavRowProps) {
  const colors = useThemedColors();
  const [focused, setFocused] = useState(false);
  const accessibleText = useAccessibleTextStyle();
  const ink = color ?? colors.text;
  const blocked = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint ?? description}
      accessibilityState={{ disabled: blocked, busy }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.row,
        inline && styles.inline,
        inline &&
          !last && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          },
        (pressed || blocked) && { opacity: blocked ? 0.65 : 0.85 },
        style,
      ]}
    >
      {(!inline || focused) && (
        <GameBevel
          color={focused ? colors.focusRing : colors.ornamentMuted}
          fill={colors.card}
          strokeWidth={focused ? 2 : 1}
          cut={8}
        />
      )}
      <View
        style={[styles.icon, { backgroundColor: colors.selectedSurface }]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <GameBevel color={colors.ornamentMuted} cut={6} />
        {gameIcon ? (
          <GameIcon
            name={gameIcon}
            size={26}
            color={color ?? colors.ornament}
          />
        ) : icon ? (
          <GameSymbol
            name={icon}
            size={22}
            color={color ?? colors.ornament}
            accessible={false}
          />
        ) : null}
      </View>
      <View style={styles.copy}>
        <GameText
          variant="label"
          style={[
            styles.title,
            inline && styles.inlineTitle,
            accessibleText,
            { color: ink },
          ]}
        >
          {title}
        </GameText>
        {!!description && (
          <GameText
            variant="caption"
            style={[accessibleText, { color: colors.textSecondary }]}
          >
            {description}
          </GameText>
        )}
      </View>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.trailing}
      >
        {busy ? (
          <ActivityIndicator color={ink} />
        ) : (
          (trailing ?? (
            <GameSymbol
              name={role === 'link' ? 'open-outline' : 'chevron-forward'}
              size={18}
              color={colors.ornament}
              accessible={false}
            />
          ))
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  inline: { paddingVertical: 12, paddingHorizontal: 0 },
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: 0.3 },
  inlineTitle: { fontSize: 18, lineHeight: 25 },
  trailing: { minWidth: 20, alignItems: 'center' },
});
