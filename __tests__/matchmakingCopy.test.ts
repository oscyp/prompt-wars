/**
 * The matchmaking screen's words, pinned without mounting the screen.
 *
 * The failure copy matters most: the server's messages are written for logs
 * ("Too many battles created") and every one of them used to reach the
 * player verbatim through an Alert.
 */
import {
  matchmakingErrorCopy,
  matchFoundMessage,
  resolveMatchmakingMode,
  NO_ACTIVE_CHARACTER,
  SEARCHING_MESSAGE,
} from '@/utils/prebattleCopy';

describe('resolveMatchmakingMode', () => {
  it('accepts the three modes the sheet sells', () => {
    expect(resolveMatchmakingMode('ranked')).toBe('ranked');
    expect(resolveMatchmakingMode('unranked')).toBe('unranked');
    expect(resolveMatchmakingMode('bot')).toBe('bot');
  });

  it('falls back to ranked for anything else', () => {
    expect(resolveMatchmakingMode(undefined)).toBe('ranked');
    expect(resolveMatchmakingMode('')).toBe('ranked');
    expect(resolveMatchmakingMode('RANKED')).toBe('ranked');
    expect(resolveMatchmakingMode('friend_challenge')).toBe('ranked');
    expect(resolveMatchmakingMode('<script>')).toBe('ranked');
  });

  it('takes the first value of a repeated param', () => {
    expect(resolveMatchmakingMode(['bot', 'ranked'])).toBe('bot');
  });
});

describe('matchmakingErrorCopy', () => {
  it('uses one title for every failure', () => {
    const titles = new Set(
      [
        'Too many battles created',
        'Cannot verify rate limits',
        'boom',
        null,
        NO_ACTIVE_CHARACTER,
      ].map((m) => matchmakingErrorCopy(m).title),
    );
    expect([...titles]).toEqual(["Couldn't find a match"]);
  });

  it('translates the rate-limit refusal', () => {
    const copy = matchmakingErrorCopy(
      'Too many battles created. Please try again later.',
    );
    expect(copy.message).toBe(
      "You've started a lot of battles. Try again in a few minutes.",
    );
    expect(copy.canRetry).toBe(true);
  });

  it('translates the rate-limit outage', () => {
    const copy = matchmakingErrorCopy('Cannot verify rate limits');
    expect(copy.message).toBe("Couldn't check your limits. Try again.");
    expect(copy.canRetry).toBe(true);
  });

  it('never echoes unknown server prose', () => {
    for (const raw of [
      'duplicate key value violates unique constraint',
      'Function returned 500',
      'Matchmaking error',
      '',
      undefined,
    ]) {
      const copy = matchmakingErrorCopy(raw);
      expect(copy.message).toBe('Something went wrong. Try again.');
      expect(copy.canRetry).toBe(true);
    }
  });

  it('does not offer a retry when there is no character to send', () => {
    const copy = matchmakingErrorCopy(NO_ACTIVE_CHARACTER);
    expect(copy.message).toBe('You need an active character to battle.');
    expect(copy.canRetry).toBe(false);
  });
});

describe('matchFoundMessage', () => {
  it('says so when a human queue came back with a bot', () => {
    const expected = "No one was free — you're facing a practice bot instead.";
    expect(matchFoundMessage({ is_bot_battle: true }, 'ranked')).toBe(expected);
    expect(matchFoundMessage({ converted_from_queue: true }, 'unranked')).toBe(
      expected,
    );
  });

  it('does not apologise for a bot the player asked for', () => {
    expect(matchFoundMessage({ is_bot_battle: true }, 'bot')).toBe(
      'Your practice bot is ready.',
    );
  });

  it('is plain when a human was found', () => {
    expect(matchFoundMessage({}, 'ranked')).toBe('Opponent found.');
    expect(
      matchFoundMessage(
        { is_bot_battle: false, converted_from_queue: false },
        'unranked',
      ),
    ).toBe('Opponent found.');
  });
});

describe('searching copy', () => {
  it('uses the ellipsis character, not three dots', () => {
    expect(SEARCHING_MESSAGE).toBe('Finding an opponent…');
    expect(SEARCHING_MESSAGE).not.toContain('...');
  });
});
