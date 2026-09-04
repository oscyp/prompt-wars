// Server-side kill switch for dev/QA-only Edge Functions.
//
// Functions like dev-generate-video bypass entitlement gates and insert
// zero-cost video jobs, so they must be blocked unless the environment
// explicitly opts in. Fail closed: the flag must be exactly '1'; unset or any
// other value means blocked. See supabase/ENV_VARS.md (DEV_FUNCTIONS_ENABLED).

export function isDevFunctionsEnabled(
  env: { get: (key: string) => string | undefined } = Deno.env,
): boolean {
  return env.get('DEV_FUNCTIONS_ENABLED') === '1';
}
