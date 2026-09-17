import { invokeAuthenticatedFunction, supabase } from './supabase';
import type { TutorialHintKey, TutorialState } from './tutorialState';
export type FunnelEvent =
  | 'tutorial_started'
  | 'tutorial_completed'
  | 'first_prompt_submitted'
  | 'result_next_battle'
  | 'draft_recovered';
export async function recordFunnelEvent(
  event: FunnelEvent,
  battleId: string,
  durationMs?: number,
): Promise<void> {
  try {
    await invokeAuthenticatedFunction('record-funnel-event', {
      event,
      battle_id: battleId,
      duration_ms:
        durationMs == null
          ? undefined
          : Math.min(86400000, Math.max(0, Math.round(durationMs))),
    });
  } catch {
    /* Telemetry never blocks play. */
  }
}
export async function loadTutorial(
  profileId: string,
): Promise<TutorialState | null> {
  const { data, error } = await supabase
    .from('tutorial_progress')
    .select('battle_id,dismissed_hints,completed_at')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw new Error('Practice progress could not load.');
  return data as TutorialState | null;
}
export async function startTutorial(replay = false): Promise<string> {
  const { state } = await invokeAuthenticatedFunction<{ state: TutorialState }>(
    'tutorial',
    { action: replay ? 'replay' : 'start' },
  );
  if (!state.battle_id) throw new Error('Practice is not ready. Try again.');
  void recordFunnelEvent('tutorial_started', state.battle_id);
  return state.battle_id;
}
export async function updateTutorial(
  battleId: string,
  hint?: TutorialHintKey,
): Promise<TutorialState> {
  const { state } = await invokeAuthenticatedFunction<{ state: TutorialState }>(
    'tutorial',
    { action: hint ? 'dismiss' : 'complete', battle_id: battleId, hint },
  );
  if (!hint) void recordFunnelEvent('tutorial_completed', battleId);
  return state;
}
