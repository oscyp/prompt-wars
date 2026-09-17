import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';

let mockUserId: string | null = 'alice';
let mockSegments = ['(tabs)', 'home'];
let mockStackMounts = 0;
let mockFonts: [boolean, Error | null] = [true, null];
const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
const mockInitialNotification = jest.fn();
const mockRemoveNotification = jest.fn();
const mockNotificationListener = jest.fn(() => ({
  remove: mockRemoveNotification,
}));
const mockRequests: {
  accountId: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}[] = [];
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: any) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: any) => children,
}));
jest.mock('expo-font', () => ({
  useFonts: () => mockFonts,
  isLoaded: () => mockFonts[0],
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(async () => {}),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@/utils/audioSettings', () => ({
  loadAudioPreferences: jest.fn(async () => {}),
}));
jest.mock('@/providers/RevenueCatProvider', () => ({
  RevenueCatProvider: ({ children }: any) => children,
}));
jest.mock('@/providers/AuthProvider', () => ({
  AuthProvider: ({ children }: any) => children,
  RouteGateContext: jest.requireActual('react').createContext(null),
  useAuth: () => ({
    session: mockUserId ? { user: { id: mockUserId } } : null,
    loading: false,
    recoveryPending: false,
  }),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  const Stack = () => {
    const gate = React.useContext(
      jest.requireMock('@/providers/AuthProvider').RouteGateContext,
    );
    React.useEffect(() => {
      mockStackMounts++;
    }, []);
    return React.createElement(Text, { testID: 'gate' }, JSON.stringify(gate));
  };
  Stack.Screen = function Screen() {
    return null;
  };
  return {
    Stack,
    useSegments: () => mockSegments,
    useRouter: () => mockRouter,
  };
});
jest.mock('@/utils/notifications', () => ({
  handleInitialNotification: () => mockInitialNotification(),
  addNotificationResponseListener: () => mockNotificationListener(),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: () => {
      let accountId = '';
      const query: any = {
        select: () => query,
        not: () => query,
        limit: () => query,
        eq: (key: string, value: string) => {
          if (key === 'profile_id') accountId = value;
          return query;
        },
        maybeSingle: () =>
          new Promise((resolve, reject) =>
            mockRequests.push({ accountId, resolve, reject }),
          ),
      };
      return query;
    },
  },
}));
beforeEach(() => {
  mockUserId = 'alice';
  mockSegments = ['(tabs)', 'home'];
  mockStackMounts = 0;
  mockFonts = [true, null];
  mockRequests.length = 0;
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const gate = (view: ReturnType<typeof render>) =>
  JSON.parse(view.getByTestId('gate').props.children);

test('a failed bundled font still mounts navigation and resolves the splash', async () => {
  mockFonts = [false, new Error('Unable to load bundled font')];
  const view = render(<RootLayout />);
  expect(view.getByTestId('gate')).toBeTruthy();
  await act(async () =>
    mockRequests[0].resolve({ data: { id: 'fighter-a' }, error: null }),
  );
  expect(gate(view).resolved).toBe(true);
  expect(jest.requireMock('expo-splash-screen').hideAsync).toHaveBeenCalled();
});

test('a stalled font load falls back without leaving a blank cold launch', async () => {
  jest.useFakeTimers();
  mockFonts = [false, null];
  const view = render(<RootLayout />);
  expect(view.queryByTestId('gate')).toBeNull();
  await act(async () => jest.advanceTimersByTime(3000));
  expect(view.getByTestId('gate')).toBeTruthy();
  view.unmount();
  jest.useRealTimers();
});

test.each([true, false])(
  'direct account switch never borrows A character answer (%s) or notification permission when B fails',
  async (hasCharacter) => {
    const view = render(<RootLayout />);
    await act(async () =>
      mockRequests[0].resolve({
        data: hasCharacter ? { id: 'fighter-a' } : null,
        error: null,
      }),
    );
    await waitFor(() => expect(gate(view).hasCharacter).toBe(hasCharacter));
    const notificationCalls = mockInitialNotification.mock.calls.length;
    mockReplace.mockClear();
    mockUserId = 'bob';
    view.rerender(<RootLayout />);
    expect(gate(view)).toEqual({ resolved: false, hasCharacter: null });
    expect(mockInitialNotification).toHaveBeenCalledTimes(notificationCalls);
    const requestB = mockRequests.find(
      (request) => request.accountId === 'bob',
    )!;
    await act(async () =>
      requestB.resolve({ data: null, error: { message: 'Offline' } }),
    );
    expect(view.getByText('Couldn’t check your fighter')).toBeTruthy();
    expect(gate(view)).toEqual({ resolved: false, hasCharacter: null });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockInitialNotification).toHaveBeenCalledTimes(notificationCalls);
    expect(mockStackMounts).toBe(1);
  },
);

test('logout immediately removes a character error and routes to sign-in with the same mounted stack', async () => {
  const view = render(<RootLayout />);
  await act(async () =>
    mockRequests[0].resolve({ data: null, error: { message: 'Offline' } }),
  );
  expect(view.getByText('Couldn’t check your fighter')).toBeTruthy();
  mockUserId = null;
  view.rerender(<RootLayout />);
  expect(view.queryByText('Couldn’t check your fighter')).toBeNull();
  expect(gate(view)).toEqual({ resolved: true, hasCharacter: null });
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  expect(mockStackMounts).toBe(1);
});

test('late account A completion cannot clear B error, route B, or enable notifications', async () => {
  const view = render(<RootLayout />);
  const requestA = mockRequests[0];
  mockUserId = 'bob';
  view.rerender(<RootLayout />);
  const requestB = mockRequests.find((request) => request.accountId === 'bob')!;
  await act(async () =>
    requestB.resolve({ data: null, error: { message: 'Offline' } }),
  );
  await act(async () =>
    requestA.resolve({ data: { id: 'fighter-a' }, error: null }),
  );
  expect(view.getByText('Couldn’t check your fighter')).toBeTruthy();
  expect(gate(view)).toEqual({ resolved: false, hasCharacter: null });
  expect(mockInitialNotification).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockStackMounts).toBe(1);
});

test('a rejected request exposes Retry and a successful retry resolves without remounting navigation', async () => {
  const view = render(<RootLayout />);
  await act(async () => mockRequests[0].reject(new Error('Network failed')));
  expect(gate(view)).toEqual({ resolved: false, hasCharacter: null });
  fireEvent.press(view.getByText('Retry'));
  expect(view.queryByText('Couldn’t check your fighter')).toBeNull();
  await act(async () =>
    mockRequests[1].resolve({ data: { id: 'fighter-a' }, error: null }),
  );
  expect(gate(view)).toEqual({ resolved: true, hasCharacter: true });
  expect(mockInitialNotification).toHaveBeenCalledTimes(1);
  expect(mockStackMounts).toBe(1);
});

test('a same-account transient recheck retains its confirmed fighter and notification listener', async () => {
  const view = render(<RootLayout />);
  await act(async () =>
    mockRequests[0].resolve({ data: { id: 'fighter-a' }, error: null }),
  );
  mockSegments = ['(auth)', 'sign-in'];
  view.rerender(<RootLayout />);
  await act(async () =>
    mockRequests[1].resolve({ data: null, error: { message: 'Offline' } }),
  );
  expect(gate(view)).toEqual({ resolved: true, hasCharacter: true });
  expect(view.queryByText('Couldn’t check your fighter')).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  expect(mockInitialNotification).toHaveBeenCalledTimes(1);
  expect(mockNotificationListener).toHaveBeenCalledTimes(1);
  expect(mockRemoveNotification).not.toHaveBeenCalled();
  expect(mockStackMounts).toBe(1);
});
