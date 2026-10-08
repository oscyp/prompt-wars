import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composerVideoInputs } from '../_shared/composer-video.ts';
Deno.test(
  'composer video uses exactly the recorded inputs and round outcome',
  () => {
    const snapshot = {
      id: 'neon-1',
      catalogVersion: 1,
      environmentId: 'neon-nexus',
      text: 'The same published scene.',
    };
    const round = {
      status: 'result_ready',
      situation_snapshot: snapshot,
      round_winner_id: 'two',
      is_draw: false,
      judge_payload: {
        frozen_inputs: {
          player_one: { text: 'Recorded one', moveType: 'attack' },
          player_two: { text: 'Recorded two', moveType: 'defense' },
        },
      },
    };
    const battle = {
      prompt_experience_version: 2,
      theme: 'Theme',
      player_one_id: 'one',
      player_two_id: 'two',
    };
    assertEquals(composerVideoInputs(battle, round), {
      playerOnePrompt: 'Recorded one',
      playerTwoPrompt: 'Recorded two',
      playerOneMoveType: 'attack',
      playerTwoMoveType: 'defense',
      theme: 'Theme\nShared situation: The same published scene.',
      winnerId: 'p2',
      isDraw: false,
    });
    assertThrows(() =>
      composerVideoInputs(battle, { ...round, round_winner_id: null }),
    );
    assertThrows(() =>
      composerVideoInputs(battle, { ...round, status: 'resolving' }),
    );
    assertEquals(
      composerVideoInputs(
        { ...battle, is_player_two_bot: true, player_two_id: null },
        { ...round, round_winner_id: null },
      )?.winnerId,
      'p2',
    );
    assertEquals(
      composerVideoInputs({ prompt_experience_version: 1 }, null),
      null,
    );
    assertThrows(() =>
      composerVideoInputs({ prompt_experience_version: 2 }, null),
    );
  },
);
