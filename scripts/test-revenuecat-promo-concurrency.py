"""Real RevenueCat races in a disposable LOCAL PostgreSQL cluster.

Copies schema only, never production rows or secrets. Existing local database is
read-only; the disposable cluster has cron disabled and no TCP listener.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
import json
import subprocess
import uuid

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = 'supabase_db_prompt-wars'
CLUSTER = '/tmp/codex_revenuecat_promo_' + uuid.uuid4().hex
PORT = '55495'
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


def race(events):
    barrier = Barrier(len(events))

    def execute(event):
        barrier.wait()
        return query("BEGIN; SELECT public.process_revenuecat_event('" + json.dumps(event).replace("'", "''") + "'::jsonb); SELECT pg_sleep(0.15); COMMIT;", check=False)

    with ThreadPoolExecutor(max_workers=len(events)) as pool:
        return list(pool.map(execute, events))


def promotion(profile, identity, **overrides):
    return dict(id=str(uuid.uuid4()), type='NON_RENEWING_PURCHASE', app_user_id=profile,
                product_id='rc_promo_plus_monthly', transaction_id=identity,
                original_transaction_id=identity, store='PROMOTIONAL',
                period_type='PROMOTIONAL', environment='PRODUCTION', entitlement_ids=['plus'],
                purchased_at_ms=1896084000000, expiration_at_ms=1903773600000,
                event_timestamp_ms=1896084000000, **overrides)


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
    profiles = [str(uuid.uuid4()), str(uuid.uuid4())]
    for profile in profiles:
        query("INSERT INTO auth.users (id,email,is_anonymous,raw_app_meta_data,raw_user_meta_data) VALUES ('" + profile + "','" + profile + "@example.test',false,'{}','{\"age_confirmed\":true}');")
    initial_wallet_count = query('SELECT count(*) FROM public.wallet_transactions;').stdout.strip()

    grant = promotion(profiles[0], 'race-replay')
    results = race([grant] * 8)
    assert all(result.returncode == 0 for result in results)
    assert query("SELECT count(*) FROM public.revenuecat_events WHERE event_id='" + grant['id'] + "';").stdout.strip() == '1'
    query("UPDATE public.subscriptions SET monthly_round_allowance_used=19 WHERE revenuecat_subscription_id='race-replay';")
    results = race([promotion(profiles[0], 'race-replay') for _ in range(8)])
    assert all(result.returncode == 0 for result in results)
    assert query("SELECT count(*)||':'||max(monthly_round_allowance_used) FROM public.subscriptions WHERE revenuecat_subscription_id='race-replay';").stdout.strip() == '1:19'
    transcript.append('PASS: 8 concurrent identical deliveries claim once; 8 new-event replays retain one grant and spent allowance.')

    results = race([promotion(profile, 'race-owner') for profile in profiles])
    assert sum(result.returncode == 0 for result in results) == 1
    assert query("SELECT count(*) FROM public.subscriptions WHERE revenuecat_subscription_id='race-owner';").stdout.strip() == '1'
    transcript.append('PASS: two profiles racing for the same provider identity grant access to exactly one profile.')

    grant = promotion(profiles[0], 'race-terminal')
    terminal = {**grant, 'id': str(uuid.uuid4()), 'type': 'CANCELLATION', 'event_timestamp_ms': grant['event_timestamp_ms'] + 1}
    assert all(result.returncode == 0 for result in race([grant, terminal]))
    assert query("SELECT status FROM public.subscriptions WHERE revenuecat_subscription_id='race-terminal';").stdout.strip() == 'expired'
    transcript.append('PASS: activation racing with revocation always ends expired.')

    for iteration in range(8):
        transaction = 'race-origin-' + str(iteration)
        promo = promotion(profiles[0], transaction)
        paid = {**promotion(profiles[1], transaction), 'type': 'INITIAL_PURCHASE',
                'store': 'APP_STORE', 'period_type': 'NORMAL',
                'product_id': 'promptwars_plus_monthly', 'price': 9.99,
                'original_transaction_id': 'paid-origin-' + str(iteration)}
        results = race([promo, paid])
        assert sum(result.returncode == 0 for result in results) == 1
        assert query("SELECT (SELECT count(*) FROM public.purchases WHERE revenuecat_transaction_id='" + transaction + "')+(SELECT count(*) FROM public.subscriptions WHERE revenuecat_promotional_transaction_id='" + transaction + "');").stdout.strip() == '1'
    assert query('SELECT count(*) FROM public.wallet_transactions;').stdout.strip() == initial_wallet_count
    transcript.append('PASS: eight cross-profile paid/promo transaction collisions have exactly one origin; no promo credits are minted.')
    print('\n'.join(transcript))
finally:
    if started:
        run(['docker', 'exec', '-u', 'postgres', CONTAINER, 'pg_ctl', '-D', CLUSTER, '-m', 'immediate', '-w', 'stop'])
    docker('rm', '-rf', CLUSTER)
    Path('/tmp/prompt-wars-revenuecat-promo-concurrency.log').write_text('\n'.join(transcript))
