import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface AvatarRequest {
  profile_ids: string[];
  battle_ids: string[];
}
export interface AvatarResult {
  identity?: {
    name: string;
    archetype: string;
    signature_color: string;
    cosmetic_config: Record<string, string> | null;
  };
  status: "available" | "unavailable" | "retryable";
  asset_id?: string;
  signed_url?: string;
  expires_at?: string;
}
export interface AvatarResponse {
  players: Record<string, AvatarResult>;
  battles: Record<string, AvatarResult>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseAvatarRequest(value: unknown): AvatarRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid request");
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some((key) =>
      !["profile_ids", "battle_ids"].includes(key)
    )
  ) throw new Error("Identifiers only");
  const ids = (value: unknown): string[] => {
    if (value === undefined) return [];
    if (
      !Array.isArray(value) || value.length > 1000 ||
      value.some((id) => typeof id !== "string" || !UUID.test(id))
    ) throw new Error("UUID identifiers required");
    return [...new Set((value as string[]).map((id) => id.toLowerCase()))];
  };
  const result = {
    profile_ids: ids(body.profile_ids),
    battle_ids: ids(body.battle_ids),
  };
  const count = result.profile_ids.length + result.battle_ids.length;
  if (count < 1 || count > 50) {
    throw new Error("Provide between 1 and 50 identifiers");
  }
  return result;
}
interface Portrait {
  id: string;
  character_id: string;
  profile_id: string;
  kind: string;
  moderation_status: string;
  image_path: string;
}
interface Candidate {
  context: "players" | "battles";
  key: string;
  owner: string;
  character: string;
  asset?: string;
  path?: string;
}

/** Service-role reads only. Every path is resolved from a verified avatar row,
 * including snapshots. No legacy full-body fallback and no generation side effects. */
export async function resolvePlayerAvatars(
  db: SupabaseClient,
  caller: string,
  request: AvatarRequest,
  now = Date.now(),
): Promise<AvatarResponse> {
  const result: AvatarResponse = { players: {}, battles: {} };
  request.profile_ids.forEach((id) =>
    result.players[id] = { status: "unavailable" }
  );
  request.battle_ids.forEach((id) =>
    result.battles[id] = { status: "unavailable" }
  );
  const [characters, battles] = await Promise.all([
    request.profile_ids.length
      ? db.from("characters").select(
        "id, profile_id, avatar_portrait_id, name, archetype, signature_color, cosmetic_config",
      ).in("profile_id", request.profile_ids).eq("is_active", true)
      : Promise.resolve({ data: [], error: null }),
    request.battle_ids.length
      ? db.from("battles").select(
        "id, player_one_id, player_two_id, player_one_character_id, player_two_character_id, is_player_two_bot, identity_snapshot",
      ).in("id", request.battle_ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (characters.error || battles.error) {
    throw new Error("Avatar authorization lookup failed");
  }
  // Each direction is bounded by at most 50 owners. Never rely on the API's
  // default row limit when deciding whether a relationship is blocked.
  const owners = [
    ...new Set([
      ...request.profile_ids,
      ...(battles.data ?? []).flatMap((row) =>
        row.player_one_id === caller
          ? [row.player_two_id]
          : row.player_two_id === caller
          ? [row.player_one_id]
          : []
      ).filter((id): id is string => Boolean(id)),
    ]),
  ];
  const blockResults = owners.length
    ? await Promise.all([
      db.from("blocks").select("blocker_profile_id, blocked_profile_id").eq(
        "blocker_profile_id",
        caller,
      ).in("blocked_profile_id", owners),
      db.from("blocks").select("blocker_profile_id, blocked_profile_id").eq(
        "blocked_profile_id",
        caller,
      ).in("blocker_profile_id", owners),
    ])
    : [];
  if (blockResults.some((result) => result.error)) {
    throw new Error("Avatar block lookup failed");
  }
  const blocked = new Set(
    blockResults.flatMap((result) => result.data ?? []).map((row) =>
      row.blocker_profile_id === caller
        ? row.blocked_profile_id
        : row.blocker_profile_id
    ),
  );
  const candidates: Candidate[] = [];
  for (const row of characters.data ?? []) {
    if (!blocked.has(row.profile_id)) {
      result.players[row.profile_id].identity = {
        name: row.name,
        archetype: row.archetype,
        signature_color: row.signature_color,
        cosmetic_config: row.cosmetic_config,
      };
    }
    if (!blocked.has(row.profile_id) && row.avatar_portrait_id) {
      candidates.push({
        context: "players",
        key: row.profile_id,
        owner: row.profile_id,
        character: row.id,
        asset: row.avatar_portrait_id,
      });
    }
  }
  for (const row of battles.data ?? []) {
    const side = row.player_one_id === caller
      ? "player_two"
      : row.player_two_id === caller
      ? "player_one"
      : null;
    if (!side || (side === "player_two" && row.is_player_two_bot)) continue;
    const owner = row[`${side}_id`];
    const frozen = row.identity_snapshot?.[side];
    const character = row[`${side}_character_id`];
    if (
      !owner || blocked.has(owner) || !character || frozen?.id !== character ||
      !frozen?.avatar?.image_path
    ) continue;
    candidates.push({
      context: "battles",
      key: row.id,
      owner,
      character,
      path: frozen.avatar.image_path,
    });
  }
  const assetIds = [
    ...new Set(candidates.flatMap((c) => c.asset ? [c.asset] : [])),
  ];
  const paths = [...new Set(candidates.flatMap((c) => c.path ? [c.path] : []))];
  const columns =
    "id, character_id, profile_id, kind, moderation_status, image_path";
  const fetched = await Promise.all([
    assetIds.length
      ? db.from("character_portraits").select(columns).in("id", assetIds)
      : Promise.resolve({ data: [], error: null }),
    paths.length
      ? db.from("character_portraits").select(columns).in("image_path", paths)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (fetched.some((r) => r.error)) {
    throw new Error("Avatar approval lookup failed");
  }
  const portraits = fetched.flatMap((r) => r.data ?? []) as Portrait[];
  const approved = candidates.flatMap((candidate) => {
    const portrait = portraits.find((p) =>
      (candidate.asset
        ? p.id === candidate.asset
        : p.image_path === candidate.path) &&
      p.character_id === candidate.character &&
      p.profile_id === candidate.owner &&
      p.kind === "avatar" && p.moderation_status === "approved" && p.image_path
    );
    return portrait ? [{ candidate, portrait }] : [];
  });
  const approvedPaths = [
    ...new Set(approved.map((p) => p.portrait.image_path)),
  ];
  if (!approvedPaths.length) return result;
  const expires_at = new Date(now + 3600_000).toISOString();
  try {
    const signed = await db.storage.from("character-portraits")
      .createSignedUrls(approvedPaths, 3600);
    for (const { candidate, portrait } of approved) {
      const url = !signed.error &&
        signed.data?.find((item) =>
          item.path === portrait.image_path && !item.error
        )?.signedUrl;
      result[candidate.context][candidate.key] = url
        ? {
          identity: result[candidate.context][candidate.key].identity,
          status: "available",
          asset_id: portrait.id,
          signed_url: url,
          expires_at,
        }
        : { ...result[candidate.context][candidate.key], status: "retryable" };
    }
  } catch {
    approved.forEach(({ candidate }) =>
      result[candidate.context][candidate.key] = { status: "retryable" }
    );
  }
  return result;
}
