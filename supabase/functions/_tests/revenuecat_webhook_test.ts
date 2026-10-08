// Real PostgreSQL (PGlite) regression tests; no remote database or store calls.
// Production table/function definitions are loaded from the existing migrations.
import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';

const migrations = new URL('../../migrations/', import.meta.url);
const PROFILE = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const migrationName = '20260922093341_revenuecat_transactional_fulfillment.sql';
const read = (name: string) => Deno.readTextFile(new URL(name, migrations));

function table(sql: string, name: string): string {
  const start = sql.search(
    new RegExp(String.raw`CREATE TABLE (IF NOT EXISTS )?${name} \(`),
  );
  if (start < 0) throw new Error(`Missing table ${name}`);
  return sql.slice(start, sql.indexOf('\n);', start) + 3);
}

function fn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  return sql.slice(
    start,
    sql.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER;', start) +
      '$$ LANGUAGE plpgsql SECURITY DEFINER;'.length,
  );
}

async function database(beforeMigration?: (db: PGlite) => Promise<void>) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA extensions; CREATE SCHEMA internal; CREATE SCHEMA cron;
    CREATE TABLE profiles (id uuid PRIMARY KEY);
    CREATE TABLE battles (id uuid PRIMARY KEY);
    CREATE TABLE video_jobs (id uuid PRIMARY KEY);
    CREATE TYPE currency_type AS ENUM ('credits');
    -- PGlite has no pg_cron worker. This shim only records registration; all
    -- fulfillment and reset logic below runs as real PostgreSQL functions.
    CREATE TABLE cron.job (jobname text PRIMARY KEY, schedule text, command text);
    CREATE FUNCTION cron.schedule(text, text, text) RETURNS bigint LANGUAGE SQL AS $$
      INSERT INTO cron.job VALUES ($1, $2, $3)
      ON CONFLICT (jobname) DO UPDATE SET schedule = $2, command = $3;
      SELECT 1::bigint;
    $$;
    INSERT INTO profiles VALUES ('${PROFILE}'), ('${OTHER}');
  `);
  const economy = await read('20260506110000_economy_video_social_schema.sql');
  for (const name of ['wallet_transactions', 'purchases', 'subscriptions']) {
    await db.exec(table(economy, name));
  }
  await db.exec(`ALTER TABLE subscriptions
    ADD monthly_round_allowance integer NOT NULL DEFAULT 90,
    ADD monthly_round_allowance_used integer NOT NULL DEFAULT 0,
    ADD monthly_full_battle_cap integer NOT NULL DEFAULT 30,
    ADD monthly_full_battle_cap_used integer NOT NULL DEFAULT 0;`);
  await db.exec(
    fn(await read('20260506120000_database_functions.sql'), 'grant_credits'),
  );
  const offers = await read('20260619121000_first_time_offer.sql');
  await db.exec(table(offers, 'first_time_offers'));
  await db.exec(table(offers, 'player_first_time_offers'));
  const cosmetics = await read('20260619122000_cosmetics_shop.sql');
  await db.exec(table(cosmetics, 'cosmetics_catalog'));
  await db.exec(table(cosmetics, 'player_cosmetics'));
  await db.exec(fn(cosmetics, 'grant_cosmetic'));
  await db.exec(
    table(
      await read('20260506130000_safety_moderation_antiabuse_schema.sql'),
      'account_abuse_signals',
    ),
  );
  await db.exec(fn(cosmetics, 'fulfill_first_time_offer'));
  await db.exec(await read('20260822190000_revenuecat_event_idempotency.sql'));
  await db.exec(`ALTER TABLE wallet_transactions
    ADD COLUMN status TEXT NOT NULL DEFAULT 'final',
    ADD COLUMN source TEXT, ADD COLUMN round_number SMALLINT;`);
  await db.exec(
    fn(
      await read('20260525150000_entitlements_round_units.sql'),
      'decrement_subscriber_round_allowance',
    ),
  );
  await db.exec(
    fn(
      await read('20260506140000_ai_video_pipeline_extension.sql'),
      'restore_subscription_allowance',
    ),
  );
  if (beforeMigration) await beforeMigration(db);
  await db.exec(await read(migrationName));
  return db;
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    type: 'INITIAL_PURCHASE',
    app_user_id: PROFILE,
    product_id: 'promptwars_plus_monthly',
    transaction_id: 'initial-txn',
    original_transaction_id: 'original-txn',
    store: 'APP_STORE',
    purchased_at_ms: Date.parse('2026-01-31T10:00:00Z'),
    expiration_at_ms: Date.parse('2026-02-28T10:00:00Z'),
    event_timestamp_ms: Date.parse('2026-01-31T10:00:00Z'),
    price: 9.99,
    price_in_purchased_currency: 39.99,
    currency: 'PLN',
    ...overrides,
  };
}

async function apply(db: PGlite, payload: Record<string, unknown>) {
  const result = await db.query<{ result: Record<string, unknown> }>(
    'SELECT public.process_revenuecat_event($1::jsonb) AS result',
    [JSON.stringify(payload)],
  );
  return result.rows[0].result;
}

Deno.test(
  'RevenueCat fulfillment is atomic, idempotent, and follows subscription identity',
  async (t) => {
    const db = await database();
    try {
      const installed = await db.query<{ installed: boolean }>(
        "SELECT to_regprocedure('public.process_revenuecat_event(jsonb)') IS NOT NULL AS installed",
      );
      assertEquals(
        installed.rows[0].installed,
        true,
        'transactional fulfillment RPC must exist',
      );

      await t.step(
        'activation stores original identity; renewal changes transaction and mirrors purchase',
        async () => {
          await apply(db, event());
          await db.exec(
            'UPDATE subscriptions SET monthly_round_allowance_used = 12',
          );
          await apply(
            db,
            event({
              type: 'RENEWAL',
              transaction_id: 'renewed-txn',
              purchased_at_ms: Date.parse('2026-02-28T10:00:00Z'),
              expiration_at_ms: Date.parse('2026-03-31T10:00:00Z'),
              event_timestamp_ms: Date.parse('2026-02-28T10:00:00Z'),
            }),
          );
          const { rows } = await db.query<Record<string, unknown>>(
            'SELECT revenuecat_subscription_id, monthly_round_allowance_used, expires_at FROM subscriptions',
          );
          assertEquals(rows.length, 1);
          assertEquals(rows[0].revenuecat_subscription_id, 'original-txn');
          assertEquals(rows[0].monthly_round_allowance_used, 0);
          assertEquals(
            new Date(rows[0].expires_at as string).toISOString(),
            '2026-03-31T10:00:00.000Z',
          );
          const purchases = await db.query<Record<string, unknown>>(
            'SELECT amount_usd, platform FROM purchases ORDER BY revenuecat_transaction_id',
          );
          assertEquals(purchases.rows.length, 2);
          assertEquals(Number(purchases.rows[0].amount_usd), 9.99);
          assertEquals(purchases.rows[0].platform, 'ios');
        },
      );

      await t.step(
        'duplicate delivery cannot reset already spent allowance',
        async () => {
          const payload = event({
            type: 'RENEWAL',
            transaction_id: 'next-txn',
            expiration_at_ms: Date.parse('2026-04-30T10:00:00Z'),
            purchased_at_ms: Date.parse('2026-03-31T10:00:00Z'),
            event_timestamp_ms: Date.parse('2026-03-31T10:00:00Z'),
          });
          await apply(db, payload);
          await db.exec(
            'UPDATE subscriptions SET monthly_round_allowance_used = 7',
          );
          assertEquals((await apply(db, payload)).duplicate, true);
          await apply(db, { ...payload, id: crypto.randomUUID() });
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                'SELECT monthly_round_allowance_used FROM subscriptions',
              )
            ).rows[0].monthly_round_allowance_used,
            7,
          );
        },
      );

      await t.step(
        'cancel, uncancel and expire target original subscription after renewal',
        async () => {
          for (const [i, type, expected] of [
            [0, 'CANCELLATION', 'canceled'],
            [1, 'UNCANCELLATION', 'active'],
            [2, 'EXPIRATION', 'expired'],
          ] as const) {
            await apply(
              db,
              event({
                type,
                transaction_id: 'next-txn',
                expiration_at_ms: Date.parse('2026-04-30T10:00:00Z'),
                event_timestamp_ms: Date.parse('2026-04-01T00:00:00Z') + i,
              }),
            );
            const sub = (
              await db.query<Record<string, unknown>>(
                'SELECT status, monthly_round_allowance_used, expires_at FROM subscriptions',
              )
            ).rows[0];
            assertEquals(sub.status, expected);
            assertEquals(sub.monthly_round_allowance_used, 7);
            assertEquals(
              new Date(sub.expires_at as string).toISOString(),
              '2026-04-30T10:00:00.000Z',
            );
          }
          await apply(
            db,
            event({ type: 'RENEWAL', transaction_id: 'delayed-old-txn' }),
          );
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                'SELECT status FROM subscriptions',
              )
            ).rows[0].status,
            'expired',
          );
        },
      );

      await t.step(
        'failed credit grant rolls back claim and purchase; retry grants once',
        async () => {
          const payload = event({
            type: 'NON_RENEWING_PURCHASE',
            product_id: 'credits_30',
            transaction_id: 'credits-txn',
          });
          await db.exec(
            "ALTER TABLE wallet_transactions ADD CONSTRAINT simulated_outage CHECK (reason <> 'purchase')",
          );
          await assertRejects(
            () => apply(db, payload),
            Error,
            'simulated_outage',
          );
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                'SELECT count(*)::int AS n FROM revenuecat_events WHERE event_id = $1',
                [payload.id],
              )
            ).rows[0].n,
            0,
          );
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                "SELECT count(*)::int AS n FROM purchases WHERE revenuecat_transaction_id = 'credits-txn'",
              )
            ).rows[0].n,
            0,
          );
          await db.exec(
            'ALTER TABLE wallet_transactions DROP CONSTRAINT simulated_outage',
          );
          await apply(db, payload);
          await apply(db, payload);
          await apply(db, { ...payload, id: crypto.randomUUID() });
          const ledger = await db.query<Record<string, unknown>>(
            "SELECT amount FROM wallet_transactions WHERE reason = 'purchase'",
          );
          assertEquals(ledger.rows, [{ amount: 30 }]);
        },
      );

      await t.step(
        'all configured credit packs grant the catalog amount and unknown packs fail',
        async () => {
          for (const [product, amount] of [
            ['credits_10', 10],
            ['credits_30', 30],
            ['credits_80', 80],
            ['credits_200', 200],
          ] as const) {
            const payload = event({
              type: 'NON_RENEWING_PURCHASE',
              product_id: product,
              transaction_id: `catalog-${product}`,
            });
            await apply(db, payload);
            const row = (
              await db.query<Record<string, unknown>>(
                'SELECT amount FROM wallet_transactions WHERE idempotency_key = $1',
                [`credits_grant_catalog-${product}`],
              )
            ).rows[0];
            assertEquals(row.amount, amount);
          }
          await assertRejects(
            () =>
              apply(
                db,
                event({
                  type: 'NON_RENEWING_PURCHASE',
                  product_id: 'credits_9999',
                }),
              ),
            Error,
            'Invalid credit product_id',
          );
        },
      );

      await t.step(
        'missing expiration is rejected without a claim or invented benefits',
        async () => {
          const payload = event({
            transaction_id: 'missing-expiry',
            expiration_at_ms: null,
          });
          await assertRejects(
            () => apply(db, payload),
            Error,
            'Subscription expiration',
          );
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                'SELECT count(*)::int AS n FROM revenuecat_events WHERE event_id = $1',
                [payload.id],
              )
            ).rows[0].n,
            0,
          );
        },
      );

      await t.step(
        'lifecycle before activation remains retryable, then targets the restored subscription',
        async () => {
          const payload = event({
            type: 'CANCELLATION',
            transaction_id: 'restored-renewal',
            original_transaction_id: 'restored-original',
          });
          await assertRejects(
            () => apply(db, payload),
            Error,
            'activation has not been received',
          );
          await apply(db, {
            ...payload,
            id: crypto.randomUUID(),
            type: 'RENEWAL',
          });
          await apply(db, payload);
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                "SELECT status FROM subscriptions WHERE revenuecat_subscription_id = 'restored-original'",
              )
            ).rows[0].status,
            'canceled',
          );
          await db.exec(
            "DELETE FROM subscriptions WHERE revenuecat_subscription_id = 'restored-original'",
          );
        },
      );

      await t.step(
        'failed subscription purchase mirror rolls back allowance renewal',
        async () => {
          await db.exec(
            "ALTER TABLE purchases ADD CONSTRAINT purchase_outage CHECK (revenuecat_transaction_id <> 'failed-renewal')",
          );
          const payload = event({
            type: 'RENEWAL',
            transaction_id: 'failed-renewal',
            event_timestamp_ms: Date.parse('2026-05-01T00:00:00Z'),
          });
          await assertRejects(
            () => apply(db, payload),
            Error,
            'purchase_outage',
          );
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                'SELECT status, monthly_round_allowance_used FROM subscriptions',
              )
            ).rows[0],
            { status: 'expired', monthly_round_allowance_used: 7 },
          );
          await db.exec(
            'ALTER TABLE purchases DROP CONSTRAINT purchase_outage',
          );
        },
      );

      await t.step(
        'unknown users and TEST events acknowledge without foreign-key failure',
        async () => {
          assertEquals(
            (await apply(db, event({ app_user_id: '$RCAnonymousID:test' })))
              .action,
            'ignored_unknown_profile',
          );
          assertEquals(
            (
              await apply(db, {
                id: 'dashboard-test',
                type: 'TEST',
                app_user_id: 'test',
              })
            ).action,
            'ignored',
          );
        },
      );

      await t.step(
        'a purchase transaction cannot be fulfilled to another profile',
        async () => {
          await assertRejects(
            () =>
              apply(
                db,
                event({
                  type: 'NON_RENEWING_PURCHASE',
                  app_user_id: OTHER,
                  product_id: 'credits_30',
                  transaction_id: 'credits-txn',
                }),
              ),
            Error,
            'different profile',
          );
        },
      );

      await t.step(
        'FTUO failure rolls back and retry grants credits plus cosmetic once',
        async () => {
          const payload = event({
            type: 'NON_RENEWING_PURCHASE',
            product_id: 'ftuo_starter',
            transaction_id: 'ftuo-txn',
          });
          await assertRejects(() => apply(db, payload), Error, 'no_offer');
          await db.exec(`INSERT INTO cosmetics_catalog (slug, name, cosmetic_type, acquisition) VALUES ('founders_frame', 'Founders', 'frame', 'exclusive');
        INSERT INTO first_time_offers (slug, title, description, product_id, credits, exclusive_cosmetic_slug) VALUES ('starter', 'Starter', 'Offer', 'ftuo_starter', 50, 'founders_frame');`);
          await apply(db, payload);
          await apply(db, payload);
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                "SELECT sum(amount)::int AS n FROM wallet_transactions WHERE reason = 'ftuo_purchase'",
              )
            ).rows[0].n,
            50,
          );
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                'SELECT count(*)::int AS n FROM player_cosmetics',
              )
            ).rows[0].n,
            1,
          );
        },
      );

      await t.step(
        'annual Google Play plan receives first monthly reset',
        async () => {
          await apply(
            db,
            event({
              app_user_id: OTHER,
              product_id: 'promptwars_plus_annual:annual',
              transaction_id: 'annual-txn',
              original_transaction_id: 'annual-original',
              purchased_at_ms: Date.parse('2027-01-31T10:00:00Z'),
              event_timestamp_ms: Date.parse('2027-01-31T10:00:00Z'),
              expiration_at_ms: Date.parse('2028-01-31T10:00:00Z'),
              store: 'PLAY_STORE',
            }),
          );
          const sub = (
            await db.query<Record<string, unknown>>(
              'SELECT allowance_reset_at FROM subscriptions WHERE profile_id = $1',
              [OTHER],
            )
          ).rows[0];
          assertEquals(
            new Date(sub.allowance_reset_at as string).toISOString(),
            '2027-02-28T10:00:00.000Z',
          );
        },
      );

      await t.step(
        'late annual delivery starts in the current monthly window',
        async () => {
          const now = new Date();
          const purchased = new Date(now.getTime() - 100 * 86400000);
          const expiry = new Date(now.getTime() + 265 * 86400000);
          await apply(
            db,
            event({
              app_user_id: OTHER,
              product_id: 'promptwars_plus_annual',
              transaction_id: 'late-annual-txn',
              original_transaction_id: 'late-annual-original',
              purchased_at_ms: purchased.getTime(),
              event_timestamp_ms: purchased.getTime(),
              expiration_at_ms: expiry.getTime(),
            }),
          );
          const row = (
            await db.query<Record<string, unknown>>(
              "SELECT allowance_reset_at FROM subscriptions WHERE revenuecat_subscription_id = 'late-annual-original'",
            )
          ).rows[0];
          assertEquals(
            new Date(row.allowance_reset_at as string).getTime() >
              now.getTime(),
            true,
          );
          await db.exec(
            "DELETE FROM subscriptions WHERE revenuecat_subscription_id = 'late-annual-original'",
          );
        },
      );

      await t.step(
        'monthly boundaries stay anchored across February, leap years, skipped months and expiry',
        async () => {
          for (const [anchor, at, expiry, expected] of [
            ['2027-01-31', '2027-02-28', '2028-01-31', '2027-03-31'],
            ['2027-01-31', '2027-06-15', '2028-01-31', '2027-06-30'],
            ['2028-01-31', '2028-02-29', '2029-01-31', '2028-03-31'],
            ['2027-01-31', '2027-02-10', '2027-02-15', '2027-02-15'],
          ]) {
            const row = (
              await db.query<Record<string, unknown>>(
                'SELECT internal.next_subscription_allowance_reset($1, $2, $3) AS at',
                [anchor, expiry, at],
              )
            ).rows[0];
            assertEquals(
              new Date(row.at as string).toISOString().slice(0, 10),
              expected,
            );
          }
        },
      );

      await t.step(
        'reset handles canceled paid annual rows once without rollover or expired benefits',
        async () => {
          await db.exec(`UPDATE subscriptions SET status = 'canceled', monthly_video_allowance_used = 20,
        monthly_round_allowance_used = 60, monthly_full_battle_cap_used = 20 WHERE profile_id = '${OTHER}';`);
          const reset = await db.query<Record<string, unknown>>(
            'SELECT internal.reset_subscription_allowances($1) AS n',
            ['2027-03-15T00:00:00Z'],
          );
          assertEquals(reset.rows[0].n, 1);
          const row = (
            await db.query<Record<string, unknown>>(
              'SELECT monthly_video_allowance_used, monthly_round_allowance_used, monthly_full_battle_cap_used, allowance_reset_at FROM subscriptions WHERE profile_id = $1',
              [OTHER],
            )
          ).rows[0];
          assertEquals(row.monthly_round_allowance_used, 0);
          assertEquals(row.monthly_video_allowance_used, 0);
          assertEquals(row.monthly_full_battle_cap_used, 0);
          assertEquals(
            new Date(row.allowance_reset_at as string).toISOString(),
            '2027-03-31T10:00:00.000Z',
          );
          await db.exec(
            `UPDATE subscriptions SET monthly_round_allowance_used = 5 WHERE profile_id = '${OTHER}'`,
          );
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                'SELECT internal.reset_subscription_allowances($1) AS n',
                ['2027-03-15T00:00:00Z'],
              )
            ).rows[0].n,
            0,
          );
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                'SELECT internal.reset_subscription_allowances($1) AS n',
                ['2028-01-31T10:00:00Z'],
              )
            ).rows[0].n,
            0,
          );
        },
      );

      await t.step(
        'reset only changes due active/canceled paid rows',
        async () => {
          const cases = [
            ['active-due', 'active', '2030-02-01', '2031-01-01', true],
            ['canceled-due', 'canceled', '2030-02-01', '2031-01-01', true],
            ['active-future', 'active', '2030-03-01', '2031-01-01', false],
            ['active-expired', 'active', '2030-02-01', '2030-02-01', false],
            ['canceled-expired', 'canceled', '2030-02-01', '2030-02-01', false],
            ['expired-due', 'expired', '2030-02-01', '2031-01-01', false],
            ['paused-due', 'paused', '2030-02-01', '2031-01-01', false],
          ] as const;
          for (const [id, status, reset, expiry] of cases) {
            await db.query(
              `INSERT INTO subscriptions (profile_id, revenuecat_subscription_id, product_id, status,
          starts_at, expires_at, allowance_anchor_at, allowance_reset_at, monthly_round_allowance_used)
          VALUES ($1, $2, 'promptwars_plus_annual', $3, '2030-01-01', $4, '2030-01-01', $5, 20)`,
              [PROFILE, id, status, expiry, reset],
            );
          }
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                "SELECT internal.reset_subscription_allowances('2030-02-15') AS n",
              )
            ).rows[0].n,
            2,
          );
          for (const [id, , , , resets] of cases) {
            const row = (
              await db.query<Record<string, unknown>>(
                'SELECT monthly_round_allowance_used FROM subscriptions WHERE revenuecat_subscription_id = $1',
                [id],
              )
            ).rows[0];
            assertEquals(row.monthly_round_allowance_used, resets ? 0 : 20, id);
          }
        },
      );

      await t.step(
        'migration is idempotent and preserves counters when reapplied',
        async () => {
          const before = await db.query(
            'SELECT id, monthly_round_allowance_used, allowance_reset_at FROM subscriptions ORDER BY id',
          );
          await db.exec(await read(migrationName));
          assertEquals(
            (
              await db.query(
                'SELECT id, monthly_round_allowance_used, allowance_reset_at FROM subscriptions ORDER BY id',
              )
            ).rows,
            before.rows,
          );
        },
      );

      await t.step(
        'fulfillment and reset are unavailable to clients; one cron job is registered',
        async () => {
          for (const role of ['anon', 'authenticated']) {
            const row = (
              await db.query<Record<string, unknown>>(
                "SELECT has_function_privilege($1, 'public.process_revenuecat_event(jsonb)', 'EXECUTE') AS allowed",
                [role],
              )
            ).rows[0];
            assertEquals(row.allowed, false);
          }
          assertEquals(
            (
              await db.query<Record<string, unknown>>(
                "SELECT count(*)::int AS n FROM cron.job WHERE jobname = 'reset-subscription-allowances'",
              )
            ).rows[0].n,
            1,
          );
        },
      );
    } finally {
      await db.close();
    }
  },
);

Deno.test(
  'migration preserves a renewed monthly subscription allowance window',
  async () => {
    const db = await database(async (db) => {
      await db.exec(`INSERT INTO subscriptions (
      profile_id, revenuecat_subscription_id, product_id, status,
      starts_at, expires_at, allowance_reset_at, monthly_round_allowance_used
    ) VALUES ('${PROFILE}', 'legacy-monthly', 'promptwars_plus_monthly', 'active',
      NOW() - INTERVAL '100 days', NOW() + INTERVAL '10 days',
      NOW() + INTERVAL '10 days', 25);`);
    });
    try {
      assertEquals(
        (
          await db.query<Record<string, unknown>>(
            'SELECT allowance_reset_at = expires_at AS preserved FROM subscriptions',
          )
        ).rows[0].preserved,
        true,
      );
      assertEquals(
        (
          await db.query<Record<string, unknown>>(
            'SELECT internal.reset_subscription_allowances() AS n',
          )
        ).rows[0].n,
        0,
      );
      assertEquals(
        (
          await db.query<Record<string, unknown>>(
            'SELECT monthly_round_allowance_used FROM subscriptions',
          )
        ).rows[0].monthly_round_allowance_used,
        25,
      );
    } finally {
      await db.close();
    }
  },
);

Deno.test(
  'paid-through canceled subscriptions spend and restore allowance; expired rows never do',
  async () => {
    const db = await database();
    try {
      const battleId = '00000000-0000-4000-8000-000000000003';
      const videoId = '00000000-0000-4000-8000-000000000004';
      await db.exec(`INSERT INTO battles VALUES ('${battleId}');
      INSERT INTO video_jobs VALUES ('${videoId}');
      INSERT INTO subscriptions (
        profile_id, revenuecat_subscription_id, product_id, status,
        starts_at, expires_at, allowance_reset_at, monthly_video_allowance_used
      ) VALUES
        ('${PROFILE}', 'expired-active', 'promptwars_plus_monthly', 'active', NOW() - INTERVAL '40 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 5),
        ('${PROFILE}', 'paid-canceled', 'promptwars_plus_monthly', 'canceled', NOW() - INTERVAL '20 days', NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days', 1);`);
      for (let i = 0; i < 2; i++) {
        assertEquals(
          (
            await db.query<Record<string, unknown>>(
              'SELECT decrement_subscriber_round_allowance($1, $2, 1::smallint, true, $3) AS ok',
              [PROFILE, battleId, 'canceled-round'],
            )
          ).rows[0].ok,
          true,
        );
        assertEquals(
          (
            await db.query<Record<string, unknown>>(
              'SELECT restore_subscription_allowance($1, $2, $3) AS ok',
              [PROFILE, videoId, 'canceled-refund'],
            )
          ).rows[0].ok,
          true,
        );
      }
      const rows = (
        await db.query<Record<string, unknown>>(
          'SELECT revenuecat_subscription_id, monthly_video_allowance_used, monthly_round_allowance_used FROM subscriptions ORDER BY revenuecat_subscription_id',
        )
      ).rows;
      assertEquals(rows, [
        {
          revenuecat_subscription_id: 'expired-active',
          monthly_video_allowance_used: 5,
          monthly_round_allowance_used: 0,
        },
        {
          revenuecat_subscription_id: 'paid-canceled',
          monthly_video_allowance_used: 0,
          monthly_round_allowance_used: 1,
        },
      ]);
      await db.exec(
        "UPDATE subscriptions SET expires_at = NOW() - INTERVAL '1 second'",
      );
      assertEquals(
        (
          await db.query<Record<string, unknown>>(
            'SELECT decrement_subscriber_round_allowance($1, $2, 2::smallint, false, $3) AS ok',
            [PROFILE, battleId, 'expired-round'],
          )
        ).rows[0].ok,
        false,
      );
      assertEquals(
        (
          await db.query<Record<string, unknown>>(
            'SELECT restore_subscription_allowance($1, $2, $3) AS ok',
            [PROFILE, videoId, 'expired-refund'],
          )
        ).rows[0].ok,
        false,
      );
    } finally {
      await db.close();
    }
  },
);

Deno.test(
  'monthly store period ending March 31 does not refresh again on March 28',
  async () => {
    const db = await database();
    try {
      await apply(
        db,
        event({
          type: 'RENEWAL',
          transaction_id: 'month-end-renewal',
          purchased_at_ms: Date.parse('2030-02-28T10:00:00Z'),
          event_timestamp_ms: Date.parse('2030-02-28T10:00:00Z'),
          expiration_at_ms: Date.parse('2030-03-31T10:00:00Z'),
        }),
      );
      const sub = (
        await db.query<Record<string, unknown>>(
          'SELECT allowance_reset_at FROM subscriptions',
        )
      ).rows[0];
      assertEquals(
        new Date(sub.allowance_reset_at as string).toISOString(),
        '2030-03-31T10:00:00.000Z',
      );
      await db.exec(
        'UPDATE subscriptions SET monthly_round_allowance_used = 80',
      );
      assertEquals(
        (
          await db.query<Record<string, unknown>>(
            "SELECT internal.reset_subscription_allowances('2030-03-28T10:00:00Z') AS n",
          )
        ).rows[0].n,
        0,
      );
      assertEquals(
        (
          await db.query<Record<string, unknown>>(
            'SELECT monthly_round_allowance_used FROM subscriptions',
          )
        ).rows[0].monthly_round_allowance_used,
        80,
      );
    } finally {
      await db.close();
    }
  },
);

Deno.test(
  'cancellation arriving before its renewal preserves cancellation and refreshes the new paid allowance',
  async () => {
    const db = await database();
    try {
      await apply(
        db,
        event({
          purchased_at_ms: Date.parse('2030-01-31T10:00:00Z'),
          expiration_at_ms: Date.parse('2030-02-28T10:00:00Z'),
          event_timestamp_ms: Date.parse('2030-01-31T10:00:00Z'),
        }),
      );
      await db.exec(
        'UPDATE subscriptions SET monthly_round_allowance_used = 90',
      );
      await apply(
        db,
        event({
          type: 'CANCELLATION',
          transaction_id: 'renewal-after-cancel',
          purchased_at_ms: Date.parse('2030-02-28T10:00:00Z'),
          expiration_at_ms: Date.parse('2030-03-31T10:00:00Z'),
          event_timestamp_ms: Date.parse('2030-03-01T10:00:00Z'),
        }),
      );
      await apply(
        db,
        event({
          type: 'RENEWAL',
          transaction_id: 'renewal-after-cancel',
          purchased_at_ms: Date.parse('2030-02-28T10:00:00Z'),
          expiration_at_ms: Date.parse('2030-03-31T10:00:00Z'),
          event_timestamp_ms: Date.parse('2030-02-28T10:00:00Z'),
        }),
      );
      const row = (
        await db.query<Record<string, unknown>>(
          'SELECT status, monthly_round_allowance_used, allowance_reset_at FROM subscriptions',
        )
      ).rows[0];
      assertEquals(row.status, 'canceled');
      assertEquals(row.monthly_round_allowance_used, 0);
      assertEquals(
        new Date(row.allowance_reset_at as string).toISOString(),
        '2030-03-31T10:00:00.000Z',
      );
    } finally {
      await db.close();
    }
  },
);
