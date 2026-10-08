import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { confirmGuestExit, confirmGuestPurchase } from '@/utils/guestAccount';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);
beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

it('does not exit a guest until explicitly choosing to continue without securing', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const onSecure = jest.fn();
  const onContinue = jest.fn();
  confirmGuestExit({ onSecure, onContinue });
  expect(onContinue).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  buttons.find((b) => b.text === 'Cancel')?.onPress?.();
  expect(onContinue).not.toHaveBeenCalled();
  buttons.find((b) => b.text === 'Secure progress')?.onPress?.();
  expect(onSecure).toHaveBeenCalledTimes(1);
  expect(onContinue).not.toHaveBeenCalled();
  buttons.find((b) => b.text === 'Continue without securing')?.onPress?.();
  expect(onContinue).toHaveBeenCalledTimes(1);
});

it('allows guest checkout after acknowledgement without requiring linking, scoped to the account', async () => {
  const alert = jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.text === 'Continue as guest')?.onPress?.();
    });
  expect(await confirmGuestPurchase('guest-a')).toBe('continue');
  expect(await confirmGuestPurchase('guest-a')).toBe('continue');
  expect(alert).toHaveBeenCalledTimes(1);
  expect(await confirmGuestPurchase('guest-b')).toBe('continue');
  expect(alert).toHaveBeenCalledTimes(2);
});

it('does not acknowledge a purchase warning when the player chooses linking or cancels', async () => {
  const alert = jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.text === 'Secure progress')?.onPress?.();
    });
  expect(await confirmGuestPurchase('guest-a')).toBe('secure');
  alert.mockImplementation((_title, _body, buttons) => {
    buttons?.find((b) => b.text === 'Cancel')?.onPress?.();
  });
  expect(await confirmGuestPurchase('guest-a')).toBe('cancel');
  expect(alert).toHaveBeenCalledTimes(2);
});

it('shows the recovery notice when local acknowledgement storage is unavailable', async () => {
  jest
    .spyOn(AsyncStorage, 'getItem')
    .mockRejectedValueOnce(new Error('storage'));
  jest
    .spyOn(AsyncStorage, 'setItem')
    .mockRejectedValueOnce(new Error('storage'));
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
    buttons?.find((b) => b.text === 'Continue as guest')?.onPress?.();
  });
  expect(await confirmGuestPurchase('guest-a')).toBe('continue');
});
