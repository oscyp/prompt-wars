// Shared helpers for DB-dependent integration tests.
//
// `profiles.id` references `auth.users(id)` and is populated by the
// `on_auth_user_created` trigger — there is no default on `profiles.id`, so a
// profile cannot be inserted directly. These helpers create a real auth user
// (which the trigger turns into a profile), optionally attach a character, and
// clean everything up by deleting the auth user (cascades to profile,
// characters, battles, prompts, etc. via ON DELETE CASCADE).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Loosely-typed client: integration tests touch many tables and the generated
// schema types resolve table rows to `never` under Deno type-checking.
export type ServiceClient = SupabaseClient<any, any, any>;

export interface TestPlayer {
  profileId: string;
  characterId: string;
  email: string;
}

/**
 * Create an auth-backed test player and (optionally) a character.
 * The profile row is created automatically by the on_auth_user_created trigger.
 */
export async function createTestPlayer(
  supabase: ServiceClient,
  opts: { displayName: string; archetype?: string; characterName?: string } = {
    displayName: 'Test Player',
  },
): Promise<TestPlayer> {
  const email = `it_${crypto.randomUUID()}@example.test`;

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    password: `Pw-${crypto.randomUUID()}`,
    email_confirm: true,
    user_metadata: { display_name: opts.displayName },
  });

  if (userError || !userData?.user) {
    throw userError ?? new Error('Failed to create test auth user');
  }

  const profileId = userData.user.id;

  const { data: character, error: charError } = await supabase
    .from('characters')
    .insert({
      profile_id: profileId,
      name: opts.characterName ?? 'Test Character',
      archetype: opts.archetype ?? 'strategist',
      battle_cry: 'For glory and victory!',
    })
    .select('id')
    .single();

  if (charError || !character) {
    // Best-effort cleanup of the auth user before surfacing the error.
    await supabase.auth.admin.deleteUser(profileId).catch(() => {});
    throw charError ?? new Error('Failed to create test character');
  }

  return { profileId, characterId: (character as { id: string }).id, email };
}

/**
 * Delete a test player. Deleting the auth user cascades to the profile and all
 * profile-owned rows (characters, battles, battle_prompts, ...).
 */
export async function deleteTestPlayer(
  supabase: ServiceClient,
  profileId: string,
): Promise<void> {
  await supabase.auth.admin.deleteUser(profileId).catch(() => {});
}
