import {
  AuthNotices,
  MIN_PASSWORD_LENGTH,
  PASSWORD_RESET_REDIRECT,
  classifyAuthError,
  describeAuthError,
  parseRecoveryLink,
  signUpOutcome,
  validateEmail,
  validateNewPassword,
  validatePasswordConfirmation,
  validateSignInPassword,
} from '@/utils/authCopy';

/** A GoTrue-shaped error: `code` on modern servers, prose on older ones. */
function authError(message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), extra);
}

describe('classifyAuthError / describeAuthError', () => {
  it('maps invalid credentials by code and by prose', () => {
    expect(
      classifyAuthError(
        authError('Invalid login credentials', { code: 'invalid_credentials' }),
      ),
    ).toBe('invalid_credentials');
    expect(classifyAuthError(authError('Invalid login credentials'))).toBe(
      'invalid_credentials',
    );
    expect(
      describeAuthError(authError('Invalid login credentials')).message,
    ).toBe('Email or password didn’t match. Try again or create an account.');
  });

  it('maps an unconfirmed email', () => {
    const copy = describeAuthError(
      authError('Email not confirmed', {
        code: 'email_not_confirmed',
        status: 400,
      }),
    );
    expect(copy.message).toBe('Confirm your email first — check your inbox.');
  });

  it('maps rate limits by status, code or prose', () => {
    expect(classifyAuthError(authError('anything', { status: 429 }))).toBe(
      'rate_limited',
    );
    expect(
      classifyAuthError(authError('x', { code: 'over_email_send_rate_limit' })),
    ).toBe('rate_limited');
    expect(
      classifyAuthError(
        authError(
          'For security purposes, you can only request this after 47 seconds.',
        ),
      ),
    ).toBe('rate_limited');
    expect(describeAuthError(authError('x', { status: 429 })).message).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
  });

  it('treats a failed fetch as offline, before anything else', () => {
    expect(classifyAuthError(new TypeError('Network request failed'))).toBe(
      'network',
    );
    expect(
      classifyAuthError(
        authError('x', { name: 'AuthRetryableFetchError', status: 0 }),
      ),
    ).toBe('network');
    expect(describeAuthError(new TypeError('Failed to fetch')).message).toBe(
      'You’re offline. Check your connection.',
    );
  });

  it('maps an existing account and a weak password', () => {
    expect(classifyAuthError(authError('User already registered'))).toBe(
      'user_exists',
    );
    expect(
      describeAuthError(authError('x', { code: 'user_already_exists' }))
        .message,
    ).toBe('That email already has an account. Sign in instead.');
    expect(
      classifyAuthError(authError('Password should be at least 6 characters')),
    ).toBe('weak_password');
  });

  it('falls back to generic copy and never leaks the raw message', () => {
    const copy = describeAuthError(
      authError('relation "auth.users" does not exist'),
    );
    expect(copy.message).toBe('Something went wrong. Please try again.');
    expect(copy.message).not.toContain('auth.users');
    expect(classifyAuthError(null)).toBe('unknown');
    expect(classifyAuthError('a string')).toBe('unknown');
  });

  it('uses typographic apostrophes and no ASCII ellipsis anywhere', () => {
    const kinds = [
      'invalid_credentials',
      'email_not_confirmed',
      'rate_limited',
      'network',
      'user_exists',
      'weak_password',
      'same_password',
      'invalid_email',
      'unknown',
    ] as const;
    for (const kind of kinds) {
      const copy = describeAuthError(authError('x', { code: kind }));
      expect(`${copy.title} ${copy.message}`).not.toMatch(/'|\.\.\./);
    }
    for (const notice of Object.values(AuthNotices)) {
      expect(notice).not.toMatch(/'|\.\.\./);
    }
  });
});

describe('field validation', () => {
  it('validates email shape only loosely', () => {
    expect(validateEmail('')).toBe('Enter your email.');
    expect(validateEmail('   ')).toBe('Enter your email.');
    expect(validateEmail('name@')).toBe(
      'That doesn’t look like an email address.',
    );
    expect(validateEmail('name@domain')).toBe(
      'That doesn’t look like an email address.',
    );
    expect(validateEmail(' name@domain.gg ')).toBeNull();
  });

  it('enforces the length floor only for new passwords', () => {
    expect(validateNewPassword('')).toBe('Enter a password.');
    expect(validateNewPassword('short7!')).toBe(
      `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
    expect(validateNewPassword('longenough')).toBeNull();
    // A legacy 6-character password must still be able to sign in.
    expect(validateSignInPassword('abc123')).toBeNull();
    expect(validateSignInPassword('')).toBe('Enter your password.');
  });

  it('checks the confirmation matches', () => {
    expect(validatePasswordConfirmation('longenough', '')).toBe(
      'Confirm your new password.',
    );
    expect(validatePasswordConfirmation('longenough', 'longenouhg')).toBe(
      'Passwords don’t match.',
    );
    expect(validatePasswordConfirmation('longenough', 'longenough')).toBeNull();
  });
});

describe('signUpOutcome', () => {
  it('reads an empty identities array as an existing account', () => {
    expect(signUpOutcome({ user: { identities: [] }, session: null })).toBe(
      'existing_account',
    );
  });

  it('reads user-without-session as needing email confirmation', () => {
    expect(signUpOutcome({ user: { identities: [{}] }, session: null })).toBe(
      'confirm_email',
    );
    expect(signUpOutcome(null)).toBe('confirm_email');
  });

  it('reads a session as signed in', () => {
    expect(signUpOutcome({ user: { identities: [{}] }, session: {} })).toBe(
      'signed_in',
    );
  });
});

describe('parseRecoveryLink', () => {
  it('reads implicit-flow tokens from the fragment', () => {
    const link = parseRecoveryLink(
      `${PASSWORD_RESET_REDIRECT}#access_token=AAA&expires_in=3600&refresh_token=RRR&token_type=bearer&type=recovery`,
    );
    expect(link).toEqual({
      kind: 'tokens',
      accessToken: 'AAA',
      refreshToken: 'RRR',
    });
  });

  it('reads a PKCE code from the query', () => {
    expect(
      parseRecoveryLink(`${PASSWORD_RESET_REDIRECT}?code=abc-123`),
    ).toEqual({
      kind: 'code',
      code: 'abc-123',
    });
  });

  it('accepts type=recovery on any path', () => {
    expect(
      parseRecoveryLink(
        'promptwars://#access_token=A&refresh_token=R&type=recovery',
      ),
    ).toEqual({ kind: 'tokens', accessToken: 'A', refreshToken: 'R' });
  });

  it('ignores links that are not ours or are incomplete', () => {
    expect(parseRecoveryLink(null)).toBeNull();
    expect(parseRecoveryLink('promptwars://result?battleId=1')).toBeNull();
    expect(
      parseRecoveryLink(`${PASSWORD_RESET_REDIRECT}#access_token=A`),
    ).toBeNull();
    expect(parseRecoveryLink(PASSWORD_RESET_REDIRECT)).toBeNull();
  });

  it('decodes percent-encoded values', () => {
    const link = parseRecoveryLink(
      `${PASSWORD_RESET_REDIRECT}#access_token=a%2Fb&refresh_token=c%3Dd`,
    );
    expect(link).toEqual({
      kind: 'tokens',
      accessToken: 'a/b',
      refreshToken: 'c=d',
    });
  });
});
