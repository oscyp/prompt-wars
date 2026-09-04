// Matchmaking Edge Function
// Pairs players for battles with newbie bucket, rating bands, and bot fallback

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
} from '../_shared/utils.ts';
import { BattleMode } from '../_shared/types.ts';
import { startFaceOff } from '../_shared/start-face-off.ts';

const THEMES = [
  'Overcome an impossible challenge',
  'Turn weakness into strength',
  'The calm before the storm',
  'Victory from the jaws of defeat',
  'Precision over power',
];

const RANKED_FINISHED_STATUSES = [
  'completed',
  'result_ready',
  'generating_video',
  'generation_failed',
];

const QUEUE_MATCH_WINDOW_MS = 5 * 60 * 1000;
const BOT_FALLBACK_MS = 60 * 1000;
const INITIAL_RATING_BAND = 50;
const RATING_BAND_STEP = 25;
const RATING_BAND_STEP_MS = 15 * 1000;
const MAX_RATING_BAND = 400;

function ratingBandForWait(
  ...createdAtValues: Array<string | undefined>
): number {
  const oldestCreatedAtMs = createdAtValues.reduce<number | null>(
    (oldest, value) => {
      if (!value) return oldest;
      const createdAtMs = new Date(value).getTime();
      if (!Number.isFinite(createdAtMs)) return oldest;
      return oldest === null ? createdAtMs : Math.min(oldest, createdAtMs);
    },
    null,
  );

  if (oldestCreatedAtMs === null) return INITIAL_RATING_BAND;

  const waitMs = Date.now() - oldestCreatedAtMs;
  if (waitMs >= BOT_FALLBACK_MS) return MAX_RATING_BAND;

  const elapsedSteps = Math.max(0, Math.floor(waitMs / RATING_BAND_STEP_MS));
  return Math.min(
    MAX_RATING_BAND,
    INITIAL_RATING_BAND + elapsedSteps * RATING_BAND_STEP,
  );
}

function embeddedProfileRating(battle: unknown): number | null {
  const row = battle as {
    profiles?:
      | { rating?: number | string }
      | Array<{ rating?: number | string }>;
  };
  const embeddedProfile = Array.isArray(row.profiles)
    ? row.profiles[0]
    : row.profiles;
  const rating = Number(embeddedProfile?.rating);
  return Number.isFinite(rating) ? rating : null;
}

function pickTheme(): string {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

async function getRankedBattleCount(
  supabase: ReturnType<typeof createServiceClient>,
  profileId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('battles')
    .select('id', { count: 'exact', head: true })
    .eq('mode', 'ranked')
    .in('status', RANKED_FINISHED_STATUSES)
    .or(`player_one_id.eq.${profileId},player_two_id.eq.${profileId}`);

  if (error) {
    logMatchmaking('ranked_count_failed', {
      profile_id: profileId,
      error_code: error.code,
    });
    return 0;
  }

  return count ?? 0;
}

/**
 * Convert an existing 'created' battle to a bot battle (60s+ fallback)
 */
async function convertToBotBattle(
  supabase: ReturnType<typeof createServiceClient>,
  battleId: string,
): Promise<{ theme: string }> {
  // Select random active bot persona
  const { data: botPersonas, error: botError } = await supabase
    .from('bot_personas')
    .select('id')
    .eq('is_active', true);

  if (botError || !botPersonas || botPersonas.length === 0) {
    throw new Error('No active bot personas found');
  }

  const randomBot = botPersonas[Math.floor(Math.random() * botPersonas.length)];

  const theme = pickTheme();

  // Convert battle to bot battle (idempotent: only updates if status is still 'created')
  const { data: battle, error: updateError } = await supabase
    .from('battles')
    .update({
      is_player_two_bot: true,
      bot_persona_id: randomBot.id,
      status: 'matched',
      theme,
      theme_revealed_at: new Date().toISOString(),
      matched_at: new Date().toISOString(),
      player_one_prompt_deadline: new Date(
        Date.now() + 2 * 60 * 60 * 1000,
      ).toISOString(), // 2h for ranked
    })
    .eq('id', battleId)
    .eq('status', 'created') // Only convert if still in created state
    .select('id')
    .single();

  if (updateError || !battle) {
    // Battle may have been matched to a human in the meantime, fetch and return current state
    const { data: currentBattle } = await supabase
      .from('battles')
      .select('theme')
      .eq('id', battleId)
      .single();

    return { theme: currentBattle?.theme || theme };
  }

  return { theme };
}

interface MatchmakingRequest {
  character_id: string;
  mode?: BattleMode;
  /** Client generated. Optional only while the previous app version ages out. */
  request_id?: string;
  /** Waiting screens resume this row instead of opening another search. */
  resume_battle_id?: string;
}

interface ReplayBattle {
  id: string;
  status: string;
  mode: BattleMode;
  theme: string | null;
  player_one_id: string;
  player_two_id: string | null;
  player_one_character_id: string;
  player_two_character_id: string | null;
  is_player_two_bot: boolean;
  created_at?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function logMatchmaking(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
) {
  // IDs and machine states only: never prompts, email addresses, display names
  // or raw provider/backend errors.
  console.log(JSON.stringify({ event: `matchmaking.${event}`, ...fields }));
}

function replayPayload(battle: ReplayBattle, replayedRequest = true) {
  const matched =
    battle.status !== 'created' &&
    battle.status !== 'canceled' &&
    battle.status !== 'expired';
  return {
    battle_id: battle.id,
    matched,
    theme: battle.theme,
    is_bot_battle: battle.is_player_two_bot,
    replayed_request: replayedRequest,
    message: matched ? undefined : 'Resuming your search...',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const {
      character_id,
      mode = 'ranked',
      request_id,
      resume_battle_id,
    }: MatchmakingRequest = await req.json();

    if (!character_id) {
      return errorResponse('character_id required');
    }

    if (request_id && !UUID_RE.test(request_id)) {
      return errorResponse('Invalid request_id');
    }
    if (resume_battle_id && !UUID_RE.test(resume_battle_id)) {
      return errorResponse('Invalid resume_battle_id');
    }

    // Compatibility: the database/Edge rollout precedes the client. Old
    // clients get a server request id; current clients always send their own.
    const requestId = request_id ?? crypto.randomUUID();

    const supabase = createServiceClient();

    // Validate character belongs to user
    const { data: character, error: charError } = await supabase
      .from('characters')
      .select('*')
      .eq('id', character_id)
      .eq('profile_id', userId)
      .single();

    if (charError || !character) {
      return errorResponse('Invalid character');
    }

    let resumedBattle: ReplayBattle | null = null;
    if (resume_battle_id) {
      const { data } = await supabase
        .from('battles')
        .select(
          'id, status, mode, theme, player_one_id, player_two_id, player_one_character_id, player_two_character_id, is_player_two_bot, created_at',
        )
        .eq('id', resume_battle_id)
        .maybeSingle();
      const candidate = data as ReplayBattle | null;
      const ownsSlot =
        candidate &&
        ((candidate.player_one_id === userId &&
          candidate.player_one_character_id === character_id) ||
          (candidate.player_two_id === userId &&
            candidate.player_two_character_id === character_id));
      if (!candidate || !ownsSlot || candidate.mode !== mode) {
        logMatchmaking('resume_rejected', {
          profile_id: userId,
          request_id: requestId,
          battle_id: resume_battle_id,
        });
        return errorResponse('Battle cannot be resumed', 409);
      }
      resumedBattle = candidate;
      if (candidate.status !== 'created') {
        logMatchmaking('resume_terminal_or_matched', {
          profile_id: userId,
          request_id: requestId,
          battle_id: candidate.id,
          status: candidate.status,
        });
        return successResponse(replayPayload(candidate));
      }
    } else if (request_id) {
      // A transport retry before navigation replays immediately. Waiting-screen
      // retries send resume_battle_id and continue through fallback matching.
      const { data: mapping } = await supabase
        .from('matchmaking_requests')
        .select('battle_id')
        .eq('profile_id', userId)
        .eq('request_id', requestId)
        .maybeSingle();
      if (mapping?.battle_id) {
        const { data } = await supabase
          .from('battles')
          .select(
            'id, status, mode, theme, player_one_id, player_two_id, player_one_character_id, player_two_character_id, is_player_two_bot',
          )
          .eq('id', mapping.battle_id)
          .maybeSingle();
        if (data) {
          logMatchmaking('request_replayed', {
            profile_id: userId,
            request_id: requestId,
            battle_id: data.id,
            status: data.status,
          });
          return successResponse(replayPayload(data as ReplayBattle));
        }
      }
    }

    // Get user profile for matchmaking
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, rating, rating_deviation, total_battles')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return errorResponse('Profile not found');
    }

    // §7.8 enforced rate limit: cap new battles created/joined per hour and
    // day. A verified waiting-screen resume is not a new action and must keep
    // working even if the player reaches a boundary while already queued.
    if (!resumedBattle) {
      const { data: rateCheck, error: rateErr } = await supabase.rpc(
        'check_rate_limit',
        { p_profile_id: userId, p_action: 'battle_create' },
      );
      if (rateErr) {
        // Fail CLOSED -- see submit-prompt for the reasoning. An abuse burst is
        // the case where this query is most likely to fail, so opening under
        // error removed the cap exactly when it mattered.
        logMatchmaking('rate_limit_check_failed', {
          profile_id: userId,
          request_id: requestId,
          error_code: rateErr.code,
        });
        return errorResponse(
          'Cannot verify rate limits right now. Please try again.',
          503,
        );
      } else if (rateCheck && rateCheck.allowed === false) {
        logMatchmaking('rate_limited', {
          profile_id: userId,
          request_id: requestId,
        });
        return errorResponse('Too many battles created. Try again later.', 429);
      }
    }

    // Newbie check is based on ranked battles, not total battles. Total battles
    // includes bots/unranked and can incorrectly push a player out of the
    // ranked newbie bucket.
    const rankedBattleCount = await getRankedBattleCount(supabase, userId);
    const isNewbie = rankedBattleCount < 10;

    // Explicit bot mode starts immediately. Ranked/unranked only fall back to
    // bots after queue timeout and after checking for human candidates.
    if (mode === 'bot') {
      const { data: botPersonas, error: botError } = await supabase
        .from('bot_personas')
        .select('id')
        .eq('is_active', true);
      if (botError || !botPersonas?.length) {
        return errorResponse('No active bot personas found', 503);
      }
      const randomBot =
        botPersonas[Math.floor(Math.random() * botPersonas.length)];
      const { data: createdRows, error: createError } = await supabase.rpc(
        'create_matchmaking_battle',
        {
          p_player_one_id: userId,
          p_character_id: character_id,
          p_mode: mode,
          p_request_id: requestId,
          p_bot_persona_id: randomBot.id,
          p_theme: pickTheme(),
        },
      );
      const created = Array.isArray(createdRows) ? createdRows[0] : createdRows;
      if (createError || !created?.battle_id) {
        logMatchmaking('bot_create_failed', {
          profile_id: userId,
          request_id: requestId,
          error_code: createError?.code,
        });
        return errorResponse('Failed to create bot battle', 500);
      }
      // Bo3 face-off writer (no-op for single-format bot battles).
      await startFaceOff(supabase, created.battle_id);
      logMatchmaking('bot_ready', {
        profile_id: userId,
        request_id: requestId,
        battle_id: created.battle_id,
        replayed_request: Boolean(created.replayed_request),
      });
      return successResponse({
        battle_id: created.battle_id,
        matched: true,
        theme: created.theme,
        is_bot_battle: true,
        replayed_request: Boolean(created.replayed_request),
      });
    }

    const queueCutoffIso = new Date(
      Date.now() - QUEUE_MATCH_WINDOW_MS,
    ).toISOString();

    // Check if user already has an active 'created' battle for this mode/character.
    // Do not convert it to a bot yet; first try to claim an eligible human
    // opponent. The previous order caused two waiting users to each convert
    // their own queued battle to a bot at the 60s retry mark.
    const { data: queriedExistingBattle } = resumedBattle
      ? { data: null }
      : await supabase
          .from('battles')
          .select('id, created_at, mode, player_one_character_id')
          .eq('player_one_id', userId)
          .eq('status', 'created')
          .eq('mode', mode)
          .eq('player_one_character_id', character_id)
          .gte('created_at', queueCutoffIso)
          .maybeSingle();
    const existingBattle = resumedBattle
      ? {
          id: resumedBattle.id,
          created_at: resumedBattle.created_at ?? new Date().toISOString(),
          mode: resumedBattle.mode,
          player_one_character_id: resumedBattle.player_one_character_id,
        }
      : queriedExistingBattle;

    const findWaitingBattle = async (
      createdBefore?: string,
      createdAfter?: string,
    ) => {
      if (mode === 'ranked') {
        const minRating = profile.rating - MAX_RATING_BAND;
        const maxRating = profile.rating + MAX_RATING_BAND;

        // NOTE: `profiles!inner(...)` is required so PostgREST applies the
        // `gte/lte` predicates to the parent `battles` rows (inner join).
        // Without `!inner`, battles outside the band would still be returned
        // with the embedded profile hidden.
        let query = supabase
          .from('battles')
          .select(
            `
          id,
          player_one_id,
          player_one_character_id,
          mode,
          created_at,
          profiles!battles_player_one_id_fkey!inner (
            rating,
            total_battles
          )
        `,
          )
          .eq('status', 'created')
          .eq('mode', 'ranked')
          .neq('player_one_id', userId) // Don't match with self
          .gte('created_at', queueCutoffIso)
          .gte('profiles.rating', minRating)
          .lte('profiles.rating', maxRating);

        if (createdBefore) query = query.lt('created_at', createdBefore);
        if (createdAfter) query = query.gt('created_at', createdAfter);

        const { data: waitingBattles } = await query
          .order('created_at', { ascending: true })
          .limit(20); // Fetch more candidates for filtering

        if (waitingBattles && waitingBattles.length > 0) {
          // Filter by newbie constraint, blocks, and opponent diversity
          for (const battle of waitingBattles) {
            const opponentRankedBattleCount = await getRankedBattleCount(
              supabase,
              battle.player_one_id,
            );
            const opponentIsNewbie = opponentRankedBattleCount < 10;

            // Newbies only match with newbies
            if (isNewbie && !opponentIsNewbie) continue;
            if (!isNewbie && opponentIsNewbie) continue;

            const opponentRating = embeddedProfileRating(battle);
            const ratingBand = ratingBandForWait(
              existingBattle?.created_at,
              battle.created_at,
            );
            if (
              opponentRating === null ||
              Math.abs(opponentRating - Number(profile.rating)) > ratingBand
            ) {
              continue;
            }

            // Check if users have blocked each other
            const { data: blockedData } = await supabase.rpc('is_blocked', {
              p_profile_id: userId,
              p_other_profile_id: battle.player_one_id,
            });

            if (blockedData === true) continue; // Skip blocked opponents

            // Check opponent diversity (max 3 ranked battles vs same opponent in 24h)
            const { data: recentBattles } = await supabase.rpc(
              'ranked_battles_vs_opponent_24h',
              {
                p_profile_id: userId,
                p_opponent_id: battle.player_one_id,
              },
            );

            if (recentBattles && recentBattles >= 3) continue; // Skip over-matched opponents

            return battle;
          }
        }

        return null;
      }

      if (mode === 'unranked') {
        // Unranked: pair with the oldest waiting unranked battle from any other
        // player. No rating band, no newbie constraint. Still respect blocks.
        let query = supabase
          .from('battles')
          .select(
            'id, player_one_id, player_one_character_id, mode, created_at',
          )
          .eq('status', 'created')
          .eq('mode', 'unranked')
          .neq('player_one_id', userId)
          .gte('created_at', queueCutoffIso);

        if (createdBefore) query = query.lt('created_at', createdBefore);
        if (createdAfter) query = query.gt('created_at', createdAfter);

        const { data: waitingBattles } = await query
          .order('created_at', { ascending: true })
          .limit(20);

        if (waitingBattles && waitingBattles.length > 0) {
          for (const battle of waitingBattles) {
            const { data: blockedData } = await supabase.rpc('is_blocked', {
              p_profile_id: userId,
              p_other_profile_id: battle.player_one_id,
            });
            if (blockedData === true) continue;

            return battle;
          }
        }

        return null;
      }

      return null;
    };

    // If this user already has a queued battle, only claim older waiting rows.
    // This deterministic ordering prevents two users who both have queued rows
    // from cross-matching each other into duplicate battles.
    const matchedBattle = await findWaitingBattle(existingBattle?.created_at);

    // If match found, pair players
    if (matchedBattle) {
      const theme = pickTheme();

      // Claim + request mapping commit together, so a timeout after this RPC
      // replays the matched battle instead of opening another queue row.
      const { data: didMatch, error: matchError } = await supabase.rpc(
        'match_battle_request',
        {
          p_battle_id: matchedBattle.id,
          p_player_two_id: userId,
          p_player_two_character_id: character_id,
          p_theme: theme,
          p_request_id: requestId,
          p_previous_battle_id: existingBattle?.id ?? null,
        },
      );

      if (matchError) {
        logMatchmaking('human_match_failed', {
          profile_id: userId,
          request_id: requestId,
          battle_id: matchedBattle.id,
          error_code: matchError.code,
        });
        return errorResponse('Failed to match battle');
      }

      if (didMatch === true) {
        // Bo3 face-off writer (no-op for single-format).
        await startFaceOff(supabase, matchedBattle.id);

        logMatchmaking('human_matched', {
          profile_id: userId,
          request_id: requestId,
          battle_id: matchedBattle.id,
          canceled_queue_id: existingBattle?.id,
        });

        return successResponse({
          battle_id: matchedBattle.id,
          matched: true,
          theme,
          is_bot_battle: false,
          replayed_request: false,
        });
      }

      logMatchmaking('candidate_raced', {
        profile_id: userId,
        request_id: requestId,
        battle_id: matchedBattle.id,
      });
    }

    if (existingBattle) {
      // Attach this request to the existing row before any fallback work. The
      // atomic creator reuses the natural queue key and records the replay map.
      const { error: mapError } = await supabase.rpc(
        'create_matchmaking_battle',
        {
          p_player_one_id: userId,
          p_character_id: character_id,
          p_mode: mode,
          p_request_id: requestId,
          p_bot_persona_id: null,
          p_theme: null,
        },
      );
      if (mapError) {
        logMatchmaking('queue_map_failed', {
          profile_id: userId,
          request_id: requestId,
          battle_id: existingBattle.id,
          error_code: mapError.code,
        });
        return errorResponse('Failed to resume battle', 500);
      }

      const battleAge =
        Date.now() - new Date(existingBattle.created_at).getTime();
      const ageSeconds = battleAge / 1000;

      if (battleAge >= BOT_FALLBACK_MS) {
        // If a newer eligible player is waiting, keep this older row available
        // so that user's next retry can claim it. Otherwise both sides can
        // convert themselves to bots instead of forming a human match.
        const newerWaitingBattle = await findWaitingBattle(
          undefined,
          existingBattle.created_at,
        );
        if (newerWaitingBattle) {
          return successResponse({
            battle_id: existingBattle.id,
            matched: false,
            theme: null,
            message: 'Opponent found. Waiting for their device to connect...',
            replayed_request: true,
          });
        }

        const botBattle = await convertToBotBattle(supabase, existingBattle.id);
        await startFaceOff(supabase, existingBattle.id);
        return successResponse({
          battle_id: existingBattle.id,
          matched: true,
          theme: botBattle.theme,
          is_bot_battle: true,
          converted_from_queue: true,
          replayed_request: true,
        });
      }

      return successResponse({
        battle_id: existingBattle.id,
        matched: false,
        theme: null,
        message: `Searching for opponent... (${Math.max(1, Math.floor(BOT_FALLBACK_MS / 1000 - ageSeconds))}s remaining)`,
        replayed_request: true,
      });
    }

    // Create or resume the one open queue row atomically.
    const { data: createdRows, error: createError } = await supabase.rpc(
      'create_matchmaking_battle',
      {
        p_player_one_id: userId,
        p_character_id: character_id,
        p_mode: mode,
        p_request_id: requestId,
        p_bot_persona_id: null,
        p_theme: null,
      },
    );
    const created = Array.isArray(createdRows) ? createdRows[0] : createdRows;

    if (createError || !created?.battle_id) {
      logMatchmaking('queue_create_failed', {
        profile_id: userId,
        request_id: requestId,
        error_code: createError?.code,
      });
      return errorResponse('Failed to create battle');
    }

    logMatchmaking('queue_ready', {
      profile_id: userId,
      request_id: requestId,
      battle_id: created.battle_id,
      replayed_request: Boolean(created.replayed_request),
    });

    return successResponse({
      battle_id: created.battle_id,
      matched: false,
      theme: null, // Theme revealed on match
      message: 'Searching for opponent...',
      replayed_request: Boolean(created.replayed_request),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse('Unauthorized', 401);
    }
    const safeCode =
      error instanceof SyntaxError ? 'invalid_json' : 'unhandled_exception';
    logMatchmaking('failed', { error_code: safeCode });
    return errorResponse('Matchmaking is temporarily unavailable', 500);
  }
});
