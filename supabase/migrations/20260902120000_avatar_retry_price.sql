-- =============================================================================
-- Price key: avatar_retry
-- =============================================================================
-- A CAPABILITY FLAG, not a price. It is 0 credits and the server never reads
-- it: regenerate-portrait's `mode: 'avatar_only'` is free by construction (no
-- spend_credits call) and guards itself on appearance_version alone.
--
-- Why a price row at all: the client already ships every row of this table to
-- the edit screen (utils/editCooldowns.ts fetchEditPricing) and offers a paid
-- action only when its key is present. Making the free avatar retry visible
-- through the same channel means the "Retry free" button appears exactly when
-- the deployed regenerate-portrait supports it -- this migration is pushed with
-- that deploy -- and never on an app talking to an older backend, where the
-- request would fall back to a paid `render`.
--
-- Housed in `character_edit_prices` for the reason argued at
-- 20260826130000_move_prompt_suggestions.sql:138-144: it is the only
-- server-owned credit price list and the only one the client reads.
--
-- DO NOTHING rather than DO UPDATE: if someone ever prices the retry, this
-- migration must not silently reset it to free on re-apply.
INSERT INTO public.character_edit_prices (edit_kind, credits, cooldown_seconds)
VALUES ('avatar_retry', 0, 0)
ON CONFLICT (edit_kind) DO NOTHING;
