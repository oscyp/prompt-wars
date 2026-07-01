-- Tier 0 enriched reveal payload storage (ADDITIVE / non-destructive).
--
-- ⚠️ LOCAL SCAFFOLD ONLY. Do NOT `supabase db push` or apply to --linked/remote
--    without explicit user confirmation. Nothing here drops or rewrites data.
--
-- WHY
-- ---
-- The free Tier 0 reveal is the app's "wow moment", but the persisted payload
-- is currently either thin (single-format `battles.tier0_reveal_payload`) or
-- effectively absent for Bo3: `generate-tier0-reveal` composes a rich payload
-- for a round but only writes a synthetic `battle_rounds.cinematic_asset_url`
-- (`tier0://…`) — the structured reveal data is returned in the HTTP response
-- and never persisted where the client can read it. This adds a single home
-- for the enriched, server-owned reveal payload on the per-round row.
--
-- STORAGE SHAPE (minimal, MVP-appropriate — do NOT over-normalize)
-- ----------------------------------------------------------------
-- One versioned JSONB blob, written synchronously by the service-role resolver
-- (`round-resolve` for Bo3; `resolve-battle` keeps writing the SAME v1 schema to
-- `battles.tier0_reveal_payload` for single-format). Generation-derived asset
-- URLs (TTS voice line, music/sting audio) live INSIDE the blob and are
-- nullable, always paired with a deterministic id/preset so the reveal is NEVER
-- blocked by video/audio generation.
--
-- RLS
-- ---
-- No new policy needed. `battle_rounds_select_participant` (migration
-- 20260525120000) already restricts SELECT to the two battle participants.
-- Only the service role writes this column (no client INSERT/UPDATE policy
-- exists on battle_rounds). Opponent portrait visibility is delivered via
-- service-role-signed Storage URLs baked into the payload (the private
-- `character-portraits` bucket is otherwise owner-read only).

ALTER TABLE public.battle_rounds
  ADD COLUMN IF NOT EXISTS reveal_payload JSONB;

COMMENT ON COLUMN public.battle_rounds.reveal_payload IS
  $doc$Enriched, server-owned Tier 0 reveal payload (RevealPayloadV1). Written
synchronously by the service-role round resolver at result_ready; NEVER depends
on Tier 1 video/audio generation. Participant-only via battle_rounds RLS.

Shape (v1):
{
  "version": 1, "tier": 0,
  "battle_id": uuid, "battle_round_id": uuid|null, "round_number": int|null,
  "generated_at": iso8601,
  "outcome": { "winner_profile_id": uuid|null, "is_draw": bool, "is_ko": bool,
               "score_gap": number },
  "players": {
    "player_one": {
      "profile_id": uuid, "character_name": text, "archetype": text,
      "signature_color": hex, "battle_cry": text,
      "portrait": { "path": text, "signed_url": text|null,
                    "thumb_signed_url": text|null, "art_style": text|null,
                    "seed": bigint|null, "fallback_gradient": [hex, hex] },
      "move_type": text, "move_matchup_result": "win"|"loss"|"neutral",
      "move_type_modifier": number|null, "stat_modifier": number|null,
      "rubric_scores": { clarity, originality, specificity, theme_fit,
                         archetype_fit, dramatic_potential },
      "prompt_excerpt": text|null
    },
    "player_two": { … same, bot-aware … }
  },
  "judge": { "why": text, "prompt_version": text|null, "model_id": text|null },
  "reveal_spec": {
    "composition_type": "motion_poster"|"static_scorecard",
    "animation_preset": text, "winner_color": hex,
    "music_track_id": text,   "music_track_url": text|null,   -- id always set
    "move_sting_id": text,    "move_sting_url": text|null,     -- id always set
    "battle_cry_voice": { "voice_preset": text, "text": text,
                          "asset_url": text|null, "duration_ms": int }
  }
}
Generation-derived *_url and asset_url fields are nullable with a deterministic
id/preset fallback; the client renders the reveal from ids + bundled assets when
URLs are absent.$doc$;

-- Read path: client fetches the current round row; index keeps the
-- "has a reveal" lookup cheap without scanning null rows.
CREATE INDEX IF NOT EXISTS idx_battle_rounds_reveal_payload
  ON public.battle_rounds (battle_id, round_number)
  WHERE reveal_payload IS NOT NULL;

-- Reaffirm the shared v1 contract on the single-format home (no shape change
-- here; the column already exists from 20260506140000).
COMMENT ON COLUMN public.battles.tier0_reveal_payload IS
  'Single-format Tier 0 reveal (RevealPayloadV1, same schema as battle_rounds.reveal_payload). Written synchronously by resolve-battle; participant-only via battles RLS.';
