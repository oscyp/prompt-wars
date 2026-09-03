// Which avatar goes with which fighter render.
//
// A `render_look` produces two images of one character and a player restoring
// an earlier fighter expects the matching face to come back with it. Nothing in
// the schema ties the two rows together, so the pairing is reconstructed from
// two sources, in order of trust:
//
// 1. The audit trail. Every render and every avatar retry writes a
//    `character_edits` row whose `after` names both ids. The newest row that
//    points at this fighter is the pair the player last saw together.
// 2. The look version. Both legs of a render are stamped with the same
//    `appearance_version`, so among avatars of that version the one produced
//    nearest in time is almost certainly the same render. Used only when no
//    edit row exists (renders predating the audit fix in 20260827133348).
//
// Pure: callers run the queries, this decides.

export interface PairingFighter {
  id: string;
  appearance_version: number | null;
  created_at: string;
}

export interface PairingEditRow {
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface PairingAvatarCandidate {
  id: string;
  kind?: string | null;
  appearance_version: number | null;
  created_at: string;
  moderation_status?: string | null;
}

export function pickPairedAvatar(
  fighter: PairingFighter,
  edits: PairingEditRow[],
  avatarCandidates: PairingAvatarCandidate[],
): string | null {
  const newestFirst = [...edits].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  for (const edit of newestFirst) {
    const after = edit.after ?? {};
    if (after.portrait_id !== fighter.id) continue;
    const avatarId = after.avatar_portrait_id;
    if (typeof avatarId === 'string' && avatarId.length > 0) return avatarId;
  }

  // A fighter with no version cannot be matched by version: NULL means "we do
  // not know which look this was", and guessing would pair strangers.
  if (
    fighter.appearance_version === null ||
    fighter.appearance_version === undefined
  ) {
    return null;
  }

  const fighterTime = Date.parse(fighter.created_at);
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of avatarCandidates) {
    if (
      candidate.kind !== undefined &&
      candidate.kind !== null &&
      candidate.kind !== 'avatar'
    ) {
      continue;
    }
    if (candidate.moderation_status === 'rejected') continue;
    if ((candidate.appearance_version ?? null) !== fighter.appearance_version)
      continue;
    const distance = Math.abs(Date.parse(candidate.created_at) - fighterTime);
    if (distance < bestDistance) {
      best = candidate.id;
      bestDistance = distance;
    }
  }
  return best;
}
