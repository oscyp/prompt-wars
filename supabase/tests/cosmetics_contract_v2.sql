-- Isolated local stack only, after migrations. No real purchase; all fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.require(ok BOOLEAN, label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
DO $$
DECLARE u UUID := gen_random_uuid(); other UUID := gen_random_uuid(); c UUID; j JSONB; initial_balance INTEGER; identity_before JSONB;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (u,u||'@cosmetics.invalid',jsonb_build_object('age_confirmed',true,'username','cosmetic_'||replace(u::text,'-',''))),
    (other,other||'@cosmetics.invalid',jsonb_build_object('age_confirmed',true,'username','cosmetic_'||replace(other::text,'-','')));
  j := create_starter_fighter(u); c := (j->>'id')::UUID;
  PERFORM grant_credits(u,100,'test_fixture','cosmetics_test_'||u);
  SELECT COALESCE(SUM(amount),0) INTO initial_balance FROM wallet_transactions WHERE profile_id=u AND currency_type='credits';
  PERFORM pg_temp.require((SELECT count(*)=4 FROM cosmetics_catalog WHERE min_client_contract_version=2 AND slug IN ('astral_codex_frame','emberforge_frame','neon_circuit_frame','laureate_frame')),'four gated frames');
  j := purchase_cosmetic(u,'astral_codex_frame');
  PERFORM pg_temp.require(j->>'error'='unsupported_client','legacy direct purchase blocked');
  j := equip_cosmetic(u,c,'frame','astral_codex_frame');
  PERFORM pg_temp.require(j->>'error'='unsupported_client','legacy direct equip blocked');
  j := equip_cosmetic(u,c,'frame','astral_codex_frame',2);
  PERFORM pg_temp.require(j->>'error'='not_owned','unowned equip blocked');
  j := purchase_cosmetic(u,'astral_codex_frame',2);
  PERFORM pg_temp.require((j->>'success')::boolean AND (j->>'price')::int=25,'supported purchase');
  j := purchase_cosmetic(u,'astral_codex_frame',2);
  PERFORM pg_temp.require(j->>'error'='already_owned','repeat purchase is authoritative replay');
  PERFORM pg_temp.require((SELECT COALESCE(SUM(amount),0)=initial_balance-25 FROM wallet_transactions WHERE profile_id=u AND currency_type='credits'),'exactly one charge');
  j := equip_cosmetic(other,c,'frame','astral_codex_frame',2);
  PERFORM pg_temp.require(j->>'error'='not_your_character','foreign character equip blocked');
  j := equip_cosmetic(u,c,'frame','astral_codex_frame',2);
  PERFORM pg_temp.require(j->'cosmetic_config'->>'frame'='astral_codex_frame' AND j->>'type'='frame','authoritative equip config');
  j := equip_cosmetic(u,c,'frame',NULL,2);
  PERFORM pg_temp.require(NOT (j->'cosmetic_config' ? 'frame'),'authoritative unequip config');
  SELECT jsonb_build_object('color',signature_color,'version',appearance_version) INTO identity_before FROM characters WHERE id=c;
  j := equip_cosmetic(u,c,'color','any',2);
  PERFORM pg_temp.require(j->>'error'='unsupported_slot' AND (SELECT jsonb_build_object('color',signature_color,'version',appearance_version)=identity_before FROM characters WHERE id=c),'color cannot rewrite identity');
  j := equip_cosmetic(u,c,'reveal_style','any',2);
  PERFORM pg_temp.require(j->>'error'='unsupported_slot','unrendered reveal style blocked');
  UPDATE profiles SET wins=50 WHERE id=u;
  PERFORM sync_unlocked_cosmetics(u);
  PERFORM pg_temp.require(EXISTS(SELECT 1 FROM player_cosmetics pc JOIN cosmetics_catalog cc ON cc.id=pc.cosmetic_id WHERE pc.profile_id=u AND cc.slug='laureate_frame' AND pc.acquired_via='play_unlock'),'50 wins grants laureate');
  PERFORM pg_temp.require(NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['authenticated','anon']) AS roles(role)
    CROSS JOIN unnest(ARRAY['purchase_cosmetic(uuid,text)','purchase_cosmetic(uuid,text,integer)',
      'equip_cosmetic(uuid,uuid,text,text)','equip_cosmetic(uuid,uuid,text,text,integer)',
      'sync_unlocked_cosmetics(uuid)']) AS functions(signature)
    WHERE has_function_privilege(role, signature, 'EXECUTE')
  ), 'all legacy/new RPC signatures reject both client roles');
  PERFORM pg_temp.require((SELECT bool_and(has_function_privilege('service_role', signature, 'EXECUTE'))
    FROM unnest(ARRAY['purchase_cosmetic(uuid,text)','purchase_cosmetic(uuid,text,integer)',
      'equip_cosmetic(uuid,uuid,text,text)','equip_cosmetic(uuid,uuid,text,text,integer)',
      'sync_unlocked_cosmetics(uuid)']) AS functions(signature)), 'service role can call all RPC signatures');
  PERFORM set_config('test.cosmetic_owner',u::text,true);
  PERFORM set_config('test.cosmetic_other',other::text,true);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('test.cosmetic_owner'),true);
SELECT pg_temp.require(EXISTS(SELECT 1 FROM player_cosmetics WHERE profile_id=current_setting('test.cosmetic_owner')::uuid),'owner reads ownership');
SELECT set_config('request.jwt.claim.sub',current_setting('test.cosmetic_other'),true);
SELECT pg_temp.require(NOT EXISTS(SELECT 1 FROM player_cosmetics WHERE profile_id=current_setting('test.cosmetic_owner')::uuid),'other cannot read ownership');
RESET ROLE;
ROLLBACK;
