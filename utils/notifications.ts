// Push notification registration, foreground handling, and tap routing.
//
// Token rows and per-category preferences are written directly to Supabase under
// the owner RLS policies on push_tokens / notification_preferences. Delivery is
// handled server-side (supabase/functions/_shared/push.ts). Everything here is
// best-effort and must never crash the app — push is additive.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';

// Show banners while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let cachedToken: string | null = null;

export interface BattleNotificationData {
  type?: 'result_ready' | 'opponent_submitted' | 'video_ready' | string;
  battleId?: string;
}

function resolveProjectId(): string | undefined {
  const fromExpoConfig = (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const fromEasConfig = (Constants as unknown as { easConfig?: { projectId?: string } })?.easConfig
    ?.projectId;
  return fromExpoConfig ?? fromEasConfig ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? undefined;
}

/**
 * Request permission, obtain the Expo push token, and persist it for this
 * device. Returns the token, or null if unavailable (denied, simulator, or no
 * EAS projectId configured). Safe to call repeatedly — the upsert is idempotent.
 */
export async function registerForPushNotifications(profileId: string): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted || existing.status === 'granted';
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted || requested.status === 'granted';
    }
    if (!granted) {
      return null;
    }

    const projectId = resolveProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResponse.data;
    cachedToken = token;

    await supabase.from('push_tokens').upsert(
      {
        profile_id: profileId,
        platform: Platform.OS,
        token,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );

    return token;
  } catch (error) {
    // Simulators and unconfigured projectId throw here — that's expected.
    console.warn('Push registration skipped:', error);
    return null;
  }
}

/** Deactivate this device's token (call on sign-out). */
export async function deactivatePushToken(): Promise<void> {
  if (!cachedToken) return;
  try {
    await supabase
      .from('push_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('token', cachedToken);
  } catch (error) {
    console.warn('Failed to deactivate push token:', error);
  } finally {
    cachedToken = null;
  }
}

/** Deep-link from a notification payload to the relevant battle screen. */
export function routeFromNotificationData(data: BattleNotificationData | null | undefined): void {
  if (!data?.battleId) return;
  const { battleId, type } = data;
  switch (type) {
    case 'opponent_submitted':
      router.push(`/(battle)/waiting?battleId=${battleId}`);
      break;
    case 'result_ready':
    case 'video_ready':
      router.push(`/(battle)/result?battleId=${battleId}`);
      break;
    default:
      break;
  }
}

/** Listen for notification taps while the app is running. */
export function addNotificationResponseListener(): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as BattleNotificationData;
    routeFromNotificationData(data);
  });
}

/** Route from a notification that cold-started the app. */
export async function handleInitialNotification(): Promise<void> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (response) {
      const data = response.notification.request.content.data as BattleNotificationData;
      routeFromNotificationData(data);
    }
  } catch (error) {
    console.warn('Failed to handle initial notification:', error);
  }
}

// --- Per-category preferences (written directly under owner RLS) -------------

export interface NotificationPreferences {
  result_ready: boolean; // must-send; cannot be disabled server-side
  opponent_submitted: boolean;
  video_ready: boolean;
  daily_quest: boolean;
  friend_challenge: boolean;
  season_ending: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  result_ready: true,
  opponent_submitted: true,
  video_ready: true,
  daily_quest: true,
  friend_challenge: true,
  season_ending: true,
};

export async function getNotificationPreferences(
  profileId: string,
): Promise<NotificationPreferences> {
  try {
    const { data } = await supabase
      .from('notification_preferences')
      .select(
        'result_ready, opponent_submitted, video_ready, daily_quest, friend_challenge, season_ending',
      )
      .eq('profile_id', profileId)
      .maybeSingle();
    return data
      ? { ...DEFAULT_NOTIFICATION_PREFERENCES, ...data }
      : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  } catch (error) {
    console.warn('Failed to load notification preferences:', error);
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export async function updateNotificationPreference(
  profileId: string,
  category: keyof NotificationPreferences,
  value: boolean,
): Promise<void> {
  await supabase.from('notification_preferences').upsert(
    {
      profile_id: profileId,
      [category]: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id' },
  );
}
