# Face-off paid-step SQL verification — 2026-10-07

Migration `20261007154542_paid_composer_step_rerolls.sql` was created using the repository Supabase CLI. It adds private paid intention/approach operation and attempt tables, service-only reserve/renew/finish/sweep RPCs, the existing shared attempt limit, effective zero action-price compatibility for test accounts, and safe recovery for expired paid action-bank operations. Older test clients confirming the catalogue price remain waived.

The initial missing-RPC regression was observed failing before implementation. The independent review found that blocked recovery of an already-charged expired operation could look like a declined new request. That regression was separately reproduced, then fixed and verified: generation/rate blocks return the original pending operation identity and financial data; unavailable changed context refunds rather than creating a new purchase.

Executed successfully:

- Rollback-only local payment suite: participation, legacy rejection, required parent shape, price/no balance, duplicate debit protection, immutable request parents, exact 3/9-path outputs, malformed-result refund, closed-round/original-price replay, changed-character replay, actual test waiver zero, free adaptation quota independence, max-three generation attempts, expired/deadline refund, explicit RLS read/write denial even with accidental grants, no Realtime publication.
- Same migration applied twice in a disposable schema-only cluster; existing `composer_suggestions.sql` and `composer_completions.sql` regressions also passed.
- Eight independent-connection race groups: duplicate purchase; stale worker vs successor; deadline after parent-lock wait; submit before delivery; delivery before submit; two sweepers plus busy parent; shared final 30/hour unit across bank/free/paid-step operations; shared final 90/day unit across all three operations.
- Four additional action-bank recovery races, for **twelve groups total**: eight blocked retries preserve one debit/attempt; deadline during parent-lock wait; submit during parent-lock wait; recovery racing the sweeper and expired worker. The final three-suite compatibility run also passed action refund/replay regressions for round closure, unavailable character and exhausted attempts. The initial action kill-switch regression was observed failing before correction.

The isolated cluster copied schema only, used synthetic accounts/catalogue data, disabled cron job launches, and was stopped/removed in `finally`. Existing local database test writes were rolled back. No production reset, production payment, provider call, app build or store submission was performed by these tests. After the final green run and independent SQL review, the authorized single migration was deployed and hosted permissions verified separately; see `README.md` and `postdeployment-check.json`.

Logs: `step-suggestions-db-test.log`, `step-suggestions-concurrency.log`. Machine-readable summary and migration digest: `sql-verification.json`.
