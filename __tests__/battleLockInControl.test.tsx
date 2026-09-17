import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import {
  BattleLockInControl,
  type LockInState,
} from '@/components/game/battle/BattleLockInControl';
import { GameBevel } from '@/components/game';
import type { SharedValue } from 'react-native-reanimated';
jest.mock('expo-font', () => ({ isLoaded: () => true }));
const progress = { value: 0 } as SharedValue<number>;
test.each(['unavailable', 'submitting', 'submitted'] as LockInState[])(
  '%s disables every submission handler and metallic ready paint',
  (state) => {
    const action = jest.fn();
    const screen = render(
      <BattleLockInControl
        state={state}
        reason="Wait for the battle"
        progress={progress}
        screenReaderEnabled={false}
        onStart={action}
        onCancel={action}
        onConfirm={action}
      />,
    );
    const control = screen.getByTestId('battle-lock-in');
    fireEvent(control, 'pressIn');
    fireEvent.press(control);
    expect(action).not.toHaveBeenCalled();
    expect(control.props.accessibilityState.disabled).toBe(true);
    expect(control.props.accessibilityState.busy).toBe(state === 'submitting');
    expect(screen.UNSAFE_getByType(GameBevel).props.gradient).toBeUndefined();
  },
);
test('ready uses quill and hold callbacks; screen reader uses confirmation', () => {
  const start = jest.fn(),
    cancel = jest.fn(),
    confirm = jest.fn();
  const props = {
    state: 'ready' as const,
    progress,
    onStart: start,
    onCancel: cancel,
    onConfirm: confirm,
  };
  const screen = render(
    <BattleLockInControl {...props} screenReaderEnabled={false} />,
  );
  expect(
    screen.getByTestId('game-icon-quill', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.getByText('HOLD TO LOCK IN')).toBeTruthy();
  fireEvent(screen.getByTestId('battle-lock-in'), 'pressIn');
  fireEvent(screen.getByTestId('battle-lock-in'), 'pressOut');
  expect(start).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
  screen.rerender(<BattleLockInControl {...props} screenReaderEnabled />);
  fireEvent.press(screen.getByTestId('battle-lock-in'));
  expect(confirm).toHaveBeenCalledTimes(1);
});
