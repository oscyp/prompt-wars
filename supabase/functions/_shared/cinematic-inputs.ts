// Provider-independent, immutable inputs. Nothing here reads current entitlements,
// mutable artwork, or a generated outcome. Signed URLs never enter the snapshot.
import type { MoveType } from './types.ts';

export type CinematicSide = 'p1' | 'p2';
export interface CinematicPolicy {
  cinematic_profile: 'standard' | 'plus';
  target_duration_seconds: number;
  duration_policy_version: string | null;
}
export interface StorageAssetRef {
  bucket: string;
  path: string;
  version: string;
  recordId: string | null;
  source: 'portrait' | 'item' | 'bundled';
}
export interface CinematicFighter {
  side: CinematicSide;
  characterId: string | null;
  name: string;
  archetype: string;
  signatureColor: string | null;
  artStyle: string | null;
  appearanceVersion: number | null;
  traits: Record<string, string>;
  item: {
    id: string;
    name: string;
    description: string;
    reference: StorageAssetRef | null;
  } | null;
  itemDepictedInFighter: boolean;
  reference: StorageAssetRef | null;
  provenance: string;
}
export interface CinematicMove {
  side: CinematicSide;
  text: string;
  moveType: MoveType;
  moderationEventId: string | null;
  provenance: 'frozen_judge' | 'locked_prompt';
}
export interface CinematicInputV2 {
  version: 2;
  battleId: string;
  roundId: string | null;
  roundNumber: number | null;
  policy: CinematicPolicy;
  fighters: Record<CinematicSide, CinematicFighter>;
  moves: Record<CinematicSide, CinematicMove | null>;
  theme: string;
  situation: string;
  outcome: {
    winner: CinematicSide | null;
    isDraw: boolean;
    isKo: boolean;
    forfeit: CinematicSide | null;
  };
  templateVersion: 'cinematic-v2' | 'cinematic-v3';
}
export interface RecordedCinematicSource {
  battle: Record<string, any>;
  round?: Record<string, any> | null;
  prompts?: Record<string, any>[];
  policy: CinematicPolicy;
}

function asset(
  row: any,
  source: StorageAssetRef['source'],
  fallbackBucket: string,
): StorageAssetRef | null {
  if (!row?.image_path || row.moderation_status !== 'approved') return null;
  return {
    bucket: row.bucket || fallbackBucket,
    path: row.image_path,
    version: String(row.version ?? row.appearance_version ?? 'legacy'),
    recordId: row.id ?? null,
    source: row.provenance === 'bundled' ? 'bundled' : source,
  };
}

function fighter(row: any, side: CinematicSide): CinematicFighter {
  if (!row?.name || !row?.archetype)
    throw new Error(`Recorded fighter unavailable: ${side}`);
  const item =
    row.signature_item?.moderation_status === 'approved'
      ? row.signature_item
      : null;
  const body = Object.hasOwn(row, 'cinematic_fighter')
    ? row.cinematic_fighter
    : row.fighter;
  return {
    side,
    characterId: row.id ?? null,
    name: row.name,
    archetype: row.archetype,
    signatureColor: row.signature_color ?? null,
    artStyle: row.art_style ?? null,
    appearanceVersion: row.appearance_version ?? null,
    traits: Object.fromEntries(
      ['vibe', 'silhouette', 'era', 'expression', 'palette_key']
        .filter((key) => typeof row[key] === 'string')
        .map((key) => [key, row[key]]),
    ),
    item: item
      ? {
          id: item.id,
          name: item.name,
          description: item.prompt_fragment || item.description || item.name,
          reference: asset(
            item,
            'item',
            item.kind === 'custom'
              ? 'signature-items-custom'
              : 'signature-items-catalog',
          ),
        }
      : null,
    itemDepictedInFighter:
      !item ||
      (body?.provenance !== 'bundled' &&
        Number.isInteger(row.appearance_version) &&
        body?.appearance_version === row.appearance_version),
    reference: asset(body, 'portrait', 'character-portraits'),
    provenance: row.identity_provenance ?? 'legacy_frozen',
  };
}

export function buildCinematicInput(
  source: RecordedCinematicSource,
): CinematicInputV2 {
  const { battle, round, policy } = source;
  if (
    round &&
    (round.battle_id !== battle.id || round.status !== 'result_ready')
  ) {
    throw new Error('Recorded round unavailable');
  }
  if (
    !round &&
    (battle.format === 'bo3' ||
      !['result_ready', 'completed', 'generating_video'].includes(
        battle.status,
      ))
  ) {
    throw new Error('Resolved battle/round required');
  }
  const result = round ?? battle;
  const isDraw = result.is_draw === true;
  const winnerId = round ? result.round_winner_id : result.winner_id;
  const winner: CinematicSide | null = isDraw
    ? null
    : winnerId === battle.player_one_id
      ? 'p1'
      : (battle.is_player_two_bot && winnerId == null) ||
          (battle.player_two_id && winnerId === battle.player_two_id)
        ? 'p2'
        : null;
  if ((!isDraw && !winner) || (isDraw && winnerId != null))
    throw new Error('Recorded outcome unavailable');
  const payload =
    (round
      ? result.judge_payload
      : (battle.score_payload ?? battle.judge_payload)) ?? {};
  const forfeitId = payload.forfeit_profile_id;
  const forfeit: CinematicSide | null =
    forfeitId === battle.player_one_id
      ? 'p1'
      : battle.player_two_id && forfeitId === battle.player_two_id
        ? 'p2'
        : null;
  const frozen = payload.frozen_inputs;
  const move = (side: CinematicSide): CinematicMove | null => {
    const key = side === 'p1' ? 'player_one' : 'player_two';
    const profileId =
      side === 'p1' ? battle.player_one_id : battle.player_two_id;
    const locked = source.prompts?.find(
      (p) => profileId && p.profile_id === profileId && p.is_locked === true,
    );
    const recorded = frozen?.[key];
    const text =
      recorded?.text ??
      (battle.prompt_experience_version === 2
        ? null
        : locked?.custom_prompt_text);
    const moveType = recorded?.moveType ?? locked?.move_type;
    if (
      (!text || !['attack', 'defense', 'finisher'].includes(moveType)) &&
      forfeit === side
    )
      return null;
    if (!text || !['attack', 'defense', 'finisher'].includes(moveType))
      throw new Error(`Recorded move unavailable: ${side}`);
    return {
      side,
      text,
      moveType,
      // Legacy prompt rows have no event pointer; fresh pre-submit audits link
      // the job and side separately without mutating these frozen inputs.
      moderationEventId: null,
      provenance: recorded ? 'frozen_judge' : 'locked_prompt',
    };
  };
  if (
    ![8, 12, 15, 20].includes(policy.target_duration_seconds) ||
    (policy.target_duration_seconds === 20 &&
      (policy.cinematic_profile !== 'plus' ||
        policy.duration_policy_version !== 'cinematics-v3')) ||
    (policy.duration_policy_version === 'cinematics-v3' &&
      policy.cinematic_profile === 'plus' &&
      policy.target_duration_seconds !== 20)
  )
    throw new Error('Unsupported cinematic duration');
  const identity = battle.identity_snapshot;
  if (!identity) throw new Error('Recorded fighter identity unavailable');
  const situation =
    result.situation_snapshot?.text ?? frozen?.situation_snapshot?.text ?? '';
  if (battle.prompt_experience_version === 2 && !situation)
    throw new Error('Recorded situation unavailable');
  return {
    version: 2,
    battleId: battle.id,
    roundId: round?.id ?? null,
    roundNumber: round?.round_number ?? null,
    policy: { ...policy },
    fighters: {
      p1: fighter(identity.player_one, 'p1'),
      p2: fighter(identity.player_two, 'p2'),
    },
    moves: { p1: move('p1'), p2: move('p2') },
    theme: battle.theme ?? '',
    situation,
    outcome: { winner, isDraw, isKo: result.is_ko === true, forfeit },
    templateVersion:
      policy.duration_policy_version === 'cinematics-v3'
        ? 'cinematic-v3'
        : 'cinematic-v2',
  };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export async function hashCinematicInput(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
