// Generate Tier 0 Reveal Edge Function — OPTIONAL async ENRICHMENT pass.
//
// The base RevealPayloadV1 is now composed SYNCHRONOUSLY inside the battle/round
// resolvers (resolve-battle, round-resolve) via `_shared/compose-reveal-payload`
// and written to `battles.tier0_reveal_payload` (+ durable
// `battle_rounds.reveal_payload`) the moment a battle/round reaches
// `result_ready`. This function is a DEMOTED, optional pass that only fills the
// nullable generation-derived asset URLs (`music_track_url`, `move_sting_url`,
// `battle_cry_voice.asset_url`) on an ALREADY-WRITTEN payload.
//
// Guarantees:
//   * Service-role only (no client access).
//   * Never blanks out or blocks the base payload. If the base is somehow
//     missing it is (re)composed defensively; otherwise base fields are
//     preserved and only nullable *_url fields may be filled.
//   * Tier 1 / audio generation success or failure NEVER gates the reveal.

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  hasSupabaseSecretAuthorization,
} from '../_shared/utils.ts';
import {
  composeRevealPayload,
  writeRoundRevealPayload,
  type RevealPayloadV1,
} from '../_shared/compose-reveal-payload.ts';

interface GenerateTier0RevealRequest {
  battle_id: string;
  // Optional per-round hints (Bo3). When `battle_round_id` is provided the
  // durable per-round copy is refreshed in addition to the battle-level home.
  battle_round_id?: string;
  round_number?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Service-role only (mirrors round-resolve). The base reveal is already
  // written by the resolvers; this endpoint must never be client-reachable.
  if (!hasSupabaseSecretAuthorization(req.headers.get('Authorization'))) {
    return errorResponse('Service role required', 403);
  }

  try {
    const { battle_id, battle_round_id, round_number }: GenerateTier0RevealRequest =
      await req.json();

    if (!battle_id) {
      return errorResponse('battle_id required');
    }

    const supabase = createServiceClient();

    // Load the already-written base payload. Prefer the durable per-round copy
    // (Bo3) when present, else the battle-level client-read home.
    let base: RevealPayloadV1 | null = null;
    if (battle_round_id) {
      base = await readRoundReveal(supabase, battle_round_id);
    }
    if (!base) {
      base = await readBattleReveal(supabase, battle_id);
    }

    // Defensive safety net: never leave the reveal blank. If no base exists yet
    // (e.g. an enrichment call raced ahead of resolution), compose it now.
    let mustPersist = false;
    if (!base) {
      base = await composeRevealPayload(supabase, {
        battleId: battle_id,
        battleRoundId: battle_round_id ?? null,
        roundNumber: round_number ?? null,
      });
      mustPersist = true;
    }

    // ENRICHMENT: fill only the nullable *_url / asset_url fields. Preserves all
    // base fields. Audio/music/TTS generation is DEFERRED, so today this is a
    // safe no-op driven entirely by the deterministic ids + gradient fallbacks.
    const { payload: enriched, changed } = enrichAssetUrls(base);

    // Only write when we composed a missing base or enrichment produced new
    // URLs — avoids needlessly overwriting a fresher per-round payload.
    if (mustPersist || changed) {
      const { error: battleWriteErr } = await supabase
        .from('battles')
        .update({ tier0_reveal_payload: enriched })
        .eq('id', battle_id);
      if (battleWriteErr) {
        console.error(
          'Failed to write enriched reveal to battles (non-blocking):',
          battleWriteErr,
        );
      }
      if (battle_round_id) {
        await writeRoundRevealPayload(supabase, battle_round_id, enriched);
      }
    }

    return successResponse({
      battle_id,
      battle_round_id: battle_round_id ?? null,
      round_number: round_number ?? null,
      tier: 0,
      composed_base: mustPersist,
      enriched: changed,
    });
  } catch (error) {
    console.error('Tier 0 reveal enrichment error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});

/**
 * Enrichment seam. DEFERRED: TTS voice line, music track, and move-sting audio
 * generation are not yet implemented. When added, generate the assets, upload
 * them to Storage, mint signed URLs, and set the corresponding nullable fields
 * (`reveal_spec.music_track_url`, `reveal_spec.move_sting_url`,
 * `reveal_spec.battle_cry_voice.asset_url`) WITHOUT mutating any base field.
 *
 * Until then this is a no-op: the deterministic ids/presets + signature-color
 * gradient fully drive the reveal, so the base payload is never blocked.
 */
function enrichAssetUrls(
  base: RevealPayloadV1,
): { payload: RevealPayloadV1; changed: boolean } {
  return { payload: base, changed: false };
}

async function readBattleReveal(
  supabase: ReturnType<typeof createServiceClient>,
  battleId: string,
): Promise<RevealPayloadV1 | null> {
  const { data } = await supabase
    .from('battles')
    .select('tier0_reveal_payload')
    .eq('id', battleId)
    .maybeSingle();
  const payload = data?.tier0_reveal_payload as RevealPayloadV1 | null | undefined;
  return isRevealPayloadV1(payload) ? payload : null;
}

/**
 * Read the durable per-round copy. Resilient to the `reveal_payload` column not
 * existing yet (pre-migration): returns null instead of throwing.
 */
async function readRoundReveal(
  supabase: ReturnType<typeof createServiceClient>,
  battleRoundId: string,
): Promise<RevealPayloadV1 | null> {
  const { data, error } = await supabase
    .from('battle_rounds')
    .select('reveal_payload')
    .eq('id', battleRoundId)
    .maybeSingle();
  if (error) {
    // 42703 = undefined_column (migration not applied yet). Fall back to the
    // battle-level home; never fail.
    return null;
  }
  const payload = data?.reveal_payload as RevealPayloadV1 | null | undefined;
  return isRevealPayloadV1(payload) ? payload : null;
}

function isRevealPayloadV1(value: unknown): value is RevealPayloadV1 {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { version?: unknown }).version === 1 &&
    'reveal_spec' in (value as Record<string, unknown>)
  );
}
