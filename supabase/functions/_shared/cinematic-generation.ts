import { moderateCinematicInput } from './cinematic-moderation.ts';
import {
  buildCinematicInput,
  hashCinematicInput,
  type CinematicInputV2,
  type CinematicPolicy,
  type StorageAssetRef,
} from './cinematic-inputs.ts';
import {
  resolveCinematicReferences,
  CinematicPreparationError,
} from './cinematic-references.ts';
import {
  captureCinematicIdentity,
  snapshotCinematicFighter,
} from './cinematic-identity.ts';
import {
  CINEMATIC_BUNDLED_ASSETS,
  bundledItemAsset,
} from './cinematic-bundled-assets.ts';
import type { VideoGenerationRequest } from './providers.ts';

/** Read stable battle inputs once, then use only the saved payload for retries. */
export async function prepareCinematicGeneration(
  db: any,
  job: {
    id: string;
    battle_id: string;
    battle_round_id?: string | null;
    round_number?: number | null;
  } & CinematicPolicy,
  battle: Record<string, any>,
  leaseToken: string,
): Promise<VideoGenerationRequest> {
  const { data: stored, error: storedError } = await db
    .from('video_job_inputs')
    .select('payload')
    .eq('video_job_id', job.id)
    .maybeSingle();
  if (storedError)
    throw new CinematicPreparationError('Cinematic snapshot unavailable');
  let input: CinematicInputV2 = stored?.payload;
  if (!input) {
    let round = null;
    if (job.battle_round_id) {
      const { data, error } = await db
        .from('battle_rounds')
        .select('*')
        .eq('id', job.battle_round_id)
        .eq('battle_id', job.battle_id)
        .maybeSingle();
      if (error || !data)
        throw new CinematicPreparationError('Recorded round unavailable');
      round = data;
    }
    let query = db
      .from('battle_prompts')
      .select('*')
      .eq('battle_id', job.battle_id)
      .eq('is_locked', true);
    if (round) query = query.eq('round_number', round.round_number);
    const { data: prompts, error: promptError } = await query;
    if (promptError)
      throw new CinematicPreparationError('Recorded moves unavailable');
    for (const p of prompts ?? []) {
      if (!p.custom_prompt_text && p.prompt_template_id) {
        const { data, error } = await db
          .from('prompt_templates')
          .select('body')
          .eq('id', p.prompt_template_id)
          .maybeSingle();
        if (error || !data)
          throw new CinematicPreparationError(
            'Recorded move template unavailable',
          );
        p.custom_prompt_text = data.body;
      }
    }
    let identity = battle.identity_snapshot
      ? structuredClone(battle.identity_snapshot)
      : null;
    if (!identity) {
      // Only old battles have no identity. Record this as legacy provenance;
      // never merge current gear into a partially frozen historical identity.
      identity = {
        player_one: await captureCinematicIdentity(
          db,
          battle.player_one_character_id,
          'legacy_backfill',
        ),
        player_two: battle.is_player_two_bot
          ? snapshotCinematicFighter({
              character: battle.bot_persona
                ? { ...battle.bot_persona, id: null }
                : null,
              botPersonaId: battle.bot_persona_id,
              provenance: 'legacy_backfill',
            })
          : await captureCinematicIdentity(
              db,
              battle.player_two_character_id,
              'legacy_backfill',
            ),
      };
      if (battle.is_player_two_bot && !battle.bot_persona)
        identity.player_two.cinematic_fighter = null;
      const { data: captured, error: captureError } = await db
        .from('battles')
        .update({ identity_snapshot: identity })
        .eq('id', job.battle_id)
        .is('identity_snapshot', null)
        .select('identity_snapshot')
        .maybeSingle();
      if (captureError)
        throw new CinematicPreparationError(
          'Legacy identity capture unavailable',
        );
      if (captured?.identity_snapshot) identity = captured.identity_snapshot;
      else {
        const { data: winner, error } = await db
          .from('battles')
          .select('identity_snapshot')
          .eq('id', job.battle_id)
          .maybeSingle();
        if (error || !winner?.identity_snapshot)
          throw new CinematicPreparationError(
            'Legacy identity capture unavailable',
          );
        identity = winner.identity_snapshot;
      }
    }
    for (const side of ['player_one', 'player_two']) {
      const frozen = identity[side];
      if (!frozen || Object.hasOwn(frozen, 'cinematic_fighter')) continue;
      // Old snapshots stored only the path. Validate that exact historical row;
      // never substitute the character's current portrait.
      if (frozen.fighter?.image_path && !frozen.fighter.moderation_status) {
        const { data, error } = await db
          .from('character_portraits')
          .select('id,image_path,moderation_status,appearance_version')
          .eq('image_path', frozen.fighter.image_path)
          .maybeSingle();
        if (error)
          throw new CinematicPreparationError('Frozen artwork unavailable');
        frozen.fighter = data ? { ...frozen.fighter, ...data } : null;
      }
    }
    const composed = buildCinematicInput({
      battle: { ...battle, identity_snapshot: identity },
      round,
      prompts: prompts ?? [],
      policy: {
        cinematic_profile: job.cinematic_profile,
        target_duration_seconds: job.target_duration_seconds,
        duration_policy_version: job.duration_policy_version,
      },
    });
    const { data, error } = await db.rpc('persist_cinematic_input', {
      p_job_id: job.id,
      p_lease_token: leaseToken,
      p_payload: composed,
      p_hash: await hashCinematicInput(composed),
    });
    if (error || !data)
      throw new CinematicPreparationError(
        error?.message ?? 'Cinematic snapshot persistence failed',
      );
    input = data;
  }
  if (
    input.version !== 2 ||
    input.battleId !== job.battle_id ||
    input.roundId !== (job.battle_round_id ?? null)
  ) {
    throw new CinematicPreparationError('Cinematic snapshot mismatch', false);
  }
  await moderateCinematicInput(
    db,
    input,
    {
      id: battle.id,
      player_one_id: battle.player_one_id,
      player_two_id: battle.player_two_id,
      is_player_two_bot: battle.is_player_two_bot,
    },
    job.id,
  );

  await assertCinematicItemsApproved(db, input);
  const cinematicReferences = await resolveCinematicReferences(input, {
    isApproved: (ref) => isCinematicAssetApproved(db, ref),
    async sign(ref, ttl) {
      const { data, error } = await db.storage
        .from(ref.bucket)
        .createSignedUrl(ref.path, ttl);
      if (error || !data?.signedUrl)
        throw new CinematicPreparationError('Reference signing failed');
      return data.signedUrl;
    },
  });
  return {
    battleId: input.battleId,
    playerOneCharacterName: input.fighters.p1.name,
    playerOneArchetype: input.fighters.p1
      .archetype as VideoGenerationRequest['playerOneArchetype'],
    playerOnePrompt: input.moves.p1?.text ?? '',
    playerOneMoveType: input.moves.p1?.moveType ?? 'defense',
    playerTwoCharacterName: input.fighters.p2.name,
    playerTwoArchetype: input.fighters.p2
      .archetype as VideoGenerationRequest['playerTwoArchetype'],
    playerTwoPrompt: input.moves.p2?.text ?? '',
    playerTwoMoveType: input.moves.p2?.moveType ?? 'defense',
    winnerId: input.outcome.winner,
    isDraw: input.outcome.isDraw,
    theme: input.theme,
    targetDurationSeconds: input.policy.target_duration_seconds,
    aspectRatio: '9:16',
    safetyConstraints: [
      'no_real_person_likeness',
      'no_violence',
      'no_nsfw',
      'no_dialogue_or_narration',
    ],
    cinematicInput: input,
    cinematicReferences,
  };
}

async function assertCinematicItemsApproved(
  db: any,
  input: CinematicInputV2,
): Promise<void> {
  // Check item approval even when no optional close-up exists: the body may show it.
  for (const f of Object.values(input.fighters)) {
    if (!f.item) continue;
    const { data, error } = await db
      .from('signature_items')
      .select('moderation_status')
      .eq('id', f.item.id)
      .maybeSingle();
    if (error) throw new CinematicPreparationError('Item approval unavailable');
    if (data?.moderation_status !== 'approved')
      throw new CinematicPreparationError('Equipped item unapproved', false);
  }
}

async function isCinematicAssetApproved(
  db: any,
  ref: StorageAssetRef,
): Promise<boolean> {
  const bundled = Object.values(CINEMATIC_BUNDLED_ASSETS).some(
    (a) =>
      a.bucket === ref.bucket &&
      a.path === ref.path &&
      a.version === ref.version,
  );
  if (ref.source === 'bundled') return bundled;
  if (ref.source === 'item') {
    const { data, error } = await db
      .from('signature_items')
      .select('name,image_path,moderation_status,kind')
      .eq('id', ref.recordId)
      .maybeSingle();
    if (error) throw new CinematicPreparationError('Item approval unavailable');
    if (data?.moderation_status !== 'approved') return false;
    if (bundled) return bundledItemAsset(data.name)?.path === ref.path;
    return (
      data.kind === 'custom' &&
      ref.bucket === 'signature-items-custom' &&
      data.image_path === ref.path
    );
  }
  if (ref.bucket !== 'character-portraits') return false;
  let q = db
    .from('character_portraits')
    .select('id,image_path,moderation_status')
    .eq('image_path', ref.path);
  if (ref.recordId) q = q.eq('id', ref.recordId);
  const { data, error } = await q.maybeSingle();
  if (error)
    throw new CinematicPreparationError('Fighter approval unavailable');
  return data?.moderation_status === 'approved';
}

/** Recheck the saved artwork without recapturing identity or signing any media. */
export async function assertFrozenCinematicAssetApproval(
  db: any,
  input: CinematicInputV2,
): Promise<void> {
  await assertCinematicItemsApproved(db, input);
  for (const side of ['p1', 'p2'] as const) {
    const fighter = input.fighters[side];
    if (!fighter.reference)
      throw new CinematicPreparationError(`Missing fighter reference: ${side}`);
    for (const ref of [fighter.reference, fighter.item?.reference]) {
      if (ref && !(await isCinematicAssetApproved(db, ref))) {
        throw new CinematicPreparationError(
          `Frozen cinematic asset unapproved: ${side}`,
          false,
        );
      }
    }
  }
}
