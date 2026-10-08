-- Additive, disabled-by-default social registration. No real jurisdiction is seeded.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role, supabase_auth_admin;

CREATE TABLE IF NOT EXISTS private.auth_release (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  minimum_client_version text NOT NULL DEFAULT '1.4.0'
);
INSERT INTO private.auth_release(singleton) VALUES(true) ON CONFLICT DO NOTHING;
COMMENT ON COLUMN private.auth_release.minimum_client_version IS
 'Combined-release compatibility metadata. Provision the reviewed 1.4.0-or-later client before activation; this migration does not bump app versions.';

CREATE TABLE IF NOT EXISTS private.jurisdiction_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL CHECK(country ~ '^[A-Z]{2}$'),
  subdivision text NOT NULL DEFAULT '',
  version text NOT NULL CHECK(length(version)>0),
  minimum_age integer NOT NULL DEFAULT 13 CHECK(minimum_age BETWEEN 13 AND 120),
  independent_consent_age integer NOT NULL CHECK(independent_consent_age BETWEEN 13 AND 120),
  requires_subdivision boolean NOT NULL DEFAULT false,
  assurance text NOT NULL DEFAULT 'declared' CHECK(assurance IN ('declared','verified')),
  teen_purchases boolean NOT NULL DEFAULT false,
  processing_allowed boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  review_reference text,
  UNIQUE(country,subdivision,version),
  CHECK(approved_at IS NULL OR (review_reference IS NOT NULL AND length(btrim(review_reference))>0)),
  CHECK(subdivision='' OR subdivision ~ ('^'||country||'-[A-Z0-9]{1,3}$'))
);

CREATE TABLE IF NOT EXISTS private.registration_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  network_hash text NOT NULL,
  policy_id uuid NOT NULL REFERENCES private.jurisdiction_policies(id),
  age_at_assessment smallint NOT NULL CHECK(age_at_assessment BETWEEN 13 AND 120),
  next_birthday date NOT NULL,
  status text NOT NULL CHECK(status IN ('eligible','pending','approved','denied','expired','revoked','consumed')),
  grant_eligible boolean NOT NULL DEFAULT false,
  consent_reference text,
  consent_evidence jsonb,
  profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours'
);
CREATE INDEX IF NOT EXISTS registration_network_velocity ON private.registration_sessions(network_hash,created_at);

CREATE TABLE IF NOT EXISTS private.registration_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES private.registration_sessions(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK(provider IN ('email','apple','google')),
  subject text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
  consumed_at timestamptz,
  profile_id uuid,
  UNIQUE(registration_id,provider,subject)
);
CREATE INDEX IF NOT EXISTS registration_identity_permit ON private.registration_authorizations(provider,subject,expires_at);

CREATE TABLE IF NOT EXISTS private.account_eligibility (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id),
  policy_id uuid NOT NULL REFERENCES private.jurisdiction_policies(id),
  age_at_assessment smallint NOT NULL CHECK(age_at_assessment BETWEEN 13 AND 120),
  next_birthday date NOT NULL,
  consent_status text NOT NULL CHECK(consent_status IN ('not_required','approved','pending','denied','expired','revoked')),
  consent_reference text,
  consent_evidence jsonb,
  signup_grant_eligible boolean NOT NULL DEFAULT true,
  assessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS private.guardian_consent_events (
  event_id text PRIMARY KEY,
  registration_id uuid REFERENCES private.registration_sessions(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK(decision IN ('approved','denied','expired','revoked')),
  occurred_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.auth_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.jurisdiction_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.registration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.registration_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.account_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.guardian_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.auth_release,private.jurisdiction_policies,private.registration_sessions,
  private.registration_authorizations,private.account_eligibility,private.guardian_consent_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.assessed_age(p_age integer,p_next_birthday date)
RETURNS integer LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_age + CASE WHEN current_date < p_next_birthday THEN 0
 ELSE 1+date_part('year',age(current_date,p_next_birthday))::integer END
$$;

CREATE OR REPLACE FUNCTION public.auth_release_configuration()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',enabled,'minimum_client_version',minimum_client_version)
 FROM private.auth_release WHERE singleton
$$;

CREATE OR REPLACE FUNCTION public.registration_policy(p_country text,p_subdivision text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
 WITH latest_reviewed AS (
   SELECT DISTINCT ON (p.country,p.subdivision) p.*
   FROM private.jurisdiction_policies p
   WHERE p.country=p_country AND p.approved_at IS NOT NULL
   ORDER BY p.country,p.subdivision,p.approved_at DESC,p.version DESC
 )
 SELECT to_jsonb(p) FROM latest_reviewed p
 WHERE ((p.subdivision=p_subdivision AND (NOT p.requires_subdivision OR p_subdivision<>''))
     OR (p.subdivision='' AND NOT p.requires_subdivision))
 ORDER BY (p.subdivision=p_subdivision) DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.create_registration_session(
 p_token_hash text,p_network_hash text,p_policy_id uuid,p_age integer,p_next_birthday date,p_status text,p_grant_eligible boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.jurisdiction_policies; r uuid; velocity integer;
BEGIN
 IF (SELECT enabled FROM private.auth_release WHERE singleton) IS DISTINCT FROM true THEN RAISE EXCEPTION 'registration_unavailable'; END IF;
 SELECT * INTO p FROM private.jurisdiction_policies WHERE id=p_policy_id;
 IF p.id IS NULL OR p.approved_at IS NULL OR NOT p.processing_allowed OR p.assurance<>'declared'
   OR (p.requires_subdivision AND p.subdivision='') THEN
   RAISE EXCEPTION 'region_unavailable';
 END IF;
 IF p_age<GREATEST(13,p.minimum_age) OR p_age>120 OR p_next_birthday<=current_date OR p_next_birthday>current_date+366 THEN
   RAISE EXCEPTION 'age_ineligible';
 END IF;
 IF (p_age<p.independent_consent_age AND p_status<>'pending') OR p_status NOT IN ('eligible','pending') THEN
   RAISE EXCEPTION 'consent_required';
 END IF;
 -- Serialize per-network reservations so concurrent requests cannot defeat the cap.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_network_hash,401));
 SELECT count(*) INTO velocity FROM private.registration_sessions
 WHERE network_hash=p_network_hash AND created_at>now()-interval '24 hours';
 IF velocity>=10 THEN RAISE EXCEPTION 'registration_rate_limited'; END IF;
 INSERT INTO private.registration_sessions(token_hash,network_hash,policy_id,age_at_assessment,next_birthday,status,grant_eligible)
 VALUES(p_token_hash,p_network_hash,p_policy_id,p_age,p_next_birthday,p_status,p_grant_eligible AND velocity<3) RETURNING id INTO r;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.get_registration_context(p_token_hash text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
 SELECT to_jsonb(r)||jsonb_build_object('policy',to_jsonb(p))
 FROM private.registration_sessions r JOIN private.jurisdiction_policies p ON p.id=r.policy_id
 WHERE r.token_hash=p_token_hash AND r.expires_at>now()
$$;

CREATE OR REPLACE FUNCTION public.authorize_registration(p_token_hash text,p_provider text,p_subject text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.registration_sessions; p private.jurisdiction_policies; a private.registration_authorizations;
BEGIN
 IF (SELECT enabled FROM private.auth_release WHERE singleton) IS DISTINCT FROM true THEN RAISE EXCEPTION 'registration_unavailable'; END IF;
 SELECT * INTO r FROM private.registration_sessions WHERE token_hash=p_token_hash FOR UPDATE;
 SELECT * INTO p FROM private.jurisdiction_policies WHERE id=r.policy_id;
 IF r.id IS NULL OR r.expires_at<=now() OR r.status NOT IN ('eligible','approved') THEN RAISE EXCEPTION 'registration_required'; END IF;
 IF p.approved_at IS NULL OR NOT p.processing_allowed OR p.assurance<>'declared' THEN RAISE EXCEPTION 'region_unavailable'; END IF;
 IF r.age_at_assessment<GREATEST(13,p.minimum_age) THEN RAISE EXCEPTION 'age_ineligible'; END IF;
 IF r.age_at_assessment<p.independent_consent_age AND (r.status<>'approved'
   OR r.consent_evidence->>'kind' IS DISTINCT FROM 'guardian_consent'
   OR r.consent_evidence->>'policy_version' IS DISTINCT FROM p.version) THEN
   RAISE EXCEPTION 'consent_required';
 END IF;
 IF p_provider IS NULL OR p_provider NOT IN ('email','apple','google') OR p_subject IS NULL
   OR length(p_subject) NOT BETWEEN 1 AND 320 THEN RAISE EXCEPTION 'invalid_identity'; END IF;
 -- One registration may authorize only one identity. Repeated requests refresh the same unconsumed permit.
 IF EXISTS(SELECT 1 FROM private.registration_authorizations WHERE registration_id=r.id
   AND (provider<>p_provider OR subject<>p_subject OR consumed_at IS NOT NULL)) THEN RAISE EXCEPTION 'registration_already_bound'; END IF;
 INSERT INTO private.registration_authorizations(registration_id,provider,subject)
 VALUES(r.id,p_provider,p_subject)
 ON CONFLICT(registration_id,provider,subject) DO UPDATE SET expires_at=now()+interval '5 minutes'
 WHERE registration_authorizations.consumed_at IS NULL
 RETURNING * INTO a;
 RETURN jsonb_build_object('authorized',true,'authorization_id',a.id,'permit_expires_at',a.expires_at);
END $$;

CREATE OR REPLACE FUNCTION private.find_registration_authorization(p_user jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_provider text:=p_user->'app_metadata'->>'provider'; v_subject text; permit uuid;
BEGIN
 IF v_provider='email' THEN
   v_subject:=lower(btrim(p_user->>'email'));
   IF (p_user->'user_metadata'->>'registration_authorization') !~ '^[a-fA-F0-9-]{36}$' THEN RETURN NULL; END IF;
 ELSE
   v_subject:=p_user->'user_metadata'->>'sub';
 END IF;
 SELECT a.id INTO permit FROM private.registration_authorizations a
 JOIN private.registration_sessions r ON r.id=a.registration_id
 JOIN private.jurisdiction_policies p ON p.id=r.policy_id
 WHERE a.provider=v_provider AND a.subject=v_subject AND a.expires_at>now() AND a.consumed_at IS NULL
   AND r.expires_at>now() AND r.status IN ('eligible','approved')
   AND p.approved_at IS NOT NULL AND p.processing_allowed AND p.assurance='declared'
   AND r.age_at_assessment>=GREATEST(13,p.minimum_age)
   AND (r.age_at_assessment>=p.independent_consent_age OR (r.status='approved'
     AND r.consent_evidence->>'kind'='guardian_consent' AND r.consent_evidence->>'policy_version'=p.version))
   AND (v_provider<>'email' OR a.id::text=p_user->'user_metadata'->>'registration_authorization')
 ORDER BY a.expires_at DESC LIMIT 1;
 RETURN permit;
END $$;

CREATE OR REPLACE FUNCTION public.before_user_created_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (SELECT enabled FROM private.auth_release WHERE singleton) THEN RETURN '{}'::jsonb; END IF;
 IF private.find_registration_authorization(event->'user') IS NULL THEN
   RETURN jsonb_build_object('error',jsonb_build_object('http_code',403,'message','registration_required'));
 END IF;
 RETURN '{}'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE enabled boolean; a private.registration_authorizations; r private.registration_sessions; confirmed timestamptz;
BEGIN
 IF NEW.is_anonymous IS TRUE THEN RAISE EXCEPTION 'guest_accounts_disabled'; END IF;
 SELECT ar.enabled INTO enabled FROM private.auth_release ar WHERE singleton;
 IF enabled IS NULL THEN RAISE EXCEPTION 'registration_unavailable'; END IF;
 IF enabled THEN
   SELECT * INTO a FROM private.registration_authorizations WHERE id=private.find_registration_authorization(
     jsonb_build_object('email',NEW.email,'app_metadata',NEW.raw_app_meta_data,'user_metadata',NEW.raw_user_meta_data)) FOR UPDATE;
   IF a.id IS NULL OR a.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'registration_required'; END IF;
   SELECT * INTO r FROM private.registration_sessions WHERE id=a.registration_id FOR UPDATE;
   IF r.status NOT IN ('eligible','approved') OR r.expires_at<=now() THEN RAISE EXCEPTION 'registration_required'; END IF;
   UPDATE private.registration_authorizations SET consumed_at=now(),profile_id=NEW.id WHERE id=a.id;
 ELSE
   -- Compatibility until the reviewed combined release is activated.
   IF NEW.raw_user_meta_data->'age_confirmed' IS DISTINCT FROM 'true'::jsonb THEN
     RAISE EXCEPTION 'age_gate_failed: account creation requires 18+ confirmation';
   END IF;
   confirmed:=now();
 END IF;
 INSERT INTO public.profiles(id,username,display_name,age_confirmed_at)
 VALUES(NEW.id,'user_'||substr(replace(NEW.id::text,'-',''),1,15),'Player',confirmed) ON CONFLICT(id) DO NOTHING;
 IF enabled THEN
   INSERT INTO private.account_eligibility(profile_id,policy_id,age_at_assessment,next_birthday,consent_status,consent_reference,consent_evidence,signup_grant_eligible)
   VALUES(NEW.id,r.policy_id,r.age_at_assessment,r.next_birthday,
     CASE WHEN r.status='approved' THEN 'approved' ELSE 'not_required' END,r.consent_reference,r.consent_evidence,r.grant_eligible);
   UPDATE private.registration_sessions SET status='consumed',profile_id=NEW.id WHERE id=r.id;
   -- The profile trigger has created this server-owned signal row already.
   UPDATE public.account_abuse_signals SET ftuo_eligible=r.grant_eligible WHERE profile_id=NEW.id;
 END IF;
 IF NOT enabled OR r.grant_eligible THEN
   BEGIN
     PERFORM public.grant_credits(NEW.id,10,'welcome_grant','welcome_'||NEW.id::text,NULL,NULL,
       jsonb_build_object('source','signup'));
   EXCEPTION WHEN OTHERS THEN RAISE WARNING 'welcome grant deferred for account'; END;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.account_capability(p_profile_id uuid,p_capability text DEFAULT 'play')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE e private.account_eligibility; p private.jurisdiction_policies; adult_confirmation timestamptz; deleted timestamptz; years integer;
BEGIN
 IF p_profile_id IS NULL THEN RETURN false; END IF;
 -- SECURITY DEFINER runs as its owner; the session role still identifies a
 -- PostgREST caller. Keep service/database checks available without a user JWT.
 IF current_setting('role',true)='authenticated' AND auth.uid() IS DISTINCT FROM p_profile_id THEN RETURN false; END IF;
 IF p_capability NOT IN ('play','generate','grant','purchase') OR p_capability IS NULL THEN RETURN false; END IF;
 SELECT age_confirmed_at,deleted_at INTO adult_confirmation,deleted FROM public.profiles WHERE id=p_profile_id;
 IF NOT FOUND OR deleted IS NOT NULL THEN RETURN false; END IF;
 IF (SELECT enabled FROM private.auth_release WHERE singleton) IS NULL THEN RETURN false; END IF;
 IF NOT (SELECT enabled FROM private.auth_release WHERE singleton) THEN RETURN true; END IF;
 SELECT * INTO e FROM private.account_eligibility WHERE profile_id=p_profile_id;
 -- Existing adult evidence is preserved; a revoked eligibility record never falls back to it.
 IF e.profile_id IS NULL THEN RETURN adult_confirmation IS NOT NULL; END IF;
 SELECT * INTO p FROM private.jurisdiction_policies WHERE id=e.policy_id;
 years:=private.assessed_age(e.age_at_assessment,e.next_birthday);
 IF p.approved_at IS NULL OR NOT p.processing_allowed OR p.assurance<>'declared'
   OR years<GREATEST(13,p.minimum_age) OR e.consent_status NOT IN ('approved','not_required')
   OR (years<p.independent_consent_age AND (e.consent_status<>'approved'
     OR e.consent_evidence->>'kind' IS DISTINCT FROM 'guardian_consent'
     OR e.consent_evidence->>'policy_version' IS DISTINCT FROM p.version)) THEN RETURN false; END IF;
 IF p_capability='purchase' THEN RETURN years>=18 OR p.teen_purchases; END IF;
 RETURN p_capability IN ('play','generate','grant');
END $$;

CREATE OR REPLACE FUNCTION public.get_account_eligibility(p_profile_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',(SELECT enabled FROM private.auth_release WHERE singleton),
   'status',CASE WHEN private.account_capability(p_profile_id,'play') THEN 'eligible'
     WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=p_profile_id AND deleted_at IS NOT NULL) THEN 'deleted'
     WHEN EXISTS(SELECT 1 FROM private.account_eligibility WHERE profile_id=p_profile_id AND consent_status='revoked') THEN 'revoked'
     ELSE 'needs_registration' END,
   'can_play',private.account_capability(p_profile_id,'play'),
   'can_generate',private.account_capability(p_profile_id,'generate'),
   'can_purchase',private.account_capability(p_profile_id,'purchase'),
   'can_grant',private.account_capability(p_profile_id,'grant'))
$$;

CREATE OR REPLACE FUNCTION public.complete_existing_account_registration(p_profile_id uuid,p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.registration_sessions; p private.jurisdiction_policies;
BEGIN
 IF (SELECT enabled FROM private.auth_release WHERE singleton) IS DISTINCT FROM true THEN RAISE EXCEPTION 'registration_unavailable'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_profile_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account_unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM private.account_eligibility WHERE profile_id=p_profile_id) THEN RAISE EXCEPTION 'eligibility_already_recorded'; END IF;
 SELECT * INTO r FROM private.registration_sessions WHERE token_hash=p_token_hash FOR UPDATE;
 SELECT * INTO p FROM private.jurisdiction_policies WHERE id=r.policy_id;
 IF r.id IS NULL OR r.status NOT IN ('eligible','approved') OR r.expires_at<=now() OR
   p.approved_at IS NULL OR NOT p.processing_allowed OR p.assurance<>'declared' OR
   r.age_at_assessment<GREATEST(13,p.minimum_age) OR
   (r.age_at_assessment<p.independent_consent_age AND (r.status<>'approved'
     OR r.consent_evidence->>'kind' IS DISTINCT FROM 'guardian_consent'
     OR r.consent_evidence->>'policy_version' IS DISTINCT FROM p.version)) THEN
   RAISE EXCEPTION 'registration_required';
 END IF;
 INSERT INTO private.account_eligibility(profile_id,policy_id,age_at_assessment,next_birthday,consent_status,consent_reference,consent_evidence,signup_grant_eligible)
 VALUES(p_profile_id,r.policy_id,r.age_at_assessment,r.next_birthday,
 CASE WHEN r.status='approved' THEN 'approved' ELSE 'not_required' END,r.consent_reference,r.consent_evidence,r.grant_eligible);
 UPDATE private.registration_sessions SET status='consumed',profile_id=p_profile_id WHERE id=r.id;
 UPDATE public.account_abuse_signals SET ftuo_eligible=coalesce(ftuo_eligible,false) AND r.grant_eligible WHERE profile_id=p_profile_id;
 RETURN public.get_account_eligibility(p_profile_id);
END $$;

CREATE OR REPLACE FUNCTION public.apply_guardian_consent(p_registration_id uuid,p_event_id text,p_decision text,p_occurred_at timestamptz,p_reference text,p_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.registration_sessions;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('approved','denied','expired','revoked')
   OR p_event_id IS NULL OR length(btrim(p_event_id))=0 OR p_occurred_at IS NULL
   OR p_occurred_at>now()+interval '5 minutes' THEN RAISE EXCEPTION 'invalid_consent_event'; END IF;
 SELECT * INTO r FROM private.registration_sessions WHERE id=p_registration_id FOR UPDATE;
 IF r.id IS NULL THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM private.guardian_consent_events WHERE event_id=p_event_id) THEN RETURN false; END IF;
 IF p_reference IS NULL OR length(btrim(p_reference))=0
   OR p_evidence->>'kind' IS DISTINCT FROM 'guardian_consent'
   OR p_evidence->>'source' IS DISTINCT FROM 'kws_consent_management'
   OR p_evidence->>'policy_version' IS DISTINCT FROM (SELECT version FROM private.jurisdiction_policies WHERE id=r.policy_id)
   OR (p_decision='approved' AND coalesce(length(btrim(p_evidence->>'evidence_reference')),0)=0)
   OR (r.consent_reference IS NOT NULL AND r.consent_reference<>p_reference) THEN
   RAISE EXCEPTION 'consent_evidence_required';
 END IF;
 IF EXISTS(SELECT 1 FROM private.guardian_consent_events WHERE registration_id=r.id AND occurred_at>=p_occurred_at) THEN RETURN false; END IF;
 INSERT INTO private.guardian_consent_events(event_id,registration_id,decision,occurred_at)
 VALUES(p_event_id,r.id,p_decision,p_occurred_at);
 -- A revoked/denied request cannot be resurrected by a delayed approval.
 IF r.status IN ('revoked','denied','expired') AND p_decision='approved' THEN RETURN false; END IF;
 UPDATE private.registration_sessions SET status=CASE WHEN profile_id IS NOT NULL AND p_decision='approved' THEN 'consumed' ELSE p_decision END,
   consent_reference=p_reference,consent_evidence=p_evidence WHERE id=r.id;
 UPDATE private.account_eligibility SET consent_status=p_decision,consent_reference=p_reference,consent_evidence=p_evidence WHERE profile_id=r.profile_id;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.erase_registration_data(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM private.account_eligibility WHERE profile_id=p_user_id;
 -- An existing account may have an unused registration permit from a retry.
 -- Resolve identity bindings before deleting Auth; user-editable metadata is not
 -- an authority for provider ownership here.
 DELETE FROM private.registration_sessions r WHERE EXISTS(
   SELECT 1 FROM private.registration_authorizations a WHERE a.registration_id=r.id AND (
     a.profile_id=p_user_id OR
     (a.provider='email' AND a.subject=(SELECT lower(btrim(email)) FROM auth.users WHERE id=p_user_id)) OR
     EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=p_user_id AND i.provider=a.provider AND i.identity_data->>'sub'=a.subject)));
 DELETE FROM private.registration_sessions WHERE profile_id=p_user_id;
 DELETE FROM private.registration_authorizations WHERE profile_id=p_user_id;
END $$;

CREATE OR REPLACE FUNCTION private.purge_expired_registration_data()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE removed integer;
BEGIN
 -- Active-account rows route later consent revocations and are erased on deletion.
 -- Unbound permits and guardian-event rows cascade with their expired session.
 DELETE FROM private.registration_sessions WHERE profile_id IS NULL AND expires_at<=now();
 GET DIAGNOSTICS removed = ROW_COUNT;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION private.purge_expired_registration_data() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.purge_expired_registration_data() TO service_role;
SELECT cron.schedule('purge-expired-registration-data','17 * * * *','SELECT private.purge_expired_registration_data();');

-- Idempotent replay, refunds and purchased value remain available after consent
-- withdrawal. New rewards are a no-op so Tier 0 battle closure never gets stuck.
CREATE OR REPLACE FUNCTION public.grant_credits(
 p_profile_id uuid,p_amount integer,p_reason text,p_idempotency_key text DEFAULT NULL,
 p_battle_id uuid DEFAULT NULL,p_purchase_id uuid DEFAULT NULL,p_metadata jsonb DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE transaction_id uuid; current_balance integer;
BEGIN
 IF p_idempotency_key IS NOT NULL THEN
   SELECT id INTO transaction_id FROM public.wallet_transactions WHERE idempotency_key=p_idempotency_key;
   IF transaction_id IS NOT NULL THEN RETURN transaction_id; END IF;
 END IF;
 IF p_reason NOT IN ('purchase','ftuo_purchase','video_generation_failed')
   AND p_reason !~ '(^|_)refund(:|_|$)' AND NOT private.account_capability(p_profile_id,'grant') THEN RETURN NULL; END IF;
 -- Signup velocity suppresses one-time acquisition incentives only. Eligible
 -- accounts continue earning ordinary daily and battle progression rewards.
 IF p_reason ~ '^(welcome|onboarding|tutorial)(_|$)' AND EXISTS(
   SELECT 1 FROM private.account_eligibility WHERE profile_id=p_profile_id AND NOT signup_grant_eligible
 ) THEN RETURN NULL; END IF;
 SELECT coalesce(sum(amount),0) INTO current_balance FROM public.wallet_transactions
 WHERE profile_id=p_profile_id AND currency_type='credits';
 INSERT INTO public.wallet_transactions(profile_id,amount,balance_after,currency_type,reason,battle_id,purchase_id,metadata,idempotency_key)
 VALUES(p_profile_id,p_amount,current_balance+p_amount,'credits',p_reason,p_battle_id,p_purchase_id,p_metadata,p_idempotency_key)
 RETURNING id INTO transaction_id;
 RETURN transaction_id;
END $$;

-- Optional credit spending is a purchase even when the credits were earned.
-- Enforce at the ledger insert so both spend_credits and the Bo3 hold RPC obey
-- the same policy. Existing debits/idempotent retries, zero-cost grants, refunds
-- and the leave-battle settlement remain available.
CREATE OR REPLACE FUNCTION private.enforce_credit_purchase_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.amount<0 AND NEW.currency_type='credits' AND NEW.reason IS DISTINCT FROM 'leave_battle'
   AND NOT private.account_capability(NEW.profile_id,'purchase') THEN
   RAISE EXCEPTION 'account_purchase_restricted';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enforce_credit_purchase_eligibility() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS enforce_credit_purchase_eligibility ON public.wallet_transactions;
CREATE TRIGGER enforce_credit_purchase_eligibility BEFORE INSERT ON public.wallet_transactions
 FOR EACH ROW EXECUTE FUNCTION private.enforce_credit_purchase_eligibility();

-- Keep existing queue validation/idempotency/caps; only prevent new generation
-- when either human participant's consent/eligibility no longer permits it.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.enqueue_auto_battle_video(uuid,uuid,smallint,text)'::regprocedure) INTO definition;
 IF position('registration_generation_guard' IN definition)=0 THEN
   definition:=regexp_replace(definition,'\mBEGIN\M', E'BEGIN\n -- registration_generation_guard\n IF EXISTS(SELECT 1 FROM public.battles b WHERE b.id=p_battle_id AND (NOT private.account_capability(b.player_one_id,''generate'') OR (NOT coalesce(b.is_player_two_bot,false) AND b.player_two_id IS NOT NULL AND NOT private.account_capability(b.player_two_id,''generate'')))) THEN RETURN NULL; END IF;', 'i');
   EXECUTE definition;
 END IF;
 SELECT pg_get_functiondef('public.get_first_time_offer(uuid)'::regprocedure) INTO definition;
 IF position('registration_purchase_guard' IN definition)=0 THEN
   definition:=regexp_replace(definition,'\mBEGIN\M', E'BEGIN\n -- registration_purchase_guard\n IF NOT private.account_capability(p_profile_id,''purchase'') OR EXISTS(SELECT 1 FROM public.account_abuse_signals WHERE profile_id=p_profile_id AND ftuo_eligible IS DISTINCT FROM true) THEN RETURN jsonb_build_object(''eligible'',false,''reason'',''account_ineligible''); END IF;', 'i');
   EXECUTE definition;
 END IF;
END $$;

-- Restrictive policies compose with existing ownership checks. Service-role work
-- (including closing an in-progress battle) is not blocked by these policies.
-- Account privacy management remains available under its existing own-row RLS.
DROP POLICY IF EXISTS account_eligibility_access ON public.blocks;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity AND c.relname<>'blocks' LOOP
   EXECUTE format('DROP POLICY IF EXISTS account_eligibility_access ON public.%I',t.relname);
   EXECUTE format('CREATE POLICY account_eligibility_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.account_capability((select auth.uid()),''play'')) WITH CHECK (private.account_capability((select auth.uid()),''play''))',t.relname);
 END LOOP;
END $$;
DROP POLICY IF EXISTS account_eligibility_access ON storage.objects;
CREATE POLICY account_eligibility_access ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING(private.account_capability((select auth.uid()),'play')) WITH CHECK(private.account_capability((select auth.uid()),'play'));

-- Client-callable SECURITY DEFINER RPCs bypass RLS; fence their entry points too.
-- Preserve signatures and bodies; insert an eligibility check in each PL/pgSQL body.
DO $$ DECLARE f record; definition text; BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND p.prosecdef AND l.lanname='plpgsql'
 AND p.proname IN ('get_battle_templates','get_opponent_move_profile','get_my_entitlements','can_appeal') LOOP
   definition:=pg_get_functiondef(f.oid);
   IF position('account_eligibility_required' IN definition)=0 THEN
     definition:=regexp_replace(definition,'\mBEGIN\M', E'BEGIN\n IF auth.uid() IS NOT NULL AND NOT private.account_capability(auth.uid(),''play'') THEN RAISE EXCEPTION ''account_eligibility_required''; END IF;', 'i');
     EXECUTE definition;
   END IF;
 END LOOP;
END $$;

-- These client reads use owner rights and therefore need explicit caller gates.
-- Keep the presentation view's public columns; switching it to invoker would
-- hide opponents' characters even from eligible players.
CREATE OR REPLACE VIEW public.public_player_cosmetics WITH (security_invoker=false) AS
 SELECT c.profile_id,c.cosmetic_config,c.archetype,c.signature_color
 FROM public.characters c WHERE c.is_active=true
   AND (current_setting('role',true)<>'authenticated' OR private.account_capability(auth.uid(),'play'));

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS TABLE(profile_id uuid,is_subscriber boolean,subscription_tier text,
 monthly_video_allowance_remaining integer,credits_balance bigint,priority_queue boolean,
 cosmetic_unlocks jsonb,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.profile_id,e.is_subscriber,e.subscription_tier,e.monthly_video_allowance_remaining,
   e.credits_balance,e.priority_queue,e.cosmetic_unlocks,e.updated_at
 FROM public.entitlements e WHERE e.profile_id=auth.uid() AND private.account_capability(auth.uid(),'play')
$$;

CREATE OR REPLACE FUNCTION public.is_blocked(p_profile_id uuid,p_other_profile_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role',true)='authenticated' AND
   (NOT private.account_capability(auth.uid(),'play') OR
    (auth.uid() IS DISTINCT FROM p_profile_id AND auth.uid() IS DISTINCT FROM p_other_profile_id)) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.blocks
   WHERE (blocker_profile_id=p_profile_id AND blocked_profile_id=p_other_profile_id)
     OR (blocker_profile_id=p_other_profile_id AND blocked_profile_id=p_profile_id));
END $$;

CREATE OR REPLACE FUNCTION public.user_can_see_signature_item(p_item_id uuid,p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (current_setting('role',true)<>'authenticated' OR
   (p_user=auth.uid() AND private.account_capability(auth.uid(),'play'))) AND EXISTS(
   SELECT 1 FROM public.characters c JOIN public.battles b
     ON b.player_one_character_id=c.id OR b.player_two_character_id=c.id
   WHERE c.signature_item_id=p_item_id AND b.status IN
     ('matched','waiting_for_prompts','resolving','result_ready','generating_video','completed')
     AND b.created_at>now()-interval '30 days' AND (b.player_one_id=p_user OR b.player_two_id=p_user))
$$;

-- Scope EXECUTE explicitly: private tables and signup authorizations are never client APIs.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='public' AND p.proname IN ('auth_release_configuration','registration_policy','create_registration_session',
 'get_registration_context','authorize_registration','before_user_created_hook','get_account_eligibility',
 'complete_existing_account_registration','apply_guardian_consent','erase_registration_data'))
 OR (n.nspname='private' AND p.proname IN ('assessed_age','find_registration_authorization','account_capability')) LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION private.account_capability(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.before_user_created_hook(jsonb) TO supabase_auth_admin;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
