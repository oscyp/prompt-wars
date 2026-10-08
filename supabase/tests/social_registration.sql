-- Run against an isolated local test database after migrations. Rolls back all data.
BEGIN;
DO $$
DECLARE u uuid:=gen_random_uuid(); p uuid; r uuid; a uuid; result jsonb;
BEGIN
 UPDATE private.auth_release SET enabled=true WHERE singleton;
 BEGIN
   INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
   VALUES(u,'bypass@example.test','{"provider":"email"}','{"age_confirmed":true}');
   RAISE EXCEPTION 'bypass was accepted';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='bypass was accepted' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%registration_required%' THEN RAISE; END IF;
 END;
 INSERT INTO private.jurisdiction_policies(country,version,minimum_age,independent_consent_age,
   approved_at,review_reference,processing_allowed)
 VALUES('ZZ','test-only',13,16,now(),'test fixture; never deploy',true) RETURNING id INTO p;
 r:=public.create_registration_session('test-token','test-network',p,17,current_date+100,'eligible',true);
 result:=public.authorize_registration('test-token','email','new@example.test');
 a:=(result->>'authorization_id')::uuid;
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
 VALUES(u,'new@example.test','{"provider":"email"}',jsonb_build_object('registration_authorization',a));
 IF (SELECT age_confirmed_at IS NOT NULL FROM public.profiles WHERE id=u) THEN
   RAISE EXCEPTION 'fabricated adult confirmation';
 END IF;
 IF NOT private.account_capability(u,'play') THEN RAISE EXCEPTION 'eligible teen blocked'; END IF;
 IF private.account_capability(u,'purchase') THEN RAISE EXCEPTION 'teen purchase policy ignored'; END IF;
 IF (SELECT count(*) FROM public.wallet_transactions WHERE profile_id=u AND reason='welcome_grant')<>1 THEN
   RAISE EXCEPTION 'welcome grant missing or duplicated';
 END IF;
 IF NOT (SELECT consumed_at IS NOT NULL FROM private.registration_authorizations WHERE id=a) THEN
   RAISE EXCEPTION 'authorization not consumed';
 END IF;
 UPDATE private.account_eligibility SET consent_status='revoked' WHERE profile_id=u;
 PERFORM set_config('test.revoked_user',u::text,true);
 IF private.account_capability(u,'play') THEN RAISE EXCEPTION 'revoked consent allowed gameplay'; END IF;
 IF has_table_privilege('authenticated','private.account_eligibility','SELECT') THEN
   RAISE EXCEPTION 'private eligibility is client readable';
 END IF;
 IF has_function_privilege('anon','public.authorize_registration(text,text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'anonymous caller can mint authorization';
 END IF;
END $$;

-- Approval needs an actual review reference: SQL NULL must not satisfy a CHECK.
DO $$ BEGIN
 BEGIN
   INSERT INTO private.jurisdiction_policies(country,version,minimum_age,independent_consent_age,approved_at,processing_allowed)
   VALUES('ZZ','missing-review',13,16,now(),true);
   RAISE EXCEPTION 'missing review reference accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO private.jurisdiction_policies(country,version,minimum_age,independent_consent_age,approved_at,review_reference,processing_allowed,requires_subdivision)
 VALUES('ZY','test-only',13,16,now(),'test fixture; never deploy',true,true);
 IF public.registration_policy('ZY','') IS NOT NULL OR public.registration_policy('ZY','ZY-XX') IS NOT NULL THEN
   RAISE EXCEPTION 'subdivision-required country fallback authorized'; END IF;
 INSERT INTO private.jurisdiction_policies(country,version,minimum_age,independent_consent_age,approved_at,review_reference,processing_allowed,requires_subdivision)
 VALUES('ZX','old-test-policy',13,16,now()-interval '1 day','test fixture; never deploy',true,false),
   ('ZX','new-test-policy',13,16,now(),'test fixture; never deploy',true,true);
 IF public.registration_policy('ZX','') IS NOT NULL OR public.registration_policy('ZX','ZX-XX') IS NOT NULL THEN
   RAISE EXCEPTION 'superseded country policy bypassed required subdivision'; END IF;
 INSERT INTO private.jurisdiction_policies(country,subdivision,version,minimum_age,independent_consent_age,approved_at,review_reference,processing_allowed)
 VALUES('ZX','ZX-AA','reviewed-region',13,16,now()-interval '2 days','test fixture; never deploy',true);
 IF public.registration_policy('ZX','ZX-AA')->>'version' IS DISTINCT FROM 'reviewed-region' THEN
   RAISE EXCEPTION 'independently reviewed subdivision was not selected'; END IF;
 UPDATE private.jurisdiction_policies SET requires_subdivision=false,processing_allowed=false WHERE country='ZX' AND version='new-test-policy';
 IF (public.registration_policy('ZX','')->>'processing_allowed')::boolean IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'unavailable current country fell back to superseded approval'; END IF;
END $$;

DO $$
DECLARE p uuid; r uuid; permit uuid; social_user uuid:=gen_random_uuid(); email_user uuid:=gen_random_uuid();
  legacy_user uuid:=gen_random_uuid(); changed_user uuid:=gen_random_uuid(); reply jsonb;
BEGIN
 SELECT id INTO p FROM private.jurisdiction_policies WHERE country='ZZ' AND version='test-only';
 BEGIN
   PERFORM public.create_registration_session('underage','net-underage',p,12,current_date+100,'eligible',true);
   RAISE EXCEPTION 'under13 session accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%age_ineligible%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM public.create_registration_session('needs-consent','net-consent',p,14,current_date+100,'eligible',true);
   RAISE EXCEPTION 'guardian requirement bypassed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%consent_required%' THEN RAISE; END IF; END;
 r:=public.create_registration_session('consent-session','net-consent',p,14,current_date+100,'pending',true);
 BEGIN
   PERFORM public.apply_guardian_consent(r,'missing-evidence-kind','approved',now(),'verified-reference',jsonb_build_object('policy_version','test-only'));
   RAISE EXCEPTION 'missing consent kind accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%consent_evidence_required%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM public.apply_guardian_consent(r,'pv-is-not-consent','approved',now(),'verified-reference',jsonb_build_object('kind','parent_verification','policy_version','test-only'));
   RAISE EXCEPTION 'parent verification accepted as consent';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%consent_evidence_required%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM public.apply_guardian_consent(r,'wrong-policy-version','approved',now(),'verified-reference',jsonb_build_object('kind','guardian_consent','source','kws_consent_management','policy_version','old-policy'));
   RAISE EXCEPTION 'wrong policy consent accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%consent_evidence_required%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM public.apply_guardian_consent(r,'missing-evidence-reference','approved',now(),'verified-reference',jsonb_build_object('kind','guardian_consent','source','kws_consent_management','policy_version','test-only'));
   RAISE EXCEPTION 'missing consent evidence reference accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%consent_evidence_required%' THEN RAISE; END IF; END;
 PERFORM public.apply_guardian_consent(r,'verified-consent','approved',now(),'verified-reference',jsonb_build_object('kind','guardian_consent','source','kws_consent_management','policy_version','test-only','evidence_reference','reviewed-evidence'));
 IF public.apply_guardian_consent(r,'verified-consent','approved',now(),'verified-reference',jsonb_build_object('kind','guardian_consent','source','kws_consent_management','policy_version','test-only','evidence_reference','reviewed-evidence')) THEN
   RAISE EXCEPTION 'consent event replay accepted'; END IF;
 BEGIN
   PERFORM public.apply_guardian_consent(r,'wrong-revocation-reference','revoked',now()+interval '1 second','other-reference',jsonb_build_object('kind','guardian_consent','source','kws_consent_management','policy_version','test-only'));
   RAISE EXCEPTION 'unbound revocation accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%consent_evidence_required%' THEN RAISE; END IF; END;
 PERFORM public.apply_guardian_consent(r,'consent-revoked','revoked',now()+interval '1 second','verified-reference',jsonb_build_object('kind','guardian_consent','source','kws_consent_management','policy_version','test-only'));
 IF public.apply_guardian_consent(r,'late-approval','approved',now()+interval '2 seconds','verified-reference',jsonb_build_object('kind','guardian_consent','source','kws_consent_management','policy_version','test-only','evidence_reference','reviewed-evidence')) THEN
   RAISE EXCEPTION 'terminal consent was resurrected'; END IF;
 BEGIN
   PERFORM public.authorize_registration('consent-session','email','revoked-consent@example.test');
   RAISE EXCEPTION 'revoked consent authorized signup';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_required%' THEN RAISE; END IF; END;

 -- A social permit is bound to the verified provider+subject, never metadata provider.
 r:=public.create_registration_session('social-session','net-social',p,17,current_date+100,'eligible',true);
 reply:=public.authorize_registration('social-session','apple','apple-verified-subject');
 BEGIN
   INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
   VALUES(gen_random_uuid(),'spoof@example.test','{"provider":"email"}',jsonb_build_object('provider','apple','sub','apple-verified-subject','registration_authorization',reply->>'authorization_id'));
   RAISE EXCEPTION 'email metadata impersonated Apple provider';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_required%' THEN RAISE; END IF; END;
 BEGIN
   INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
   VALUES(gen_random_uuid(),'wrong-sub@example.test','{"provider":"apple"}','{"sub":"wrong-subject"}');
   RAISE EXCEPTION 'social permit accepted wrong subject';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_required%' THEN RAISE; END IF; END;
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
 VALUES(social_user,'social@example.test','{"provider":"apple"}','{"sub":"apple-verified-subject"}');
 BEGIN
   INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
   VALUES(gen_random_uuid(),'replay@example.test','{"provider":"apple"}','{"sub":"apple-verified-subject"}');
   RAISE EXCEPTION 'social permit replay accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_required%' THEN RAISE; END IF; END;
 PERFORM set_config('test.eligible_user',social_user::text,true);

 r:=public.create_registration_session('email-expiry','net-email',p,17,current_date+100,'eligible',true);
 permit:=(public.authorize_registration('email-expiry','email','expired@example.test')->>'authorization_id')::uuid;
 UPDATE private.registration_authorizations SET expires_at=now()-interval '1 second' WHERE id=permit;
 BEGIN
   INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
   VALUES(email_user,'expired@example.test','{"provider":"email"}',jsonb_build_object('registration_authorization',permit));
   RAISE EXCEPTION 'expired permit accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_required%' THEN RAISE; END IF; END;
 permit:=(public.authorize_registration('email-expiry','email','expired@example.test')->>'authorization_id')::uuid;
 BEGIN
   INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
   VALUES(email_user,'other-email@example.test','{"provider":"email"}',jsonb_build_object('registration_authorization',permit));
   RAISE EXCEPTION 'email permit rebound to different identity';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_required%' THEN RAISE; END IF; END;

 -- Legacy adults continue, while a new assessment cannot ignore a tightened policy.
 UPDATE private.auth_release SET enabled=false WHERE singleton;
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
 VALUES(legacy_user,'legacy-adult@example.test','{"provider":"email"}','{"age_confirmed":true}'),
   (changed_user,'changed-policy@example.test','{"provider":"email"}','{"age_confirmed":true}');
 BEGIN
   INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data)
   VALUES(gen_random_uuid(),true,'{"provider":"anonymous"}','{"age_confirmed":true}');
   RAISE EXCEPTION 'guest account accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%guest_accounts_disabled%' THEN RAISE; END IF; END;
 UPDATE private.auth_release SET enabled=true WHERE singleton;
 IF NOT private.account_capability(legacy_user,'play') THEN RAISE EXCEPTION 'legacy adult lost access'; END IF;
 PERFORM set_config('test.legacy_user',legacy_user::text,true);
 r:=public.create_registration_session('changed-policy','net-policy',p,17,current_date+100,'eligible',true);
 UPDATE private.jurisdiction_policies SET minimum_age=18 WHERE id=p;
 BEGIN
   PERFORM public.authorize_registration('changed-policy','email','changed-policy@example.test');
   RAISE EXCEPTION 'new minimum age ignored when authorizing';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%age_ineligible%' THEN RAISE; END IF; END;
 BEGIN
   PERFORM public.complete_existing_account_registration(changed_user,'changed-policy');
   RAISE EXCEPTION 'new minimum age ignored for existing account';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%registration_required%' THEN RAISE; END IF; END;
 UPDATE private.jurisdiction_policies SET minimum_age=13 WHERE id=p;

 -- Fixed fixtures exercise the owner-rights public presentation view and block helper.
 INSERT INTO public.characters(profile_id,name,archetype,battle_cry)
 VALUES(social_user,'Eligibility fixture',(SELECT unnest(enum_range(NULL::public.archetype)) LIMIT 1),'Fixture');
 INSERT INTO public.blocks(blocker_profile_id,blocked_profile_id)
 VALUES(legacy_user,changed_user),(social_user,legacy_user);
 PERFORM set_config('test.other_user',changed_user::text,true);
END $$;

DO $$
DECLARE p uuid; r uuid; farm_user uuid:=gen_random_uuid(); a uuid; w uuid; b uuid; character_id uuid; spend_reason text;
  denied_user uuid:=current_setting('test.revoked_user')::uuid;
BEGIN
 SELECT id INTO p FROM private.jurisdiction_policies WHERE country='ZZ' AND version='test-only';
 r:=public.create_registration_session('farm-signup','net-farm',p,17,current_date+100,'eligible',false);
 a:=(public.authorize_registration('farm-signup','email','farm-signup@example.test')->>'authorization_id')::uuid;
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
 VALUES(farm_user,'farm-signup@example.test','{"provider":"email"}',jsonb_build_object('registration_authorization',a));
 IF NOT private.account_capability(farm_user,'grant') THEN RAISE EXCEPTION 'signup guard blocked earned progression'; END IF;
 IF NOT private.account_capability(farm_user,'play') THEN RAISE EXCEPTION 'signup grant guard blocked game access'; END IF;
 IF (SELECT ftuo_eligible FROM public.account_abuse_signals WHERE profile_id=farm_user) IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'signup guard did not reach FTUO'; END IF;
 IF public.grant_credits(farm_user,10,'onboarding','blocked-onboarding') IS NOT NULL THEN RAISE EXCEPTION 'onboarding bypassed signup guard'; END IF;
 IF public.grant_credits(farm_user,10,'welcome_grant','blocked-welcome') IS NOT NULL THEN RAISE EXCEPTION 'welcome bypassed signup guard'; END IF;
 IF public.grant_credits(farm_user,10,'tutorial_completed','blocked-tutorial') IS NOT NULL THEN RAISE EXCEPTION 'tutorial bypassed signup guard'; END IF;
 IF public.grant_credits(farm_user,1,'daily_login','allowed-earned-daily') IS NULL THEN RAISE EXCEPTION 'signup guard blocked earned daily reward'; END IF;
 IF public.grant_credits(farm_user,1,'battle_win','allowed-earned-battle') IS NULL THEN RAISE EXCEPTION 'signup guard blocked earned battle reward'; END IF;
 IF public.grant_credits(denied_user,10,'daily_login','blocked-daily') IS NOT NULL THEN RAISE EXCEPTION 'revoked account received new reward'; END IF;
 IF public.grant_credits(denied_user,10,'video_generation_failed_refund','allowed-refund') IS NULL THEN RAISE EXCEPTION 'revoked account refund withheld'; END IF;
 IF public.grant_credits(denied_user,10,'purchase','allowed-purchase') IS NULL THEN RAISE EXCEPTION 'paid credits withheld'; END IF;
 INSERT INTO public.blocks(blocker_profile_id,blocked_profile_id)
 VALUES(denied_user,current_setting('test.eligible_user')::uuid);
 FOREACH spend_reason IN ARRAY ARRAY['cosmetic_purchase','video_upgrade','draft_render','prompt_suggestions','identity'] LOOP
   BEGIN
     PERFORM public.spend_credits(current_setting('test.eligible_user')::uuid,1,spend_reason,'blocked-spend-'||spend_reason);
     RAISE EXCEPTION 'optional teen spending bypassed purchase policy';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%account_purchase_restricted%' THEN RAISE; END IF; END;
 END LOOP;
 IF public.spend_credits(current_setting('test.eligible_user')::uuid,1,'leave_battle','allowed-forfeit') IS NULL THEN
   RAISE EXCEPTION 'purchase restriction blocked battle exit'; END IF;
 IF public.spend_credits(current_setting('test.eligible_user')::uuid,0,'video_upgrade','allowed-free') IS NULL THEN
   RAISE EXCEPTION 'purchase restriction blocked a free grant'; END IF;
 SELECT id INTO w FROM public.wallet_transactions WHERE profile_id=denied_user AND reason='welcome_grant';
 IF public.grant_credits(denied_user,10,'welcome_grant','welcome_'||denied_user::text) IS DISTINCT FROM w THEN
   RAISE EXCEPTION 'idempotent granted reward became an error'; END IF;
 IF EXISTS(SELECT 1 FROM public.wallet_transactions WHERE idempotency_key IN ('blocked-onboarding','blocked-daily','blocked-welcome','blocked-tutorial')) THEN
   RAISE EXCEPTION 'blocked grants still wrote ledger'; END IF;
 UPDATE public.profiles SET created_at=now()-interval '48 hours' WHERE id=farm_user;
 UPDATE private.account_eligibility SET age_at_assessment=19 WHERE profile_id=farm_user;
 IF NOT private.account_capability(farm_user,'purchase') THEN RAISE EXCEPTION 'adult purchase fixture unavailable'; END IF;
 IF (public.get_first_time_offer(farm_user)->>'eligible')::boolean IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'signup guard bypassed by FTUO service'; END IF;

 INSERT INTO public.characters(profile_id,name,archetype,battle_cry)
 VALUES(denied_user,'Revoked fixture',(SELECT unnest(enum_range(NULL::public.archetype)) LIMIT 1),'Fixture') RETURNING id INTO character_id;
 INSERT INTO public.battles(player_one_id,player_one_character_id,is_player_two_bot,status,mode)
 VALUES(denied_user,character_id,true,'completed',(SELECT unnest(enum_range(NULL::public.battle_mode)) LIMIT 1)) RETURNING id INTO b;
 IF public.enqueue_auto_battle_video(b,NULL,NULL,'registration-ineligible-video-test') IS NOT NULL THEN
   RAISE EXCEPTION 'automatic video generated for revoked participant'; END IF;
 IF EXISTS(SELECT 1 FROM public.video_jobs WHERE battle_id=b) THEN RAISE EXCEPTION 'revoked automatic job was written'; END IF;
 INSERT INTO public.battles(player_one_id,player_two_id,player_one_character_id,player_two_character_id,is_player_two_bot,status,mode)
 VALUES(current_setting('test.eligible_user')::uuid,denied_user,
   (SELECT id FROM public.characters WHERE profile_id=current_setting('test.eligible_user')::uuid AND is_active LIMIT 1),
   character_id,false,'completed',(SELECT unnest(enum_range(NULL::public.battle_mode)) LIMIT 1)) RETURNING id INTO b;
 IF public.enqueue_auto_battle_video(b,NULL,NULL,'registration-ineligible-opponent') IS NOT NULL THEN
   RAISE EXCEPTION 'automatic video ignored revoked human opponent'; END IF;
 -- Current cinematic funding requires a completed Bo3 round before it reaches
 -- the ledger purchase gate that this case exercises.
 UPDATE public.battles SET format='bo3',best_of=3 WHERE id=b;
 INSERT INTO public.battle_rounds(battle_id,round_number,status) VALUES(b,1,'result_ready');
 BEGIN
   PERFORM public.reserve_round_upgrade_credit(current_setting('test.eligible_user')::uuid,b,1::smallint,'blocked-bo3-credit');
   RAISE EXCEPTION 'direct Bo3 credit debit bypassed purchase policy';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%account_purchase_restricted%' THEN RAISE; END IF; END;
 UPDATE private.registration_sessions SET expires_at=now()-interval '1 second' WHERE token_hash='email-expiry';
 PERFORM private.purge_expired_registration_data();
 IF EXISTS(SELECT 1 FROM private.registration_sessions WHERE token_hash='email-expiry') THEN RAISE EXCEPTION 'expired unbound data retained'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.registration_sessions WHERE id=r AND profile_id=farm_user) THEN RAISE EXCEPTION 'active consent routing was purged'; END IF;
 r:=public.create_registration_session('erase-pending','net-erasure',p,19,current_date+100,'eligible',true);
 PERFORM public.authorize_registration('erase-pending','email','legacy-adult@example.test');
 PERFORM public.erase_registration_data(current_setting('test.legacy_user')::uuid);
 IF EXISTS(SELECT 1 FROM private.registration_sessions WHERE id=r) THEN RAISE EXCEPTION 'unbound matching identity retained after deletion'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.eligible_user'),true);
DO $$ BEGIN
 -- Later private-schema migrations may forbid direct client helper calls;
 -- application-facing RLS and entitlement behavior is asserted below either way.
 IF has_schema_privilege(current_user,'private','USAGE') THEN
   IF NOT private.account_capability(auth.uid(),'play') THEN RAISE EXCEPTION 'own eligible capability denied'; END IF;
   IF private.account_capability(current_setting('test.legacy_user')::uuid,'play') THEN RAISE EXCEPTION 'cross-user capability probe'; END IF;
 ELSE
   BEGIN
     PERFORM private.account_capability(current_setting('test.legacy_user')::uuid,'play');
     RAISE EXCEPTION 'cross-user capability probe';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'eligible RLS access denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.get_my_entitlements()) THEN RAISE EXCEPTION 'eligible entitlements denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.public_player_cosmetics WHERE profile_id=auth.uid()) THEN RAISE EXCEPTION 'eligible presentation denied'; END IF;
 IF public.is_blocked(current_setting('test.legacy_user')::uuid,current_setting('test.other_user')::uuid) THEN
   RAISE EXCEPTION 'cross-user block probe'; END IF;
 IF NOT public.is_blocked(auth.uid(),current_setting('test.legacy_user')::uuid) THEN RAISE EXCEPTION 'own block check denied'; END IF;
 BEGIN
   PERFORM public.authorize_registration('social-session','email','forged@example.test');
   RAISE EXCEPTION 'client minted a permit';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('test.revoked_user'),true);
DO $$ BEGIN
 IF has_schema_privilege(current_user,'private','USAGE') THEN
   IF private.account_capability(auth.uid(),'play') THEN RAISE EXCEPTION 'revoked capability allowed'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid()) THEN RAISE EXCEPTION 'revoked RLS read allowed'; END IF;
 IF EXISTS(SELECT 1 FROM public.get_my_entitlements()) THEN RAISE EXCEPTION 'revoked definer entitlement read allowed'; END IF;
 IF EXISTS(SELECT 1 FROM public.public_player_cosmetics) THEN RAISE EXCEPTION 'revoked owner-view read allowed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.blocks WHERE blocker_profile_id=auth.uid()) THEN RAISE EXCEPTION 'revoked account cannot manage own block list'; END IF;
 IF EXISTS(SELECT 1 FROM public.blocks WHERE blocker_profile_id<>auth.uid()) THEN RAISE EXCEPTION 'revoked account read another block list'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
   PERFORM public.before_user_created_hook('{}');
   RAISE EXCEPTION 'anonymous role can invoke signup hook';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM private.account_capability(current_setting('test.eligible_user')::uuid,'play');
   RAISE EXCEPTION 'anonymous capability probe';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   IF EXISTS(SELECT 1 FROM public.profiles) THEN RAISE EXCEPTION 'anonymous profile read'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
