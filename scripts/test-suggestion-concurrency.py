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
CLUSTER = '/tmp/codex_suggestion_' + uuid.uuid4().hex
PORT = '55489'
log = Path('/tmp/prompt-wars-suggestion-concurrency.log')
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
        if version <= latest or (version > '20260930235959' and not any(tag in path.name for tag in ['composer_suggestion_operations','composer_delivery_safety'])):
            continue
        parts.append(path.read_text())
    psql('BEGIN;\n'+'\n'.join(parts)+'\nCOMMIT;')
    u, c, b, item = [str(uuid.uuid4()) for _ in range(4)]
    # Auth fixture and real triggers run in the isolated cluster only.
    psql(f"""
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('{u}','{u}@concurrency.invalid','{{"age_confirmed":true}}');
INSERT INTO signature_items(id,profile_id,kind,item_class,name,prompt_fragment,moderation_status) VALUES('{item}','{u}','custom','tool','Test tool','A simple wooden tool','approved');
INSERT INTO characters(id,profile_id,name,archetype,battle_cry,signature_item_id) VALUES('{c}','{u}','Tester','strategist','Ready','{item}');
INSERT INTO battles(id,player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of)
VALUES('{b}','{u}','{c}',true,'waiting_for_prompts','ranked','bo3',1,3);
INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline) VALUES('{b}',1,'waiting_for_prompts',now()+interval '1 hour');
INSERT INTO character_edit_prices(edit_kind,credits,cooldown_seconds) VALUES('prompt_suggestions_reroll',1,0)
ON CONFLICT(edit_kind) DO UPDATE SET credits=1;
SELECT grant_credits('{u}',10,'test','test-grant');
""")
    def reserve(kind, key=None):
        key_sql = "'"+key+"'" if key else 'NULL'
        price = '1' if kind=='reroll' else 'NULL'
        return json_sql(f"SELECT reserve_suggestion_operation('{u}','{b}',1,'attack','{kind}',{key_sql},{price},'player',true,true);")
    def race(fn):
        with ThreadPoolExecutor(max_workers=8) as pool:
            return list(pool.map(fn, range(8)))
    free = race(lambda _: reserve('ensure_free'))
    assert sum(r['status']=='claimed' for r in free)==1, free
    assert len({r['operation_id'] for r in free})==1, free
    report('PASS: eight concurrent free requests reserve one slot, seven replay pending.')
    owner = next(r for r in free if r['status']=='claimed')
    result = '[{"title":"Opening","body":"I step around the wave to gain room for a counter."}]'
    def finish(op, failure=None):
        result_sql = "'"+result+"'::jsonb" if failure is None else 'NULL'
        failure_sql = 'NULL' if failure is None else "'generation_failed'"
        return json_sql(f"SELECT finish_suggestion_operation('{op['operation_id']}','{op['lease_token']}',{result_sql},'{{}}',{failure_sql});")
    finish(owner)
    key = str(uuid.uuid4())
    paid = race(lambda _: reserve('reroll',key))
    assert sum(r['status']=='claimed' for r in paid)==1, paid
    assert len({r['operation_id'] for r in paid})==1, paid
    op = next(r for r in paid if r['status']=='claimed')
    assert psql(f"SELECT count(*) FROM wallet_transactions WHERE profile_id='{u}' AND reason='prompt_suggestions';").strip()=='1'
    report('PASS: eight identical paid retries create one operation and one debit.')
    psql(f"UPDATE private.suggestion_operations SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id='{op['operation_id']}';")
    recovery = race(lambda _:reserve('reroll',key))
    assert sum(r['status']=='claimed' for r in recovery)==1, recovery
    successor=next(r for r in recovery if r['status']=='claimed')
    with ThreadPoolExecutor(max_workers=2) as pool:
        good=pool.submit(finish,successor)
        stale=pool.submit(finish,op,'generation_failed')
        assert good.result()['status']=='ready'
        assert stale.result()['status']=='stale'
    assert psql(f"SELECT count(*) FROM wallet_transactions WHERE profile_id='{u}' AND reason LIKE 'prompt_suggestions_refund:%';").strip()=='0'
    report('PASS: concurrent reclaim grants one lease; racing old failure cannot refund new success.')
    def wait_for_sleep(label):
        for _ in range(100):
            if psql("SELECT count(*) FROM pg_stat_activity WHERE application_name='"+label+"' AND wait_event='PgSleep';").strip()=='1':
                return
            time.sleep(0.01)
        raise AssertionError('Race setup did not acquire parent: '+label)
    def hold_parent(label, sql=''):
        return psql(f"SET application_name='{label}'; BEGIN; SELECT id FROM battles WHERE id='{b}' FOR UPDATE; {sql} SELECT pg_sleep(0.5); COMMIT;")
    def refund_count(operation):
        return int(psql(f"SELECT count(*) FROM wallet_transactions WHERE metadata->>'operation_id'='{operation['operation_id']}' AND reason LIKE 'prompt_suggestions_refund:%';").strip())
    def clear_prompt():
        psql(f"DELETE FROM battle_prompts WHERE battle_id='{b}'; UPDATE battles SET status='waiting_for_prompts',player_one_locked_at=NULL WHERE id='{b}';")
    submit_sql=f"SELECT lock_prompt('{b}','{u}',NULL,'I move around the support to gain space for the next exchange.','attack','approved',1);"
    # Prompt wins the parent lock. The delivery cannot publish while submit is uncommitted.
    late=reserve('reroll',str(uuid.uuid4()))
    with ThreadPoolExecutor(max_workers=2) as pool:
        submit=pool.submit(hold_parent,'submit-before-delivery',submit_sql)
        wait_for_sleep('submit-before-delivery')
        completed=pool.submit(finish,late)
        submit.result()
        terminal=completed.result()
    assert terminal['status']=='failed' and terminal['error']=='prompt_locked_before_delivery',terminal
    assert refund_count(late)==1
    finish(late)
    assert refund_count(late)==1
    report('PASS: submit-before-delivery blocks publication and refunds exactly once.')
    clear_prompt()
    # Delivery wins the same parent. Submit proceeds after a successful publication.
    early=reserve('reroll',str(uuid.uuid4()))
    final_sql=f"SELECT finish_suggestion_operation('{early['operation_id']}','{early['lease_token']}','{result}'::jsonb,'{{}}',NULL);"
    with ThreadPoolExecutor(max_workers=2) as pool:
        delivery=pool.submit(hold_parent,'delivery-before-submit',final_sql)
        wait_for_sleep('delivery-before-submit')
        submit=pool.submit(psql,submit_sql)
        delivery.result(); submit.result()
    replay=reserve('reroll',psql(f"SELECT idempotency_key FROM private.suggestion_operations WHERE id='{early['operation_id']}';").strip())
    assert replay['status']=='ready' and refund_count(early)==0,replay
    report('PASS: delivery-before-submit remains a successful replay after the prompt closes.')
    clear_prompt()
    # Transaction began while open but the lock is released only after deadline.
    deadline=reserve('reroll',str(uuid.uuid4()))
    with ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(hold_parent,'deadline-while-waiting',f"UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()+interval '0.2 seconds' WHERE battle_id='{b}';")
        wait_for_sleep('deadline-while-waiting')
        completed=pool.submit(finish,deadline)
        holder.result(); terminal=completed.result()
    assert terminal['status']=='failed' and terminal['error']=='round_closed_before_delivery',terminal
    assert refund_count(deadline)==1
    report('PASS: delivery uses wall clock after waiting for locks past the deadline.')
    # Free late deliveries fail without wallet entries.
    psql(f"UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()+interval '1 hour' WHERE battle_id='{b}';")
    free_late=json_sql(f"SELECT reserve_suggestion_operation('{u}','{b}',1,'defense','ensure_free',NULL,NULL,'player',true,true);")
    balance=psql(f"SELECT sum(amount) FROM wallet_transactions WHERE profile_id='{u}' AND currency_type='credits';").strip()
    psql(f"UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()-interval '1 second' WHERE battle_id='{b}';")
    assert finish(free_late)['error']=='round_closed_before_delivery'
    assert refund_count(free_late)==0
    assert balance==psql(f"SELECT sum(amount) FROM wallet_transactions WHERE profile_id='{u}' AND currency_type='credits';").strip()
    report('PASS: free late completion fails without money movement.')
    psql(f"UPDATE battle_rounds SET lock_in_deadline=clock_timestamp()+interval '1 hour' WHERE battle_id='{b}';")
    abandoned=reserve('reroll',str(uuid.uuid4()))
    psql(f"UPDATE private.suggestion_operations SET lease_expires_at=clock_timestamp()-interval '5 minutes' WHERE id='{abandoned['operation_id']}';")
    # A sweep skips a busy parent immediately instead of taking its operation first.
    with ThreadPoolExecutor(max_workers=2) as pool:
        holder=pool.submit(hold_parent,'sweeper-busy-parent')
        wait_for_sleep('sweeper-busy-parent')
        assert psql('SELECT expire_suggestion_operations();').strip()=='0'
        holder.result()
    assert refund_count(abandoned)==0
    with ThreadPoolExecutor(max_workers=2) as pool:
        sweeps=list(pool.map(lambda _:psql('SELECT expire_suggestion_operations();').strip(),range(2)))
    assert sum(map(int,sweeps))==1,sweeps
    assert refund_count(abandoned)==1 and finish(abandoned)['status']=='stale'
    report('PASS: busy-parent sweep skips safely; concurrent sweepers refund once and fence the expired worker.')
    # Eight DIFFERENT purchases race for the same last credit.
    psql(f"DO $$ DECLARE balance integer; BEGIN SELECT sum(amount) INTO balance FROM wallet_transactions WHERE profile_id='{u}' AND currency_type='credits'; PERFORM spend_credits('{u}',balance-1,'test_drain','test-drain'); END $$;")
    last_credit=race(lambda _:reserve('reroll',str(uuid.uuid4())))
    assert sum(r.get('status')=='claimed' for r in last_credit)==1, last_credit
    assert sum(r.get('error')=='insufficient_credits' for r in last_credit)==7, last_credit
    assert psql(f"SELECT sum(amount) FROM wallet_transactions WHERE profile_id='{u}' AND currency_type='credits';").strip()=='0'
    report('PASS: eight different purchases cannot overspend the last credit.')
    # The per-profile serialization also spans different battles, not just one parent.
    rate_user,rate_character,rate_item,rate_a,rate_b=[str(uuid.uuid4()) for _ in range(5)]
    psql(f"""
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('{rate_user}','{rate_user}@rate-race.invalid','{{"age_confirmed":true}}');
INSERT INTO signature_items(id,profile_id,kind,item_class,name,prompt_fragment,moderation_status) VALUES('{rate_item}','{rate_user}','custom','tool','Rate tool','A simple wooden tool','approved');
INSERT INTO characters(id,profile_id,name,archetype,battle_cry,signature_item_id) VALUES('{rate_character}','{rate_user}','Rate tester','strategist','Ready','{rate_item}');
INSERT INTO battles(id,player_one_id,player_one_character_id,is_player_two_bot,status,mode,format,current_round,best_of)
SELECT bid,'{rate_user}','{rate_character}',true,'waiting_for_prompts','ranked','bo3',1,3 FROM unnest(ARRAY['{rate_a}','{rate_b}']::uuid[]) bid;
INSERT INTO battle_rounds(battle_id,round_number,status,lock_in_deadline)
SELECT bid,1,'waiting_for_prompts',clock_timestamp()+interval '1 hour' FROM unnest(ARRAY['{rate_a}','{rate_b}']::uuid[]) bid;
UPDATE character_edit_prices SET credits=0 WHERE edit_kind='prompt_suggestions_reroll';
""")
    def rate_free(bid):
        return json_sql(f"SELECT reserve_suggestion_operation('{rate_user}','{bid}',1,'attack','ensure_free',NULL,NULL,'player',true,true);")
    for bid in [rate_a,rate_b]:
        old=rate_free(bid)
        finish(old,'generation_failed')
    psql(f"UPDATE private.suggestion_operations SET created_at=clock_timestamp()-interval '2 hours' WHERE profile_id='{rate_user}'; UPDATE private.suggestion_operation_attempts SET attempted_at=clock_timestamp()-interval '2 hours' WHERE profile_id='{rate_user}';")
    psql(f"DO $$ BEGIN FOR n IN 1..29 LOOP PERFORM reserve_suggestion_operation('{rate_user}','{rate_a}',1,'attack','reroll',gen_random_uuid()::text,0,'player',true,true); END LOOP; END $$;")
    retries=race(lambda i:rate_free([rate_a,rate_b][i%2]))
    assert sum(r.get('status')=='claimed' for r in retries)==1,retries
    assert sum(r.get('error')=='rate_limited' for r in retries)==4,retries
    assert psql(f"SELECT count(*) FROM private.suggestion_operation_attempts WHERE profile_id='{rate_user}' AND attempted_at>clock_timestamp()-interval '1 hour';").strip()=='30'
    report('PASS: old-operation retries across two battles race for one remaining hourly unit; exactly one wins.')
finally:
    if started:
        run(['docker','exec','-u','postgres',CONTAINER,'pg_ctl','-D',CLUSTER,'-m','immediate','-w','stop'])
    docker('rm','-rf',CLUSTER)
    log.write_text('\n'.join(transcript))
