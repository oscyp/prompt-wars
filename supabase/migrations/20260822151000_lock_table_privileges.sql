-- ============================================================================
-- Lock table privileges for anon/authenticated to what the client actually uses
-- ============================================================================
--
-- What was wrong
-- --------------
-- Verified against the linked database on 2026-08-22: BOTH `anon` and
-- `authenticated` held
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- on EVERY table in `public` -- including wallet_transactions, subscriptions,
-- battles, battle_rounds, video_jobs and rankings.
--
-- TRUNCATE is the sharpest edge: PostgreSQL row-level security does NOT apply
-- to TRUNCATE. RLS gates SELECT/INSERT/UPDATE/DELETE only. So no policy in this
-- schema was stopping the anon key -- which ships inside the mobile app -- from
-- emptying any table in the database.
--
-- Source: 20260623120000_grant_api_role_privileges.sql:67 granted
-- SELECT, INSERT, UPDATE, DELETE ON ALL TABLES to authenticated, and the
-- platform default ACL supplies the rest to both roles. That same migration
-- also silently reverted the correct column-scoped lockdown that
-- 20260513120000_character_creation_expansion.sql:406-407 had applied to
-- `characters`, because a table-level grant supersedes column-level grants.
--
-- The fix
-- -------
--   * Revoke every write privilege plus TRUNCATE/REFERENCES/TRIGGER from anon
--     and authenticated across all tables.
--   * Revoke SELECT from anon entirely. Verified no pre-auth surface reads a
--     table: app/(auth)/*, app/index.tsx, app/_layout.tsx and
--     providers/AuthProvider.tsx contain no supabase.from() or .rpc() calls.
--   * Re-grant, column-scoped, only the four writes the client actually makes
--     (enumerated below, each traced to a call site).
--   * Fix ALTER DEFAULT PRIVILEGES so new tables stop inheriting the grant.
--
-- The only client writes that exist, verified by grep over
-- app/ hooks/ utils/ providers/ components/:
--   app/(onboarding)/create-character.tsx:145  profiles UPDATE {display_name}
--   app/(onboarding)/create-character.tsx:149  profiles INSERT {id, username, display_name}
--   app/(onboarding)/create-character.tsx:224  characters INSERT (identity/cosmetic cols)
--   app/(onboarding)/create-character.tsx:637  characters INSERT (draft row)
--   utils/notifications.ts:70                  push_tokens UPSERT
--   utils/notifications.ts:95                  push_tokens UPDATE {is_active}
--   utils/notifications.ts:187                 notification_preferences UPSERT
-- Everything else -- blocks, reports, battle_prompts, appeals, quests --
-- already goes through Edge Functions running as service_role.
--
-- Notes:
--   * The characters INSERT grant is deliberately column-scoped. The client
--     never sets stat_strength/stat_stamina/stat_agility/stat_focus, level or
--     xp, and those feed Bo3 damage and HP -- a full-table INSERT grant would
--     let a client create a max-stat character. This restores the intent of
--     20260513120000 that the blanket grant undid.
--   * SELECT for `authenticated` is left full-table here; RLS policies gate it.
--     Narrowing profiles SELECT is a separate migration because it forces
--     client changes.
--   * UPSERT needs both INSERT and UPDATE, hence both on push_tokens and
--     notification_preferences.
--   * service_role is untouched and keeps ALL on everything.
--
-- Idempotent: REVOKE/GRANT are safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Revoke the blanket privileges
-- ----------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon;

-- ----------------------------------------------------------------------------
-- 2. Stop future tables inheriting it
-- ----------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT ON TABLES FROM anon;

-- ----------------------------------------------------------------------------
-- 3. Re-grant exactly what the client writes
-- ----------------------------------------------------------------------------

-- profiles: onboarding creates the row when the auth trigger did not, and
-- sets the display name. Nothing else is client-writable -- rating, wins,
-- streaks, is_test_user and the new_user_* / free_tier1_* grant counters all
-- stay server-owned.
GRANT INSERT (id, username, display_name) ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url)   ON public.profiles TO authenticated;

-- characters: identity and cosmetics only. Stats, level, xp, portrait_seed,
-- art_style and cosmetic_config are server-owned.
GRANT INSERT (
  profile_id, name, archetype, battle_cry, signature_color,
  vibe, silhouette, palette_key, era, expression, signature_item_id
) ON public.characters TO authenticated;
GRANT UPDATE (is_active) ON public.characters TO authenticated;

-- push_tokens / notification_preferences: device-local settings, upserted.
GRANT INSERT, UPDATE ON public.push_tokens             TO authenticated;
GRANT INSERT, UPDATE ON public.notification_preferences TO authenticated;
