// Shared push-notification delivery for Edge Functions.
//
// Token registration and per-category preferences are written directly by the
// client under RLS (own-row policies on push_tokens / notification_preferences).
// Actual delivery is service-role only: it reads every active device token for a
// recipient, enforces the per-category + frequency-cap policy via the
// `can_send_notification` / `log_notification_send` DB functions, and posts to
// the Expo Push API. Delivery never throws — a failed push must never break a
// battle, video, or matchmaking flow.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// Categories map 1:1 to boolean columns on notification_preferences.
export type PushCategory =
  | 'result_ready'
  | 'opponent_submitted'
  | 'video_ready'
  | 'daily_quest'
  | 'friend_challenge'
  | 'season_ending';

export interface PushPayload {
  profileId: string;
  category: PushCategory;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Run a background task without blocking the response. Uses EdgeRuntime.waitUntil
 * when deployed; falls back to a fire-and-forget promise locally/in tests.
 */
export function runInBackground(task: Promise<unknown>): void {
  const swallow = (err: unknown) => console.error('push background task error:', err);
  // @ts-ignore - EdgeRuntime is only defined in the deployed runtime.
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(Promise.resolve(task).catch(swallow));
  } else {
    void Promise.resolve(task).catch(swallow);
  }
}

/**
 * Deliver a single push to one recipient's active devices. Honors the
 * per-category preference + 2/day frequency cap (result_ready is must-send).
 * Always resolves; logs and absorbs all errors.
 */
export async function deliverPush(
  supabase: SupabaseClient,
  payload: PushPayload,
): Promise<void> {
  const { profileId, category, title, body, data } = payload;

  try {
    // Policy gate: category opt-out + frequency cap. result_ready ignores both.
    const { data: allowed, error: gateError } = await supabase.rpc(
      'can_send_notification',
      { p_profile_id: profileId, p_category: category },
    );

    const canSend = gateError ? category === 'result_ready' : allowed !== false;
    if (!canSend) {
      return;
    }

    const { data: tokens, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('profile_id', profileId)
      .eq('is_active', true);

    if (tokenError || !tokens || tokens.length === 0) {
      return;
    }

    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    }));

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error('Expo push send failed:', response.status, await response.text());
      return;
    }

    // Deactivate tokens Expo reports as unregistered so we stop targeting them.
    const result = (await response.json()) as { data?: ExpoTicket[] };
    const tickets = result.data ?? [];
    const deadTokens: string[] = [];
    tickets.forEach((ticket, index) => {
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered' &&
        messages[index]
      ) {
        deadTokens.push(messages[index].to);
      }
    });

    if (deadTokens.length > 0) {
      await supabase
        .from('push_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('token', deadTokens);
    }

    // Record the send for frequency-cap accounting.
    await supabase.rpc('log_notification_send', {
      p_profile_id: profileId,
      p_category: category,
    });
  } catch (error) {
    console.error('deliverPush error:', error);
  }
}

/** Deliver the same notification to multiple recipients in parallel. */
export async function deliverPushToMany(
  supabase: SupabaseClient,
  profileIds: string[],
  payload: Omit<PushPayload, 'profileId'>,
): Promise<void> {
  const unique = [...new Set(profileIds.filter(Boolean))];
  await Promise.all(unique.map((id) => deliverPush(supabase, { ...payload, profileId: id })));
}

interface BattlePlayers {
  player_one_id: string | null;
  player_two_id: string | null;
  is_player_two_bot: boolean | null;
}

async function loadHumanParticipants(
  supabase: SupabaseClient,
  battleId: string,
): Promise<string[]> {
  const { data: battle } = await supabase
    .from('battles')
    .select('player_one_id, player_two_id, is_player_two_bot')
    .eq('id', battleId)
    .single<BattlePlayers>();

  if (!battle) return [];

  const ids: string[] = [];
  if (battle.player_one_id) ids.push(battle.player_one_id);
  if (battle.player_two_id && !battle.is_player_two_bot) ids.push(battle.player_two_id);
  return ids;
}

/** result_ready (must-send): both human players. Fire-and-forget. */
export function notifyBattleResult(supabase: SupabaseClient, battleId: string): void {
  runInBackground(
    (async () => {
      const recipients = await loadHumanParticipants(supabase, battleId);
      await deliverPushToMany(supabase, recipients, {
        category: 'result_ready',
        title: 'Result ready',
        body: 'Your battle result is in. Tap to see how it played out.',
        data: { type: 'result_ready', battleId },
      });
    })(),
  );
}

/** opponent_submitted: notify the other player it is their turn. */
export function notifyOpponentSubmitted(
  supabase: SupabaseClient,
  battleId: string,
  submitterProfileId: string,
): void {
  runInBackground(
    (async () => {
      const recipients = (await loadHumanParticipants(supabase, battleId)).filter(
        (id) => id !== submitterProfileId,
      );
      await deliverPushToMany(supabase, recipients, {
        category: 'opponent_submitted',
        title: 'Your move',
        body: 'Your opponent locked in their prompt. The battle is waiting on you.',
        data: { type: 'opponent_submitted', battleId },
      });
    })(),
  );
}

/** video_ready: cinematic upgrade finished, notify both human players. */
export function notifyVideoReady(supabase: SupabaseClient, battleId: string): void {
  runInBackground(
    (async () => {
      const recipients = await loadHumanParticipants(supabase, battleId);
      await deliverPushToMany(supabase, recipients, {
        category: 'video_ready',
        title: 'Cinematic ready',
        body: 'Your battle video is ready to watch and share.',
        data: { type: 'video_ready', battleId },
      });
    })(),
  );
}
