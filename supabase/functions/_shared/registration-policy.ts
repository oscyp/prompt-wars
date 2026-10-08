/** Policy decisions contain no provider credentials or persistable birth date. */
export interface JurisdictionPolicy {
  id?: string;
  country: string;
  subdivision: string;
  version: string;
  approved_at: string | null;
  minimum_age: number;
  independent_consent_age: number;
  requires_subdivision: boolean;
  assurance: 'declared' | 'verified';
  teen_purchases: boolean;
  processing_allowed: boolean;
}

export class RegistrationError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export function parseRegion(country: unknown, subdivision: unknown = '') {
  const c = typeof country === 'string' ? country.trim().toUpperCase() : '';
  const s =
    typeof subdivision === 'string' ? subdivision.trim().toUpperCase() : '';
  if (
    !/^[A-Z]{2}$/.test(c) ||
    (s && !new RegExp(`^${c}-[A-Z0-9]{1,3}$`).test(s))
  ) {
    throw new RegistrationError('invalid_region');
  }
  return { country: c, subdivision: s };
}

export function ageAtDate(birthDate: unknown, now: Date): number {
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new RegistrationError('invalid_birth_date');
  }
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (
    !Number.isFinite(birth.getTime()) ||
    birth.toISOString().slice(0, 10) !== birthDate ||
    birth > now
  ) {
    throw new RegistrationError('invalid_birth_date');
  }
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.toISOString().slice(5, 10) < birthDate.slice(5)) age--;
  if (age > 120) throw new RegistrationError('invalid_birth_date');
  return age;
}

export type RegistrationAssessment = {
  status:
    | 'eligible'
    | 'underage'
    | 'region_unavailable'
    | 'consent_required'
    | 'assurance_required';
  age: number;
  nextBirthday: string;
  canPurchase: boolean;
};

export function assessRegistration(
  birthDate: unknown,
  policy: JurisdictionPolicy | null,
  now = new Date(),
): RegistrationAssessment {
  const age = ageAtDate(birthDate, now);
  const birthday = (birthDate as string).slice(5);
  const thisYear = `${now.getUTCFullYear()}-${birthday}`;
  const year =
    now.getUTCFullYear() + (thisYear <= now.toISOString().slice(0, 10) ? 1 : 0);
  // Feb 29 moves to March 1 in a non-leap year; never mature a player early.
  const nextBirthday = new Date(`${year}-${birthday}T00:00:00Z`)
    .toISOString()
    .slice(0, 10);
  const base = { age, nextBirthday, canPurchase: false };
  if (age < Math.max(13, policy?.minimum_age ?? 13))
    return { ...base, status: 'underage' };
  if (
    !policy?.approved_at ||
    !policy.processing_allowed ||
    !policy.version ||
    !Number.isInteger(policy.independent_consent_age) ||
    policy.independent_consent_age < 13
  ) {
    return { ...base, status: 'region_unavailable' };
  }
  if (policy.assurance !== 'declared')
    return { ...base, status: 'assurance_required' };
  if (age < policy.independent_consent_age)
    return { ...base, status: 'consent_required' };
  return {
    ...base,
    status: 'eligible',
    canPurchase: age >= 18 || policy.teen_purchases,
  };
}

export async function digestRegistrationSecret(value: string): Promise<string> {
  const data = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(data), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
