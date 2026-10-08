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
CLUSTER = '/tmp/codex_step_suggestions_' + uuid.uuid4().hex
PORT = '55491'
log = Path('/tmp/prompt-wars-step-suggestions-concurrency.log')
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
INSERT INTO battles(id,player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of,theme,prompt_experience_version,judge_policy_version,situation_catalog_version)
VALUES('{b}','{u}','{c}',true,'waiting_for_prompts','ranked','bo3',1,3,'Precision over power',2,'v2.0.0-ideas',1);
INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES('{b}',1,'waiting_for_prompts',clock_timestamp()+interval '1 hour');
""")
        psql(f"SELECT grant_credits('{u}',200,'step_test','{uuid.uuid4()}');")
        return u, b
    result = json.dumps({'approachHints': [
        {'id':'one','text':'by waiting until their footing shifts'},
        {'id':'two','text':'by tightening it at the crossing'},
        {'id':'three','text':'by stepping behind the near support'},
    ]})
    def reserve(u,b,key,target='approach',move='attack',price=1):
        intent = "'to interrupt their charge'" if target == 'approach' else 'NULL'
        return json_sql(f"SELECT reserve_suggestion_step_operation('{u}','{b}',1,'{move}','{target}','I pull the cable',{intent},'{key}',{price},true,true);")
    def finish(op, failure=None):
        failure_sql = "'generation_failed'" if failure else 'NULL'
        return json_sql(f"SELECT finish_suggestion_step_operation('{op['operation_id']}','{op['lease_token']}','{result}'::jsonb,'{{}}',{failure_sql});")
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

    psql("INSERT INTO character_edit_prices(edit_kind,credits,cooldown_seconds) VALUES('prompt_suggestions_reroll',1,0) ON CONFLICT(edit_kind) DO UPDATE SET credits=1;")
    # Idempotent application and regression compatibility are tested in this same disposable schema.
    migration = next((ROOT/'supabase/migrations').glob('*_paid_composer_step_rerolls.sql')).read_text()
    psql(migration)
    report('PASS: additive migration applies twice without changing the contract.')
    psql("WITH c AS (INSERT INTO signature_items_catalog(slug,name,item_class,prompt_fragment) VALUES('step-synthetic','Test tool','tool','A simple wooden tool') RETURNING id) INSERT INTO signature_items(catalog_id,kind,item_class,name,prompt_fragment,moderation_status) SELECT id,'catalog','tool','Test tool','A simple wooden tool','approved' FROM c;")
    for test in ('composer_step_suggestions.sql','composer_completions.sql','composer_suggestions.sql'):
        psql((ROOT/'supabase/tests'/test).read_text())
        report('PASS: '+test)

    def reserve_action(u,b,key,generate=False):
        allowed = 'true' if generate else 'false'
        return json_sql(f"SELECT reserve_suggestion_operation('{u}','{b}',1,'attack','reroll','{key}',1,'player',{allowed},false,2);")
    def new_action(u,b,key):
        return json_sql(f"SELECT reserve_suggestion_operation('{u}','{b}',1,'attack','reroll','{key}',1,'player',true,true,2);")
    def finish_action(op):
        return json_sql(f"SELECT finish_suggestion_operation('{op['operation_id']}','{op['lease_token']}',NULL,'{{}}','generation_failed');")
    def action_refunds(op):
        return int(psql(f"SELECT count(*) FROM wallet_transactions WHERE metadata->>'operation_id'='{op['operation_id']}' AND reason LIKE 'prompt_suggestions_refund:%';").strip())

    u,b=fixture(); key=str(uuid.uuid4()); action=new_action(u,b,key)
    psql(f"UPDATE private.suggestion_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id='{action['operation_id']}';")
    blocked=race(lambda _:reserve_action(u,b,key))
    assert all(r.get('status')=='pending' and r.get('operation_id')==action['operation_id'] and r.get('error')=='generation_disabled' and r.get('credits_spent')==1 for r in blocked),blocked
    assert psql(f"SELECT attempts FROM private.suggestion_operations WHERE id='{action['operation_id']}';").strip()=='1'
    assert psql(f"SELECT count(*) FROM wallet_transactions WHERE profile_id='{u}' AND amount=-1;").strip()=='1'
    report('PASS: eight blocked expired action retries retain one charged operation without another debit or attempt.')

    for trigger in ('deadline','submit'):
        u,b=fixture(); key=str(uuid.uuid4()); action=new_action(u,b,key)
        psql(f"UPDATE private.suggestion_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id='{action['operation_id']}';")
        mutation=(f"UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()+interval '0.2 seconds' WHERE battle_id='{b}';" if trigger=='deadline'
                  else f"SELECT lock_prompt('{b}','{u}',NULL,'I move behind the support to regain space for a counter.','attack','approved',1);")
        expected='round_closed_before_delivery' if trigger=='deadline' else 'prompt_locked_before_delivery'
        with ThreadPoolExecutor(max_workers=6) as pool:
            holder=pool.submit(hold_parent,b,'action-recovery-'+trigger,mutation)
            wait_for_sleep('action-recovery-'+trigger)
            recoveries=[pool.submit(reserve_action,u,b,key) for _ in range(4)]
            old_worker=pool.submit(finish_action,action)
            holder.result()
            terminal=[f.result() for f in recoveries]
            assert all(r.get('status')=='failed' and r.get('error')==expected and r.get('refunded') for r in terminal),terminal
            assert old_worker.result()['status']=='stale'
        assert action_refunds(action)==1
        report('PASS: action recovery after '+trigger+' parent-lock wait refunds once and fences the expired worker.')

    u,b=fixture(); key=str(uuid.uuid4()); action=new_action(u,b,key)
    psql(f"UPDATE private.suggestion_operations SET lease_expires_at=clock_timestamp()-interval '5 minutes' WHERE id='{action['operation_id']}'; UPDATE battles SET status='result_ready' WHERE id='{b}';")
    with ThreadPoolExecutor(max_workers=3) as pool:
        recovery=pool.submit(reserve_action,u,b,key)
        sweeper=pool.submit(psql,'SELECT expire_suggestion_operations();')
        old_worker=pool.submit(finish_action,action)
        terminal=recovery.result(); sweeper.result()
        assert terminal['status']=='failed' and terminal['refunded'],terminal
        assert old_worker.result()['status']=='stale'
    assert action_refunds(action)==1
    assert reserve_action(u,b,key)==terminal
    report('PASS: action recovery, sweeper and old worker race without deadlock and produce one terminal refund.')

    u,b=fixture(); key=str(uuid.uuid4())
    claims=race(lambda _:reserve(u,b,key))
    assert sum(r.get('status')=='claimed' for r in claims)==1,claims
    assert len({r['operation_id'] for r in claims})==1,claims
    assert psql(f"SELECT count(*) FROM private.suggestion_step_attempts WHERE profile_id='{u}';").strip()=='1'
    assert psql(f"SELECT count(*) FROM wallet_transactions WHERE profile_id='{u}' AND amount=-1;").strip()=='1'
    owner=next(r for r in claims if r['status']=='claimed')
    assert finish(owner)['status']=='ready'
    psql(f"UPDATE battles SET status='result_ready' WHERE id='{b}'; UPDATE character_edit_prices SET credits=2 WHERE edit_kind='prompt_suggestions_reroll';")
    assert reserve(u,b,key)['status']=='ready'
    psql("UPDATE character_edit_prices SET credits=1 WHERE edit_kind='prompt_suggestions_reroll';")
    report('PASS: eight duplicate purchases reserve/generate/debit once; lost-response replay succeeds after closure and price change.')

    u,b=fixture(); key=str(uuid.uuid4()); old=reserve(u,b,key)
    psql(f"UPDATE private.suggestion_step_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id='{old['operation_id']}';")
    assert psql(f"SELECT renew_suggestion_step_operation('{old['operation_id']}','{old['lease_token']}');").strip()=='f'
    claims=race(lambda _:reserve(u,b,key))
    assert sum(r.get('status')=='claimed' for r in claims)==1,claims
    successor=next(r for r in claims if r.get('status')=='claimed')
    with ThreadPoolExecutor(max_workers=2) as pool:
        success=pool.submit(finish,successor)
        stale=pool.submit(finish,old,'failure')
        assert success.result()['status']=='ready'
        assert stale.result()['status']=='stale'
    assert psql(f"SELECT count(*) FROM wallet_transactions WHERE profile_id='{u}' AND amount=-1;").strip()=='1'
    assert psql(f"SELECT count(*) FROM wallet_transactions WHERE profile_id='{u}' AND reason LIKE 'prompt_suggestions_refund:%';").strip()=='0'
    report('PASS: exactly one reclaim wins; stale heartbeat/failure cannot overwrite or refund successor success, no second debit.')

    u,b=fixture(); key=str(uuid.uuid4()); late=reserve(u,b,key)
    with ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(hold_parent,b,'step-deadline',f"UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()+interval '0.2 seconds' WHERE battle_id='{b}';")
        wait_for_sleep('step-deadline')
        future=pool.submit(finish,late)
        holder.result(); terminal=future.result()
    assert terminal['error']=='round_closed_before_delivery' and terminal['refunded'],terminal
    refunds=race(lambda _:finish(late,'failure'))
    assert all(r['status']=='failed' and r['refunded'] for r in refunds),refunds
    assert psql(f"SELECT count(*) FROM wallet_transactions WHERE profile_id='{u}' AND reason LIKE 'prompt_suggestions_refund:%';").strip()=='1'
    report('PASS: deadline checked after battle-lock wait; concurrent failed-finalization retries produce one refund.')

    u,b=fixture(); key=str(uuid.uuid4()); late=reserve(u,b,key)
    submit=f"SELECT lock_prompt('{b}','{u}',NULL,'I move behind the support to regain space for a counter.','attack','approved',1);"
    with ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(hold_parent,b,'step-submit',submit)
        wait_for_sleep('step-submit')
        future=pool.submit(finish,late)
        holder.result(); terminal=future.result()
    assert terminal['error']=='prompt_locked_before_delivery' and terminal['refunded'],terminal
    assert reserve(u,b,key)['error']=='prompt_locked_before_delivery'
    report('PASS: submit-first prevents publication and refunds once; failed purchase remains replayable.')

    u,b=fixture(); key=str(uuid.uuid4()); op=reserve(u,b,key)
    with ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(hold_parent,b,'step-delivered',f"SELECT finish_suggestion_step_operation('{op['operation_id']}','{op['lease_token']}','{result}'::jsonb);")
        wait_for_sleep('step-delivered')
        future=pool.submit(psql,f"SELECT lock_prompt('{b}','{u}',NULL,'I move behind the support to regain space for a counter.','attack','approved',1);")
        holder.result(); future.result()
    assert reserve(u,b,key)['status']=='ready'
    assert psql(f"SELECT count(*) FROM wallet_transactions WHERE profile_id='{u}' AND reason LIKE 'prompt_suggestions_refund:%';").strip()=='0'
    report('PASS: delivery-first stays successful after submit, no refund for a delivered purchase.')

    u,b=fixture(); key=str(uuid.uuid4()); abandoned=reserve(u,b,key)
    psql(f"UPDATE private.suggestion_step_operations SET lease_expires_at=clock_timestamp()-interval '5 minutes' WHERE id='{abandoned['operation_id']}';")
    with ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(hold_parent,b,'step-sweep-busy')
        wait_for_sleep('step-sweep-busy')
        assert psql('SELECT expire_suggestion_step_operations();').strip()=='0'
        holder.result()
    sweeps=race(lambda _:int(psql('SELECT expire_suggestion_step_operations();').strip()),2)
    assert sum(sweeps)==1,sweeps
    assert finish(abandoned)['status']=='stale'
    assert psql(f"SELECT count(*) FROM wallet_transactions WHERE profile_id='{u}' AND reason LIKE 'prompt_suggestions_refund:%';").strip()=='1'
    report('PASS: sweeper skips busy parents; concurrent sweepers refund once and fence abandoned worker.')

    # All three paths compete for the same final attempt, not separate budgets.
    u,b=fixture()
    for i in range(29):
        assert reserve(u,b,str(uuid.uuid4()))['status']=='claimed'
    def mixed_claim(i):
        if i%3==0:
            return reserve(u,b,str(uuid.uuid4()))
        if i%3==1:
            return json_sql(f"SELECT reserve_suggestion_completion('{u}','{b}',1,'defense','approach','I pull the cable {i}','to hold the crossing',NULL,3,true);")
        return json_sql(f"SELECT reserve_suggestion_operation('{u}','{b}',1,'finisher','reroll','{uuid.uuid4()}',1,'player',true,true,3);")
    mixed=race(mixed_claim,9)
    assert sum(r.get('status')=='claimed' for r in mixed)==1,mixed
    assert sum(r.get('error')=='rate_limited' for r in mixed)==8,mixed
    report('PASS: nine competing bank/free-completion/paid-step requests consume only the final 30/h unit.')

    # Real claims accumulate 89 attempts in the last 24h but outside the last hour.
    u,b=fixture()
    for i in range(89):
        op=reserve(u,b,str(uuid.uuid4()))
        assert op['status']=='claimed',op
        psql(f"UPDATE private.suggestion_step_attempts SET attempted_at=clock_timestamp()-interval '2 hours' WHERE operation_id='{op['operation_id']}';")
    daily=race(mixed_claim,9)
    assert sum(r.get('status')=='claimed' for r in daily)==1,daily
    assert sum(r.get('error')=='rate_limited' for r in daily)==8,daily
    report('PASS: bank/free-completion/paid-step attempts also share the final 90/day unit.')
finally:
    if started:
        run(['docker','exec','-u','postgres',CONTAINER,'pg_ctl','-D',CLUSTER,'-m','immediate','-w','stop'])
    docker('rm','-rf',CLUSTER)
    log.write_text('\n'.join(transcript))
