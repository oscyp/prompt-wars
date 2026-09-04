import { canLeaveBattleStatus, leaveActionLabel } from '@/utils/battles';

describe('battle lifecycle actions', () => {
  it.each(['created', 'matched', 'waiting_for_prompts'])(
    'allows leave in %s',
    (status) => expect(canLeaveBattleStatus(status)).toBe(true),
  );

  it.each(['resolving', 'result_ready', 'generating_video', 'completed'])(
    'hides leave while %s',
    (status) => expect(canLeaveBattleStatus(status)).toBe(false),
  );

  it('names cancel, ranked forfeit and ordinary leave explicitly', () => {
    expect(
      leaveActionLabel({
        status: 'created',
        mode: 'ranked',
        isBot: false,
        hasOpponent: false,
      }),
    ).toBe('Cancel search');
    expect(
      leaveActionLabel({
        status: 'matched',
        mode: 'ranked',
        isBot: false,
        hasOpponent: true,
      }),
    ).toBe('Forfeit');
    expect(
      leaveActionLabel({
        status: 'matched',
        mode: 'bot',
        isBot: true,
        hasOpponent: true,
      }),
    ).toBe('Leave');
  });
});
