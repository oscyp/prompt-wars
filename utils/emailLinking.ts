import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { supabase } from './supabase';
import { validateEmail, validateNewPassword } from './authCopy';
import {
  assertAuthOperationCurrent,
  AuthSessionChangedError,
  beginAuthOperation,
  commitLinkedSessionSafely,
  type AuthOperation,
} from './authSession';

export class EmailLinkingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EmailLinkingError';
  }
}

function safeError(error: unknown): Error {
  if (
    error instanceof EmailLinkingError ||
    error instanceof AuthSessionChangedError
  )
    return error;
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';
  if (
    ['email_exists', 'user_already_exists', 'identity_already_exists'].includes(
      code,
    )
  )
    return new EmailLinkingError(
      'identity_collision',
      'This email belongs to another account. Your current progress has not moved.',
    );
  if (code === 'otp_expired')
    return new EmailLinkingError(
      code,
      'The code is invalid or expired. Check it or request a new one.',
    );
  return new EmailLinkingError(
    'linking_failed',
    'Could not connect this email. Please try again.',
  );
}

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase();
  const error = validateEmail(email);
  if (error) throw new EmailLinkingError('invalid_email', error);
  return email;
}

function assertVerifiedEmail(user: User, email: string): void {
  if (
    user.is_anonymous !== false ||
    !user.email_confirmed_at ||
    user.email?.toLowerCase() !== email
  )
    throw new EmailLinkingError(
      'verification_required',
      'Verify your email before setting a password.',
    );
}

async function withAccount<T>(
  expectedUserId: string,
  operation: AuthOperation,
  work: (auth: SupabaseClient['auth'], session: Session) => Promise<T>,
): Promise<T> {
  assertAuthOperationCurrent(operation);
  const current = await supabase.auth.getSession();
  if (
    current.error ||
    !expectedUserId ||
    current.data.session?.user.id !== expectedUserId
  )
    throw new AuthSessionChangedError();
  assertAuthOperationCurrent(operation);
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `prompt-wars-email-link-${operation.revision}`,
      },
    },
  );
  try {
    const seeded = await client.auth.setSession({
      access_token: current.data.session.access_token,
      refresh_token: current.data.session.refresh_token,
    });
    if (seeded.error) throw seeded.error;
    if (
      seeded.data.session?.user.id !== expectedUserId ||
      seeded.data.user?.id !== expectedUserId
    )
      throw new AuthSessionChangedError();
    assertAuthOperationCurrent(operation);
    const result = await work(client.auth, seeded.data.session);
    assertAuthOperationCurrent(operation);
    return result;
  } catch (error) {
    throw safeError(error);
  } finally {
    await client.auth.stopAutoRefresh();
  }
}

/** Adds an email to this UUID; Supabase sends an email-change verification code. */
export function requestEmailLink(
  emailInput: string,
  expectedUserId: string,
  operation = beginAuthOperation(),
): Promise<User> {
  return withAccount(expectedUserId, operation, async (auth, session) => {
    const email = normalizedEmail(emailInput);
    const { data, error } = await auth.updateUser({ email });
    if (error) throw error;
    if (data.user?.id !== expectedUserId) throw new AuthSessionChangedError();
    await commitLinkedSessionSafely(
      { ...session, user: data.user },
      expectedUserId,
      operation,
      { requirePermanent: false },
    );
    return data.user;
  });
}

/** OTP exchange stays isolated until its account and verified email are checked. */
export function verifyEmailLink(
  emailInput: string,
  token: string,
  expectedUserId: string,
  operation = beginAuthOperation(),
): Promise<User> {
  return withAccount(expectedUserId, operation, async (auth) => {
    const email = normalizedEmail(emailInput);
    if (!/^\d{6,10}$/.test(token.trim()))
      throw new EmailLinkingError(
        'invalid_code',
        'Enter the verification code from your email.',
      );
    const { data, error } = await auth.verifyOtp({
      email,
      token: token.trim(),
      type: 'email_change',
    });
    if (error) throw error;
    if (
      !data.session ||
      data.user?.id !== expectedUserId ||
      data.session.user.id !== expectedUserId
    )
      throw new AuthSessionChangedError();
    assertVerifiedEmail(data.user, email);
    assertVerifiedEmail(data.session.user, email);
    return (
      await commitLinkedSessionSafely(data.session, expectedUserId, operation)
    ).user;
  });
}

/** Can be resumed after verification, including after restarting the app. */
export function setLinkedEmailPassword(
  password: string,
  emailInput: string,
  expectedUserId: string,
  operation = beginAuthOperation(),
): Promise<User> {
  return withAccount(expectedUserId, operation, async (auth, session) => {
    const email = normalizedEmail(emailInput);
    assertVerifiedEmail(session.user, email);
    const invalid = validateNewPassword(password);
    if (invalid) throw new EmailLinkingError('invalid_password', invalid);
    const { data, error } = await auth.updateUser({ password });
    if (error) throw error;
    if (data.user?.id !== expectedUserId) throw new AuthSessionChangedError();
    assertVerifiedEmail(data.user, email);
    return (
      await commitLinkedSessionSafely(
        { ...session, user: data.user },
        expectedUserId,
        operation,
      )
    ).user;
  });
}
