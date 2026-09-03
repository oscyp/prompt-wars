/**
 * Every sentence the wallet, shop, stats and blocked screens compose from
 * `utils/walletView.ts`, pinned so a copy change is a deliberate one.
 */
import {
  BALANCE_POLL_DELAYS_MS,
  COSMETIC_ERROR_COPY,
  COSMETIC_ERROR_FALLBACK,
  allowanceLabel,
  alsoEarnHint,
  autoRenewDisclosure,
  blockedAtLabel,
  buyAccessibilityLabel,
  cosmeticErrorMessage,
  earnOrBuyHint,
  lockedHint,
  restoreOutcomeFor,
  shortDate,
  subscriptionManageUrl,
  subscriptionRenewalLabel,
  unlockHint,
  winRateLabel,
  type UnlockRule,
} from '@/utils/walletView';

describe('unlockHint', () => {
  it('returns the bare condition, never a prefixed sentence', () => {
    expect(unlockHint({ wins: 25 })).toBe('25 wins');
    expect(unlockHint({ wins: 1 })).toBe('1 win');
    expect(unlockHint({ total_battles: 50 })).toBe('50 battles');
    expect(unlockHint({ level: 5 })).toBe('level 5');
    expect(unlockHint({ best_streak: 3 })).toBe('a 3-win streak');
    expect(unlockHint({ daily_login_streak: 3 })).toBe('a 3-day login streak');
  });

  it('falls back to "play" for null or unknown rules', () => {
    expect(unlockHint(null)).toBe('play');
    expect(unlockHint(undefined)).toBe('play');
    expect(unlockHint({ something_new: 4 })).toBe('play');
  });

  it('never carries the old "Unlock:" prefix', () => {
    const rules: UnlockRule[] = [{ wins: 25 }, { level: 2 }, null];
    for (const rule of rules) {
      expect(unlockHint(rule)).not.toMatch(/Unlock/);
    }
  });
});

describe('unlock hint composition', () => {
  // The regression: "Free at: Unlock: 25 wins — or buy it now".
  it('composes the earn-or-buy line once', () => {
    expect(earnOrBuyHint({ wins: 25 })).toBe('Free at 25 wins — or buy it now');
    expect(earnOrBuyHint(null)).toBe('Free through play — or buy it now');
    expect(earnOrBuyHint({ wins: 25 })).not.toMatch(/:/);
  });

  it('names the free route in the purchase confirmation', () => {
    expect(alsoEarnHint({ level: 5 })).toBe('You can also earn it: level 5');
    expect(alsoEarnHint(null)).toBe('You can also earn it through play');
  });

  it('labels a locked, unbuyable item', () => {
    expect(lockedHint({ best_streak: 3 })).toBe('Unlocks at a 3-win streak');
    expect(lockedHint(null)).toBe('Earned through play');
  });

  it('reads the Buy button aloud with the price in sentence form', () => {
    expect(
      buyAccessibilityLabel({
        name: 'Champion',
        price: 25,
        earnable: true,
        rule: { wins: 25 },
      }),
    ).toBe('Buy Champion for 25 credits, or earn it: 25 wins');
    expect(
      buyAccessibilityLabel({
        name: 'Neon',
        price: 1,
        earnable: false,
        rule: null,
      }),
    ).toBe('Buy Neon for 1 credit');
  });
});

describe('cosmeticErrorMessage', () => {
  it('maps every known server code to player copy', () => {
    for (const code of [
      'not_purchasable',
      'already_owned',
      'type_mismatch',
      'not_your_character',
      'not_owned',
    ]) {
      const message = cosmeticErrorMessage(code);
      expect(message).toBe(COSMETIC_ERROR_COPY[code]);
      expect(message).not.toMatch(/_/);
    }
  });

  it('falls back to a generic sentence, never the raw code', () => {
    expect(cosmeticErrorMessage('some_new_code')).toBe(COSMETIC_ERROR_FALLBACK);
    expect(cosmeticErrorMessage(undefined)).toBe(COSMETIC_ERROR_FALLBACK);
    expect(cosmeticErrorMessage('')).toBe(COSMETIC_ERROR_FALLBACK);
    expect(COSMETIC_ERROR_FALLBACK).toBe('Something went wrong. Try again.');
  });
});

describe('subscription copy', () => {
  it('formats the renewal date in the device locale', () => {
    const label = subscriptionRenewalLabel({
      expirationDate: '2026-10-03T12:00:00Z',
      willRenew: true,
    });
    expect(label).toMatch(/^Renews .*2026$/);
  });

  it('says Expires when auto-renew is off', () => {
    expect(
      subscriptionRenewalLabel({
        expirationDate: '2026-10-03T12:00:00Z',
        willRenew: false,
      }),
    ).toMatch(/^Expires /);
  });

  it('is null without a date or with garbage', () => {
    expect(subscriptionRenewalLabel(null)).toBeNull();
    expect(
      subscriptionRenewalLabel({ expirationDate: null, willRenew: true }),
    ).toBeNull();
    expect(
      subscriptionRenewalLabel({ expirationDate: 'nope', willRenew: true }),
    ).toBeNull();
    expect(shortDate('not a date')).toBeNull();
  });

  it('points each platform at its own subscription management page', () => {
    expect(subscriptionManageUrl('ios')).toBe(
      'https://apps.apple.com/account/subscriptions',
    );
    expect(subscriptionManageUrl('android')).toBe(
      'https://play.google.com/store/account/subscriptions',
    );
  });

  it('discloses auto-renewal with the store price when known', () => {
    expect(autoRenewDisclosure('$9.99')).toBe(
      'Renews automatically at $9.99/month until cancelled in your store account settings.',
    );
    expect(autoRenewDisclosure(null)).toMatch(/the monthly price/);
  });
});

describe('restoreOutcomeFor', () => {
  it('is restored when Plus is active', () => {
    expect(restoreOutcomeFor({ entitlements: { active: { plus: {} } } })).toBe(
      'restored',
    );
  });

  it('is restored when any product was ever bought', () => {
    expect(
      restoreOutcomeFor({
        entitlements: { active: {} },
        allPurchasedProductIdentifiers: ['credits_30'],
      }),
    ).toBe('restored');
  });

  it('is nothing for an empty account', () => {
    expect(
      restoreOutcomeFor({
        entitlements: { active: {} },
        allPurchasedProductIdentifiers: [],
      }),
    ).toBe('nothing');
    expect(restoreOutcomeFor(null)).toBe('nothing');
  });
});

describe('wallet and stats labels', () => {
  it('polls at widening intervals', () => {
    expect([...BALANCE_POLL_DELAYS_MS]).toEqual([2000, 5000, 10000]);
  });

  it('pluralises the allowance and never says "0 remaining"', () => {
    expect(allowanceLabel(30)).toBe('30 video reveals left this month');
    expect(allowanceLabel(1)).toBe('1 video reveal left this month');
    expect(allowanceLabel(0)).toBe('No video reveals left this month');
  });

  it('shows a dash rather than 0% before the first battle', () => {
    expect(winRateLabel(0, 0)).toBe('—');
    expect(winRateLabel(5, 8)).toBe('62.5%');
    expect(winRateLabel(4, 4)).toBe('100%');
    expect(winRateLabel(0, 3)).toBe('0%');
  });

  it('dates a block', () => {
    expect(blockedAtLabel('2026-08-12T09:00:00Z')).toMatch(/^Blocked .*2026$/);
    expect(blockedAtLabel(null)).toBeNull();
  });
});
