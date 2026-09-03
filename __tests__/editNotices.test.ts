/**
 * One banner at a time, in a fixed priority. Getting the order wrong hides a
 * battle lock behind a pricing hiccup.
 */
import {
  mergeEditNotices,
  compactStatusLabel,
} from '@/components/edit-character/editNotices';

const onRetryPricing = jest.fn();
const onRetryAvatar = jest.fn();

function merge(over: Partial<Parameters<typeof mergeEditNotices>[0]> = {}) {
  return mergeEditNotices({
    battleLocked: false,
    pricingVerified: true,
    avatarPending: false,
    canRetryAvatar: false,
    onRetryPricing,
    onRetryAvatar,
    ...over,
  });
}

describe('mergeEditNotices', () => {
  it('is null when nothing is wrong', () => {
    expect(merge()).toBeNull();
  });

  it('merges the battle lock and the pricing failure into one warning with Retry', () => {
    const notice = merge({ battleLocked: true, pricingVerified: false });
    expect(notice).toEqual({
      tone: 'warning',
      text: "Editing is locked during a battle, and credit prices couldn't be checked.",
      actionLabel: 'Retry',
      onAction: onRetryPricing,
    });
  });

  it('states the battle lock alone without an action', () => {
    expect(merge({ battleLocked: true })).toEqual({
      tone: 'warning',
      text: 'Editing is unavailable while this fighter is in an active battle.',
    });
  });

  it('reports the pricing failure as an error with Retry', () => {
    expect(merge({ pricingVerified: false })).toEqual({
      tone: 'error',
      text: "Couldn't check credit prices, so paid actions are paused.",
      actionLabel: 'Retry',
      onAction: onRetryPricing,
    });
  });

  it('offers the free avatar retry only when the server can honour it', () => {
    expect(merge({ avatarPending: true, canRetryAvatar: true })).toEqual({
      tone: 'warning',
      text: 'Your avatar didn’t render. Retry free.',
      actionLabel: 'Retry',
      onAction: onRetryAvatar,
    });
    expect(merge({ avatarPending: true, canRetryAvatar: false })).toEqual({
      tone: 'warning',
      text: 'Your avatar didn’t render. It will be redrawn with your next look.',
    });
  });

  it('ranks battle lock over pricing over avatar', () => {
    expect(
      merge({ battleLocked: true, pricingVerified: false, avatarPending: true })
        ?.text,
    ).toMatch(/locked during a battle/);
    expect(merge({ pricingVerified: false, avatarPending: true })?.tone).toBe(
      'error',
    );
    expect(merge({ avatarPending: true })?.text).toMatch(/avatar/);
  });
});

describe('compactStatusLabel', () => {
  const base = {
    battleLocked: false,
    pricingVerified: true,
    avatarPending: false,
  };

  it('is null when nothing is wrong', () => {
    expect(compactStatusLabel(base)).toBeNull();
  });

  it('uses the same priority as the banner', () => {
    expect(
      compactStatusLabel({
        battleLocked: true,
        pricingVerified: false,
        avatarPending: true,
      }),
    ).toBe('Locked during battle');
    expect(
      compactStatusLabel({
        ...base,
        pricingVerified: false,
        avatarPending: true,
      }),
    ).toBe('Prices unavailable · Retry');
    expect(compactStatusLabel({ ...base, avatarPending: true })).toBe(
      'Avatar missing',
    );
  });
});
