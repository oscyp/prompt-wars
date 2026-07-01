// Unit tests for the shared Tier 0 reveal composer.
//
// Dependency-free: a hand-rolled mock Supabase client (read-only) drives the
// composer so these run without a live database. Validates that the FLAT
// backward-compat fields the current client reads populate with real values and
// that portraits are signed / fall back deterministically.

import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { composeRevealPayload } from '../_shared/compose-reveal-payload.ts';

interface Fixtures {
  battle: Record<string, unknown>;
  round?: Record<string, unknown> | null;
  prompts?: Array<Record<string, unknown>>;
  portraits?: Record<string, Record<string, unknown>>;
  templates?: Record<string, Record<string, unknown>>;
}

// deno-lint-ignore no-explicit-any
function createMockSupabase(fx: Fixtures): any {
  const one = (table: string, filters: Record<string, unknown>) => {
    switch (table) {
      case 'battles':
        return { data: fx.battle, error: null };
      case 'battle_rounds':
        return { data: fx.round ?? null, error: null };
      case 'character_portraits':
        return {
          data: fx.portraits?.[String(filters.character_id)] ?? null,
          error: null,
        };
      case 'prompt_templates':
        return { data: fx.templates?.[String(filters.id)] ?? null, error: null };
      default:
        return { data: null, error: null };
    }
  };
  const many = (table: string) => {
    if (table === 'battle_prompts') return { data: fx.prompts ?? [], error: null };
    return { data: [], error: null };
  };

  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      single: () => Promise.resolve(one(table, filters)),
      maybeSingle: () => Promise.resolve(one(table, filters)),
      // Thenable so `await query` (list reads) resolves.
      // deno-lint-ignore no-explicit-any
      then: (res: any, rej: any) =>
        Promise.resolve(many(table)).then(res, rej),
    };
    return api;
  };

  const storage = {
    from: (_bucket: string) => ({
      createSignedUrl: (path: string, _ttl: number) =>
        Promise.resolve({
          data: { signedUrl: `https://signed.test/${path}?token=abc` },
          error: null,
        }),
    }),
  };

  return { from, storage };
}

Deno.test('composeRevealPayload — human battle populates flat compat fields + signs winner portrait', async () => {
  const fx: Fixtures = {
    battle: {
      id: 'battle-1',
      is_player_two_bot: false,
      player_one_id: 'u1',
      player_two_id: 'u2',
      winner_id: 'u1',
      is_draw: false,
      judge_prompt_version: 'judge_v1',
      judge_model_id: 'mock-model',
      score_payload: {
        player_one_normalized_scores: {
          clarity: 8,
          originality: 7,
          specificity: 6,
          theme_fit: 9,
          archetype_fit: 8,
          dramatic_potential: 7,
        },
        player_two_normalized_scores: {
          clarity: 5,
          originality: 6,
          specificity: 5,
          theme_fit: 6,
          archetype_fit: 5,
          dramatic_potential: 6,
        },
        explanation: 'Player one was clearer and more specific.',
        aggregate_score_diff: 5.5,
        move_type_matchup: { player_one: 'attack', player_two: 'defense' },
      },
      player_one_character: {
        id: 'c1',
        profile_id: 'u1',
        name: 'Aria',
        archetype: 'strategist',
        signature_color: '#ff8800',
        battle_cry: 'For the win!',
        art_style: 'anime',
      },
      player_two_character: {
        id: 'c2',
        profile_id: 'u2',
        name: 'Bruno',
        archetype: 'titan',
        signature_color: '#3366ff',
        battle_cry: 'Crush them.',
        art_style: 'comic',
      },
      bot_persona: null,
    },
    prompts: [
      {
        profile_id: 'u1',
        move_type: 'attack',
        custom_prompt_text: 'A clever, precise opening strike.',
        prompt_template_id: null,
      },
      {
        profile_id: 'u2',
        move_type: 'defense',
        custom_prompt_text: 'A sturdy, unbreakable wall.',
        prompt_template_id: null,
      },
    ],
    // Only the winner (c1) has a current portrait; c2 falls back to gradient.
    portraits: {
      c1: {
        image_path: 'u1/c1/p1.png',
        thumb_path: null,
        seed: 1234,
        moderation_status: 'approved',
      },
    },
  };

  const payload = await composeRevealPayload(createMockSupabase(fx), {
    battleId: 'battle-1',
  });

  // Flat backward-compat fields (exact client reads).
  assertEquals(payload.summary, 'Player one was clearer and more specific.');
  assertEquals(payload.winnerColor, '#ff8800');
  assertEquals(payload.battleCryText, 'For the win!');
  assertEquals(
    payload.winnerPortraitUrl,
    'https://signed.test/u1/c1/p1.png?token=abc',
  );
  assertEquals(payload.portraitUrl, payload.winnerPortraitUrl);

  // Nested RevealPayloadV1.
  assertEquals(payload.version, 1);
  assertEquals(payload.tier, 0);
  assertEquals(payload.battle_id, 'battle-1');
  assertEquals(payload.battle_round_id, null);
  assertEquals(payload.round_number, null);
  assertEquals(payload.outcome.winner_profile_id, 'u1');
  assertEquals(payload.outcome.is_draw, false);
  assertEquals(payload.outcome.is_ko, false);
  assertEquals(payload.outcome.score_gap, 5.5);

  // Winner portrait carries path + signed URL + art style + seed.
  assertEquals(payload.players.player_one.portrait.path, 'u1/c1/p1.png');
  assertEquals(
    payload.players.player_one.portrait.signed_url,
    'https://signed.test/u1/c1/p1.png?token=abc',
  );
  assertEquals(payload.players.player_one.portrait.art_style, 'anime');
  assertEquals(payload.players.player_one.portrait.seed, 1234);

  // Non-winner without a portrait: gradient fallback, null signed URL.
  assertEquals(payload.players.player_two.portrait.signed_url, null);
  assertEquals(payload.players.player_two.portrait.fallback_gradient.length, 2);
  assertEquals(
    payload.players.player_two.portrait.fallback_gradient[0],
    '#3366ff',
  );

  // Move triangle: defense beats attack.
  assertEquals(payload.players.player_one.move_matchup_result, 'loss');
  assertEquals(payload.players.player_two.move_matchup_result, 'win');

  // Rubric passthrough.
  assertEquals(payload.players.player_one.rubric_scores.clarity, 8);
  assertEquals(payload.judge.why, 'Player one was clearer and more specific.');
  assertEquals(payload.judge.prompt_version, 'judge_v1');
  assertEquals(payload.judge.model_id, 'mock-model');

  // Generation-derived asset URLs are nullable + deterministic ids present.
  assertEquals(payload.reveal_spec.music_track_url, null);
  assertEquals(payload.reveal_spec.move_sting_url, null);
  assertEquals(payload.reveal_spec.battle_cry_voice.asset_url, null);
  assertEquals(payload.reveal_spec.winner_color, '#ff8800');
  assert(payload.reveal_spec.music_track_id.length > 0);
  assert(payload.reveal_spec.move_sting_id.length > 0);
});

Deno.test('composeRevealPayload — Bo3 round reads per-round outcome; bot opponent gets gradient fallback', async () => {
  const fx: Fixtures = {
    battle: {
      id: 'battle-2',
      is_player_two_bot: true,
      player_one_id: 'u1',
      player_two_id: null,
      // Series aggregate winner differs from this round's winner on purpose.
      winner_id: null,
      is_draw: false,
      judge_prompt_version: 'judge_v1',
      judge_model_id: 'mock-model',
      score_payload: null,
      player_one_character: {
        id: 'c1',
        profile_id: 'u1',
        name: 'Aria',
        archetype: 'mystic',
        signature_color: '#00ccaa',
        battle_cry: 'By the stars!',
        art_style: 'painterly',
      },
      player_two_character: null,
      bot_persona: {
        id: 'b1',
        name: 'Rival Bot',
        archetype: 'trickster',
        signature_color: '#cc4444',
        battle_cry: 'Hehe.',
      },
    },
    round: {
      id: 'round-2',
      round_number: 2,
      round_winner_id: 'u1',
      is_draw: false,
      is_ko: true,
      score_gap: 9.0,
      move_type_modifier_player_one: 0.12,
      move_type_modifier_player_two: -0.08,
      stat_modifier_player_one: 0.03,
      stat_modifier_player_two: -0.01,
      judge_prompt_version: 'judge_v1',
      judge_model_id: 'mock-model',
      judge_payload: {
        player_one_normalized_scores: {
          clarity: 9,
          originality: 8,
          specificity: 8,
          theme_fit: 9,
          archetype_fit: 8,
          dramatic_potential: 9,
        },
        player_two_normalized_scores: {
          clarity: 4,
          originality: 4,
          specificity: 3,
          theme_fit: 5,
          archetype_fit: 4,
          dramatic_potential: 4,
        },
        explanation: 'A decisive finishing blow.',
        move_type_matchup: { player_one: 'finisher', player_two: 'defense' },
      },
    },
    prompts: [
      {
        profile_id: 'u1',
        move_type: 'finisher',
        custom_prompt_text: 'The final, dramatic finisher.',
        prompt_template_id: null,
      },
    ],
    portraits: {
      c1: {
        image_path: 'u1/c1/p1.png',
        thumb_path: 'u1/c1/p1_thumb.png',
        seed: 42,
        moderation_status: 'approved',
      },
    },
  };

  const payload = await composeRevealPayload(createMockSupabase(fx), {
    battleId: 'battle-2',
    battleRoundId: 'round-2',
    roundNumber: 2,
  });

  // Per-round outcome (NOT the battle aggregate).
  assertEquals(payload.battle_round_id, 'round-2');
  assertEquals(payload.round_number, 2);
  assertEquals(payload.outcome.winner_profile_id, 'u1');
  assertEquals(payload.outcome.is_ko, true);
  assertEquals(payload.outcome.score_gap, 9.0);

  // Winner (human) portrait signed, incl. thumbnail.
  assertEquals(payload.winnerColor, '#00ccaa');
  assertEquals(payload.battleCryText, 'By the stars!');
  assertEquals(
    payload.winnerPortraitUrl,
    'https://signed.test/u1/c1/p1.png?token=abc',
  );
  assertEquals(
    payload.players.player_one.portrait.thumb_signed_url,
    'https://signed.test/u1/c1/p1_thumb.png?token=abc',
  );

  // Per-round modifiers surfaced.
  assertEquals(payload.players.player_one.move_type_modifier, 0.12);
  assertEquals(payload.players.player_one.stat_modifier, 0.03);

  // Bot opponent: no profile, no portrait, gradient fallback, bot metadata.
  assertEquals(payload.players.player_two.profile_id, null);
  assertEquals(payload.players.player_two.character_name, 'Rival Bot');
  assertEquals(payload.players.player_two.portrait.signed_url, null);
  assertEquals(payload.players.player_two.portrait.path, null);
  assertEquals(
    payload.players.player_two.portrait.fallback_gradient[0],
    '#cc4444',
  );

  assertEquals(payload.summary, 'A decisive finishing blow.');
});
