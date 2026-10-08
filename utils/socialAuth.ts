import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { createClient, type Session, type User } from '@supabase/supabase-js';
import { invokeAuthenticatedFunction, supabase } from '@/utils/supabase';
import {
  assertAuthOperationCurrent,
  beginAuthOperation,
  commitLinkedSessionSafely,
  signInWithIdTokenSafely,
  type AuthOperation,
} from './authSession';

export type SocialProvider = 'apple' | 'google';
export interface SocialCredential {
  provider: SocialProvider;
  idToken: string;
  nonce?: string;
  authorizationCode?: string;
  expectedUserId: string | null;
}
export class SocialAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SocialAuthError';
  }
}
export class RegistrationRequiredError extends SocialAuthError {
  constructor() {
    super('registration_required', 'Create an account to continue.');
    this.name = 'RegistrationRequiredError';
  }
}

// Load Nitro only after checking the rollout/platform. Existing binaries and web
// must remain usable before the new native module is built and configured.
function googleSdk() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Nitro must not initialize on web/older binaries.
  return require('react-native-nitro-google-signin') as typeof import('react-native-nitro-google-signin');
}

export async function getAvailableSocialProviders(): Promise<SocialProvider[]> {
  if (
    process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED !== '1' ||
    (Platform.OS !== 'ios' && Platform.OS !== 'android')
  )
    return [];

  const providers: SocialProvider[] = [];
  if (
    Platform.OS === 'ios' &&
    (await AppleAuthentication.isAvailableAsync().catch(() => false))
  ) {
    providers.push('apple');
  }
  if (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() &&
    (Platform.OS !== 'ios' ||
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim())
  ) {
    try {
      googleSdk();
      providers.push('google');
    } catch {
      // A JS update cannot add the native Google SDK to an older binary.
    }
  }
  return providers;
}

function errorCode(error: unknown): string | undefined {
  return error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

export function isSocialAuthCancelled(error: unknown): boolean {
  return ['ERR_REQUEST_CANCELED', 'SIGN_IN_CANCELLED', 'cancelled'].includes(
    errorCode(error) ?? '',
  );
}

function authError(error: unknown): SocialAuthError {
  if (error instanceof SocialAuthError) return error;
  const code = errorCode(error);
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : '';
  if (
    message.trim() === 'registration_required' ||
    (code === 'hook_error' && message.includes('registration_required'))
  )
    return new RegistrationRequiredError();
  if (code === 'session_changed')
    return new SocialAuthError(
      'session_changed',
      'Your sign-in request changed. Please try again.',
    );
  if (
    ['identity_already_exists', 'email_exists', 'user_already_exists'].includes(
      code ?? '',
    )
  ) {
    return new SocialAuthError(
      'identity_collision',
      'This sign-in method belongs to another account. Sign in to that account to use it.',
    );
  }
  if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
    return new SocialAuthError(
      'provider_unavailable',
      'Update Google Play services and try again.',
    );
  }
  // Provider errors can contain credential details. Keep error UI and logs free
  // of those details rather than forwarding native/network response messages.
  return new SocialAuthError(
    'authentication_failed',
    'Could not connect this sign-in method. Please try again.',
  );
}

async function readSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw authError(error);
  return data.session;
}

async function assertCurrentUser(
  expectedUserId: string | null,
): Promise<Session | null> {
  const session = await readSession();
  if ((session?.user.id ?? null) !== expectedUserId) {
    throw new SocialAuthError(
      'session_changed',
      'Your account changed. Please try again.',
    );
  }
  return session;
}

async function randomHex(bytes: number): Promise<string> {
  return Array.from(await Crypto.getRandomBytesAsync(bytes), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}

let acquiringCredential = false;
const credentialOperations = new WeakMap<SocialCredential, AuthOperation>();

function rememberCredential(
  credential: SocialCredential,
  operation: AuthOperation,
): SocialCredential {
  credentialOperations.set(credential, operation);
  return credential;
}

function currentCredentialOperation(
  credential: SocialCredential,
): AuthOperation {
  const operation = credentialOperations.get(credential);
  if (!operation)
    throw new SocialAuthError(
      'session_changed',
      'Request a new sign-in credential to continue.',
    );
  assertAuthOperationCurrent(operation);
  return operation;
}

/** Credentials are short lived and must stay in memory until registration/login. */
export async function acquireSocialCredential(
  provider: SocialProvider,
  authOperation?: AuthOperation,
): Promise<SocialCredential | null> {
  if (acquiringCredential)
    throw new SocialAuthError(
      'in_progress',
      'A sign-in request is already open.',
    );
  acquiringCredential = true;
  const operation = authOperation ?? beginAuthOperation();
  try {
    assertAuthOperationCurrent(operation);
    if (!(await getAvailableSocialProviders()).includes(provider)) {
      throw new SocialAuthError(
        'provider_unavailable',
        'This sign-in method is not available on this device.',
      );
    }
    const expectedUserId = (await readSession())?.user.id ?? null;
    assertAuthOperationCurrent(operation);
    const nonce = await randomHex(32);
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      nonce,
    );

    if (provider === 'apple') {
      const state = await randomHex(16);
      const credential = await AppleAuthentication.signInAsync({
        // Fighter names are chosen in the app; never import the person's name.
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
        state,
      });
      if (credential.state !== state)
        throw new SocialAuthError(
          'invalid_state',
          'Could not verify the Apple sign-in response. Please try again.',
        );
      if (!credential.identityToken?.trim())
        throw new SocialAuthError(
          'missing_token',
          'Apple did not return a sign-in token. Please try again.',
        );
      if (!credential.authorizationCode?.trim())
        throw new SocialAuthError(
          'missing_authorization_code',
          'Apple did not return authorization. Please try again.',
        );
      await assertCurrentUser(expectedUserId);
      assertAuthOperationCurrent(operation);
      return rememberCredential(
        {
          provider,
          idToken: credential.identityToken,
          authorizationCode: credential.authorizationCode,
          nonce,
          expectedUserId,
        },
        operation,
      );
    }

    const { GoogleOneTapSignIn } = googleSdk();
    GoogleOneTapSignIn.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!.trim(),
      ...(Platform.OS === 'ios'
        ? { iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID!.trim() }
        : {}),
      nonce: hashedNonce,
      autoSelectOnSignIn: false,
      offlineAccess: false,
    });
    await GoogleOneTapSignIn.checkPlayServices();
    assertAuthOperationCurrent(operation);
    const response = await GoogleOneTapSignIn.presentExplicitSignIn();
    if (response.type === 'cancelled') return null;
    if (response.type !== 'success' || !response.data?.idToken?.trim()) {
      throw new SocialAuthError(
        'missing_token',
        'Google did not return a sign-in token. Please try again.',
      );
    }
    await assertCurrentUser(expectedUserId);
    assertAuthOperationCurrent(operation);
    return rememberCredential(
      { provider, idToken: response.data.idToken, nonce, expectedUserId },
      operation,
    );
  } catch (error) {
    if (isSocialAuthCancelled(error)) return null;
    throw authError(error);
  } finally {
    acquiringCredential = false;
  }
}

async function recordAppleAuthorization(
  credential: SocialCredential,
  userId: string,
): Promise<void> {
  if (credential.provider !== 'apple') return;
  currentCredentialOperation(credential);
  await assertCurrentUser(userId);
  currentCredentialOperation(credential);
  try {
    await invokeAuthenticatedFunction(
      'apple-authorization',
      {
        authorization_code: credential.authorizationCode,
        nonce: credential.nonce,
      },
      { expectedAccountId: userId },
    );
  } catch {
    throw new SocialAuthError(
      'apple_authorization_failed',
      'Apple connected, but account setup could not finish. Reconnect Apple in Settings to try again.',
    );
  }
  await assertCurrentUser(userId);
  currentCredentialOperation(credential);
}

export async function signInWithSocialCredential(
  credential: SocialCredential,
  options: { allowAccountSwitch?: boolean } = {},
): Promise<Session> {
  try {
    const operation = currentCredentialOperation(credential);
    const current = await assertCurrentUser(credential.expectedUserId);
    if (
      credential.expectedUserId &&
      !(options.allowAccountSwitch && current?.user.is_anonymous === true)
    )
      throw new SocialAuthError(
        'already_signed_in',
        'Connect a sign-in method from Settings while signed in.',
      );
    const { data, error } = await signInWithIdTokenSafely(
      {
        provider: credential.provider,
        token: credential.idToken,
        nonce: credential.nonce,
      },
      operation,
    );
    if (error) throw authError(error);
    if (!data.session)
      throw new SocialAuthError(
        'missing_session',
        'Sign-in did not return a session. Please try again.',
      );
    await assertCurrentUser(data.session.user.id);
    await recordAppleAuthorization(credential, data.session.user.id);
    return data.session;
  } catch (error) {
    throw authError(error);
  }
}

export async function linkSocialIdentity(
  provider: SocialProvider,
  expectedUserId: string,
  operation = beginAuthOperation(),
): Promise<User | null> {
  assertAuthOperationCurrent(operation);
  await assertCurrentUser(expectedUserId);
  const credential = await acquireSocialCredential(provider, operation);
  if (!credential) return null;
  const session = await assertCurrentUser(expectedUserId);
  currentCredentialOperation(credential);
  if (!session || credential.expectedUserId !== expectedUserId) {
    throw new SocialAuthError(
      'session_changed',
      'Your account changed. Please try again.',
    );
  }

  // auth-js native linkIdentity writes a session when its request completes.
  // Isolate that write so a late response cannot undo sign-out/account switching.
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'prompt-wars-identity-link',
      },
    },
  );
  try {
    const seeded = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (seeded.error) throw authError(seeded.error);
    if (seeded.data.user?.id !== expectedUserId) {
      throw new SocialAuthError(
        'session_changed',
        'Could not verify the connected account.',
      );
    }
    await assertCurrentUser(expectedUserId);
    currentCredentialOperation(credential);
    if (
      provider === 'apple' &&
      seeded.data.user.identities?.some(
        (identity) => identity.provider === 'apple',
      )
    ) {
      // A prior link can succeed while code retention fails. The endpoint
      // verifies this fresh code belongs to the existing Apple identity.
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error) throw authError(refreshed.error);
      if (!refreshed.data.session)
        throw new SocialAuthError(
          'session_changed',
          'Please connect Apple again.',
        );
      await commitLinkedSessionSafely(
        refreshed.data.session,
        expectedUserId,
        operation,
      );
      await recordAppleAuthorization(credential, expectedUserId);
      return refreshed.data.session.user;
    }
    const { data, error } = await client.auth.linkIdentity({
      provider,
      token: credential.idToken,
      nonce: credential.nonce,
    });
    if (error) throw authError(error);
    await assertCurrentUser(expectedUserId);
    currentCredentialOperation(credential);
    if (
      data.user?.id !== expectedUserId ||
      !data.session ||
      data.user.is_anonymous !== false
    )
      throw new SocialAuthError(
        'session_changed',
        'Could not verify the connected account.',
      );
    await commitLinkedSessionSafely(data.session, expectedUserId, operation);
    await recordAppleAuthorization(credential, expectedUserId);
    return data.user;
  } finally {
    await client.auth.stopAutoRefresh();
  }
}
