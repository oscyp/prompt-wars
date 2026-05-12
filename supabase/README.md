# Prompt Wars Backend

Supabase-powered backend for async 1v1 prompt battles with AI judge, video generation, and competitive rankings.

## Phase 1+: Backend Implementation Complete ✅

Complete MVP schema, database functions, Edge Functions, and seed data implemented.

**Implemented:**
- ✅ Core gameplay schema (battles, prompts, characters, profiles)
- ✅ Economy & monetization (wallet, purchases, subscriptions, entitlements view)
- ✅ Video pipeline (jobs, videos, moderation)
- ✅ Rankings & seasons (Glicko-2, leaderboards)
- ✅ Social & safety (rivals, reports, blocks, moderation events)
- ✅ Daily meta (quests, themes, streaks)
- ✅ Database functions (server-owned state transitions)
- ✅ Edge Functions (matchmaking, judge, appeals, webhooks)
- ✅ RLS policies (user-scoped data access)
- ✅ Seed data (archetypes, templates, bots, calibration sets)
- ✅ Shared utilities (Glicko-2, judge pipeline, mock provider)

## Project Structure

```
supabase/
├── config.toml              # Supabase local dev config (mirrored from Remedy)
├── migrations/              # Database schema evolution (timestamped SQL files)
│   ├── README.md           # Migration strategy and planned schema
│   └── 20260506000000_init_prompt_wars.sql  # Phase 0 empty init migration
├── functions/              # Edge Functions (server-owned battle logic)
│   └── README.md          # Planned functions and security notes
├── seed.sql               # Starter data (archetypes, templates, bots)
├── ENV_VARS.md           # Environment variable documentation
└── .gitignore            # Ignore local DB, secrets, build artifacts
```

## Authoritative Documentation

📖 **Single source of truth**: [`docs/prompt-wars-implementation-concept.md`](../docs/prompt-wars-implementation-concept.md)

All data models, state machines, RLS policies, and Edge Function responsibilities are defined in the implementation concept doc. If this README conflicts, the concept doc wins.

## Quick Start (Local Development)

### Prerequisites
- Supabase CLI v2.78.1+ (installed: v2.78.1, v2.98.2+ recommended)
- Docker Desktop (for local Postgres, Realtime, Storage)
- Node.js 18+ (for Edge Functions)

### Initialize Local Supabase

```bash
# Start local Supabase stack (Postgres, Studio, Realtime, Storage, Edge Functions)
supabase start

# Output will show:
# - API URL: http://127.0.0.1:54321
# - Studio URL: http://127.0.0.1:54323
# - Anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (use in client)
# - Service role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (NEVER expose to client)

# Apply migrations and seed data
supabase db reset

# Open Supabase Studio (database browser, table editor, SQL editor)
open http://127.0.0.1:54323
```

### Link to Remote Project (After Project Creation)

```bash
# Login to Supabase
supabase login

# Link local repo to remote project
supabase link --project-ref your-project-id

# Push local migrations to remote
supabase db push

# Pull remote schema (if remote is ahead)
supabase db pull
```

## Architecture Overview

### Client Responsibilities (Mobile App)
- Auth screens and session handling
- Character creation UI
- Prompt template browsing and custom prompt editor
- Battle status screens with Realtime subscriptions
- Result reveal and video playback
- Wallet and subscription screens
- Profile, stats, and rankings

### Backend Responsibilities (Supabase)
- **Postgres**: Source of truth for gameplay state, wallet, rankings
- **Realtime**: Battle state updates, video job status, appeal results
- **Storage**: Generated videos, thumbnails, avatar assets (signed URLs)
- **Edge Functions**: Matchmaking, battle resolution, LLM judge, video generation, moderation, purchase webhooks, credit ledger, push notifications
- **RLS**: Restrict players to their own data; server-role owns battle outcomes

### Key Security Invariants
- ✅ Client can read own battles, prompts, wallet, and public leaderboards
- ✅ Client can insert prompts for own active battle slot
- ❌ Client **cannot** update battle results, judge scores, wallet balance, or video job status
- ❌ Client **cannot** resolve battles, grant credits, or transition server-owned state
- ✅ All provider API keys (xAI, OpenAI, moderation) live in Edge Function secrets only
- ✅ RevenueCat webhook validates signature before granting entitlements

## Phase Roadmap

### ✅ Phase 0: Scaffolding (Current)
- [x] Supabase config.toml with project_id "prompt-wars"
- [x] Empty initial migration (20260506000000)
- [x] Migrations README with planned schema
- [x] Edge Functions README with planned functions
- [x] Seed.sql placeholder
- [x] ENV_VARS.md documentation
- [x] .gitignore for local dev artifacts

### Phase 1: Core Gameplay Schema (Next)
- [ ] Profiles, characters, prompt_templates tables
- [ ] Battles, battle_prompts, judge_runs tables
- [ ] RLS policies for all user-facing tables
- [ ] Indexes for active battles, player history
- [ ] Database functions for server-owned writes
- [ ] Storage buckets (videos, thumbnails, avatars)
- [ ] Realtime publication for battles table

### Phase 2: Battle Resolution
- [ ] `matchmaking` Edge Function (newbie bucket, bot fallback)
- [ ] `resolve-battle` Edge Function (LLM judge, Glicko-2 rating)
- [ ] `judge-prompt` provider adapter (double-run, length normalization)
- [ ] Judge calibration set in seed.sql
- [ ] Appeal flow tables and Edge Function

### Phase 3: Video Pipeline
- [ ] Video_jobs, videos tables
- [ ] `generate-video` Edge Function (xAI provider)
- [ ] `generate-motion-poster` Edge Function (Tier 0 cinematic)
- [ ] `moderate-video` Edge Function (post-gen safety)
- [ ] Storage retention policy (14d for free tier)

### Phase 4: Economy & Monetization
- [ ] Wallet_transactions, purchases, subscriptions tables
- [ ] Entitlements derived view
- [ ] `revenuecat-webhook` Edge Function
- [ ] `grant-credits` Edge Function (daily login, quests, refunds)
- [ ] `validate-entitlements` Edge Function
- [ ] FTUO (first-time-user offer) trigger

### Phase 5: Retention & Social
- [ ] Rivals, daily_quests, prompt_journal tables
- [ ] `rival-update` Edge Function (30d most-played)
- [ ] `daily-login-grant` Edge Function (streak with mercy day)
- [ ] `judge-a-friend-minigame` Edge Function
- [ ] `send-push-notification` Edge Function (Expo push tokens)

### Phase 6: Rankings & Seasons
- [ ] Rankings, seasons, leaderboards tables
- [ ] Glicko-2 rating update function
- [ ] Seasonal leaderboard materialized view
- [ ] Anti-collusion heuristics (opponent diversity, quality floor)

### Phase 7: Moderation & Safety
- [ ] Reports, moderation_events tables
- [ ] `moderate-prompt` Edge Function (pre-gen)
- [ ] `report-intake` Edge Function
- [ ] `storage-retention-prune` Edge Function
- [ ] Manual review queue UI (Supabase Studio or custom admin)

## Development Workflow

### Creating Migrations

```bash
# Create a new migration
supabase migration new add_battles_table

# Edit the generated file in supabase/migrations/
# Run migration locally
supabase db reset

# Generate TypeScript types from schema
supabase gen types typescript --local > ../lib/database.types.ts
```

### Creating Edge Functions

```bash
# Create a new function
supabase functions new matchmaking

# Serve all functions locally (auto-reload on save)
supabase functions serve

# Deploy to remote
supabase functions deploy matchmaking

# Set secrets for deployed function
supabase secrets set JUDGE_API_KEY=sk-...
```

### Testing

```bash
# Run tests against local Supabase
npm test

# Seed test data
psql $SUPABASE_DB_URL < supabase/test_fixtures.sql
```

## Environment Variables

See [`supabase/ENV_VARS.md`](./ENV_VARS.md) for comprehensive documentation.

**Client-side** (safe to bundle in app):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_AUTH_REDIRECT_SCHEME`
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`

**Server-side** (Edge Functions only, NEVER expose to client):
- `SUPABASE_PUBLISHABLE_KEYS`
- `SUPABASE_SECRET_KEYS`
- `JUDGE_API_KEY` (OpenAI/Anthropic/xAI for LLM judge)
- `XAI_API_KEY` (video generation)
- `IMAGE_API_KEY` (Tier 0 motion poster)
- `TEXT_MODERATION_API_KEY`, `VIDEO_MODERATION_API_KEY`
- `REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_API_KEY`
- `EXPO_PUSH_TOKEN`

## Useful Commands

```bash
# Start local Supabase stack
supabase start

# Stop local stack
supabase stop

# Reset database (drop + recreate + migrate + seed)
supabase db reset

# Generate migration from remote changes
supabase db pull

# Push local migrations to remote
supabase db push

# Open Studio (database browser)
open http://127.0.0.1:54323

# View logs (Edge Functions, Postgres, Realtime)
supabase functions logs matchmaking --tail
supabase logs --db

# List remote projects
supabase projects list

# Check Supabase status
supabase status
```

## Production Deployment

1. **Create Supabase Project**: https://supabase.com/dashboard
2. **Link Local Repo**: `supabase link --project-ref <id>`
3. **Push Migrations**: `supabase db push`
4. **Deploy Functions**: `supabase functions deploy --all`
5. **Set Secrets**: `supabase secrets set KEY=value`
6. **Configure Storage Buckets**: Create `videos`, `thumbnails`, `avatars` buckets in Studio
7. **Enable Realtime**: Publish `battles`, `video_jobs`, `appeals` tables
8. **Configure Auth Providers**: Apple, Google, Email in Supabase Studio > Auth > Providers
9. **Update Mobile App**: Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Troubleshooting

### "Error: No linked project"
Run `supabase link --project-ref your-project-id` to link local repo to remote.

### "Migration failed: relation already exists"
Reset local DB: `supabase db reset`. For remote, manually drop conflicting tables or use `supabase db pull` to generate a baseline migration.

### "Edge Function timeout"
Video generation can exceed default 60s timeout. Increase in Dashboard > Edge Functions > Settings or move to async job queue.

### "Storage bucket not found"
Create buckets manually in Studio > Storage, or add bucket definitions to `config.toml` and restart.

### "RLS policy denying access"
Check policies in Studio > Database > Policies. Ensure service-role key is used for server writes, not anon key.

## Resources

- [Supabase Docs](https://supabase.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/guides/cli)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Realtime](https://supabase.com/docs/guides/realtime)
- [Glicko-2 Rating System](http://www.glicko.net/glicko/glicko2.pdf)

## Support

For backend questions, see:
- Implementation concept doc: `docs/prompt-wars-implementation-concept.md`
- Migrations README: `supabase/migrations/README.md`
- Edge Functions README: `supabase/functions/README.md`
- Environment variables: `supabase/ENV_VARS.md`
