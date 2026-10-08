import React from 'react';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GuestProgressReminder } from '@/components/auth/GuestProgressReminder';

const mockRouter = { push: jest.fn() };
const mockQuery = {
  select: jest.fn(),
  or: jest.fn(),
  eq: jest.fn(),
  limit: jest.fn(),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (callback: () => void) =>
    jest.requireActual('react').useEffect(callback, [callback]),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual(
    '@react-native-async-storage/async-storage/jest/async-storage-mock',
  ),
);
jest.mock('@/utils/supabase', () => ({ supabase: { from: () => mockQuery } }));
jest.mock('expo-font', () => ({ isLoaded: () => false }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockQuery.select.mockReturnValue(mockQuery);
  mockQuery.or.mockReturnValue(mockQuery);
  mockQuery.eq.mockReturnValue(mockQuery);
  mockQuery.limit.mockResolvedValue({
    data: [{ id: 'completed' }],
    error: null,
  });
});

it('offers securing only after a completed battle and persists dismissal for this guest', async () => {
  const view = render(<GuestProgressReminder userId="guest-a" />);
  const secure = await view.findByLabelText('Secure your progress');
  expect(mockQuery.eq).toHaveBeenCalledWith('status', 'completed');
  fireEvent.press(secure);
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/(profile)/settings',
    params: { secure: '1' },
  });
  fireEvent.press(view.getByLabelText('Dismiss account reminder'));
  await waitFor(() =>
    expect(view.queryByLabelText('Secure your progress')).toBeNull(),
  );
  view.unmount();
  const again = render(<GuestProgressReminder userId="guest-a" />);
  await act(async () => {});
  expect(again.queryByLabelText('Secure your progress')).toBeNull();
  again.rerender(<GuestProgressReminder userId="guest-b" />);
  expect(await again.findByLabelText('Secure your progress')).toBeTruthy();
});

it('does not show a battle milestone when the read fails or no battle has completed', async () => {
  mockQuery.limit.mockResolvedValueOnce({
    data: null,
    error: { message: 'offline' },
  });
  const view = render(<GuestProgressReminder userId="guest-a" />);
  await act(async () => {});
  expect(view.queryByLabelText('Secure your progress')).toBeNull();
  mockQuery.limit.mockResolvedValueOnce({ data: [], error: null });
  view.rerender(<GuestProgressReminder userId="guest-b" />);
  await act(async () => {});
  expect(view.queryByLabelText('Secure your progress')).toBeNull();
});

it('ignores a delayed battle read after switching accounts', async () => {
  let resolve!: (value: unknown) => void;
  mockQuery.limit.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(<GuestProgressReminder userId="guest-a" />);
  await waitFor(() => expect(mockQuery.limit).toHaveBeenCalledTimes(1));
  mockQuery.limit.mockResolvedValueOnce({ data: [], error: null });
  view.rerender(<GuestProgressReminder userId="guest-b" />);
  await act(async () => {
    resolve({ data: [{ id: 'old' }], error: null });
  });
  expect(view.queryByLabelText('Secure your progress')).toBeNull();
});
