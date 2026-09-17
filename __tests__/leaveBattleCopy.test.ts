import { leaveDialogCopy } from '@/utils/battles';

test.each([false, true])(
  'ranked human forfeit is a free series loss, locked=%s',
  (isLocked) => {
    const copy = leaveDialogCopy({
      format: 'bo3',
      mode: 'ranked',
      isBot: false,
      isLocked,
      price: 99,
    });
    expect(copy.title).toBe('Forfeit series?');
    expect(copy.message).toContain('ranked loss');
    expect(copy.message).toContain('free');
    expect(copy.message).not.toContain('99');
  },
);
test.each(['bot', 'unranked'] as const)(
  'canceling %s never charges or promises a ranked loss',
  (mode) => {
    const copy = leaveDialogCopy({
      format: 'bo3',
      mode,
      isBot: mode === 'bot',
      isLocked: true,
      price: 99,
    });
    expect(copy.title).toBe('Cancel battle?');
    expect(copy.message).toContain('free');
    expect(copy.message).not.toContain('ranked loss');
  },
);
