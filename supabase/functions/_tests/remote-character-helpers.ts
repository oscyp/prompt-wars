import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

export type FunctionEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export interface RemoteTestConfig {
  enabled: boolean;
  supabaseUrl: string;
  publishableKey: string;
  serviceKey: string;
}

export interface TestUserFixture {
  email: string;
  password: string;
  profileId: string;
  accessToken: string;
  admin: SupabaseClient;
  userClient: SupabaseClient;
}

export interface TestCharacterFixture extends TestUserFixture {
  characterId: string;
}

export interface FunctionResult<T> {
  status: number;
  statusText: string;
  bodyText: string;
  body: FunctionEnvelope<T> | Record<string, unknown> | null;
}

const FINAL_BATTLE_STATUSES = [
  'completed',
  'expired',
  'canceled',
  'moderation_failed',
  'generation_failed',
];

export function getRemoteTestConfig(): RemoteTestConfig {
  return {
    enabled: Deno.env.get('PROMPT_WARS_REMOTE_FUNCTION_TESTS') === '1',
    supabaseUrl: readEnv('SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL'),
    publishableKey: readEnv(
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    ),
    serviceKey: readServiceKey(),
  };
}

export function skipUnlessRemoteEnabled(): RemoteTestConfig | null {
  const config = getRemoteTestConfig();
  if (!config.enabled) {
    console.warn(
      'Skipping remote Supabase character function tests. Set PROMPT_WARS_REMOTE_FUNCTION_TESTS=1 to run them.',
    );
    return null;
  }

  assert(config.supabaseUrl, 'SUPABASE_URL is required for remote function tests');
  assert(
    config.publishableKey,
    'SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required for remote function tests',
  );
  assert(
    config.serviceKey,
    'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS is required for remote function tests',
  );

  return config;
}

export function createAdminClient(config: RemoteTestConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createUserClient(
  config: RemoteTestConfig,
  accessToken?: string,
): SupabaseClient {
  return createClient(config.supabaseUrl, config.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

export async function createTestUser(
  config: RemoteTestConfig,
  label: string,
): Promise<TestUserFixture> {
  const admin = createAdminClient(config);
  const testId = `${Date.now()}-${crypto.randomUUID()}`;
  const email = `pw-${label}-${testId}@example.test`;
  const password = `PwTest-${crypto.randomUUID()}!1`;

  const { data: createdUser, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `PW ${label}` },
    });
  assertEquals(createError, null, `createUser failed: ${createError?.message}`);
  assertExists(createdUser.user?.id, 'createUser did not return a user id');

  const userClient = createUserClient(config);
  const { data: sessionData, error: signInError } =
    await userClient.auth.signInWithPassword({ email, password });
  assertEquals(signInError, null, `signIn failed: ${signInError?.message}`);
  assertExists(sessionData.session?.access_token, 'signIn did not return an access token');

  await waitForProfile(admin, createdUser.user.id);

  return {
    email,
    password,
    profileId: createdUser.user.id,
    accessToken: sessionData.session.access_token,
    admin,
    userClient: createUserClient(config, sessionData.session.access_token),
  };
}

export async function createTestCharacter(
  config: RemoteTestConfig,
  label: string,
  overrides: Record<string, unknown> = {},
): Promise<TestCharacterFixture> {
  const fixture = await createTestUser(config, label);
  const { data: character, error } = await fixture.admin
    .from('characters')
    .insert({
      profile_id: fixture.profileId,
      name: `PW ${label}`.slice(0, 40),
      archetype: 'strategist',
      battle_cry: 'Tests win cleanly',
      signature_color: '#6366F1',
      is_active: true,
      vibe: 'heroic',
      silhouette: 'lean_duelist',
      palette_key: 'ember',
      era: 'modern',
      expression: 'calm',
      ...overrides,
    })
    .select('id')
    .single();

  assertEquals(error, null, `character insert failed: ${error?.message}`);
  const characterId = character?.id;
  assertExists(characterId, 'character insert did not return an id');

  return {
    ...fixture,
    characterId,
  };
}

export async function cleanupFixture(fixture?: Partial<TestUserFixture>): Promise<void> {
  if (!fixture?.profileId || !fixture.admin) return;

  await removeStoragePrefix(fixture.admin, 'character-portraits', fixture.profileId);
  await removeStoragePrefix(fixture.admin, 'signature-items-custom', fixture.profileId);
  await fixture.admin.auth.admin.deleteUser(fixture.profileId);
}

export async function grantCredits(
  fixture: TestUserFixture,
  amount: number,
  reason = 'remote_test_grant',
): Promise<string> {
  const { data, error } = await fixture.admin.rpc('grant_credits', {
    p_profile_id: fixture.profileId,
    p_amount: amount,
    p_reason: reason,
    p_idempotency_key: `${reason}_${fixture.profileId}_${amount}_${crypto.randomUUID()}`,
    p_battle_id: null,
    p_purchase_id: null,
    p_metadata: { test: true },
  });

  assertEquals(error, null, `grant_credits failed: ${error?.message}`);
  assertExists(data, 'grant_credits did not return a transaction id');
  return data as string;
}

export async function invokeFunction<T>(
  config: RemoteTestConfig,
  accessToken: string,
  functionName: string,
  body: Record<string, unknown>,
): Promise<FunctionResult<T>> {
  const url = `${config.supabaseUrl}/functions/v1/${functionName}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const bodyText = await response.text();
  let parsed: FunctionResult<T>['body'] = null;
  if (bodyText) {
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    console.error('Remote Supabase function failed', {
      functionName,
      url,
      status: response.status,
      statusText: response.statusText,
      requestBody: body,
      responseText: bodyText,
      responseBody: parsed,
    });
  }

  return {
    status: response.status,
    statusText: response.statusText,
    bodyText,
    body: parsed,
  };
}

export function assertOk<T>(result: FunctionResult<T>): T {
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Expected 2xx response, got ${result.status}: ${result.bodyText}`);
  }

  const envelope = result.body as FunctionEnvelope<T>;
  assertEquals(envelope?.ok, true, `Expected ok envelope: ${result.bodyText}`);
  if (envelope.ok !== true) {
    throw new Error(`Expected ok envelope: ${result.bodyText}`);
  }
  assertExists(envelope.data, `Expected data in ok envelope: ${result.bodyText}`);
  return envelope.data;
}

export function assertFunctionError(
  result: FunctionResult<unknown>,
  status: number,
  code: string,
): void {
  assertEquals(result.status, status, `Expected HTTP ${status}: ${result.bodyText}`);
  const envelope = result.body as FunctionEnvelope<unknown>;
  assertEquals(envelope?.ok, false, `Expected error envelope: ${result.bodyText}`);
  if (envelope.ok !== false) {
    throw new Error(`Expected error envelope: ${result.bodyText}`);
  }
  assertEquals(envelope.error?.code, code, `Expected error code ${code}: ${result.bodyText}`);
}

export async function createActiveBattle(
  fixture: TestCharacterFixture,
): Promise<string> {
  const { data, error } = await fixture.admin
    .from('battles')
    .insert({
      mode: 'bot',
      status: 'waiting_for_prompts',
      player_one_id: fixture.profileId,
      player_one_character_id: fixture.characterId,
      is_player_two_bot: true,
      player_one_prompt_deadline: new Date(Date.now() + 60_000).toISOString(),
    })
    .select('id')
    .single();

  assertEquals(error, null, `battle insert failed: ${error?.message}`);
  const battleId = data?.id;
  assertExists(battleId, 'battle insert did not return an id');
  return battleId;
}

export async function cancelNonFinalBattles(fixture: TestCharacterFixture): Promise<void> {
  await fixture.admin
    .from('battles')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .or(
      `player_one_character_id.eq.${fixture.characterId},player_two_character_id.eq.${fixture.characterId}`,
    )
    .not('status', 'in', `(${FINAL_BATTLE_STATUSES.join(',')})`);
}

export async function getCreditBalance(fixture: TestUserFixture): Promise<number> {
  const { data, error } = await fixture.admin
    .from('entitlements')
    .select('credits_balance')
    .eq('profile_id', fixture.profileId)
    .single();

  assertEquals(error, null, `entitlements lookup failed: ${error?.message}`);
  return Number(data?.credits_balance ?? 0);
}

export async function waitForPortraitJob(
  admin: SupabaseClient,
  jobId: string,
  timeoutMs = 120_000,
): Promise<Record<string, unknown>> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data, error } = await admin
      .from('portrait_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    assertEquals(error, null, `portrait job lookup failed: ${error?.message}`);
    if (
      data?.status === 'succeeded' ||
      data?.status === 'failed' ||
      data?.status === 'moderation_rejected'
    ) {
      return data as Record<string, unknown>;
    }

    await delay(1_000);
  }

  throw new Error(`Timed out waiting for portrait job ${jobId}`);
}

function readEnv(...names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return '';
}

function readServiceKey(): string {
  const direct = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (direct) return direct;

  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')?.trim();
  if (!raw) return '';
  if (!raw.startsWith('{')) return raw;

  const parsed = JSON.parse(raw) as Record<string, string>;
  return parsed.default || parsed.secret || parsed.service_role || Object.values(parsed)[0] || '';
}

async function waitForProfile(admin: SupabaseClient, profileId: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq('id', profileId)
      .maybeSingle();

    if (!error && data?.id) return;
    await delay(250);
  }

  throw new Error(`Timed out waiting for profile ${profileId}`);
}

async function removeStoragePrefix(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<void> {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 100 });
  if (!data?.length) return;

  const paths = data.map((entry) => `${prefix}/${entry.name}`);
  await admin.storage.from(bucket).remove(paths);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
