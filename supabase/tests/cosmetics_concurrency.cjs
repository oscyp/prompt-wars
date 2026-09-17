// Run against the isolated PostgreSQL fixture runtime only, after migrations.
// Requires pg on NODE_PATH; no Supabase service or real account is contacted.
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const config = {
  host: '/tmp/prompt-wars-db-runtime',
  port: 55439,
  user: 'postgres',
  database: 'postgres',
};

async function connect() {
  const client = new Client(config);
  await client.connect();
  await client.query("SET statement_timeout = '10s'");
  return client;
}

async function main() {
  const admin = await connect();
  const workers = [await connect(), await connect()];
  const users = [randomUUID(), randomUUID()];
  try {
    for (const id of users) {
      await admin.query(
        'INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES($1, $2, \'{"age_confirmed":true}\')',
        [id, `${id}@cosmetics.invalid`],
      );
      await admin.query('SELECT create_starter_fighter($1)', [id]);
      const balance = Number(
        (
          await admin.query(
            "SELECT coalesce(sum(amount), 0) AS n FROM wallet_transactions WHERE profile_id = $1 AND currency_type = 'credits'",
            [id],
          )
        ).rows[0].n,
      );
      await admin.query("SELECT grant_credits($1, $2, 'test_fixture', $3)", [
        id,
        30 - balance,
        `cosmetics_concurrent_${id}`,
      ]);
    }

    async function race(id, slugs) {
      await admin.query('BEGIN');
      await admin.query(
        "SELECT pg_advisory_xact_lock(hashtext('wallet:' || $1))",
        [id],
      );
      const pending = workers.map((worker, index) =>
        worker.query('SELECT purchase_cosmetic($1, $2, 2) AS result', [
          id,
          slugs[index],
        ]),
      );
      pending.forEach((result) => result.catch(() => {}));
      let blocked = 0;
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        blocked = Number(
          (
            await admin.query(
              "SELECT count(*) AS n FROM pg_stat_activity WHERE pid = ANY($1) AND wait_event_type = 'Lock'",
              [workers.map((worker) => worker.processID)],
            )
          ).rows[0].n,
        );
        if (blocked === 2) break;
      }
      await admin.query('COMMIT');
      const results = (await Promise.all(pending)).map(
        (result) => result.rows[0].result,
      );
      assert.equal(
        blocked,
        2,
        'both purchases reached the wallet lock concurrently',
      );
      assert.equal(
        results.filter((result) => result.success).length,
        1,
        'exactly one committed purchase',
      );
      const ledger = (
        await admin.query(
          "SELECT coalesce(sum(amount), 0) AS balance, count(*) FILTER(WHERE reason = 'cosmetic_purchase') AS charges FROM wallet_transactions WHERE profile_id = $1 AND currency_type = 'credits'",
          [id],
        )
      ).rows[0];
      assert.equal(Number(ledger.balance), 5);
      assert.equal(Number(ledger.charges), 1);
      return results;
    }

    const duplicate = await race(users[0], [
      'astral_codex_frame',
      'astral_codex_frame',
    ]);
    assert.equal(
      duplicate.filter((result) => result.error === 'already_owned').length,
      1,
    );
    const competing = await race(users[1], [
      'emberforge_frame',
      'neon_circuit_frame',
    ]);
    assert.equal(
      competing.filter((result) => result.error === 'insufficient_credits')
        .length,
      1,
    );
    console.log(
      'PASS concurrent cosmetic purchases: observed wallet lock, duplicate charged once, competing items cannot overspend.',
    );
  } finally {
    await admin.query('ROLLBACK').catch(() => {});
    await Promise.all(workers.map((worker) => worker.end()));
    await admin.query('DELETE FROM auth.users WHERE id = ANY($1)', [users]);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
