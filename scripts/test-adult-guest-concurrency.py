"""Test real signup races in a disposable cluster inside the LOCAL container.

Copies schema only, never rows or secrets. No writes or migration history changes
in the existing database. The temporary cluster has cron disabled and no TCP listener.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
import json
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = 'supabase_db_prompt-wars'
CLUSTER = '/tmp/codex_adult_guest_' + uuid.uuid4().hex
PORT = '55494'
transcript = []


def run(args, source=None, check=True):
    result = subprocess.run(args, input=source, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr[-3000:])
    return result


def docker(*args, source=None):
    return run(['docker', 'exec', '-i', CONTAINER, *args], source).stdout


def query(sql, existing=False, check=True):
    args = ['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
    if not existing:
        args += ['-h', CLUSTER, '-p', PORT]
    return run(args, sql, check)


def race(statements):
    barrier = Barrier(len(statements))

    def execute(statement):
        barrier.wait()
        return query('BEGIN;\n' + statement + '\nSELECT pg_sleep(0.15);\nCOMMIT;', check=False)

    with ThreadPoolExecutor(max_workers=len(statements)) as pool:
        return list(pool.map(execute, statements))


def permit(network):
    response = query(f"SELECT public.authorize_adult_guest('{network}','true','true');").stdout.strip()
    return json.loads(response)['authorization_token']


def signup(token, user_id):
    return f"INSERT INTO auth.users(id,is_anonymous,raw_app_meta_data,raw_user_meta_data) VALUES('{user_id}',true,'{{}}','{{\"adult_guest_authorization\":\"{token}\"}}');"


started = False
try:
    latest = query('SELECT max(version) FROM supabase_migrations.schema_migrations;', True).stdout.strip()
    schema = docker('pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--no-owner', '--no-privileges')
    roles = query("SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%' AND rolname <> 'postgres';", True).stdout.splitlines()
    run(['docker', 'exec', '-u', 'postgres', CONTAINER, 'initdb', '-D', CLUSTER, '--auth=trust'])
    run(['docker', 'exec', '-u', 'postgres', CONTAINER, 'pg_ctl', '-D', CLUSTER, '-l', CLUSTER + '/server.log',
         '-o', '-p ' + PORT + ' -k ' + CLUSTER + " -c listen_addresses='' -c shared_preload_libraries=pg_cron,pg_net -c cron.database_name=postgres -c cron.launch_active_jobs=off",
         '-w', 'start'])
    started = True
    query('\n'.join('CREATE ROLE "' + role.replace('"', '""') + '";' for role in roles))
    query(schema)
    pending = [path.read_text() for path in sorted((ROOT / 'supabase/migrations').glob('*.sql')) if path.name.split('_')[0] > latest]
    query('BEGIN;\n' + '\n'.join(pending) + '\nCOMMIT;')
    query('UPDATE private.auth_release SET enabled=false,adult_guest_signup_enabled=true WHERE singleton;')

    results = race(["SELECT public.authorize_adult_guest(repeat('a',64),'true','true');"] * 16)
    assert sum(result.returncode == 0 for result in results) == 10
    assert all('registration_rate_limited' in result.stderr for result in results if result.returncode)
    assert query("SELECT count(*) FROM private.adult_guest_network_reservations WHERE network_hash=repeat('a',64);").stdout.strip() == '10'
    transcript.append('PASS: 16 concurrent reservations issue exactly 10 permits; all 6 other requests are rate limited.')

    token = permit('b' * 64)
    candidates = [str(uuid.uuid4()) for _ in range(8)]
    results = race([signup(token, candidate) for candidate in candidates])
    assert sum(result.returncode == 0 for result in results) == 1
    assert all('registration_required' in result.stderr for result in results if result.returncode)
    users = ','.join("'" + candidate + "'" for candidate in candidates)
    assert query(f'SELECT count(*) FROM auth.users WHERE id IN ({users});').stdout.strip() == '1'
    assert query(f"SELECT count(*) FROM public.wallet_transactions WHERE profile_id IN ({users}) AND reason='welcome_grant' AND amount=10;").stdout.strip() == '1'
    transcript.append('PASS: 8 concurrent redemptions create exactly one account, one consumed permit, and one welcome ledger entry.')

    # A signup can see a valid permit, wait on its row, then resume after expiry.
    # Its post-lock validation must use fresh evidence rather than the old lookup.
    token = permit('c' * 64)
    candidate = str(uuid.uuid4())
    label = 'adult-expiry-' + uuid.uuid4().hex
    with ThreadPoolExecutor(max_workers=2) as pool:
        locker = pool.submit(query, f"BEGIN; SELECT id FROM private.adult_guest_authorizations WHERE authorization_token_hash=encode(extensions.digest('{token}','sha256'),'hex') FOR UPDATE; SELECT pg_sleep(0.8); UPDATE private.adult_guest_authorizations SET expires_at=clock_timestamp()-interval '1 second' WHERE authorization_token_hash=encode(extensions.digest('{token}','sha256'),'hex'); COMMIT;")
        time.sleep(0.15)
        waiting = pool.submit(query, f"SET application_name='{label}'; " + signup(token, candidate), False, False)
        deadline = time.monotonic() + 0.5
        blocked = False
        while time.monotonic() < deadline:
            blocked = query(f"SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='{label}' AND wait_event_type='Lock');").stdout.strip() == 't'
            if blocked:
                break
            time.sleep(0.02)
        assert blocked, 'expiry race did not observe signup waiting on permit lock'
        locker.result()
        failed = waiting.result()
    assert failed.returncode and 'registration_required' in failed.stderr
    assert query(f"SELECT count(*) FROM auth.users WHERE id='{candidate}';").stdout.strip() == '0'
    transcript.append('PASS: a redemption blocked on a permit row rechecks expiry after the lock and leaves no account.')
    print('\n'.join(transcript))
finally:
    if started:
        run(['docker', 'exec', '-u', 'postgres', CONTAINER, 'pg_ctl', '-D', CLUSTER, '-m', 'immediate', '-w', 'stop'])
    docker('rm', '-rf', CLUSTER)
    Path('/tmp/prompt-wars-adult-guest-concurrency.log').write_text('\n'.join(transcript))
