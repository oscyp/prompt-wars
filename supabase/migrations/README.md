# Prompt Wars Database Migrations

Timestamped migration chain for Supabase Postgres schema evolution.

## Phase 1+ Migration Chain ✅ Complete

### `20260506000000_init_prompt_wars.sql` (Phase 0)
- Extensions: uuid-ossp, pgcrypto
- Placeholder for migration chain initialization

### `20260506100000_core_gameplay_schema.sql` ✅
**Size**: 19KB, ~600 lines  
**Content**: Enums (battle_status, move_type, archetype, etc.), core tables (profiles, characters, battles, prompts, judge_runs, appeals, rivals), indexes, RLS policies, Realtime, triggers

### `20260506110000_economy_video_social_schema.sql` ✅
**Size**: 20KB, ~650 lines  
**Content**: Video pipeline (video_jobs, videos), economy (wallet, purchases, subscriptions, entitlements view), seasons/rankings, daily meta (quests, themes), moderation/safety (reports, blocks, moderation_events), push notifications

### `20260506120000_database_functions.sql` ✅
**Size**: 19KB, ~600 lines  
**Content**: Server-owned functions (create_battle, match_battle, lock_prompt, resolve_battle, grant/spend/refund credits, appeals, daily login streak, notification frequency cap)

**Total**: 1851 lines SQL, ~60KB

See [BACKEND_PHASE1_COMPLETION_REPORT.md](../../docs/BACKEND_PHASE1_COMPLETION_REPORT.md) for full details.

## Migration Strategy

Migrations are ordered by timestamp prefix (YYYYMMDDHHMMSS). Each migration is atomic and idempotent where possible.

## Planned Schema (Phase 1+)

The authoritative data model is defined in `docs/prompt-wars-implementation-concept.md` §12. High-level summary:

### Core Gameplay Tables
- `profiles` - User profiles, rating, season context
- `characters` - Player-created characters (archetype, battle cry, signature color, cosmetics)
- `prompt_templates` - Curated prompts by category, ranked-safe flags, active date ranges
- `battles` - 1v1 async battles with state machine, theme, players, characters, scores, winner
- `battle_prompts` - Per-player prompts with move_type, moderation status, lock timestamp
- `judge_runs` - LLM judge invocations with version, seed, scores, winner (supports double-run + appeals)
- `appeals` - Player appeal requests for ranked losses (1/day cap), original vs appeal winner

### Video Pipeline Tables
- `video_jobs` - Video generation job queue (provider, status, attempt count, error codes)
- `videos` - Completed videos with Storage paths, thumbnails, visibility, retention metadata

### Economy Tables
- `wallet_transactions` - Credit ledger (earned, purchased, spent, refunded) with audit trail
- `purchases` - IAP purchase records mirrored from RevenueCat webhook
- `subscriptions` - Subscription state (active, tier, allowance) mirrored from RevenueCat
- `entitlements` - **Derived view** (never a table). Source of truth for feature gates; server-owned. Aggregates subscription + purchase state into is_subscriber, monthly_video_allowance_remaining, cosmetic_unlocks, priority_queue.

### Social & Retention Tables
- `rivals` - Auto-tagged most-played opponent over 30d rolling window
- `daily_quests` - Quest definitions and player progress
- `prompt_journal` - Player's best-rated prompts (shareable, retention surface)
- `reports` - User-submitted reports for prompts, videos, profiles
- `moderation_events` - Audit log of moderation decisions (pre-gen, post-gen, manual review)

### Rankings & Seasons
- `rankings` - Glicko-2 ratings, seasonal placement, tier assignment
- `seasons` - Season config (start, end, rewards, judge version)
- `leaderboards` - Materialized view of top players by season/mode/archetype

## RLS Principles

All user-facing tables enable RLS. General rules:

- Players can `SELECT` their own profile, characters, battles, wallet, and public leaderboard data.
- Players can `INSERT` battle_prompts for their own active battle slot.
- Players **cannot** `UPDATE` or `DELETE` battles, judge_runs, video_jobs, wallet_transactions, or entitlements.
- Only **service-role** Edge Functions can resolve battles, grant credits, create video jobs, or write to server-owned columns.

## Indexes (Phase 1+)

Critical for performance at scale:

- `battles(player_one_id, status)` and `battles(player_two_id, status)` - Active battle lookup
- `battles(status, created_at)` - Matchmaking queue and timeout expiry
- `battle_prompts(battle_id, profile_id)` - Prompt lock-in checks
- `video_jobs(status, created_at)` - Job queue and retry logic
- `wallet_transactions(profile_id, created_at DESC)` - Transaction history
- `rankings(season_id, rating DESC)` - Leaderboard queries
- `judge_runs(battle_id, is_appeal, created_at)` - Appeal history and judge audit

## Database Functions (Phase 1+)

Server-owned state transitions implemented as Postgres functions called by Edge Functions:

- `resolve_battle(battle_id, winner_id, score_payload, rating_deltas)` - Atomic battle close with rating update
- `grant_credits(profile_id, amount, reason, metadata)` - Insert wallet transaction, enforce daily caps
- `check_appeal_eligibility(profile_id, battle_id)` - Validate 1/day appeal cap
- `update_rival(profile_id)` - Recompute 30d most-played opponent
- `prune_free_tier_videos(cutoff_date)` - Delete videos older than N days for non-subscribers

## Migration Workflow

```bash
# Create a new migration
supabase migration new feature_name

# Reset local DB and apply all migrations + seed
supabase db reset

# Push migrations to remote (after link)
supabase db push

# Generate TypeScript types from schema
supabase gen types typescript --local > lib/database.types.ts
```

## Phase 1 Migration Checklist

- [ ] Core tables with constraints and defaults
- [ ] RLS policies for all user-facing tables
- [ ] Indexes for common queries
- [ ] Database functions for server-owned writes
- [ ] Entitlements view definition
- [ ] Storage bucket policies (videos, thumbnails, avatars)
- [ ] Realtime publication for battles, video_jobs, appeals

## Notes

- All timestamps use `timestamptz`.
- UUIDs use `gen_random_uuid()` defaults.
- JSONB columns for flexible payload storage (score_payload, cosmetic_config, metadata).
- Soft deletes where audit trail required (reports, moderation_events).
- Foreign keys with `ON DELETE CASCADE` where appropriate (battle_prompts -> battles).
