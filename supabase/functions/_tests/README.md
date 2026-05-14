# Supabase Function Tests

Most tests in this directory are Deno tests for shared Edge Function code. Remote character tests are opt-in because they mutate the linked Supabase dev project and call deployed Edge Functions over HTTP.

## Remote Character Function Tests

Run from the repository root:

```bash
PROMPT_WARS_REMOTE_FUNCTION_TESTS=1 \
SUPABASE_URL=https://uoyjhudegdpanrgllfoj.supabase.co \
SUPABASE_PUBLISHABLE_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run test:supabase:remote
```

The suite creates unique test auth users, inserts test characters, grants credits through `grant_credits`, invokes real deployed functions, and deletes test users during cleanup. It targets the linked remote dev project only; do not point it at production.

Covered functions:

- `edit-character`
- `create-custom-signature-item`
- `list-signature-items-catalog`
- `generate-portrait`
- `regenerate-portrait`

Provider note: generated item icons and portraits currently use real deployed provider configuration. That can consume xAI/OpenAI quota and make tests slower or less deterministic. For routine CI, configure the function environment for fallback image mode before running these tests.

If a remote function returns non-2xx, the test helper prints the function name, URL, status, request body, raw response text, and parsed response payload.
