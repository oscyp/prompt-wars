import {
  assertEquals,
  assertNotEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildCinematicInput,
  hashCinematicInput,
} from '../_shared/cinematic-inputs.ts';

import { cinematicSource } from './fixtures/cinematic.ts';

Deno.test(
  'cinematic inputs preserve frozen fighters, gear and round outcome rather than series winner',
  () => {
    const source = cinematicSource();
    const input = buildCinematicInput(source);
    assertEquals(input.fighters.p1.name, 'Ash');
    assertEquals(input.fighters.p2.item?.name, 'Copper shield');
    assertEquals(input.fighters.p1.reference?.path, 'Ash/v2.png');
    assertEquals(input.outcome.winner, 'p2');
    assertEquals(input.policy.target_duration_seconds, 15);
    source.battle.identity_snapshot.player_one.name = 'Edited';
    assertEquals(input.fighters.p1.name, 'Ash');
  },
);

Deno.test(
  'cinematic inputs preserve long cross-locale moves and their ending',
  () => {
    const source = cinematicSource();
    const text =
      'Przechodzę ostrożnie. '.repeat(35) +
      'using the copper shield as a bridge.';
    source.round.judge_payload.frozen_inputs.player_one.text = text;
    assertEquals(buildCinematicInput(source).moves.p1?.text, text);
  },
);

Deno.test(
  'cinematic inputs distinguish a bot victory from a draw and reject unrelated outcomes',
  () => {
    const source: any = cinematicSource();
    source.battle.is_player_two_bot = true;
    source.battle.player_two_id = null;
    source.round.round_winner_id = null;
    assertEquals(buildCinematicInput(source).outcome.winner, 'p2');
    source.round.is_draw = true;
    assertEquals(buildCinematicInput(source).outcome.winner, null);
    source.round.is_draw = false;
    source.round.round_winner_id = 'outsider';
    assertThrows(() => buildCinematicInput(source), Error, 'outcome');
  },
);

Deno.test(
  'cinematic inputs fail closed on mismatched rounds and missing composer moves',
  () => {
    const source: any = cinematicSource();
    source.round.battle_id = 'other';
    assertThrows(() => buildCinematicInput(source), Error, 'round');
    source.round.battle_id = 'battle';
    delete source.round.judge_payload.frozen_inputs.player_two;
    assertThrows(() => buildCinematicInput(source), Error, 'move');
    source.round.judge_payload.forfeit_profile_id = 'two';
    source.round.round_winner_id = 'one';
    assertEquals(buildCinematicInput(source).outcome.forfeit, 'p2');
    assertEquals(buildCinematicInput(source).moves.p2, null);
  },
);

Deno.test(
  'legacy round inputs use recorded bot action rather than drawing another prompt',
  () => {
    const source: any = cinematicSource();
    source.battle.prompt_experience_version = 1;
    assertEquals(
      buildCinematicInput(source).moves.p2?.text,
      'I pull the rope to tilt the bridge.',
    );
    source.round = null;
    source.battle.format = 'single';
    source.battle.status = 'completed';
    source.battle.score_payload = {
      frozen_inputs: {
        player_one: { text: 'One', moveType: 'defense' },
        player_two: { text: 'Recorded bot action', moveType: 'attack' },
      },
    };
    assertEquals(
      buildCinematicInput(source).moves.p2?.text,
      'Recorded bot action',
    );
  },
);

Deno.test(
  'canonical cinematic hash includes nested moves, gear and outcome but ignores key order',
  async () => {
    const input = buildCinematicInput(cinematicSource());
    const hash = await hashCinematicInput(input);
    const reordered = JSON.parse(JSON.stringify(input, null, 2));
    reordered.fighters.p1 = Object.fromEntries(
      Object.entries(reordered.fighters.p1).reverse(),
    );
    assertEquals(await hashCinematicInput(reordered), hash);
    for (const change of [
      (i: any) => (i.fighters.p1.item.name = 'Different item'),
      (i: any) => (i.moves.p1.text = 'Different action'),
      (i: any) => (i.outcome.winner = 'p1'),
      (i: any) => (i.policy.target_duration_seconds = 12),
    ]) {
      const changed = structuredClone(input);
      change(changed);
      assertNotEquals(await hashCinematicInput(changed), hash);
    }
  },
);
