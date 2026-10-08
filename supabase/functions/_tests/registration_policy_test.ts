import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assessRegistration,
  ageAtDate,
  parseRegion,
  type JurisdictionPolicy,
} from '../_shared/registration-policy.ts';

const now = new Date('2026-09-22T12:00:00Z');
const policy: JurisdictionPolicy = {
  country: 'PL',
  subdivision: '',
  version: 'test-reviewed',
  approved_at: '2026-09-01',
  minimum_age: 13,
  independent_consent_age: 16,
  requires_subdivision: false,
  assurance: 'declared',
  teen_purchases: false,
  processing_allowed: true,
};
Deno.test(
  'age uses the birthday, including future and impossible-date rejection',
  () => {
    assertEquals(ageAtDate('2013-09-22', now), 13);
    assertEquals(ageAtDate('2013-09-23', now), 12);
    assertEquals(ageAtDate('2000-02-29', now), 26);
    for (const date of ['2027-01-01', '2013-02-29', 'not-a-date', '13-09-22']) {
      assertThrows(() => ageAtDate(date, now));
    }
  },
);
Deno.test('missing and unreviewed policies never permit signup', () => {
  assertEquals(
    assessRegistration('2000-01-01', null, now).status,
    'region_unavailable',
  );
  assertEquals(
    assessRegistration('2010-01-01', { ...policy, approved_at: null }, now)
      .status,
    'region_unavailable',
  );
  assertEquals(
    assessRegistration(
      '2000-01-01',
      { ...policy, processing_allowed: false },
      now,
    ).status,
    'region_unavailable',
  );
});
Deno.test('minimum age cannot be weakened by a country policy', () => {
  assertEquals(
    assessRegistration('2014-01-01', { ...policy, minimum_age: 10 }, now)
      .status,
    'underage',
  );
});
Deno.test(
  'country consent boundary is enforced and purchase permission is independent',
  () => {
    const younger = assessRegistration('2011-09-22', policy, now);
    assertEquals(younger.status, 'consent_required');
    const independentTeen = assessRegistration('2010-09-22', policy, now);
    assertEquals(independentTeen.status, 'eligible');
    assertEquals(independentTeen.canPurchase, false);
    assertEquals(
      assessRegistration('2008-09-22', policy, now).canPurchase,
      true,
    );
    assertEquals(
      assessRegistration(
        '2010-09-22',
        { ...policy, assurance: 'verified' },
        now,
      ).status,
      'assurance_required',
    );
  },
);
Deno.test(
  'region validation rejects vague countries and malformed subdivisions',
  () => {
    assertEquals(parseRegion('pl', ''), { country: 'PL', subdivision: '' });
    assertEquals(parseRegion('US', 'US-CA'), {
      country: 'US',
      subdivision: 'US-CA',
    });
    for (const [country, subdivision] of [
      ['worldwide', ''],
      ['US', 'PL-MA'],
      ['US', '../CA'],
    ]) {
      assertThrows(() => parseRegion(country, subdivision));
    }
  },
);
