-- =============================================================================
-- Retire the static prompt template library.
-- =============================================================================
-- The arena's prompt help is now the per-fighter generated set in
-- `move_prompt_suggestions` (see 20260826130000_move_prompt_suggestions.sql).
-- The 11 remaining hand-written rows in `prompt_templates` were the same
-- handful of strings in front of every player in every battle, and the client
-- no longer offers them at all.
--
-- Retired, not dropped. `battle_prompts.prompt_template_id` is a FK with
-- ON DELETE SET NULL and a template-based prompt stores no text of its own,
-- so deleting the rows would erase what past players submitted --
-- `resolve-battle` and `compose-reveal-payload` both read the body back off
-- this table. `active_until` empties the served pool and closes the
-- `prompt_templates_select_all` RLS policy over these rows, while leaving
-- every historical battle readable.
--
-- Reversible: UPDATE prompt_templates SET active_until = NULL.
UPDATE prompt_templates
SET active_until = NOW()
WHERE active_until IS NULL OR active_until > NOW();

-- The serving RPC has no caller left and nothing to serve: its pool filters on
-- exactly the `active_until` this migration just set, so it can only return
-- zero rows. Dropped rather than left as a grantable no-op.
DROP FUNCTION IF EXISTS get_battle_templates(UUID);
