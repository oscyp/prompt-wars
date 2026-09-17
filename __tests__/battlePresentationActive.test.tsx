import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';

test('decorative presentation pauses on screen blur and background, then removes listeners', () => {
  const original = AppState.currentState;
  AppState.currentState = 'active';
  let appChanged!: (state: AppStateStatus) => void;
  const removeApp = jest.fn();
  const appListener = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, callback) => {
      appChanged = callback;
      return { remove: removeApp };
    });
  const callbacks: Record<string, () => void> = {};
  const removeFocus = jest.fn();
  const navigation = {
    isFocused: () => true,
    addListener: (name: string, callback: () => void) => {
      callbacks[name] = callback;
      return removeFocus;
    },
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <NavigationContext.Provider
      value={
        navigation as unknown as React.ContextType<typeof NavigationContext>
      }
    >
      {children}
    </NavigationContext.Provider>
  );
  const hook = renderHook(useBattlePresentationActive, { wrapper });
  expect(hook.result.current).toBe(true);
  act(() => callbacks.blur());
  expect(hook.result.current).toBe(false);
  act(() => callbacks.focus());
  expect(hook.result.current).toBe(true);
  act(() => appChanged('background'));
  expect(hook.result.current).toBe(false);
  act(() => appChanged('active'));
  expect(hook.result.current).toBe(true);
  hook.unmount();
  expect(removeFocus).toHaveBeenCalledTimes(2);
  expect(removeApp).toHaveBeenCalledTimes(1);
  appListener.mockRestore();
  AppState.currentState = original;
});
