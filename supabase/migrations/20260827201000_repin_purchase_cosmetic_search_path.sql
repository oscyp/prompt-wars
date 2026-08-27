-- Re-pin purchase_cosmetic's search_path.
--
-- 20260827200000 redefined this function starting from its ORIGINAL body in
-- 20260619122000, which carries no `SET search_path`. But the live database had
-- one: every other SECURITY DEFINER function in `public` is pinned to
-- `public, extensions`, applied out of band and recorded in no migration. The
-- redefinition therefore un-hardened a SECURITY DEFINER function that spends
-- credits, leaving it open to search-path injection by its caller.
--
-- Caught by supabase/checks/privilege_audit.sql, which is the entire reason that
-- check exists. The lesson is the one CLAUDE.md already states: verify
-- privileges against the live catalog, never against the migration files.
--
-- ALTER rather than another CREATE OR REPLACE, so this is correct whether or not
-- the definition it lands on already carries the pin.

ALTER FUNCTION purchase_cosmetic(UUID, TEXT)
  SET search_path = public, extensions;
