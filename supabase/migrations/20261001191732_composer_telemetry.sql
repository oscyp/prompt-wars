CREATE TABLE IF NOT EXISTS public.composer_events (
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 battle_id uuid NOT NULL REFERENCES public.battles(id) ON DELETE CASCADE,
 round_number integer NOT NULL CHECK(round_number BETWEEN 1 AND 3),
 session_id uuid NOT NULL,
 event text NOT NULL CHECK(event IN ('composer_opened','composer_changed','composer_mode_selected','composer_action_selected','composer_intent_selected','composer_full_edit','composer_draft_recovered','composer_submitted','composer_suggestions_pending','composer_suggestions_fallback','composer_suggestions_generated','composer_suggestions_reroll','composer_explanation_read','composer_next_battle','composer_session_ended')),
 duration_ms integer NOT NULL CHECK(duration_ms BETWEEN 0 AND 86400000),
 choice text CHECK(choice IN ('builder','write','suggestion','custom','free','paid')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(profile_id,battle_id,round_number,session_id,event)
);
ALTER TABLE public.composer_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.composer_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.composer_events TO authenticated;
GRANT ALL ON public.composer_events TO service_role;
CREATE POLICY composer_events_read_own ON public.composer_events FOR SELECT TO authenticated USING(profile_id=(SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS composer_events_created_at ON public.composer_events(created_at);

-- Out-of-order mobile flushes must not reduce accumulated active time.
CREATE OR REPLACE FUNCTION public.keep_composer_event_duration() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN NEW.duration_ms:=greatest(OLD.duration_ms,NEW.duration_ms); RETURN NEW; END $$;
CREATE TRIGGER keep_composer_event_duration BEFORE UPDATE ON public.composer_events FOR EACH ROW EXECUTE FUNCTION public.keep_composer_event_duration();
REVOKE ALL ON FUNCTION public.keep_composer_event_duration() FROM PUBLIC,anon,authenticated;
