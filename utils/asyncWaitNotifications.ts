import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications } from './notifications';
const pending = new Set<string>();
/** Ask once per account/device, after their first human async lock-in. */
export async function requestFirstAsyncWaitNotifications(profileId: string) {
  if (pending.has(profileId)) return;
  pending.add(profileId);
  try {
    const key = `prompt-wars:async-wait-permission:${profileId}`;
    if (await AsyncStorage.getItem(key)) return;
    await AsyncStorage.setItem(key, 'requested');
    await registerForPushNotifications(profileId);
  } catch {
    /* Permission is optional; a storage failure must not block a battle. */
  } finally {
    pending.delete(profileId);
  }
}
