# Isolated database verification — 13 September 2026

Executed PostgreSQL15.18 through `@embedded-postgres/darwin-arm64@15.18.0-beta.17`, with `pg@8.16.3`. Both dependencies and the database live only in `/tmp/prompt-wars-db-runtime`; no dependency or database data was added to the app. Sources: [embedded-postgres](https://github.com/leinelissen/embedded-postgres), [platform package](https://www.npmjs.com/package/@embedded-postgres/darwin-arm64).

The server listens only on `/tmp/prompt-wars-db-runtime/.s.PGSQL.55439`, with TCP disabled. No existing local/remote database was reset, migrated or queried. The checked-in CJS files preserve the executed local harness and use that fixed temporary socket; they are an execution record, not a deployment tool.

`verify.cjs bootstrap` supplied minimal auth.users/auth.uid, storage tables/foldername, API roles and a realtime publication. The repository migration chain (101 migrations) then applied in timestamp order. Only `20260526120000_schedule_background_workers.sql` was skipped because pg_cron/pg_net/Vault are Supabase services. This validates PostgreSQL functions, constraints, grants and the fixture RLS cases; it does not validate GoTrue, PostgREST, Realtime delivery, Storage signing services, Edge Runtime or scheduling.

## Final results

See [results.txt](results.txt). Five rollback-only SQL fixtures passed. The custom isolation runner executed all three permutations in `combat_timeout_races.spec` with independent sessions and an observed PostgreSQL lock wait in every permutation. The idempotency runner held an explicit lock barrier until both concurrent calls were waiting, covering eight operations and asserting their effects. It cleaned only its generated fixture records; audit-ledger records were explicitly removed before deleting fixture users. This is not a production account-deletion test.

Earlier runs exposed invalid fixture setup (missing character IDs/locked timestamps), an ambiguous portrait RPC seed reference, and incomplete harness cleanup. These were corrected and the recorded final run passed. No claim of a pristine first run is made.

## Reproduction

The three captured scripts contain the exact SQL bootstrap, migration skip, assertions, ordering and fixed local paths. In an isolated environment, supply the pinned PostgreSQL and pg runtime, initialize a new temporary data directory, disable TCP and start its Unix socket, then execute bootstrap/migrate, the five fixtures, isolation.cjs and idempotency.cjs. Never substitute a shared/staging/production connection into this harness. For real Supabase staging, use the repository fixtures with its normal migration runner and separately validate the service gates in the release acceptance matrix.
