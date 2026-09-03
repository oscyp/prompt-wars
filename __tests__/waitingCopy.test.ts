/**
 * The waiting screen's words and its two small parsers, pinned without
 * mounting the screen.
 */
import {
  waitingHero,
  sanitizeServerMessage,
  opponentDeadlineLine,
  resolveRoundParam,
  STILL_SCORING,
  RECONNECTING,
  NOTIFY_ON,
  NOTIFY_OFF,
  BOT_READY,
} from '@/utils/prebattleCopy';

describe('waitingHero', () => {
  it('is the queue while there is no opponent, whatever else is true', () => {
    const hero = waitingHero({
      hasOpponent: false,
      myLocked: true,
      opponentLocked: false,
      isResolving: false,
    });
    expect(hero.title).toBe('Finding an opponent…');
    expect(hero.subtitle).toBe(
      "Usually under a minute. We'll bring in a practice bot if no one's free.",
    );
  });

  it('is the lock-in wait when only this player has locked', () => {
    const hero = waitingHero({
      hasOpponent: true,
      myLocked: true,
      opponentLocked: false,
      isResolving: false,
    });
    expect(hero).toEqual({
      title: 'Locked in',
      subtitle: 'Waiting for your opponent to lock in…',
    });
  });

  it('is the judge once both have locked, before the status flips', () => {
    const hero = waitingHero({
      hasOpponent: true,
      myLocked: true,
      opponentLocked: true,
      isResolving: false,
    });
    expect(hero.title).toBe('The judge deliberates');
    expect(hero.subtitle).toBe('Weighing every word of both prompts…');
  });

  it('is the judge while resolving regardless of lock flags', () => {
    expect(
      waitingHero({
        hasOpponent: true,
        myLocked: false,
        opponentLocked: false,
        isResolving: true,
      }).title,
    ).toBe('The judge deliberates');
  });

  it('has a neutral placeholder for the frame before face-off routing', () => {
    expect(
      waitingHero({
        hasOpponent: true,
        myLocked: false,
        opponentLocked: false,
        isResolving: false,
      }),
    ).toEqual({ title: 'Entering the arena', subtitle: 'One moment…' });
  });
});

describe('sanitizeServerMessage', () => {
  it('drops the frozen countdown parenthetical', () => {
    expect(
      sanitizeServerMessage('Searching for opponent... (43s remaining)'),
    ).toBe('Searching for opponent…');
    expect(sanitizeServerMessage('Waiting (5 seconds remaining)')).toBe(
      'Waiting',
    );
  });

  it('normalises three dots to an ellipsis', () => {
    expect(sanitizeServerMessage('Still looking...')).toBe('Still looking…');
  });

  it('returns null for nothing to show', () => {
    expect(sanitizeServerMessage(undefined)).toBeNull();
    expect(sanitizeServerMessage('')).toBeNull();
    expect(sanitizeServerMessage('(43s remaining)')).toBeNull();
  });

  it('leaves ordinary parentheticals alone', () => {
    expect(sanitizeServerMessage('Queued (ranked)')).toBe('Queued (ranked)');
  });
});

describe('opponentDeadlineLine', () => {
  it('reads as a duration, in the shared clock format', () => {
    expect(opponentDeadlineLine(5 * 60_000 + 3_000)).toBe(
      'Opponent has 5m 03s to lock in',
    );
    expect(opponentDeadlineLine(65 * 60_000)).toBe(
      'Opponent has 1h 05m to lock in',
    );
  });

  it('does not print a negative or zero clock', () => {
    expect(opponentDeadlineLine(0)).toBe("Opponent's time is up");
    expect(opponentDeadlineLine(-4_000)).toBe("Opponent's time is up");
  });
});

describe('resolveRoundParam', () => {
  it('parses a positive integer', () => {
    expect(resolveRoundParam('2', 1)).toBe(2);
    expect(resolveRoundParam(['3'], 1)).toBe(3);
  });

  it('falls back for anything that is not a round', () => {
    expect(resolveRoundParam(undefined, 2)).toBe(2);
    expect(resolveRoundParam('', 2)).toBe(2);
    expect(resolveRoundParam('abc', 2)).toBe(2);
    expect(resolveRoundParam('0', 2)).toBe(2);
    expect(resolveRoundParam('-1', 2)).toBe(2);
    expect(resolveRoundParam('1.5', 2)).toBe(2);
  });
});

describe('fixed lines', () => {
  it('never narrates retries or attempts', () => {
    expect(STILL_SCORING).toBe('Still scoring — this can take a minute.');
    expect(RECONNECTING).toBe('Reconnecting…');
    expect(BOT_READY).toBe('Bot is ready');
  });

  it('only promises a notification in the granted branch', () => {
    expect(NOTIFY_ON).toBe("You'll be notified when the result is ready");
    expect(NOTIFY_OFF).toBe("Turn on notifications to hear when it's ready");
  });
});
