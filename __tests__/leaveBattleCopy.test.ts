/**
 * The confirm dialog before someone leaves a battle.
 *
 * The free-path strings are asserted byte-for-byte on purpose. They shipped
 * long before the credit toll existed and players have learned them; adding a
 * paid case must not quietly reword the free ones.
 */
import { leaveDialogCopy } from '@/utils/battles';

const PRICE = 2;

describe('leaveDialogCopy — free, before this player locks', () => {
  it('keeps the ranked forfeit wording exactly', () => {
    expect(
      leaveDialogCopy({
        format: 'single',
        mode: 'ranked',
        isBot: false,
        isLocked: false,
        price: PRICE,
      }),
    ).toEqual({
      title: 'Forfeit Ranked Battle?',
      message:
        'This will count as a ranked loss and award the win to your opponent.',
      confirmLabel: 'Forfeit',
    });
  });

  it('keeps the cancel wording exactly', () => {
    expect(
      leaveDialogCopy({
        format: 'single',
        mode: 'unranked',
        isBot: false,
        isLocked: false,
        price: PRICE,
      }),
    ).toEqual({
      title: 'Leave Battle?',
      message: 'This will cancel the battle before prompt lock.',
      confirmLabel: 'Leave',
    });
  });

  it('treats a ranked bot battle as a cancel, not a forfeit', () => {
    const copy = leaveDialogCopy({
      format: 'single',
      mode: 'ranked',
      isBot: true,
      isLocked: false,
      price: PRICE,
    });
    expect(copy.title).toBe('Leave Battle?');
  });

  it('never mentions a price', () => {
    for (const mode of ['ranked', 'unranked'] as const) {
      const copy = leaveDialogCopy({
        format: 'single',
        mode,
        isBot: false,
        isLocked: false,
        price: PRICE,
      });
      expect(copy.message).not.toMatch(/credit/i);
      expect(copy.title).not.toMatch(/credit/i);
    }
  });
});

describe('leaveDialogCopy — paid, after this player locks', () => {
  it('states the cost in prose form, never the chip form', () => {
    const copy = leaveDialogCopy({
      format: 'single',
      mode: 'ranked',
      isBot: false,
      isLocked: true,
      price: PRICE,
    });
    expect(copy.message).toContain('2 credits');
    // 'chip' style ("2 cr") belongs in buttons, not dialogs.
    expect(copy.message).not.toContain('2 cr.');
    expect(copy.message).not.toMatch(/\b2 cr\b/);
  });

  it('keeps the price out of the title', () => {
    const copy = leaveDialogCopy({
      format: 'single',
      mode: 'ranked',
      isBot: false,
      isLocked: true,
      price: PRICE,
    });
    expect(copy.title).toBe('Forfeit and leave?');
    expect(copy.title).not.toMatch(/credit/i);
  });

  it('says the whole series is lost in bo3', () => {
    const copy = leaveDialogCopy({
      format: 'bo3',
      mode: 'ranked',
      isBot: false,
      isLocked: true,
      price: PRICE,
    });
    expect(copy.title).toBe('Forfeit the series?');
    expect(copy.message).toContain('the whole series');
  });

  it('does not say "series" for a single battle', () => {
    const copy = leaveDialogCopy({
      format: 'single',
      mode: 'ranked',
      isBot: false,
      isLocked: true,
      price: PRICE,
    });
    expect(copy.message).not.toContain('series');
  });

  it('warns about rating only in ranked human battles', () => {
    const ranked = leaveDialogCopy({
      format: 'single',
      mode: 'ranked',
      isBot: false,
      isLocked: true,
      price: PRICE,
    });
    expect(ranked.message).toContain('Your rating will drop.');

    const bot = leaveDialogCopy({
      format: 'single',
      mode: 'ranked',
      isBot: true,
      isLocked: true,
      price: PRICE,
    });
    expect(bot.message).not.toContain('rating');

    const casual = leaveDialogCopy({
      format: 'single',
      mode: 'unranked',
      isBot: false,
      isLocked: true,
      price: PRICE,
    });
    expect(casual.message).not.toContain('rating');
  });

  it('charges for a bot battle too, once a prompt is locked', () => {
    // Leaving a bot match is a cancel, not a forfeit — but the arena was still
    // used, so the toll applies.
    const copy = leaveDialogCopy({
      format: 'single',
      mode: 'bot',
      isBot: true,
      isLocked: true,
      price: PRICE,
    });
    expect(copy.message).toContain('2 credits');
  });

  it('pluralizes a one-credit price correctly', () => {
    const copy = leaveDialogCopy({
      format: 'single',
      mode: 'ranked',
      isBot: false,
      isLocked: true,
      price: 1,
    });
    expect(copy.message).toContain('1 credit.');
    expect(copy.message).not.toContain('1 credits');
  });
});
