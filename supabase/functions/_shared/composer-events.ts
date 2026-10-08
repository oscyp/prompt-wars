export const COMPOSER_EVENTS = [
  'composer_opened',
  'composer_changed',
  'composer_mode_selected',
  'composer_action_selected',
  'composer_inspiration_selected',
  'composer_action_changed',
  'composer_suggestions_applied',
  'composer_intent_selected',
  'composer_approach_selected',
  'composer_step_next',
  'composer_step_back',
  'composer_adaptation_requested',
  'composer_adaptation_ready',
  'composer_adaptation_failed',
  'composer_full_edit',
  'composer_draft_recovered',
  'composer_submitted',
  'composer_suggestions_pending',
  'composer_suggestions_fallback',
  'composer_suggestions_generated',
  'composer_suggestions_reroll',
  'composer_explanation_read',
  'composer_next_battle',
  'composer_session_ended',
] as const;
export type ComposerEvent = (typeof COMPOSER_EVENTS)[number];
export const COMPOSER_OCCURRENCE_EVENTS: readonly ComposerEvent[] = [
  'composer_approach_selected', 'composer_step_next', 'composer_step_back',
  'composer_adaptation_requested', 'composer_adaptation_ready', 'composer_adaptation_failed',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseComposerEvent(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const v = input as Record<string, unknown>;
  if (
    !COMPOSER_EVENTS.includes(v.event as ComposerEvent) ||
    typeof v.battle_id !== 'string' ||
    !UUID.test(v.battle_id) ||
    typeof v.session_id !== 'string' ||
    !UUID.test(v.session_id)
  )
    return null;
  if (
    typeof v.round_number !== 'number' ||
    !Number.isInteger(v.round_number) ||
    v.round_number < 1 ||
    v.round_number > 3
  )
    return null;
  if (
    typeof v.duration_ms !== 'number' ||
    !Number.isInteger(v.duration_ms) ||
    v.duration_ms < 0 ||
    v.duration_ms > 86400000
  )
    return null;
  if (
    v.choice != null &&
    !['builder', 'write', 'suggestion', 'custom', 'free', 'paid'].includes(
      String(v.choice),
    )
  )
    return null;
  const occurrence = COMPOSER_OCCURRENCE_EVENTS.includes(v.event as ComposerEvent);
  if (occurrence && (typeof v.sequence_number !== 'number' || !Number.isInteger(v.sequence_number) || v.sequence_number < 1 || v.sequence_number > 10000)) return null;
  return {
    event: v.event as ComposerEvent,
    ...(occurrence ? { sequence_number: v.sequence_number as number } : {}),
    battle_id: v.battle_id,
    session_id: v.session_id,
    round_number: v.round_number,
    duration_ms: v.duration_ms,
    ...(v.choice == null ? {} : { choice: String(v.choice) }),
  };
}
