-- =============================================================================
-- Price key: leave_battle
-- =============================================================================
-- Housed in `character_edit_prices` despite the name, for the reason argued at
-- 20260826130000_move_prompt_suggestions.sql:138-144: that table is the only
-- server-owned credit price list, every read of it is a keyed lookup, and a
-- price living in a table means repricing needs no deploy.
--
-- 2 credits, flat. Against the live ladder -- random_character 5,
-- render_look / custom_item_image 3, prompt_suggestions_reroll /
-- regenerate_portrait 1, trait edits 0 -- a leave has to cost more than a
-- cheap impulse action or it reads as free, and less than a render or it reads
-- as a punishment. The punishment is the ranked loss; the credits are a sink.
--
-- Flat rather than scaling by round or mode: a formula would move the price
-- back into code (undoing the only reason it lives here) and would make the
-- number in the confirm dialog unpredictable.
--
-- Unlike every other key in this table, this one is READ BY THE CLIENT -- the
-- `character_edit_prices_select_all` policy (20260513120000:396-397) already
-- allows it -- to populate the confirm dialog before charging. That is why
-- there is no price-quote endpoint. The server re-reads the same row and is
-- authoritative; a stale client number surfaces as a 402, not as a mischarge.
INSERT INTO public.character_edit_prices (edit_kind, credits, cooldown_seconds)
VALUES ('leave_battle', 2, 0)
ON CONFLICT (edit_kind) DO NOTHING;
