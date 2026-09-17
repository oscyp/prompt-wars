import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { GameBevel, GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';

export type LockInState =
  | 'unavailable'
  | 'ready'
  | 'holding'
  | 'submitting'
  | 'failure'
  | 'submitted';
const ProgressCircle = Animated.createAnimatedComponent(Circle);
export function BattleLockInControl({
  state,
  reason,
  progress,
  screenReaderEnabled,
  onStart,
  onCancel,
  onConfirm,
}: {
  state: LockInState;
  reason?: string;
  progress: SharedValue<number>;
  screenReaderEnabled: boolean;
  onStart: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blocked =
    state === 'unavailable' || state === 'submitting' || state === 'submitted';
  const ink = blocked ? '#ABA6BA' : '#171026';
  const circumference = 2 * Math.PI * 15;
  const ring = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));
  const label =
    state === 'submitting'
      ? 'LOCKING IN…'
      : state === 'submitted'
        ? 'PROMPT LOCKED IN'
        : state === 'holding'
          ? 'KEEP HOLDING'
          : state === 'failure'
            ? 'HOLD TO TRY AGAIN'
            : screenReaderEnabled
              ? 'LOCK IN PROMPT'
              : 'HOLD TO LOCK IN';
  return (
    <Pressable
      testID="battle-lock-in"
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel="Lock in prompt"
      accessibilityState={{ disabled: blocked, busy: state === 'submitting' }}
      accessibilityHint={
        reason ??
        (screenReaderEnabled
          ? 'Opens confirmation. You can’t change your prompt afterward.'
          : 'Press and hold. You can’t change your prompt afterward.')
      }
      onPressIn={screenReaderEnabled || blocked ? undefined : onStart}
      onPressOut={screenReaderEnabled || blocked ? undefined : onCancel}
      onPress={screenReaderEnabled && !blocked ? onConfirm : undefined}
      style={styles.control}
    >
      <GameBevel
        color={blocked ? '#665E76' : '#D6B476'}
        insetColor={blocked ? '#454052' : '#F2E8D9'}
        strokeWidth={2}
        gradient={blocked ? undefined : ['#D6C8FF', '#9F82ED']}
        fill={blocked ? '#252332' : undefined}
      />
      {state === 'submitting' ? (
        <ActivityIndicator color={ink} />
      ) : (
        <GameIcon name="quill" size={32} color={ink} />
      )}
      <GameText
        variant="display"
        style={{
          flex: 1,
          fontSize: 23,
          lineHeight: 28,
          color: ink,
          textAlign: 'center',
        }}
      >
        {label}
      </GameText>
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width={36} height={36}>
          <Circle
            cx={18}
            cy={18}
            r={15}
            fill="none"
            stroke={ink}
            strokeOpacity={0.22}
            strokeWidth={4}
          />
          <ProgressCircle
            cx={18}
            cy={18}
            r={15}
            fill="none"
            stroke={ink}
            strokeWidth={4}
            strokeDasharray={[circumference, circumference]}
            animatedProps={ring}
            rotation={-90}
            origin="18,18"
          />
        </Svg>
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  control: {
    minHeight: 64,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
