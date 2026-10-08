"""Exercise cinematic job/input races in a disposable schema on LOCAL Docker.

Copies table definitions and the real entitlement view, never user data. Only
the new cinematic migration is adapted to the isolated schema. No database
reset, migration history change, linked connection, or provider invocation.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import re
from pathlib import Path
import subprocess
from threading import Barrier
import uuid

root = Path(__file__).resolve().parent.parent
schema = 'cinematic_test_' + uuid.uuid4().hex
command = ['docker', 'exec', '-i', 'supabase_db_prompt-wars', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']


def query(sql, check=True):
    result = subprocess.run(command, input=sql, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr[-2000:])
    return result


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def race(statements):
    barrier = Barrier(len(statements))

    def execute(statement):
        barrier.wait()
        return query('BEGIN;\n' + statement + '\nSELECT pg_sleep(0.15);\nCOMMIT;', check=False)

    with ThreadPoolExecutor(max_workers=len(statements)) as pool:
        return list(pool.map(execute, statements))


try:
    tables = ['profiles', 'subscriptions', 'wallet_transactions', 'battles', 'battle_rounds', 'video_jobs', 'player_cosmetics', 'cosmetics_catalog']
    query(f'CREATE SCHEMA {schema};\n' + '\n'.join(
        f'CREATE TABLE {schema}.{table}(LIKE public.{table} INCLUDING ALL);' for table in tables))
    for name in ['entitlements', 'entitlements_v2']:
        view = query(f"SELECT pg_get_viewdef('public.{name}'::regclass,true);").stdout.strip()
        query(f'SET search_path={schema},public; CREATE VIEW {schema}.{name} AS ' + view.replace('public.', schema + '.'))
    for signature in ['spend_credits(uuid,integer,text,text,uuid,uuid,jsonb)', 'consume_free_tier1_reveal(uuid,uuid,text)']:
        definition = query(f"SELECT pg_get_functiondef('public.{signature}'::regprocedure);").stdout.strip()
        query(definition.replace('public.', schema + '.'))
        query(f'ALTER FUNCTION {schema}.{signature} SET search_path={schema},public;')
    leases = (root / 'supabase/migrations/20260917120000_video_job_leases.sql').read_text()
    query(leases.replace('public.', schema + '.'))
    migration = next((root / 'supabase/migrations').glob('*_cinematic_generation_policy.sql')).read_text()
    adapted = migration.replace('public.', schema + '.').replace('private.', schema + '.')
    query(adapted.replace(schema + '.video_job_status', 'public.video_job_status'))
    # LIKE copies the old partial unique index under a generated name.
    old_indexes = query(f"SELECT indexname FROM pg_indexes WHERE schemaname='{schema}' AND tablename='wallet_transactions' AND indexdef LIKE '%(battle_id, round_number, reason)%';").stdout.splitlines()
    for name in old_indexes:
        query(f'DROP INDEX {schema}.{name};')
    for name in ['cinematic_funding_retries', 'cinematic_atomic_funding_recovery', 'cinematic_twenty_second_policy']:
        source = next((root / 'supabase/migrations').glob('*_' + name + '.sql')).read_text()
        source = re.sub(r'INSERT INTO storage\.buckets[\s\S]*?EXCLUDED\.file_size_limit;', '', source)
        query(source.replace('public.', schema + '.').replace('private.', schema + '.').replace('SET SCHEMA private;', f'SET SCHEMA {schema};'))
    u1, u2, battle, round_id, token = [str(uuid.uuid4()) for _ in range(5)]
    query(f"""
      INSERT INTO {schema}.profiles(id,username,display_name) VALUES('{u1}','race_one','Race one'),('{u2}','race_two','Race two');
      INSERT INTO {schema}.battles(id,player_one_id,player_two_id,player_one_character_id,format,best_of,mode,status)
      VALUES('{battle}','{u1}','{u2}',gen_random_uuid(),'bo3',3,'unranked','completed');
      INSERT INTO {schema}.battle_rounds(id,battle_id,round_number,status) VALUES('{round_id}','{battle}',1,'result_ready');
      INSERT INTO {schema}.battle_rounds(battle_id,round_number,status) VALUES('{battle}',2,'result_ready'),('{battle}',3,'result_ready');
      UPDATE {schema}.profiles SET free_tier1_reveals_remaining=0,new_user_round_grants_remaining=3,new_user_round_grants_granted_at=now();
      INSERT INTO {schema}.wallet_transactions(profile_id,amount,balance_after,reason) VALUES('{u1}',5,5,'race_credit_grant');
      UPDATE {schema}.cinematic_generation_config SET enabled=true;
    """)
    policy = {'cinematic_profile': 'standard', 'target_duration_seconds': 8, 'duration_policy_version': 'cinematics-v3'}
    jobs = [dict(battle_id=battle, battle_round_id=round_id, round_number=1, tier=1,
                 trigger=source, request_payload_hash='race-' + source)
            for source in ['on_demand_credit', 'on_demand_grant']]
    results = race([f'SELECT {schema}.insert_cinematic_video_job({literal(json.dumps(job))}::jsonb,{literal(json.dumps(policy))}::jsonb);'
                    for job in jobs])
    assert sorted(result.returncode == 0 for result in results) == [False, True], [result.stderr for result in results]
    losing_error = next(result.stderr for result in results if result.returncode)
    assert 'cinematic_shared_job_exists' in losing_error or 'unique constraint' in losing_error, losing_error
    count = query(f'SELECT count(*) FROM {schema}.video_jobs;').stdout.strip()
    assert count == '1', count
    job_id = query(f'SELECT id FROM {schema}.video_jobs;').stdout.strip()
    query(f"UPDATE {schema}.video_jobs SET lease_token='{token}',lease_expires_at=now()+interval '2 minutes' WHERE id='{job_id}';")
    payload = dict(version=2, battleId=battle, roundId=round_id, roundNumber=1, policy=policy)
    results = race([f"SELECT {schema}.persist_cinematic_input('{job_id}','{token}',{literal(json.dumps(dict(payload, move=move)))}::jsonb,'{hash_letter * 64}');"
                    for move, hash_letter in [('first', 'a'), ('second', 'b')]])
    assert all(result.returncode == 0 for result in results), [result.stderr for result in results]
    responses = [json.loads(next(line for line in result.stdout.splitlines() if line.startswith('{'))) for result in results]
    assert responses[0] == responses[1], responses
    hash_consistent = query(f'SELECT j.input_payload_hash=i.payload_hash FROM {schema}.video_jobs j JOIN {schema}.video_job_inputs i ON i.video_job_id=j.id;').stdout.strip()
    assert hash_consistent == 't', hash_consistent
    results = race([
        f"SELECT {schema}.reserve_round_upgrade_credit('{u1}','{battle}',2::smallint,'credit-race');",
        f"SELECT {schema}.reserve_round_upgrade_grant('{u2}','{battle}',2::smallint,'grant-race');",
    ])
    assert sorted(result.returncode == 0 for result in results) == [False, True], [result.stderr for result in results]
    assert 'round_upgrade_already_reserved' in next(result.stderr for result in results if result.returncode)
    hold = json.loads(query(f"SELECT to_jsonb(w) FROM {schema}.wallet_transactions w WHERE status='held';").stdout.strip())
    query(f"UPDATE {schema}.wallet_transactions SET created_at=now()-interval '16 minutes' WHERE id='{hold['id']}';")
    round_two = query(f"SELECT id FROM {schema}.battle_rounds WHERE battle_id='{battle}' AND round_number=2;").stdout.strip()
    funded_job = dict(battle_id=battle, battle_round_id=round_two, round_number=2,
                     requester_profile_id=hold['profile_id'], entitlement_source=hold['source'],
                     spend_transaction_id=hold['id'], request_payload_hash='recovery-race')
    results = race([
        f'SELECT {schema}.insert_cinematic_video_job({literal(json.dumps(funded_job))}::jsonb,{literal(json.dumps(policy))}::jsonb);',
        f'SELECT {schema}.recover_orphan_cinematic_funding(100,900);',
    ])
    assert results[1].returncode == 0, results[1].stderr
    if results[0].returncode:
        assert 'cinematic_funding_reservation_invalid' in results[0].stderr, results[0].stderr
    safe = query(f"SELECT NOT EXISTS(SELECT 1 FROM {schema}.video_jobs j JOIN {schema}.wallet_transactions w ON w.id=j.spend_transaction_id WHERE w.status<>'held');").stdout.strip()
    assert safe == 't', safe
    single_battle = str(uuid.uuid4())
    query(f"INSERT INTO {schema}.battles(id,player_one_id,player_one_character_id,format,mode,status,is_player_two_bot) VALUES('{single_battle}','{u1}',gen_random_uuid(),'single','bot','completed',true);")
    before = int(query(f"SELECT sum(amount) FROM {schema}.wallet_transactions WHERE profile_id='{u1}';").stdout.strip())
    single_job = dict(battle_id=single_battle, requester_profile_id=u1, request_payload_hash='single-race',
                      entitlement_source='credits', expected_funding_quote=dict(method='credits', cost_credits=1))
    single_policy = dict(cinematic_profile='standard', target_duration_seconds=12, duration_policy_version='cinematics-v3')
    statements = [f'SELECT {schema}.insert_cinematic_video_job({literal(json.dumps(single_job))}::jsonb,{literal(json.dumps(single_policy))}::jsonb);'] * 2
    results = race(statements)
    assert sorted(result.returncode == 0 for result in results) == [False, True], [result.stderr for result in results]
    after = int(query(f"SELECT sum(amount) FROM {schema}.wallet_transactions WHERE profile_id='{u1}';").stdout.strip())
    assert after == before - 1, (before, after)
    extended_battle, extended_job = [str(uuid.uuid4()) for _ in range(2)]
    query(f"""
      INSERT INTO {schema}.subscriptions(profile_id,revenuecat_subscription_id,product_id,status,allowance_reset_at,starts_at,expires_at)
      VALUES('{u1}','race-plus','promptwars_plus_monthly','active',now()+interval '30 days',now(),now()+interval '30 days');
      INSERT INTO {schema}.battles(id,player_one_id,player_one_character_id,format,mode,status,is_player_two_bot)
      VALUES('{extended_battle}','{u1}',gen_random_uuid(),'single','bot','completed',true);
      INSERT INTO {schema}.video_jobs(id,battle_id,request_payload_hash,lease_token,lease_expires_at)
      VALUES('{extended_job}','{extended_battle}','stage-race','{token}',now()+interval '2 minutes');
    """)
    mark = f"UPDATE {schema}.video_jobs SET execution_stage='base_submitting',execution_started_at=now(),submitted_at=now(),status='submitted' WHERE id='{extended_job}' AND lease_token='{token}' AND execution_stage='base' RETURNING id;"
    results = race([mark, mark])
    assert all(result.returncode == 0 for result in results), [result.stderr for result in results]
    assert sum(extended_job in result.stdout.splitlines() for result in results) == 1, [result.stdout for result in results]
    results = race([f"UPDATE {schema}.video_jobs SET execution_stage='base',provider_job_id='{provider_id}',submitted_duration_seconds=15 WHERE id='{extended_job}' AND lease_token='{token}' AND execution_stage='base_submitting' RETURNING id;" for provider_id in ['base-result-one', 'base-result-two']])
    assert all(result.returncode == 0 for result in results), [result.stderr for result in results]
    assert sum(extended_job in result.stdout.splitlines() for result in results) == 1, [result.stdout for result in results]
    print('PASS: shared job/input races; competing funding; orphan recovery vs insertion; single charges once; execution marker and provider result CAS each win once')
finally:
    query(f'DROP SCHEMA IF EXISTS {schema} CASCADE;')
