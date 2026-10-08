import type { CinematicInputV2 } from './cinematic-inputs.ts';

/** Captions use the same frozen fighters, round outcome and timing as the clip. */
export function buildCinematicCaptions(
  input: CinematicInputV2,
): Array<{ start_ms: number; end_ms: number; text: string }> {
  const end = input.policy.target_duration_seconds * 1000;
  const reveal = Math.round((end * 2) / 3);
  const name = (side: 'p1' | 'p2') => input.fighters[side].name;
  const outcome = input.outcome.isDraw
    ? 'Draw'
    : input.outcome.winner
      ? `${name(input.outcome.winner)} wins${input.outcome.forfeit ? ' by forfeit' : ''}`
      : '';
  return [
    {
      start_ms: 0,
      end_ms: Math.round(end / 5),
      text: `${name('p1')} vs ${name('p2')}`,
    },
    ...(outcome ? [{ start_ms: reveal, end_ms: end, text: outcome }] : []),
  ];
}
