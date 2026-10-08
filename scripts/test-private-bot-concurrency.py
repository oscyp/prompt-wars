"""True PostgreSQL races in a disposable cluster inside the existing LOCAL container.

Copies schema only (no rows, passwords or secrets). Runs no migrations against
the existing database. Stops and removes only its own /tmp cluster in finally.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import subprocess
import uuid
import time

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = 'supabase_db_prompt-wars'
CLUSTER = '/tmp/codex_private_bot_' + uuid.uuid4().hex
PORT = '55490'
log = Path('/tmp/prompt-wars-private-bot-concurrency.log')
transcript = []

def run(args, source=None):
    result = subprocess.run(args, input=source, capture_output=True, text=True)
    if result.returncode:
        transcript.append(result.stderr[-8000:])
        raise RuntimeError('Local test command failed: ' + result.stderr[-2000:])
    return result.stdout

def docker(*args, source=None):
    return run(['docker', 'exec', '-i', CONTAINER, *args], source)

def psql(sql, existing=False):
    args = ['psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
    if not existing:
        args += ['-h', CLUSTER, '-p', PORT]
    return docker(*args, source=sql)

def json_sql(sql):
    return json.loads(psql(sql).strip().splitlines()[-1])

started = False
try:
    latest = psql('select max(version) from supabase_migrations.schema_migrations;', True).strip()
    schema = docker('pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--no-owner', '--no-privileges')
    roles = psql("select rolname from pg_roles where rolname not like 'pg_%' and rolname <> 'postgres';", True).splitlines()
    run(['docker', 'exec', '-u', 'postgres', CONTAINER, 'initdb', '-D', CLUSTER, '--auth=trust'])
    run(['docker', 'exec', '-u', 'postgres', CONTAINER, 'pg_ctl', '-D', CLUSTER, '-l', CLUSTER+'/server.log',
         '-o', "-p "+PORT+" -k "+CLUSTER+" -c listen_addresses='' -c shared_preload_libraries=pg_cron,pg_net -c cron.database_name=postgres -c cron.launch_active_jobs=off",
         '-w', 'start'])
    started = True
    psql('\n'.join('CREATE ROLE "'+role.replace('"','""')+'";' for role in roles))
    psql(schema)
    parts = []
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        version = path.name.split('_')[0]
        if version <= latest:
            continue
        parts.append(path.read_text())
    psql('BEGIN;\n'+'\n'.join(parts)+'\nCOMMIT;')

    u, c, b, item = [str(uuid.uuid4()) for _ in range(4)]
    psql(f"""
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('{u}','{u}@bot-race.invalid','{{"age_confirmed":true}}');
INSERT INTO signature_items(id,profile_id,kind,item_class,name,prompt_fragment,moderation_status) VALUES('{item}','{u}','custom','tool','Test tool','A simple wooden tool','approved');
INSERT INTO characters(id,profile_id,name,archetype,battle_cry,signature_item_id) VALUES('{c}','{u}','Tester','strategist','Ready','{item}');
INSERT INTO battles(id,player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of,
 prompt_experience_version,judge_policy_version,situation_catalog_version,theme)
VALUES('{b}','{u}','{c}',true,'matched','bot','bo3',1,3,2,'v2.0.0-ideas',1,'Precision over power');
""")
    def race(fn):
        with ThreadPoolExecutor(max_workers=8) as pool:
            return list(pool.map(fn, range(8)))
    results=race(lambda _:psql(f"SELECT start_battle_face_off('{b}','{{}}','{{}}','{{}}',100,100,now()+interval '24 hours');").strip())
    assert results.count('t')==1 and results.count('f')==7, results
    before=json_sql(f"SELECT to_jsonb(c) FROM private.bot_round_choices c WHERE battle_id='{b}' AND round_number=1;")
    assert psql(f"SELECT count(*) FROM private.bot_round_choices WHERE battle_id='{b}';").strip()=='1'
    transcript.append('PASS: eight concurrent first-round openers create one immutable choice and one deadline.')
    psql(f"UPDATE battle_rounds SET status='result_ready' WHERE battle_id='{b}' AND round_number=1;")
    next_round=race(lambda _:json_sql(f"SELECT open_next_prompt_round('{b}',1,clock_timestamp()+interval '24 hours');"))
    assert len({json.dumps(r,sort_keys=True) for r in next_round})==1, next_round
    assert psql(f"SELECT count(*) FROM private.bot_round_choices WHERE battle_id='{b}';").strip()=='2'
    choice=json_sql(f"SELECT get_private_bot_move('{b}',2);")
    transcript.append('PASS: eight concurrent next-round openers receive the same round, situation, deadline and prepared move.')
    # Real lock_prompt competes with retries. There is never a window after opening
    # in which a human can commit without the private choice already existing.
    def submit_or_retry(i):
        if i==0:
            return psql(f"SELECT lock_prompt('{b}','{u}',NULL,'I move along the barrier. I want a clear path behind me.','defense','approved',2);")
        return psql(f"SELECT open_next_prompt_round('{b}',1,clock_timestamp()+interval '48 hours');")
    race(submit_or_retry)
    assert json_sql(f"SELECT get_private_bot_move('{b}',2);")==choice
    assert json_sql(f"SELECT to_jsonb(c) FROM private.bot_round_choices c WHERE battle_id='{b}' AND round_number=1;")==before
    assert psql(f"SELECT count(*) FROM battle_prompts WHERE battle_id='{b}' AND round_number=2 AND is_locked;").strip()=='1'
    transcript.append('PASS: concurrent human submission and opening retries preserve both private choices.')
    print('\n'.join(transcript))
finally:
    if started:
        run(['docker','exec','-u','postgres',CONTAINER,'pg_ctl','-D',CLUSTER,'-m','immediate','-w','stop'])
    docker('rm','-rf',CLUSTER)
    log.write_text('\n'.join(transcript))
