import type { createServiceClient } from './utils.ts';
import type { CinematicInputV2, CinematicSide } from './cinematic-inputs.ts';
import { CinematicPreparationError } from './cinematic-references.ts';
import {
  assertTextModerationConfigured,
  TextModerationProvider,
  type TextModerationResult,
} from './moderation.ts';

/** Recheck permission to generate without replacing immutable recorded actions. */
export async function moderateCinematicInput(
  db: Pick<ReturnType<typeof createServiceClient>, 'from'>,
  input: CinematicInputV2,
  battle: {
    id: string;
    player_one_id: string;
    player_two_id?: string | null;
    is_player_two_bot?: boolean;
  },
  jobId: string,
): Promise<void> {
  try {
    assertTextModerationConfigured();
  } catch {
    throw new CinematicPreparationError(
      'Cinematic text moderation is not configured',
    );
  }
  const roundNumber = input.roundNumber ?? 1;
  if (
    input.battleId !== battle.id ||
    !Number.isInteger(roundNumber) ||
    roundNumber < 1 ||
    roundNumber > 3
  ) {
    throw new CinematicPreparationError(
      'Cinematic moderation context mismatch',
      false,
    );
  }
  const { data: prompts, error } = await db
    .from('battle_prompts')
    .select('id,profile_id,moderation_status')
    .eq('battle_id', input.battleId)
    .eq('round_number', roundNumber)
    .eq('is_locked', true);
  if (error || !Array.isArray(prompts))
    throw new CinematicPreparationError(
      'Current prompt moderation unavailable',
    );
  const audit = async (
    side: CinematicSide,
    targetId: string,
    result: TextModerationResult,
    stage: string,
  ) => {
    try {
      const { error } = await db.from('moderation_events').insert({
        target_type: 'battle_prompt',
        target_id: targetId,
        action: result.status,
        reason: result.reason ?? null,
        automated: true,
        provider: result.provider ?? null,
        provider_request_id: result.providerRequestId ?? null,
        confidence_score: result.confidence ?? null,
        flagged_categories: result.flaggedCategories ?? [],
        moderator_notes: JSON.stringify({
          video_job_id: jobId,
          battle_id: input.battleId,
          round_number: roundNumber,
          side,
          stage,
        }),
      });
      if (error) throw error;
    } catch {
      throw new CinematicPreparationError(
        'Cinematic moderation audit unavailable',
      );
    }
  };
  const targets = new Map<CinematicSide, string>();
  for (const side of ['p1', 'p2'] as const) {
    if (!input.moves[side] && input.outcome.forfeit === side) continue;
    if (!input.moves[side])
      throw new CinematicPreparationError(
        'Recorded cinematic move unavailable',
        false,
      );
    if (side === 'p2' && battle.is_player_two_bot) {
      targets.set(side, battle.id);
      continue;
    }
    const profileId =
      side === 'p1' ? battle.player_one_id : battle.player_two_id;
    const matching = prompts.filter(
      (p) => profileId && p.profile_id === profileId,
    );
    if (matching.length !== 1 || !matching[0].id)
      throw new CinematicPreparationError(
        'Current human prompt approval unavailable',
      );
    const prompt = matching[0];
    targets.set(side, prompt.id);
    if (prompt.moderation_status !== 'approved') {
      await audit(
        side,
        prompt.id,
        {
          status: prompt.moderation_status,
          provider: 'recorded_prompt',
          reason: 'Current locked prompt is not approved',
        },
        'cinematic_current_approval',
      );
      throw new CinematicPreparationError(
        'Current cinematic prompt is not approved',
        false,
      );
    }
  }
  const moderator = new TextModerationProvider();
  for (const side of ['p1', 'p2'] as const) {
    const move = input.moves[side];
    if (!move) continue;
    let result: TextModerationResult;
    try {
      result = await moderator.moderate(move.text);
    } catch {
      throw new CinematicPreparationError(
        'Cinematic text moderation unavailable',
      );
    }
    await audit(side, targets.get(side)!, result, 'cinematic_pre_generation');
    if (result.status !== 'approved') {
      const unavailable =
        result.provider === 'unavailable' ||
        result.flaggedCategories?.includes('provider_unavailable');
      throw new CinematicPreparationError(
        unavailable
          ? 'Cinematic text moderation unavailable'
          : 'Frozen cinematic action is not approved',
        Boolean(unavailable),
      );
    }
  }
}
