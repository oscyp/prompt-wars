/**
 * Pure helpers for the auth screens: error copy, field validation, sign-up
 * outcome detection and password-recovery link parsing.
 *
 * Supabase's auth errors are written for developers ("Invalid login
 * credentials", "For security purposes, you can only request this after 47
 * seconds"). The sign-in and sign-up screens used to surface them verbatim.
 * Everything here is pure so the copy can be pinned by tests and the screens
 * stay free of string matching.
 */

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'network'
  | 'user_exists'
  | 'weak_password'
  | 'same_password'
  | 'invalid_email'
  | 'unknown';

export interface AuthErrorCopy {
  title: string;
  message: string;
}

export const MIN_PASSWORD_LENGTH = 8;

/** Deep link Supabase sends the player back to from a password-reset email. */
export const PASSWORD_RESET_REDIRECT = 'promptwars://reset-password';

/** Transient confirmations shown as toasts on the auth screens. */
export const AuthNotices = {
  resetEmailSent: 'Check your inbox for a reset link.',
  confirmationResent: 'Confirmation email sent. Check your inbox.',
  passwordUpdated: 'Password updated. Sign in with your new password.',
  forgotNeedsEmail: 'Enter your email above, then tap Forgot password.',
} as const;

/** Route param the reset screen hands to sign-in so it can show the toast. */
export const PASSWORD_UPDATED_NOTICE = 'password-updated';

const COPY: Record<AuthErrorKind, AuthErrorCopy> = {
  invalid_credentials: {
    title: 'Couldn’t sign in',
    message: 'Email or password didn’t match. Try again or create an account.',
  },
  email_not_confirmed: {
    title: 'Confirm your email',
    message: 'Confirm your email first — check your inbox.',
  },
  rate_limited: {
    title: 'Too many attempts',
    message: 'Too many attempts. Wait a minute and try again.',
  },
  network: {
    title: 'You’re offline',
    message: 'You’re offline. Check your connection.',
  },
  user_exists: {
    title: 'Account already exists',
    message: 'That email already has an account. Sign in instead.',
  },
  weak_password: {
    title: 'Choose a stronger password',
    message: `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`,
  },
  same_password: {
    title: 'Same password',
    message: 'Choose a password you haven’t used before.',
  },
  invalid_email: {
    title: 'Check your email address',
    message: 'That doesn’t look like an email address.',
  },
  unknown: {
    title: 'Something went wrong',
    message: 'Something went wrong. Please try again.',
  },
};

interface ErrorShape {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
}

/**
 * Sort a thrown auth error into a kind the screens can act on.
 *
 * Matches on Supabase's machine-readable `code` first and falls back to the
 * message for older GoTrue versions that sent prose only. Network failures are
 * checked before everything else because they arrive as plain `TypeError`s
 * with no code at all.
 */
export function classifyAuthError(err: unknown): AuthErrorKind {
  const e: ErrorShape =
    err && typeof err === 'object' ? (err as ErrorShape) : {};
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' ? e.status : undefined;
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  const name = typeof e.name === 'string' ? e.name : '';

  if (
    name === 'AuthRetryableFetchError' ||
    status === 0 ||
    /network request failed|failed to fetch|network error|networkerror/.test(
      message,
    )
  ) {
    return 'network';
  }
  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    code === 'over_sms_send_rate_limit' ||
    status === 429 ||
    /rate limit|too many requests|only request this after/.test(message)
  ) {
    return 'rate_limited';
  }
  if (
    code === 'invalid_credentials' ||
    /invalid login credentials/.test(message)
  ) {
    return 'invalid_credentials';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/.test(message)) {
    return 'email_not_confirmed';
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    /already registered|already been registered|already exists/.test(message)
  ) {
    return 'user_exists';
  }
  if (
    code === 'weak_password' ||
    /password should be at least|password is too weak|weak password/.test(
      message,
    )
  ) {
    return 'weak_password';
  }
  if (
    code === 'same_password' ||
    /different from the old password/.test(message)
  ) {
    return 'same_password';
  }
  if (
    code === 'validation_failed' ||
    /unable to validate email|invalid email|invalid format/.test(message)
  ) {
    return 'invalid_email';
  }
  return 'unknown';
}

/** Player-facing copy for a failed auth call. Never returns the raw message. */
export function describeAuthError(err: unknown): AuthErrorCopy {
  return COPY[classifyAuthError(err)];
}

// Deliberately loose: the server is the authority on deliverability. This only
// catches the typo class ("name@", "name@domain") before a round trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Inline error for the email field, or null when it looks usable. */
export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Enter your email.';
  if (!EMAIL_RE.test(trimmed))
    return 'That doesn’t look like an email address.';
  return null;
}

/**
 * Inline error for a NEW password (sign-up, reset), or null.
 *
 * Sign-in must not use this: the length floor only applies when a password is
 * being set, and an account created under an older, shorter minimum still has
 * to be able to sign in.
 */
export function validateNewPassword(password: string): string | null {
  if (!password) return 'Enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/** Inline error for the sign-in password field: presence only. */
export function validateSignInPassword(password: string): string | null {
  return password ? null : 'Enter your password.';
}

/** Inline error for the confirm field on the reset screen, or null. */
export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): string | null {
  if (!confirmation) return 'Confirm your new password.';
  if (password !== confirmation) return 'Passwords don’t match.';
  return null;
}

export type SignUpOutcome = 'signed_in' | 'confirm_email' | 'existing_account';

interface SignUpData {
  user?: { identities?: unknown[] | null } | null;
  session?: unknown | null;
}

/**
 * What a successful `signUp` call actually means.
 *
 * With email confirmation on, Supabase returns a user and NO session, and the
 * old screen simply waited for a redirect that never came. With confirmation
 * on and an email that already has an account, it returns a user with an empty
 * `identities` array instead of an error (to avoid leaking who has signed up),
 * which the screen must read as "sign in instead".
 */
export function signUpOutcome(
  data: SignUpData | null | undefined,
): SignUpOutcome {
  const identities = data?.user?.identities;
  if (data?.user && Array.isArray(identities) && identities.length === 0) {
    return 'existing_account';
  }
  if (data?.session) return 'signed_in';
  return 'confirm_email';
}

export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string };

function parseParams(segment: string, into: Map<string, string>): void {
  for (const pair of segment.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    try {
      into.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue));
    } catch {
      into.set(rawKey, rawValue);
    }
  }
}

/**
 * Pull the session out of a password-recovery deep link.
 *
 * The Supabase client runs with `detectSessionInUrl: false` (there is no
 * browser URL to detect on native), so the app has to read the link itself.
 * Under the default implicit flow the tokens arrive in the fragment
 * (`promptwars://reset-password#access_token=…&refresh_token=…&type=recovery`);
 * under PKCE they arrive as `?code=…`. Anything that is neither a reset-password
 * path nor `type=recovery` is not ours and returns null.
 */
export function parseRecoveryLink(
  url: string | null | undefined,
): RecoveryLink | null {
  if (!url) return null;
  const hashAt = url.indexOf('#');
  const queryAt = url.indexOf('?');
  const cut = [hashAt, queryAt].filter((i) => i >= 0);
  const pathEnd = cut.length > 0 ? Math.min(...cut) : url.length;
  const path = url.slice(0, pathEnd).toLowerCase();

  const params = new Map<string, string>();
  if (queryAt >= 0) {
    const end = hashAt > queryAt ? hashAt : url.length;
    parseParams(url.slice(queryAt + 1, end), params);
  }
  if (hashAt >= 0) {
    const end = queryAt > hashAt ? queryAt : url.length;
    parseParams(url.slice(hashAt + 1, end), params);
  }

  const isRecovery =
    path.includes('reset-password') || params.get('type') === 'recovery';
  if (!isRecovery) return null;

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken };
  }
  const code = params.get('code');
  if (code) return { kind: 'code', code };
  return null;
}
