/**
 * Who the other fighter is: the frozen reveal payload first, the public view
 * second, nulls last — and bots never get a name here.
 */
import {
  opponentIdentityFor,
  UNKNOWN_OPPONENT,
} from '@/utils/opponentIdentity';
import { NO_COSMETICS } from '@/utils/cosmetics';
import type { PublicPlayerMap } from '@/utils/publicPlayers';

const ME = 'me-1';
const THEM = 'them-2';

const payload = (
  side: 'player_one' | 'player_two',
  fields: Record<string, unknown>,
) => ({ version: 1, players: { [side]: fields } });

const publicMap = (
  id: string,
  archetype: string | null,
  signatureColor: string | null,
): PublicPlayerMap =>
  new Map([[id, { archetype, signatureColor, cosmetics: NO_COSMETICS }]]);

describe('opponentIdentityFor', () => {
  it('reads the opponent from the payload when it is there', () => {
    const battle = {
      player_one_id: ME,
      player_two_id: THEM,
      is_player_two_bot: false,
      tier0_reveal_payload: payload('player_two', {
        character_name: 'Vex',
        archetype: 'trickster',
        signature_color: '#F59E0B',
      }),
    };
    expect(
      opponentIdentityFor(battle, ME, publicMap(THEM, 'titan', '#EF4444')),
    ).toEqual({
      name: 'Vex',
      archetype: 'trickster',
      signatureColor: '#F59E0B',
      isBot: false,
    });
  });

  it('falls back to the public view for a live battle, without a name', () => {
    const battle = { player_one_id: ME, player_two_id: THEM };
    expect(
      opponentIdentityFor(battle, ME, publicMap(THEM, 'mystic', 'violet')),
    ).toEqual({
      name: null,
      archetype: 'mystic',
      signatureColor: 'violet',
      isBot: false,
    });
  });

  it('fills each field from the next source when the payload is partial', () => {
    const battle = {
      player_one_id: ME,
      player_two_id: THEM,
      tier0_reveal_payload: payload('player_two', {
        character_name: 'Vex',
        archetype: '',
      }),
    };
    expect(
      opponentIdentityFor(battle, ME, publicMap(THEM, 'engineer', '#10B981')),
    ).toEqual({
      name: 'Vex',
      archetype: 'engineer',
      signatureColor: '#10B981',
      isBot: false,
    });
  });

  it('returns nulls when nothing is known', () => {
    expect(
      opponentIdentityFor({ player_one_id: ME, player_two_id: THEM }, ME),
    ).toEqual(UNKNOWN_OPPONENT);
    expect(
      opponentIdentityFor(
        { player_one_id: ME, player_two_id: THEM, tier0_reveal_payload: 'x' },
        ME,
        new Map(),
      ),
    ).toEqual(UNKNOWN_OPPONENT);
  });

  it('reads player one when the viewer is player two', () => {
    const battle = {
      player_one_id: THEM,
      player_two_id: ME,
      tier0_reveal_payload: {
        players: {
          player_one: { character_name: 'Rook', archetype: 'strategist' },
          player_two: { character_name: 'Me', archetype: 'titan' },
        },
      },
    };
    expect(opponentIdentityFor(battle, ME)).toMatchObject({
      name: 'Rook',
      archetype: 'strategist',
    });
    expect(
      opponentIdentityFor(
        { player_one_id: THEM, player_two_id: ME },
        ME,
        publicMap(THEM, 'strategist', '#3B82F6'),
      ),
    ).toMatchObject({ archetype: 'strategist', signatureColor: '#3B82F6' });
  });

  it('treats an unknown viewer as player one', () => {
    const battle = {
      player_one_id: ME,
      player_two_id: THEM,
      tier0_reveal_payload: payload('player_two', { character_name: 'Vex' }),
    };
    expect(opponentIdentityFor(battle, null).name).toBe('Vex');
    expect(opponentIdentityFor(battle, 'stranger').name).toBe('Vex');
  });

  it('marks a bot and leaves it unnamed, taking the persona look only from the payload', () => {
    const live = {
      player_one_id: ME,
      player_two_id: null,
      is_player_two_bot: true,
    };
    expect(
      opponentIdentityFor(live, ME, publicMap(THEM, 'titan', '#EF4444')),
    ).toEqual({
      name: null,
      archetype: null,
      signatureColor: null,
      isBot: true,
    });

    const finished = {
      ...live,
      tier0_reveal_payload: payload('player_two', {
        character_name: 'Ironclad',
        archetype: 'titan',
        signature_color: '#EF4444',
      }),
    };
    expect(opponentIdentityFor(finished, ME)).toEqual({
      name: null,
      archetype: 'titan',
      signatureColor: '#EF4444',
      isBot: true,
    });
  });

  it('never calls the opponent a bot when the viewer is player two', () => {
    // Bots are always player two, so player two's opponent is human.
    expect(
      opponentIdentityFor(
        { player_one_id: THEM, player_two_id: ME, is_player_two_bot: true },
        ME,
      ).isBot,
    ).toBe(false);
  });
});
