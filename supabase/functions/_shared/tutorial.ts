export const FUNNEL_EVENTS = [
  'tutorial_started',
  'tutorial_completed',
  'first_prompt_submitted',
  'result_next_battle',
  'draft_recovered',
] as const;
export function parseFunnelEvent(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const v = input as Record<string, unknown>;
  if (!FUNNEL_EVENTS.includes(v.event as (typeof FUNNEL_EVENTS)[number]))
    return null;
  if (
    v.duration_ms != null &&
    (typeof v.duration_ms !== 'number' ||
      !Number.isInteger(v.duration_ms) ||
      v.duration_ms < 0 ||
      v.duration_ms > 86400000)
  )
    return null;
  if (
    v.battle_id != null &&
    (typeof v.battle_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        v.battle_id,
      ))
  )
    return null;
  return {
    event: v.event as (typeof FUNNEL_EVENTS)[number],
    duration_ms: (v.duration_ms as number | undefined) ?? null,
    battle_id: (v.battle_id as string | undefined) ?? null,
  };
}
