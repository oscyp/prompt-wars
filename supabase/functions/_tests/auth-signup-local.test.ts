import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * Local Auth journey test.
 *
 * Run against `supabase start` with:
 * PROMPT_WARS_LOCAL_AUTH_TESTS=1 deno test --config ... --allow-all ...
 * Set PROMPT_WARS_EXPECT_EMAIL_CONFIRMATION=1 or 0 to pin either deployment
 * configuration; omit it to exercise and report whichever local mode is set.
 */
Deno.test(
  'local signup enforces age and creates onboarding prerequisites',
  async () => {
    if (Deno.env.get('PROMPT_WARS_LOCAL_AUTH_TESTS') !== '1') {
      console.warn(
        'Skipping local Auth integration; set PROMPT_WARS_LOCAL_AUTH_TESTS=1.',
      );
      return;
    }

    const url = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    assert(anon, 'SUPABASE_ANON_KEY is required');
    assert(service, 'SUPABASE_SERVICE_ROLE_KEY is required');

    const client = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const createdIds: string[] = [];
    const password = `Pw-${crypto.randomUUID()}!1`;

    try {
      const valid = await client.auth.signUp({
        email: `auth-${crypto.randomUUID()}@example.test`,
        password,
        options: { data: { age_confirmed: true } },
      });
      assertEquals(valid.error, null, 'valid 18+ signup failed');
      assertExists(valid.data.user?.id, 'signup did not return a user id');
      createdIds.push(valid.data.user.id);

      const expectedConfirmation = Deno.env.get(
        'PROMPT_WARS_EXPECT_EMAIL_CONFIRMATION',
      );
      if (expectedConfirmation === '1') {
        assertEquals(
          valid.data.session,
          null,
          'confirmation should be required',
        );
      } else if (expectedConfirmation === '0') {
        assertExists(
          valid.data.session,
          'signup should create an immediate session',
        );
      }

      // Trigger-created profile and anti-abuse rows are prerequisites for FTUO.
      let profile: { id: string; age_confirmed_at: string | null } | null =
        null;
      for (let attempt = 0; attempt < 20 && !profile; attempt += 1) {
        const result = await admin
          .from('profiles')
          .select('id, age_confirmed_at')
          .eq('id', valid.data.user.id)
          .maybeSingle();
        profile = result.data;
        if (!profile) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assertExists(profile, 'profile trigger did not create a row');
      assertExists(
        profile.age_confirmed_at,
        '18+ attestation was not recorded',
      );

      const { data: abuseSignal, error: abuseError } = await admin
        .from('account_abuse_signals')
        .select('profile_id')
        .eq('profile_id', valid.data.user.id)
        .maybeSingle();
      assertEquals(abuseError, null, 'abuse-signal lookup failed');
      assertExists(abuseSignal, 'signup did not create an abuse-signal row');

      const { count: characterCount, error: characterError } = await admin
        .from('characters')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', valid.data.user.id)
        .eq('is_active', true)
        .not('finalized_at', 'is', null);
      assertEquals(characterError, null, 'onboarding character lookup failed');
      assertEquals(characterCount, 0, 'fresh signup should enter onboarding');

      // Existing-email behavior differs with enumeration protection: either a
      // machine error or an empty identities array is acceptable, never a second
      // identity/session.
      const existing = await client.auth.signUp({
        email: valid.data.user.email!,
        password,
        options: { data: { age_confirmed: true } },
      });
      const protectedReplay =
        Boolean(existing.error) ||
        (Array.isArray(existing.data.user?.identities) &&
          existing.data.user!.identities!.length === 0);
      assert(protectedReplay, 'existing account was not recognized safely');

      const rejected = await client.auth.signUp({
        email: `underage-${crypto.randomUUID()}@example.test`,
        password,
        options: { data: { age_confirmed: false } },
      });
      assert(rejected.error, 'signup without the 18+ attestation was accepted');
    } finally {
      for (const id of createdIds) {
        await admin.auth.admin.deleteUser(id).catch(() => {});
      }
    }
  },
);
