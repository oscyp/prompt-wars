import { recordedRoundForfeit } from './round-forfeit.ts';
import { createServiceClient } from './utils.ts';
import { XAIJudgeProvider, type AiJudgeProvider } from './providers.ts';
import {
  aggregateScore,
  JUDGE_PROMPT_VERSION,
  runJudgePipeline,
} from './judge.ts';
import {
  assertIndependentCalls,
  calibrationEligible,
  reconstructAppeal,
  type AppealRound,
} from './appeals.ts';
import type { CombatStats } from './combat.ts';
import type { MoveType } from './types.ts';
type DB = ReturnType<typeof createServiceClient>;
export function appealConfig() {
  return {
    enabled: Deno.env.get('APPEALS_ENABLED') === 'true',
    model: Deno.env.get('APPEAL_JUDGE_MODEL') ?? '',
    locale: Deno.env.get('APPEAL_JUDGE_LOCALE') ?? 'en',
    maxAgeHours: Math.max(
      1,
      Number(Deno.env.get('APPEAL_CALIBRATION_MAX_AGE_HOURS') ?? 168),
    ),
    hasKey: Boolean(
      Deno.env.get('JUDGE_API_KEY') || Deno.env.get('XAI_API_KEY'),
    ),
  };
}
export function independentProvider() {
  const c = appealConfig();
  if (!c.model || !c.hasKey)
    throw new Error('Independent reviewer unconfigured');
  return new XAIJudgeProvider(c.model);
}
export async function reviewerAvailability(
  db: DB,
  originalModels: string[],
  checkCooldown = true,
) {
  const c = appealConfig();
  if (!c.enabled || !c.model || !c.hasKey)
    return {
      available: false,
      reason: 'Independent review is currently unavailable.',
    };
  if (!originalModels.length || originalModels.includes(c.model))
    return {
      available: false,
      reason: 'A different calibrated reviewer is required.',
    };
  const { data: failures, error: failureError } = await db
    .from('appeals')
    .select('id')
    .eq('review_status', 'retryable_failure')
    .eq('failed_provider_model', c.model)
    .gt('provider_unavailable_until', new Date().toISOString())
    .limit(1);
  if (checkCooldown && (failureError || failures?.length))
    return {
      available: false,
      reason:
        'Independent reviewer is temporarily unavailable; please check again later.',
    };
  const { data, error } = await db
    .from('judge_calibration_runs')
    .select('*')
    .eq('judge_model_id', c.model)
    .eq('judge_prompt_version', JUDGE_PROMPT_VERSION)
    .eq('locale', c.locale)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    error ||
    !calibrationEligible(
      data,
      c.model,
      JUDGE_PROMPT_VERSION,
      c.locale,
      c.maxAgeHours,
    )
  )
    return {
      available: false,
      reason: 'Independent reviewer calibration is unavailable.',
    };
  return { available: true, reason: null };
}
export async function originalModelsFor(db: DB, battleId: string) {
  const [
    { data: b, error: be },
    { data: rounds, error: re },
    { data: runs, error: je },
  ] = await Promise.all([
    db
      .from('battles')
      .select('format,player_one_id,player_two_id,judge_model_id,score_payload')
      .eq('id', battleId)
      .single(),
    db
      .from('battle_rounds')
      .select(
        'round_number,status,judge_model_id,judge_payload,round_winner_id,player_one_locked_at,player_two_locked_at',
      )
      .eq('battle_id', battleId),
    db
      .from('judge_runs')
      .select('model_id,run_sequence')
      .eq('battle_id', battleId)
      .eq('is_appeal', false),
  ]);
  if (be || re || je)
    throw new Error('Cannot read original adjudication provenance');
  const models = new Set<string>();
  const normalize = (value: unknown): string[] =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(
            (s) =>
              Boolean(s) &&
              !['bo3-aggregate', 'unknown', 'timeout', 'forfeit'].includes(
                s.toLowerCase(),
              ),
          )
      : [];
  const fromPayload = (payload: { calls?: { model_id?: unknown }[] } | null) =>
    Array.isArray(payload?.calls)
      ? payload.calls.flatMap((call) => normalize(call.model_id))
      : [];
  const add = (values: string[]) =>
    values.forEach((model) => models.add(model));
  add(normalize(b?.judge_model_id));
  add(fromPayload(b?.score_payload));
  runs?.forEach((run) => add(normalize(run.model_id)));
  if (b?.format === 'bo3') {
    const played = (rounds ?? []).filter(
      (round) => round.status === 'result_ready',
    );
    if (!played.length) return [];
    for (const round of played) {
      const payload = round.judge_payload ?? {};
      const roundModels = [
        ...normalize(round.judge_model_id),
        ...fromPayload(payload),
        ...(runs ?? [])
          .filter((run) => run.run_sequence === round.round_number)
          .flatMap((run) => normalize(run.model_id)),
      ];
      const unjudged = recordedRoundForfeit(round, b) !== undefined;
      // A known model for another round cannot prove this round's independence.
      if (!roundModels.length && !unjudged) return [];
      add(roundModels);
    }
  }
  return [...models];
}

interface FrozenPrompt {
  text: string;
  moveType: MoveType;
  wordCount: number;
}
function stats(raw: unknown): CombatStats {
  const s = raw as CombatStats;
  if (
    !s ||
    !['strength', 'stamina', 'agility', 'focus'].every((k) =>
      Number.isFinite(s[k as keyof CombatStats]),
    )
  )
    throw new Error('Frozen fighter stats are missing');
  return s;
}
export class IndependentProviderFailure extends Error {}
export async function judgeAppealRound(
  provider: AiJudgeProvider,
  p1: FrozenPrompt,
  p2: FrozenPrompt,
  theme: string | null,
  model: string,
  original: string[],
) {
  const judged = await runJudgePipeline(
    provider,
    p1.text,
    p2.text,
    p1.moveType,
    p2.moveType,
    p1.wordCount,
    p2.wordCount,
    theme,
    JUDGE_PROMPT_VERSION,
  );
  try {
    assertIndependentCalls(judged.calls, model, original, JUDGE_PROMPT_VERSION);
  } catch (error) {
    throw new IndependentProviderFailure(
      error instanceof Error ? error.message : 'Invalid reviewer provenance',
    );
  }
  return judged;
}
export async function processIndependentAppeal(db: DB, id: string) {
  const token = crypto.randomUUID();
  const { data: appeal, error: claimError } = await db.rpc(
    'claim_independent_appeal',
    { p_appeal_id: id, p_token: token },
  );
  if (claimError) throw claimError;
  if (!appeal) return { status: 'not_claimed' };
  try {
    const models = await originalModelsFor(db, appeal.battle_id);
    const availability = await reviewerAvailability(db, models, false);
    if (!availability.available)
      throw new Error(
        availability.reason ?? 'Independent reviewer unavailable',
      );
    const { data: live, error: be } = await db
      .from('battles')
      .select('*')
      .eq('id', appeal.battle_id)
      .single();
    if (be || !live) throw new Error('Battle unavailable');
    const b = appeal.original_resolution ?? live;
    const { data: played, error: re } = await db
      .from('battle_rounds')
      .select('*')
      .eq('battle_id', b.id)
      .eq('status', 'result_ready')
      .order('round_number');
    if (re) throw re;
    const { data: prompts, error: pe } = await db
      .from('battle_prompts')
      .select('*,prompt_templates(body)')
      .eq('battle_id', b.id)
      .eq('is_locked', true);
    if (pe) throw pe;
    const underlying = independentProvider(),
      config = appealConfig();
    const provider: AiJudgeProvider = {
      getModelId: () => underlying.getModelId(),
      judge: async (request) => {
        const response = await underlying.judge(request).catch((error) => {
          throw new IndependentProviderFailure(
            error instanceof Error ? error.message : 'Reviewer provider failed',
          );
        });
        const { data: saved, error } = await db.rpc('append_appeal_call', {
          p_appeal_id: id,
          p_token: token,
          p_call: {
            model_id: response.modelId,
            prompt_version: response.promptVersion,
            seed: request.seed,
            response_id: response.responseId,
            fallback: response.fallback ?? false,
            player_one_raw_scores: response.playerOneScores,
            player_two_raw_scores: response.playerTwoScores,
            explanation: response.explanation,
            cost_usd: response.costUsd,
            attempt: appeal.attempts,
          },
        });
        if (error || !saved)
          throw new Error(
            'Review call audit could not be saved or lease expired',
          );
        return response;
      },
    };
    const reviews: AppealRound[] = [];
    const source =
      b.format === 'bo3'
        ? (played ?? [])
        : [
            {
              id: undefined,
              judge_payload: b.score_payload,
              round_winner_id: b.winner_id,
              judge_model_id: b.judge_model_id,
              player_one_locked_at: b.player_one_locked_at,
              player_two_locked_at: b.player_two_locked_at,
            },
          ];
    for (const r of source) {
      const payload = r.judge_payload ?? {};
      const frozen = payload.frozen_inputs;
      const select = (pid: string): FrozenPrompt | undefined => {
        const p = prompts?.find(
          (p) =>
            p.profile_id === pid &&
            (b.format !== 'bo3' || p.round_number === r.round_number),
        );
        const text = p?.custom_prompt_text ?? p?.prompt_templates?.body;
        return text
          ? {
              text,
              moveType: p.move_type,
              wordCount: p.word_count ?? text.trim().split(/\s+/).length,
            }
          : undefined;
      };
      const p1: FrozenPrompt | undefined =
          frozen?.player_one ?? select(b.player_one_id),
        p2: FrozenPrompt | undefined =
          frozen?.player_two ?? select(b.player_two_id);
      const forfeitWinner = recordedRoundForfeit(r, b);
      if (forfeitWinner !== undefined || !p1?.text || !p2?.text) {
        if (forfeitWinner === undefined)
          throw new Error(
            'Original prompts unavailable; review can be retried',
          );
        reviews.push({
          roundId: r.id,
          playerOneBase: 0,
          playerTwoBase: 0,
          playerOneMove: p1?.moveType ?? 'attack',
          playerTwoMove: p2?.moveType ?? 'attack',
          forfeitWinner,
        });
        continue;
      }
      const j = await judgeAppealRound(
        provider,
        p1,
        p2,
        frozen?.theme ?? b.theme,
        config.model,
        models,
      );
      reviews.push({
        roundId: r.id,
        playerOneBase: aggregateScore(j.player_one_normalized_scores),
        playerTwoBase: aggregateScore(j.player_two_normalized_scores),
        playerOneMove: p1.moveType,
        playerTwoMove: p2.moveType,
        singleWinner:
          j.winner_profile_id === 'p1'
            ? 1
            : j.winner_profile_id === 'p2'
              ? 2
              : null,
        judge: j,
      });
    }
    const fallback = { strength: 5, stamina: 5, agility: 5, focus: 5 };
    const review = reconstructAppeal({
      format: b.format === 'bo3' ? 'bo3' : 'single',
      rulesVersion: b.rules_version ?? 1,
      playerOne:
        b.format === 'bo3' ? stats(b.player_one_stats_snapshot) : fallback,
      playerTwo:
        b.format === 'bo3' ? stats(b.player_two_stats_snapshot) : fallback,
      originalWinner:
        b.winner_id === b.player_one_id
          ? 1
          : b.winner_id === b.player_two_id
            ? 2
            : null,
      rounds: reviews,
    });
    const { data: done, error: fe } = await db.rpc(
      'finalize_independent_appeal',
      {
        p_appeal_id: id,
        p_token: token,
        p_review: {
          ...review,
          all_played_reviews: reviews,
          reviewer_model: config.model,
          reviewer_prompt_version: JUDGE_PROMPT_VERSION,
          locale: config.locale,
        },
      },
    );
    if (fe) throw fe;
    return { status: done ? review.status : 'lease_lost' };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Independent review failed';
    const { error: failed } = await db.rpc(
      'fail_independent_appeal_classified',
      {
        p_appeal_id: id,
        p_token: token,
        p_error: message,
        p_failed_provider_model:
          error instanceof IndependentProviderFailure
            ? appealConfig().model
            : null,
      },
    );
    if (failed) throw failed;
    return { status: 'retryable_failure', error: message };
  }
}
