// Helper for checking whether a profile is flagged as a test user.
// Test users bypass cooldowns, daily rate limits, and active battle locks.
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * Returns true when the profile is marked as a test user.
 * Falls back to false on any lookup error so production users are never
 * accidentally treated as test users.
 */
export async function isTestUser(
  supabase: SupabaseClient,
  profileId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_test_user')
    .eq('id', profileId)
    .maybeSingle();
  if (error) {
    console.warn('isTestUser lookup failed', {
      profileId,
      error: error.message,
    });
    return false;
  }
  return Boolean((data as { is_test_user?: boolean } | null)?.is_test_user);
}
