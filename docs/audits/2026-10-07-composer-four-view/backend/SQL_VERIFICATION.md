# Composition v3 SQL verification — 2026-10-07

Migration: `supabase/migrations/20261007122059_composer_three_decision_operations.sql`.

The following checks were executed against local PostgreSQL only. No production database reset or test data write was performed. Local pending migrations and the assertion suite ran inside a transaction ending in ROLLBACK. Real concurrency cases used separate PostgreSQL connections in a disposable cluster inside the existing local Supabase container, initialized with schema only and synthetic users; that cluster was removed after execution.

## Results

- Baseline test failed before the migration because the completion reservation RPC was absent, reproducing the missing contract.
- `rtk proxy python3 scripts/test-composition-db.py`: passed; all test writes rolled back.
- `rtk proxy python3 scripts/test-composer-db.py`: existing composer SQL suites and the new completion suite passed together; rolled back.
- Reapplying the new migration in the local verification transaction passed, checking additive/idempotent declarations and preserved overloads.
- `rtk proxy python3 scripts/test-composition-concurrency.py`: six independent concurrency scenarios passed. Exact concise output is in [composition-concurrency.log](composition-concurrency.log).

## Real concurrency cases

1. Concurrent identical contexts reserve exactly one operation/attempt. Competing seventh contexts cannot exceed six live reservations or delivered custom completions, including different move types.
2. One reclaim winner gets a fresh lease token; an old worker cannot overwrite a successor's delivered result.
3. A finalizer waiting on the battle lock rechecks current time, rejecting a deadline crossed during its wait.
4. Submit taking the parent lock first blocks later delivery. Earlier delivered completions remain replayable after submit. Custom completions do not touch the wallet.
5. Sweeper skips a busy parent. Concurrent sweepers release a reservation once and fence the old worker.
6. Bank generation and completion generation share the same remaining thirtieth hourly attempt under concurrent claims.

## Contract and access assertions

The SQL assertion suite also covers: six-success quota across target/type; pending/cache replay without another attempt; no fourth generation attempt for one context; failed/partial/late results releasing quota; upgrade allowed after custom quota; immutable purchased fields/IDs; successful enrichment replay with original purchase price; zero enrichment wallet changes; frozen operation composition version and legacy request replay; incomplete v3 tree rejection; lease fencing; and service-only mutation functions.

Private completion/attempt tables have RLS enabled and no client grants. Negative SELECT tests additionally grant temporary read access within the rollback transaction to prove RLS still hides rows. Occurrence telemetry checks owner-read versus outsider-read, no client writes, per-sequence retry deduplication, repeated Next occurrences, monotonic duration, and unchanged legacy composer-event upsert shape.

## Limits

These are local SQL guarantees, not a claim of production load-testing, payment-provider integration, mobile runtime behavior, or xAI latency. Endpoint auth/provider tests and deployment evidence are separate. The sweeper and finalizer share parent-lock ordering; these targeted races do not prove absence of every possible future database deadlock.
