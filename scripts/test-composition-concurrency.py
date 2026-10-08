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
CLUSTER = '/tmp/codex_composition_' + uuid.uuid4().hex
PORT = '55490'
log = Path('/tmp/prompt-wars-composition-concurrency.log')
transcript = []

def report(message):
    transcript.append(message)
    print(message)

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
    def fixture():
        u, c, b, item = [str(uuid.uuid4()) for _ in range(4)]
        psql(f"""
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('{u}','{u}@composition-race.invalid','{{"age_confirmed":true,"username":"cmp_{u[:8]}"}}');
INSERT INTO signature_items(id,profile_id,kind,item_class,name,prompt_fragment,moderation_status) VALUES('{item}','{u}','custom','tool','Test tool','A simple wooden tool','approved');
INSERT INTO characters(id,profile_id,name,archetype,battle_cry,signature_item_id) VALUES('{c}','{u}','Tester','strategist','Ready','{item}');
INSERT INTO battles(id,player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of)
VALUES('{b}','{u}','{c}',true,'waiting_for_prompts','ranked','bo3',1,3);
INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES('{b}',1,'waiting_for_prompts',clock_timestamp()+interval '1 hour');
""")
        return u, b
    result = json.dumps({'approachHints': [
        {'id':'one','text':'by waiting until their footing shifts'},
        {'id':'two','text':'by tightening it at the crossing'},
        {'id':'three','text':'by stepping behind the near support'},
    ]})
    def reserve(u,b,index=0,target='approach',move='attack'):
        intent = "'to interrupt their charge'" if target == 'approach' else 'NULL'
        return json_sql(f"SELECT reserve_suggestion_completion('{u}','{b}',1,'{move}','{target}','I pull the cable {index}',{intent},NULL,3,true);")
    def finish(op, failure=None):
        failure_sql = "'generation_failed'" if failure else 'NULL'
        return json_sql(f"SELECT finish_suggestion_completion('{op['operation_id']}','{op['lease_token']}','{result}'::jsonb,'{{}}',{failure_sql});")
    def race(fn,count=8):
        with ThreadPoolExecutor(max_workers=count) as pool:
            return list(pool.map(fn, range(count)))
    def wait_for_sleep(label):
        for _ in range(100):
            if psql("SELECT count(*) FROM pg_stat_activity WHERE application_name='"+label+"' AND wait_event='PgSleep';").strip()=='1':
                return
            time.sleep(0.01)
        raise AssertionError('Race setup did not acquire parent: '+label)
    def hold_parent(b,label,sql=''):
        return psql(f"SET application_name='{label}'; BEGIN; SELECT id FROM battles WHERE id='{b}' FOR UPDATE; {sql} SELECT pg_sleep(0.5); COMMIT;")

    u,b=fixture()
    first=race(lambda _:reserve(u,b))
    assert sum(r.get('status')=='claimed' for r in first)==1,first
    assert len({r['operation_id'] for r in first})==1,first
    assert psql(f"SELECT count(*) FROM private.suggestion_completion_attempts WHERE profile_id='{u}';").strip()=='1'
    owner=next(r for r in first if r['status']=='claimed')
    assert finish(owner)['status']=='ready'
    for n in range(1,5):
        assert finish(reserve(u,b,n))['status']=='ready'
    results=race(lambda i:reserve(u,b,10+i,move=['attack','defense','finisher'][i%3]))
    assert sum(r.get('status')=='claimed' for r in results)==1,results
    assert sum(r.get('error')=='adaptation_limit_reached' for r in results)==7,results
    sixth=next(r for r in results if r.get('status')=='claimed')
    assert finish(sixth)['status']=='ready'
    assert reserve(u,b)['status']=='ready'
    assert psql(f"SELECT count(*) FROM private.suggestion_completion_attempts WHERE profile_id='{u}';").strip()=='6'
    report('PASS: duplicate context reserves one operation; seven competing contexts cannot exceed six delivered/reserved slots.')

    u,b=fixture()
    old=reserve(u,b)
    psql(f"UPDATE private.suggestion_completions SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id='{old['operation_id']}';")
    claims=race(lambda _:reserve(u,b))
    assert sum(r.get('status')=='claimed' for r in claims)==1,claims
    successor=next(r for r in claims if r.get('status')=='claimed')
    with ThreadPoolExecutor(max_workers=2) as pool:
        success=pool.submit(finish,successor)
        stale=pool.submit(finish,old,'failure')
        assert success.result()['status']=='ready'
        assert stale.result()['status']=='stale'
    report('PASS: one reclaim winner; old worker cannot overwrite successor success.')
    late=reserve(u,b,1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(hold_parent,b,'completion-deadline',f"UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()+interval '0.2 seconds' WHERE battle_id='{b}';")
        wait_for_sleep('completion-deadline')
        future=pool.submit(finish,late)
        holder.result(); terminal=future.result()
    assert terminal['error']=='round_closed_before_delivery',terminal
    report('PASS: deadline is checked after waiting for battle lock, not at transaction start.')
    psql(f"UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()+interval '1 hour' WHERE battle_id='{b}';")
    late=reserve(u,b,2)
    submit=f"SELECT lock_prompt('{b}','{u}',NULL,'I move behind the support to regain space for a counter.','attack','approved',1);"
    with ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(hold_parent,b,'completion-submit',submit)
        wait_for_sleep('completion-submit')
        future=pool.submit(finish,late)
        holder.result(); terminal=future.result()
    assert terminal['error']=='prompt_locked_before_delivery',terminal
    assert reserve(u,b)['status']=='ready'
    assert psql(f"SELECT count(*) FROM wallet_transactions WHERE profile_id='{u}' AND reason LIKE 'prompt_suggestions%';").strip()=='0'
    report('PASS: submit-first blocks new delivery, successful earlier completion stays replayable; no financial side effects.')

    u,b=fixture()
    abandoned=reserve(u,b)
    psql(f"UPDATE private.suggestion_completions SET lease_expires_at=clock_timestamp()-interval '5 minutes' WHERE id='{abandoned['operation_id']}';")
    with ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(hold_parent,b,'completion-sweep-busy')
        wait_for_sleep('completion-sweep-busy')
        assert psql('SELECT expire_suggestion_completions();').strip()=='0'
        holder.result()
    sweeps=race(lambda _:int(psql('SELECT expire_suggestion_completions();').strip()),2)
    assert sum(sweeps)==1,sweeps
    assert finish(abandoned)['status']=='stale'
    report('PASS: sweeper skips busy parent, concurrent sweepers release one quota reservation and fence old worker.')

    # Independent bank/completion claims compete atomically for the same last hourly unit.
    u,b=fixture()
    psql("INSERT INTO character_edit_prices(edit_kind,credits,cooldown_seconds) VALUES('prompt_suggestions_reroll',0,0) ON CONFLICT(edit_kind) DO UPDATE SET credits=0;")
    psql(f"DO $$ BEGIN FOR n IN 1..29 LOOP PERFORM reserve_suggestion_operation('{u}','{b}',1,'attack','reroll',gen_random_uuid()::text,0,'player',true,true); END LOOP; END $$;")
    def mixed_claim(i):
        if i%2:
            return reserve(u,b,i)
        return json_sql(f"SELECT reserve_suggestion_operation('{u}','{b}',1,'defense','reroll','{uuid.uuid4()}',0,'player',true,true);")
    mixed=race(mixed_claim)
    assert sum(r.get('status')=='claimed' for r in mixed)==1,mixed
    assert sum(r.get('error')=='rate_limited' for r in mixed)==7,mixed
    assert psql(f"SELECT (SELECT count(*) FROM private.suggestion_operation_attempts WHERE profile_id='{u}')+(SELECT count(*) FROM private.suggestion_completion_attempts WHERE profile_id='{u}');").strip()=='30'
    report('PASS: bank and completion generation share the same 30/h budget under concurrent claims.')
finally:
    if started:
        run(['docker','exec','-u','postgres',CONTAINER,'pg_ctl','-D',CLUSTER,'-m','immediate','-w','stop'])
    docker('rm','-rf',CLUSTER)
    log.write_text('\n'.join(transcript))
