import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestFirstAsyncWaitNotifications } from '@/utils/asyncWaitNotifications';
import { registerForPushNotifications } from '@/utils/notifications';
jest.mock('@/utils/notifications', () => ({
  registerForPushNotifications: jest.fn().mockResolvedValue(null),
}));
beforeEach(() => {
  jest.clearAllMocks();
  const storage = new Map<string, string>();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(
    async (key: string) => storage.get(key) ?? null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(
    async (key: string, value: string) => {
      storage.set(key, value);
    },
  );
});
test('concurrent waits and later visits ask once, independently for another account', async () => {
  await Promise.all([
    requestFirstAsyncWaitNotifications('one'),
    requestFirstAsyncWaitNotifications('one'),
  ]);
  await requestFirstAsyncWaitNotifications('one');
  expect(registerForPushNotifications).toHaveBeenCalledTimes(1);
  await requestFirstAsyncWaitNotifications('two');
  expect(registerForPushNotifications).toHaveBeenCalledTimes(2);
});
