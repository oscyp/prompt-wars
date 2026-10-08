import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';

let mockUserId: string | null = 'alice';
let mockAnonymous = false;
let mockParams: { switchAccount?: string } = {};
let mockRestorationError = false;
let mockAuthLoading = false;
const mockRetrySessionRestore = jest.fn();
let mockSegments = ['(tabs)', 'home'];
let mockStackMounts = 0;
let mockFonts: [boolean, Error | null] = [true, null];
let mockEligibility: { can_play: boolean; status: string } | null = null;
let mockEligibilityLoading = false;
let mockEligibilityError = false;
let mockRecoveryPending = false;
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
    session: mockUserId
      ? { user: { id: mockUserId, is_anonymous: mockAnonymous } }
      : null,
    restorationError: mockRestorationError,
    retrySessionRestore: mockRetrySessionRestore,
    loading: mockAuthLoading,
    recoveryPending: mockRecoveryPending,
    recoveryProcessing: false,
    eligibility: mockEligibility,
    eligibilityLoading: mockEligibilityLoading,
    eligibilityError: mockEligibilityError,
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
    useGlobalSearchParams: () => mockParams,
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
  delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
  mockEligibility = null;
  mockEligibilityLoading = false;
  mockEligibilityError = false;
  mockRecoveryPending = false;
  mockUserId = 'alice';
  mockAnonymous = false;
  mockParams = {};
  mockRestorationError = false;
  mockAuthLoading = false;
  mockSegments = ['(tabs)', 'home'];
  mockStackMounts = 0;
  mockFonts = [true, null];
  mockRequests.length = 0;
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

test('eligibility must resolve before character reads or notification handling', async () => {
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  mockEligibilityLoading = true;
  const view = render(<RootLayout />);
  expect(mockRequests).toHaveLength(0);
  expect(mockInitialNotification).not.toHaveBeenCalled();
  expect(gate(view).resolved).toBe(false);
  mockEligibilityLoading = false;
  mockEligibility = { can_play: true, status: 'eligible' };
  view.rerender(<RootLayout />);
  await act(async () =>
    mockRequests[0].resolve({ data: { id: 'fighter-a' }, error: null }),
  );
  expect(mockInitialNotification).toHaveBeenCalledTimes(1);
});

test.each(['needs_registration', 'revoked', 'deleted'])(
  'restricted account %s routes to eligibility without reading characters',
  (status) => {
    process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
    mockEligibility = { can_play: false, status };
    render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/eligibility');
    expect(mockRequests).toHaveLength(0);
    expect(mockInitialNotification).not.toHaveBeenCalled();
  },
);

test.each(['settings', 'blocked'])(
  'an eligibility failure is closed but leaves account management %s reachable',
  (screen) => {
    process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
    mockEligibilityError = true;
    mockSegments = ['(profile)', screen];
    render(<RootLayout />);
    expect(mockRequests).toHaveLength(0);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockInitialNotification).not.toHaveBeenCalled();
  },
);

test('eligibility loading leaves management controls on the eligibility screen unobstructed', () => {
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  mockEligibilityLoading = true;
  mockSegments = ['(auth)', 'eligibility'];
  const view = render(<RootLayout />);
  expect(view.queryByText('Checking account access…')).toBeNull();
  expect(mockRequests).toHaveLength(0);
});

test('a failed character read does not obscure account settings and deletion', async () => {
  mockSegments = ['(profile)', 'settings'];
  const view = render(<RootLayout />);
  await act(async () =>
    mockRequests[0].resolve({ data: null, error: { message: 'Offline' } }),
  );
  expect(view.queryByText('Couldn’t check your fighter')).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});

test('password recovery takes priority over restricted eligibility', () => {
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  mockRecoveryPending = true;
  mockEligibility = { can_play: false, status: 'revoked' };
  render(<RootLayout />);
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/reset-password');
  expect(mockRequests).toHaveLength(0);
});
afterEach(() => jest.restoreAllMocks());
const gate = (view: ReturnType<typeof render>) =>
  JSON.parse(
    view.getByTestId('gate', { includeHiddenElements: true }).props.children,
  );

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

test('failed restoration offers explicit retry and never routes to account creation', () => {
  mockUserId = null;
  mockRestorationError = true;
  const view = render(<RootLayout />);
  expect(view.getByText('Could not restore your progress')).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(gate(view).resolved).toBe(false);
  fireEvent.press(view.getByText('Retry'));
  expect(mockRetrySessionRestore).toHaveBeenCalledTimes(1);
});

test('signed-out combined release opens guest entry only after restoration succeeds', () => {
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  mockUserId = null;
  render(<RootLayout />);
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/entry');
});

test.each([
  { anonymous: true, param: '1', screen: 'sign-in', stays: true },
  { anonymous: true, param: undefined, screen: 'sign-in', stays: false },
  { anonymous: false, param: '1', screen: 'sign-in', stays: false },
  { anonymous: true, param: '1', screen: 'sign-up', stays: false },
])(
  'guest account-switch route is scoped to explicit sign-in: %j',
  async ({ anonymous, param, screen, stays }) => {
    mockAnonymous = anonymous;
    mockParams = { switchAccount: param };
    mockSegments = ['(auth)', screen];
    const view = render(<RootLayout />);
    await act(async () =>
      mockRequests[0].resolve({ data: { id: 'fighter-a' }, error: null }),
    );
    if (stays) expect(mockReplace).not.toHaveBeenCalled();
    else expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
    expect(gate(view).resolved).toBe(true);
  },
);

test.each([
  { state: 'revoked', explicit: true },
  { state: 'error', explicit: true },
  { state: 'loading', explicit: true },
  { state: 'revoked', explicit: false },
  { state: 'error', explicit: false },
  { state: 'loading', explicit: false },
])(
  'guest eligibility $state preserves only explicit account switching ($explicit)',
  ({ state, explicit }) => {
    process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
    mockAnonymous = true;
    mockSegments = ['(auth)', 'sign-in'];
    mockParams = explicit ? { switchAccount: '1' } : {};
    mockEligibility =
      state === 'revoked' ? { can_play: false, status: 'revoked' } : null;
    mockEligibilityError = state === 'error';
    mockEligibilityLoading = state === 'loading';
    const view = render(<RootLayout />);

    if (explicit) {
      expect(mockReplace).not.toHaveBeenCalled();
      expect(view.queryByText('Checking account access…')).toBeNull();
    } else if (state === 'loading') {
      expect(view.getByText('Checking account access…')).toBeTruthy();
    } else {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/eligibility');
    }
    expect(gate(view).hasCharacter).toBeNull();
    expect(mockRequests).toHaveLength(0);
    expect(mockInitialNotification).not.toHaveBeenCalled();
    expect(mockNotificationListener).not.toHaveBeenCalled();
  },
);

test.each(['sign-in', 'sign-up'])(
  'initial restoration blocks a direct %s route including its accessibility tree',
  (screen) => {
    mockUserId = null;
    mockAuthLoading = true;
    mockSegments = ['(auth)', screen];
    const view = render(<RootLayout />);
    expect(view.getByText('Restoring your progress…')).toBeTruthy();
    expect(view.queryByTestId('gate')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRequests).toHaveLength(0);
    expect(gate(view).resolved).toBe(false);
  },
);

test('retry keeps the auth route blocked while the restoration error becomes loading', () => {
  mockUserId = null;
  mockSegments = ['(auth)', 'sign-up'];
  mockRestorationError = true;
  const view = render(<RootLayout />);
  fireEvent.press(view.getByText('Retry'));
  mockRestorationError = false;
  mockAuthLoading = true;
  view.rerender(<RootLayout />);
  expect(view.getByText('Restoring your progress…')).toBeTruthy();
  expect(view.queryByTestId('gate')).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
  mockAuthLoading = false;
  view.rerender(<RootLayout />);
  expect(view.queryByText('Restoring your progress…')).toBeNull();
  expect(view.getByTestId('gate')).toBeTruthy();
});
