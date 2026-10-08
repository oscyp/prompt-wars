import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { GameBevel } from '@/components/game/GameBevel';
import { useThemedColors } from '@/hooks/useThemedColors';

/** A single quiet gold edge; the artwork and native labels remain separate. */
export default function ItemFrame({
  children,
  selected = false,
  style,
}: {
  children: React.ReactNode;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemedColors();
  return (
    <View style={[{ backgroundColor: colors.background }, style]}>
      {children}
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        {/* Mask only the corners, so native images never cover the bevel. */}
        {corners.map((corner, index) => (
          <Svg
            key={index}
            width={9}
            height={9}
            viewBox="0 0 9 9"
            style={[{ position: 'absolute' }, corner]}
            accessible={false}
          >
            <Path d="M0 0H9L0 9Z" fill={colors.background} />
          </Svg>
        ))}
        <GameBevel
          color={selected ? colors.primary : colors.ornament}
          strokeWidth={selected ? 2 : 1}
          cut={8}
        />
      </View>
    </View>
  );
}
const corners: ViewStyle[] = [
  { top: 0, left: 0 },
  { top: 0, right: 0, transform: [{ rotate: '90deg' }] },
  { bottom: 0, right: 0, transform: [{ rotate: '180deg' }] },
  { bottom: 0, left: 0, transform: [{ rotate: '270deg' }] },
];
