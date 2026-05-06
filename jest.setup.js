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
    Promise.resolve({ status: 'granted' })
  ),
  scheduleNotificationAsync: jest.fn(() =>
    Promise.resolve('notification-id')
  ),
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
  getCustomerInfo: jest.fn(() =>
    Promise.resolve({ activeSubscriptions: [] })
  ),
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

// Silence the warning: Animated: `useNativeDriver` is not supported
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
