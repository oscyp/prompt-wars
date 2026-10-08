# Faceoff composer — paid step backend verification

Implemented and deployed to Prompt Wars on 2026-10-07. The authorized rollout applied only migration `20261007154542` and the new `reroll-move-step-suggestions` function. No real provider calls, mobile builds or store releases were performed by this backend task.

## Contract

`POST reroll-move-step-suggestions` requires authenticated shared eligibility and battle participation. Body: `battle_id`, optional `round_number`, `move_type`, `target` (`intent` or `approach`), `action_text`, `intent_text` only for Approach, `composition_version: 3`, `client_contract_version: 3`, `idempotency_key`, and `expected_credits`. The `Idempotency-Key` header may supply the key. Effective price is checked by the reservation RPC (normally 1 credit; existing test-user waiver remains).

Successful responses use the existing `{ok:true,data:{...}}` envelope. Data exposes `status`, `operation_id`, `context_key`, `target`, `composition_version`, `credits_spent`, `is_paid`, `refunded`, `error` and a delivered `result`. Intention results contain three `intentHints`, each with three `approachHints`; Approach results contain three `approachHints`. Each fragment has a server-generated stable `id` and `text`. Private lease tokens, context snapshots and provider metadata are never returned. Undelivered results are always null. Pending/stale recovery returns HTTP 202; terminal operation success or failure returns HTTP 200 with its recorded financial outcome.

Retry uses the exact same body/key and replays the recorded result. The endpoint never converts old free completion calls into purchases. New paid calls reuse the existing xAI extension provider with an operation-specific variation value, while existing callers omit that value.

## Verified behavior

- Authenticated identity, participant ownership and authoritative situation/fighter inputs; forged profile/theme input cannot override them.
- Explicit price/idempotency validation before reservation; missing purchase fields never reach a financial RPC.
- Generation/context loading, moderation and finalization covered by the renewable worker lease. Only the financial RPC decides delivery, debit and refund.
- Both parent pair and all reachable triples are moderated alongside individual fragments; rejected, incomplete and timed-out responses fail closed.
- A lost finalization response recovers the recorded success rather than refunding it; late and stale workers use the database fence. Stale replies retain the original recovery metadata with a null result, so the client polls the same key without treating it as a new purchase.
- Existing free completion/enrichment and action-bank APIs remain available.

## Executed checks

- Full Deno suite: **498 passed, 59 nested steps, 0 failed, 7 ignored**. Ignored remote tests were not enabled. Log: `deno-full.log`.
- New coverage: 11 tests, comprising paid endpoint transport coverage and ten service tests. Existing completion endpoint/provider/service tests also passed.
- `deno check --config supabase/functions/deno.json supabase/functions/reroll-move-step-suggestions/index.ts`: passed.
- Scoped Deno lint: passed with `no-import-prefix` excluded because this repository uses pinned URL imports throughout its Deno tests. The initial default lint run reported only those two test-import style diagnostics.
- Tests were introduced before their implementations; endpoint absence, missing paid variation and missing stale-response recovery metadata caused observed failures before passing.

SQL transaction/RLS/race evidence is recorded in `SQL_VERIFICATION.md` and `sql-verification.json`: migration reapplication, three compatibility suites and twelve independent-connection race groups passed. No claim of real xAI latency or semantic quality is made by these local checks.

## Independent integration review

Reviewed the SQL task's migration and the client task's paid-request API, journal hook and purchase confirmation without modifying those files. One P2 issue was identified and corrected by the SQL task: an expired existing purchase blocked by the AI switch or rate limit originally returned a bare decline, allowing the client to discard its recovery key despite an earlier debit. The final RPC returns the complete pending operation identity and financial metadata in those cases; changed authoritative context instead terminalizes and refunds under a fresh worker fence. Delivered replay remains readable independently of a later character-reference change. The stale-worker client-response regression was also reproduced and fixed in the backend service.

No further P1/P2 findings remained in the reviewed boundaries. Verified preservation of old catalogue-price confirmation for waived action purchases, effective zero-price confirmation for new test accounts, write-before-request journals, parent-scoped delayed outcomes, ambiguous-error recovery, and stale-alert checks for account/round/step/revision. SQL concurrency execution and device/UI acceptance are separate evidence, not inferred from this source review.

A later action-bank recovery regression exposed the same bare-decline problem in the existing action reservation function. Its regression failed before correction, then passed: blocked expired paid operations retain pending identity/price, and closed rounds, expired deadlines, locked prompts, unavailable characters or exhausted attempts terminalize and refund under a new worker fence. Delivered replay and fresh-request decline semantics remain compatible. The SQL owner independently reviewed this correction; the client task separately verified its pending-status precedence fix. Four added action races cover concurrent blocked retries, deadline and submit lock waits, and recovery racing the sweeper/old worker.

### Final composer integration review

Read-only review of the route, composer state/flow, v5 draft migration, selection panel and free-bank hook found two further P2 migration issues: a full legacy prompt without readable composer data could be overwritten when starting a builder branch, and preserved older draft buffers had no recovery control. The route now opens unstructured saved text in freestyle with its exact type. A small pure recovery utility exposes existing migration archives only in freestyle and swaps the chosen exact text/type with the current version, preserving both. Six utility tests and scoped ESLint passed; the route task added regressions for both integration paths.

The final source review also checked type-first selection, three choices per active type, independent manual/builder buffers, branch restoration, review completeness, 600 ms hold cancellation and accessible confirmation fencing. The final free-bank patch stages each generated type as soon as it resolves, and allows explicit complete starter ideas for old banks whose Approach enrichment failed; stored paid banks remain available and late enrichment cannot overwrite a newer purchase. No additional P1/P2 findings remained in these reviewed boundaries. This review does not replace the separate native QA or real-provider checks.

## Initial hosted access checks (historical)

Production target from the existing project configuration: `uoyjhudegdpanrgllfoj`. The current Supabase connector's project listing does not include that project. Calls to list its functions, list migrations and read its configured suggestion price returned `MCP error -32600: You do not have permission to perform this action`. The unrelated accessible project was not queried or modified.

Installed repository CLI is 2.98.2. Its read-only `projects list --output json` returned `Access token not provided. Supply an access token by running supabase login or setting the SUPABASE_ACCESS_TOKEN environment variable.` No credential stores were searched, no authentication bypass was attempted, and no deployment or production writes occurred. Current hosted function versions, migration status and configured price therefore remain unverified in this task until the user restores an authorized connection or CLI login.

Rechecked at approximately **16:00 UTC on 2026-10-07** after the user reported restoring access. The connector still listed only the unrelated project, all three explicit Prompt Wars reads (migrations, functions, price) returned the same permission error, and the sandboxed repository CLI still reported no access token. No production mutation was attempted during that blocked phase.

## Authorized hosted rollout and verification

The root task subsequently verified that the existing legitimate CLI login worked outside the sandbox through its normal credential handling. No credential values were read or printed. The read-only migration list matched every local migration through `20261007122059`; `db push --dry-run` listed only `20261007154542_paid_composer_step_rerolls.sql`.

The authorized `db push --linked --yes` applied that single migration successfully. Its SHA256 is `68b454c516ccc4991ae643ef3e9cec1ae3e1c2ee4e248b8509487cdc26573358`. Docker-backed CLI bundling then deployed only `reroll-move-step-suggestions`, now **ACTIVE, version 1**, bundle SHA256 `84cfee5332ecf19558476ed0cf83ce85221df7f1c621d7d283d197293e9fb2e8`. Existing `generate-move-suggestions` v21, `complete-move-suggestion` v1 and `record-funnel-event` v15 were left unchanged. Logs: `migration-deploy.log`, `function-deploy.log`, `hosted-functions.json`.

Read-only hosted checks confirmed the migration history, installed action recovery code, configured price of **1 credit**, RLS on both private tables, no anon/authenticated table grants, no Realtime publication, four service-only RPCs with fixed search paths and the active once-per-minute sweeper. See `postdeployment-check.json` and its saved SQL. Public endpoint checks returned **405** for GET and **401** for unauthenticated POST, including malformed JSON; see `hosted-auth-check.json`. Authentication runs before body parsing and reservation. Authenticated malformed-input cases are covered locally; no authenticated production fixture or live purchase was created.

Aggregate snapshots at **16:19:24 UTC** before and **16:21:46 UTC** after rollout were unchanged: 15 action deliveries in the preceding 24 hours (mean 22.49 seconds), six generation failures, three moderation rejections, zero expired pending leases and no suggestion debit/refund ledger entries in that window. New step operations were zero at the metadata check. This confirms the inspected baseline, not live adoption or the quality of newly generated output. See `predeployment-check.json` and `postdeployment-operations.json`.

A further read-only check after the HTTP probes confirmed **zero** step operations (`hosted-auth-no-reservations.json`).

No secrets, flags or prices were changed; no old endpoint was removed, no real xAI call was made, and no mobile build or store publication was started.
