import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  type CurrentPortrait,
  resolveCurrentPortrait,
} from './compose-reveal-payload.ts';
import {
  bundledFighterAsset,
  bundledItemAsset,
} from './cinematic-bundled-assets.ts';

export interface CinematicIdentityPortrait extends CurrentPortrait {
  id: string | null;
  appearance_version: number | null;
  moderation_status: string | null;
  bucket: string;
  version: string;
  provenance: 'generated' | 'bundled' | 'legacy_frozen';
}
export interface CinematicSignatureItem {
  id: string;
  name: string;
  description: string;
  item_class: string;
  prompt_fragment: string;
  moderation_status: 'approved';
  image_path: string | null;
  kind: 'catalog' | 'custom';
  bucket: string | null;
  version: string | null;
}
export interface CinematicIdentitySnapshot {
  id: string | null;
  name: string;
  archetype: string;
  signature_color: string;
  battle_cry: string;
  art_style: string | null;
  cosmetic_config: Record<string, string> | null;
  appearance_version: number | null;
  starter_asset_key: string | null;
  vibe: string | null;
  silhouette: string | null;
  era: string | null;
  expression: string | null;
  palette_key: string | null;
  bot_persona_id: string | null;
  identity_provenance: 'matched' | 'legacy_backfill' | 'legacy_frozen';
  signature_item: CinematicSignatureItem | null;
  avatar: CinematicIdentityPortrait | null;
  fighter: CinematicIdentityPortrait | null;
  cinematic_fighter?: CinematicIdentityPortrait | null;
}
export interface CinematicIdentitySource {
  character?: Record<string, unknown> | null;
  fighter?: CurrentPortrait | null;
  avatar?: CurrentPortrait | null;
  signatureItem?: Record<string, unknown> | null;
  frozenIdentity?: Record<string, unknown> | null;
  botPersonaId?: string | null;
  provenance?: 'matched' | 'legacy_backfill';
}
const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const versionOrNull = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;

/** Pure capture. Existing frozen identity is authoritative, even when incomplete. */
export function snapshotCinematicFighter(
  source: CinematicIdentitySource,
): CinematicIdentitySnapshot {
  const frozen = source.frozenIdentity;
  const c = frozen ?? source.character ?? {};
  const appearanceVersion = versionOrNull(c.appearance_version);
  const portrait = (
    value: unknown,
    eligible = false,
  ): CinematicIdentityPortrait | null => {
    if (!value || typeof value !== 'object') return null;
    const p = value as CurrentPortrait;
    if (!p.image_path) return null;
    if (
      eligible &&
      !frozen &&
      (p.moderation_status !== 'approved' ||
        p.appearance_version !== appearanceVersion)
    )
      return null;
    return {
      id: p.id ?? null,
      image_path: p.image_path,
      thumb_path: p.thumb_path ?? null,
      seed: p.seed ?? null,
      appearance_version: p.appearance_version ?? null,
      moderation_status: p.moderation_status ?? null,
      bucket: p.bucket ?? 'character-portraits',
      version: p.version ?? p.id ?? p.image_path,
      provenance: p.provenance ?? (frozen ? 'legacy_frozen' : 'generated'),
    };
  };
  const starterKey = stringOrNull(c.starter_asset_key);
  const botId = stringOrNull(c.bot_persona_id) ?? source.botPersonaId ?? null;
  const fighter = portrait(frozen ? c.fighter : source.fighter);
  let cinematicFighter = portrait(
    frozen ? c.cinematic_fighter : source.fighter,
    true,
  );
  if (!frozen && !cinematicFighter && (starterKey || botId || !c.id)) {
    const asset = bundledFighterAsset(
      starterKey ?? stringOrNull(c.archetype) ?? 'default',
    );
    cinematicFighter = {
      id: null,
      image_path: asset.path,
      thumb_path: null,
      seed: null,
      appearance_version: appearanceVersion,
      moderation_status: 'approved',
      bucket: asset.bucket,
      version: asset.version,
      provenance: 'bundled',
    };
  }
  let signatureItem: CinematicSignatureItem | null = null;
  const item = frozen ? c.signature_item : source.signatureItem;
  if (item && typeof item === 'object') {
    const i = item as Record<string, unknown>;
    const approved = i.moderation_status === 'approved';
    const owned =
      frozen ||
      (i.id === c.signature_item_id &&
        (i.kind === 'catalog' || i.profile_id === c.profile_id));
    if (
      approved &&
      owned &&
      typeof i.id === 'string' &&
      (i.kind === 'catalog' || i.kind === 'custom')
    ) {
      const name = stringOrNull(i.name) ?? '';
      const bundled = i.kind === 'catalog' ? bundledItemAsset(name) : null;
      const imagePath = frozen
        ? stringOrNull(i.image_path)
        : (bundled?.path ??
          (i.kind === 'custom' ? stringOrNull(i.image_path) : null));
      signatureItem = {
        id: i.id,
        name,
        description: stringOrNull(i.description) ?? '',
        item_class: stringOrNull(i.item_class) ?? '',
        prompt_fragment: stringOrNull(i.prompt_fragment) ?? '',
        moderation_status: 'approved',
        kind: i.kind,
        image_path: imagePath,
        bucket: frozen
          ? stringOrNull(i.bucket)
          : (bundled?.bucket ?? (imagePath ? 'signature-items-custom' : null)),
        version: frozen
          ? stringOrNull(i.version)
          : (bundled?.version ?? imagePath),
      };
    }
  }
  return {
    id: stringOrNull(c.id),
    name: stringOrNull(c.name) ?? 'AI Opponent',
    archetype: stringOrNull(c.archetype) ?? 'strategist',
    signature_color: stringOrNull(c.signature_color) ?? '#8B5CF6',
    battle_cry: stringOrNull(c.battle_cry) ?? '',
    art_style: stringOrNull(c.art_style),
    cosmetic_config: c.cosmetic_config
      ? (structuredClone(c.cosmetic_config) as Record<string, string>)
      : null,
    appearance_version: appearanceVersion,
    starter_asset_key: starterKey,
    vibe: stringOrNull(c.vibe),
    silhouette: stringOrNull(c.silhouette),
    era: stringOrNull(c.era),
    expression: stringOrNull(c.expression),
    palette_key: stringOrNull(c.palette_key),
    bot_persona_id: botId,
    identity_provenance:
      (stringOrNull(
        c.identity_provenance,
      ) as CinematicIdentitySnapshot['identity_provenance']) ??
      (frozen ? 'legacy_frozen' : (source.provenance ?? 'matched')),
    signature_item: signatureItem,
    avatar: portrait(frozen ? c.avatar : source.avatar),
    fighter,
    ...(!frozen || 'cinematic_fighter' in c
      ? {
          cinematic_fighter:
            !frozen && c.signature_item_id && !signatureItem
              ? null
              : cinematicFighter,
        }
      : {}),
  };
}

export const CINEMATIC_CHARACTER_SELECT =
  'id, profile_id, name, archetype, signature_color, battle_cry, art_style, cosmetic_config, appearance_version, starter_asset_key, vibe, silhouette, era, expression, palette_key, signature_item_id, updated_at';

/** Retry concurrent edits; never combine an old render with a newly equipped item. */
export async function captureCinematicIdentity(
  supabase: SupabaseClient,
  characterId: string,
  provenance: 'matched' | 'legacy_backfill' = 'matched',
): Promise<CinematicIdentitySnapshot> {
  const load = async () => {
    const { data, error } = await supabase
      .from('characters')
      .select(CINEMATIC_CHARACTER_SELECT)
      .eq('id', characterId)
      .single();
    if (error || !data) {
      throw new Error('cinematic_identity_character_unavailable');
    }
    return data as Record<string, unknown>;
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const character = await load();
    const [fighter, avatar] = await Promise.all([
      resolveCurrentPortrait(supabase, characterId, 'fighter'),
      resolveCurrentPortrait(supabase, characterId, 'avatar'),
    ]);
    let signatureItem: Record<string, unknown> | null = null;
    if (character.signature_item_id) {
      const { data, error } = await supabase
        .from('signature_items')
        .select(
          'id, profile_id, kind, name, description, item_class, prompt_fragment, image_path, moderation_status',
        )
        .eq('id', String(character.signature_item_id))
        .maybeSingle();
      // Visual metadata loss must not gate the free battle transition.
      // A missing approved item disables the cinematic reference instead.
      signatureItem = error ? null : data;
    }
    if (JSON.stringify(character) !== JSON.stringify(await load())) continue;
    return snapshotCinematicFighter({
      character,
      fighter,
      avatar,
      signatureItem,
      provenance,
    });
  }
  throw new Error('cinematic_identity_concurrent_edit');
}
