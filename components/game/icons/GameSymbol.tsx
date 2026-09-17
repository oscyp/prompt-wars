import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GameIcon, type GameIconName } from './GameIcon';

type LegacyName = React.ComponentProps<typeof Ionicons>['name'];
/** Compatibility names stay at call sites; visual game symbols share one family. */
const GAME_SYMBOLS: Partial<Record<LegacyName, GameIconName>> = {
  flash: 'attack',
  'flash-outline': 'attack',
  shield: 'defense',
  'shield-outline': 'defense',
  skull: 'finisher',
  'skull-outline': 'finisher',
  'game-controller': 'battle',
  'game-controller-outline': 'battle',
  trophy: 'trophy',
  'trophy-outline': 'trophy',
  flame: 'flame',
  'flame-outline': 'flame',
  'stats-chart': 'stats',
  'stats-chart-outline': 'stats',
  'bar-chart': 'rankings',
  'bar-chart-outline': 'rankings',
  person: 'profile',
  'person-outline': 'profile',
  'people-outline': 'profile',
  'person-circle-outline': 'profile',
  'shirt-outline': 'hanger',
  'brush-outline': 'hanger',
  sparkles: 'aura',
  'sparkles-outline': 'aura',
  diamond: 'crystal',
  'diamond-outline': 'crystal',
  'wallet-outline': 'wallet',
  wallet: 'wallet',
  'cash-outline': 'wallet',
  'card-outline': 'wallet',
  'shield-checkmark': 'shield-check',
  'shield-checkmark-outline': 'shield-check',
  'settings-outline': 'settings',
  settings: 'settings',
  'cog-outline': 'gear',
  'cube-outline': 'gear',
  'color-palette-outline': 'palette',
  'color-palette': 'palette',
  'color-wand-outline': 'aura',
  'share-outline': 'share',
  'share-social-outline': 'share',
  'open-outline': 'external',
  'school-outline': 'scroll',
  'document-text-outline': 'scroll',
  'reader-outline': 'scroll',
  'ribbon-outline': 'badge',
  ribbon: 'badge',
  'medal-outline': 'badge',
  medal: 'badge',
  checkmark: 'check',
  'checkmark-circle': 'shield-check',
  'checkmark-circle-outline': 'shield-check',
  'chevron-forward': 'chevron-right',
  'chevron-back': 'chevron-left',
  refresh: 'replay',
  'refresh-outline': 'replay',
  reload: 'replay',
  'time-outline': 'clock',
  time: 'clock',
  'timer-outline': 'clock',
  'bulb-outline': 'ideas',
  'help-circle-outline': 'help',
  'help-circle': 'help',
  'lock-closed-outline': 'lock',
  'lock-closed': 'lock',
  'ban-outline': 'blocked',
  'trash-outline': 'trash',
  trash: 'trash',
  'log-out-outline': 'exit',
  heart: 'heart',
  'heart-outline': 'heart',
  close: 'close',
};

/** Common platform utility icons remain compatible; action parents retain semantics. */
export function GameSymbol({
  name,
  size = 24,
  color,
  style,
  ...props
}: React.ComponentProps<typeof Ionicons>) {
  const gameIcon = GAME_SYMBOLS[name];
  if (
    !gameIcon ||
    props.onPress ||
    props.onLongPress ||
    (color != null && typeof color !== 'string')
  )
    return (
      <Ionicons
        {...props}
        name={name}
        size={size}
        color={color}
        style={style}
      />
    );
  return (
    <View
      testID={props.testID}
      nativeID={props.nativeID}
      onLayout={props.onLayout}
      accessible={props.accessible ?? Boolean(props.accessibilityLabel)}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      accessibilityRole={props.accessibilityRole}
      accessibilityState={props.accessibilityState}
      accessibilityValue={props.accessibilityValue}
      accessibilityElementsHidden={props.accessibilityElementsHidden}
      importantForAccessibility={props.importantForAccessibility}
      pointerEvents="none"
      style={style as StyleProp<ViewStyle>}
    >
      <GameIcon
        name={gameIcon}
        size={size}
        color={color as string | undefined}
      />
    </View>
  );
}
