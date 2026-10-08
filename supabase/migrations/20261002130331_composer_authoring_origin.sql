ALTER TABLE public.battle_prompts ADD COLUMN IF NOT EXISTS authoring_origin text NOT NULL DEFAULT 'unknown'
  CHECK (authoring_origin IN ('builder','manual','mixed','unknown'));
COMMENT ON COLUMN public.battle_prompts.authoring_origin IS 'Declared authoring analytics only. Never included in judge input.';

-- The existing prompt RPC remains compatible. This service-only wrapper shares
-- its battle-first serialization and only annotates the first accepted prompt.
CREATE OR REPLACE FUNCTION public.lock_prompt_with_origin(
 p_battle_id uuid, p_profile_id uuid, p_prompt_template_id uuid DEFAULT NULL,
 p_custom_prompt_text text DEFAULT NULL, p_move_type public.move_type DEFAULT 'attack',
 p_moderation_status public.moderation_status DEFAULT NULL, p_round_number integer DEFAULT 1,
 p_authoring_origin text DEFAULT 'unknown'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_existing uuid; v_prompt uuid;
BEGIN
 IF p_authoring_origin IS NULL OR p_authoring_origin NOT IN ('builder','manual','mixed','unknown') THEN
  RAISE EXCEPTION 'Invalid authoring origin' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.battles WHERE id=p_battle_id FOR UPDATE;
 SELECT id INTO v_existing FROM public.battle_prompts
 WHERE battle_id=p_battle_id AND profile_id=p_profile_id AND round_number=coalesce(p_round_number,1);
 v_prompt:=public.lock_prompt(p_battle_id,p_profile_id,p_prompt_template_id,p_custom_prompt_text,p_move_type,p_moderation_status,p_round_number);
 IF v_existing IS NULL THEN
  UPDATE public.battle_prompts SET authoring_origin=p_authoring_origin WHERE id=v_prompt;
 END IF;
 RETURN v_prompt;
END $$;
REVOKE ALL ON FUNCTION public.lock_prompt_with_origin(uuid,uuid,uuid,text,public.move_type,public.moderation_status,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lock_prompt_with_origin(uuid,uuid,uuid,text,public.move_type,public.moderation_status,integer,text) TO service_role;

ALTER TABLE public.composer_events DROP CONSTRAINT IF EXISTS composer_events_event_check;
ALTER TABLE public.composer_events ADD CONSTRAINT composer_events_event_check CHECK(event IN (
 'composer_opened','composer_changed','composer_mode_selected','composer_action_selected',
 'composer_intent_selected','composer_full_edit','composer_draft_recovered','composer_submitted',
 'composer_suggestions_pending','composer_suggestions_fallback','composer_suggestions_generated',
 'composer_suggestions_reroll','composer_explanation_read','composer_next_battle','composer_session_ended',
 'composer_inspiration_selected','composer_action_changed','composer_suggestions_applied'
));
