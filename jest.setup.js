// Jest setup file for Prompt Wars app
// Mocks for native modules that don't exist in the test environment

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  clear: jest.fn(() => Promise.resolve()),
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' }),
  ),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  setNotificationHandler: jest.fn(),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
  useSegments: jest.fn(() => []),
  usePathname: jest.fn(() => '/'),
  Link: 'Link',
  Slot: 'Slot',
  Stack: 'Stack',
  Tabs: 'Tabs',
}));

// Mock expo-linking
jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'exp://localhost:8081/'),
  parse: jest.fn(() => ({ path: '/', queryParams: {} })),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Mock react-native-purchases
jest.mock('react-native-purchases', () => ({
  configure: jest.fn(),
  getCustomerInfo: jest.fn(() => Promise.resolve({ activeSubscriptions: [] })),
  purchasePackage: jest.fn(() => Promise.resolve()),
  restorePurchases: jest.fn(() => Promise.resolve()),
}));

// Mock Supabase
jest.mock('./utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null } })),
      signInWithPassword: jest.fn(() => Promise.resolve({ data: {} })),
      signUp: jest.fn(() => Promise.resolve({ data: {} })),
      signOut: jest.fn(() => Promise.resolve()),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));

// Reanimated: the edit-character Stage animates on the UI thread. The library's
// own Jest mock turns worklets into no-ops, so component tests assert on
// accessibility props and state, never on animated style values.
//
// Worklets must be mocked first: Reanimated's mock re-exports its real index,
// which initialises react-native-worklets, and worklets' `.native` platform
// check hardcodes IS_JEST=false under jest-expo, so it tries to construct the
// native module and throws. Worklets ships a JS mock without a `./mock` export.
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

// NOTE: The old `react-native/Libraries/Animated/NativeAnimatedHelper` mock was
// removed. That module path no longer exists in this React Native version (it
// moved under `react-native/src/private/animated/`), so mocking it threw a
// "Cannot find module" error that broke *every* test suite. The jest-expo
// preset already silences the `useNativeDriver` warning, so no mock is needed.
