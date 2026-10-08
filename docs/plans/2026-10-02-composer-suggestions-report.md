# Composer suggestion remediation evidence — 2 October 2026

Task 1 is implemented in the shared checkout. No deployment, commit, database reset, or paid provider call was performed by this task.

## Behavior and interfaces

- `TextModerationProvider.moderate(text)` retains the existing 20–800 prompt contract and reason. `moderateUnits` validates title 3–48, action 5–240, intent 5–180, body/pair 20–800 separately, then deduplicates classifier inputs. OpenAI receives an input array; Perspective/custom single-input classifiers use at most four concurrent requests. The whole moderation operation, including fallback across all claimed banks, has one 60-second deadline. Missing/malformed/partial/timed-out responses fail closed. OpenAI validation requires the 11 categories shared by text/omni models, scores in [0,1] for every returned category, and a consistent raw flagged boolean before applying the existing fictional-combat tolerances. Perspective requires all six requested attribute scores in [0,1]. All three structured cards must pass. Moderation audit contains unit kind/status/reason/provider, never the text. Existing lease heartbeat continues through generation, moderation, finalization and fenced cleanup. A completed operation whose response is delayed no longer makes a racing heartbeat falsely declare the remaining banks lost; each in-flight finalization relies on its own DB fence.
- `generate-move-suggestions` accepts `ensure_free` with `move_types` (one to three unique types), mutually exclusive with `move_type`. Single-type request/response shape remains. Batch returns `data.results` in requested type order; each type has its own private operation/lease, and only claimed types enter one grouped generation call. Pending/cache/error types remain separate. Caller source is ignored and forced to `player`. Batch rerolls are rejected before reservation; explicit rerolls retain contract 3, price and idempotency requirements. Tokens never leave the endpoint.
- Optional generated `affordanceIds` are restricted to IDs from the stored round snapshot via the root-owned pure `_shared/prompt-affordances.ts`. Unknown/duplicate/invalid tags are dropped and absent tags remain absent. The mobile catalog is never imported into the server.
- V2 prefetch returns `build_entry_required` before reservations/provider work. Legacy service prefetch remains available. Round-creation call-site guards are owned by the bot task.
- The additive delivery migration consistently takes battle → round → per-profile suggestion advisory lock → operation → wallet. Finalization re-reads after those locks and uses `clock_timestamp()`. An owner's locked prompt yields `prompt_locked_before_delivery`; inactive, changed, expired or closed rounds yield `round_closed_before_delivery`. Late paid results refund exactly once; free failures create no wallet movement. Earlier successful operation replays remain successful after closing. Any mismatched or expired pending worker fence is stale.
- Sweeper discovers candidates without locking operations, takes parents first using nonblocking row/advisory locks, rechecks expiry after locks, and issues a new worker token before the normal fenced refund. It skips contention on battle, round, per-player serialization, operation or wallet, avoiding a child-lock/parent-lock inversion even across multiple candidates.
- Rate accounting uses a new private timestamped attempt ledger: three fresh banks consume three; pending/cache replays consume zero; 30/hour and 90/day caps remain. Retrying an old operation counts in the current window. Historical attempts lack precise individual timestamps, so the migration conservatively backfills each at greatest(created_at, updated_at); this can temporarily count more historical units in the recent window, never undercount a known recent retry. Reapplying the migration does not move recorded timestamps.

## Verification

RED observed before implementation:

1. Real heuristic moderation rejected safe structured cards because their repeated fragment/body/pair concatenation exceeded prompt bounds; expected ready, received failed.
2. Unit moderation asserted separate title/body/action/hint/pair classifier inputs; existing aggregate failed.
3. Free batch parser/HTTP results and optional allowlisted tags were absent.
4. Rollback SQL late paid delivery succeeded after its deadline instead of failing/refunding.
5. Closed single-round delivery with stale open battle status was permitted.
6. Independent review reproduced a completion/heartbeat race that failed the remaining banks after one bank had already committed successfully.
7. Partial or contradictory classifier category maps were approved; these now fail closed with complete wire-response fixtures.
8. With 29 new attempts, retries of two two-hour-old operations both bypassed the hourly cap; the second is now rejected. A concurrent variant across two different battles also permits only the remaining single unit.

GREEN final checks:

- Full Deno Edge Function suite: **473 passed, 59 steps, 0 failed, 7 ignored**. Log: `/tmp/prompt-wars-composer-suggestions-all-deno.log`. Ignored remote integration tests remain gated; no production/provider requests were made by new tests.
- `scripts/test-suggestion-db.py`: all SQL finance, rate, legacy, replay, RLS and privilege cases pass, writes rolled back. Log: `/tmp/prompt-wars-suggestion-db-test.log`.
- `scripts/test-suggestion-concurrency.py`: real separate PostgreSQL connections in a temporary schema-only cluster copied from local Docker; existing database is never migrated/reset by this script. Cases cover 8-way free reservation, same-key paid reservation/debit, reclaimed worker versus old failure, submit-before-delivery/refund, delivery-before-submit/replay, crossing deadline while blocked on parent lock, free late failure, busy-parent sweep skip, two competing sweepers/one refund, expired-worker fence, competing purchases for the last credit, and old-operation retries across two battles competing for one remaining hourly unit. Log: `/tmp/prompt-wars-suggestion-concurrency.log`.
- Deno formatting applied to owned TypeScript. Scoped Deno lint passes with `--rules-exclude=no-import-prefix` (repository tests conventionally use pinned HTTPS std imports). The formerly unused video ID parameter is now `_videoId` with no behavioral change.

The new classifier tests mock only network boundaries and exercise the real validation/policy. They verify safe short fragments, validation before text deduplication, harmful joined meaning despite safe fragments, partial/malformed provider output, and one global timeout with at most four fallback requests. HTTP tests exercise one grouped provider call for two fresh types while a third remains pending, and server validation of tags.

## Files owned by this task

- `supabase/functions/_shared/moderation.ts`
- `supabase/functions/_shared/suggestion-service.ts`
- `supabase/functions/_shared/move-suggestions.ts`
- `supabase/functions/generate-move-suggestions/index.ts`
- `supabase/functions/prefetch-move-suggestions/index.ts`
- `supabase/migrations/20261002130316_composer_delivery_safety.sql`
- `supabase/functions/_tests/suggestion_service_test.ts`
- `supabase/functions/_tests/suggestion_endpoint_test.ts`
- `supabase/functions/_tests/structured_suggestions_test.ts`
- `supabase/functions/_tests/suggestion_moderation_units_test.ts` (new)
- `supabase/functions/_tests/suggestion_prefetch_test.ts` (new)
- `supabase/functions/_tests/fixtures/moderation.ts` (new complete classifier wire fixture)
- `supabase/tests/composer_suggestions.sql`
- `scripts/test-suggestion-db.py`
- `scripts/test-suggestion-concurrency.py`

The existing checkout contained earlier uncommitted composer work. Compare against `/tmp/prompt-wars-remediation-20261002-baseline`, not the branch-wide Git diff, to isolate this task. No edits were made to root-owned mobile APIs or bot-owned start/advance call sites.

## Independent review follow-up

The bot implementation reviewer reproduced the delayed-completion heartbeat race, partial classifier responses and old-operation rate-window issue. All three have regression coverage and are fixed. The final full Deno run was performed after the root updated the submission RPC fixture to `lock_prompt_with_origin`; the transient three failing submission steps are resolved.

My independent review of bot migration 17, activation 32, private read helper, resolver, matchmaking/start/advance found a legacy single prefetch regression from moving kickoff inside the Bo3-only opener. The bot owner restored guarded legacy single and already-open retry prefetch with behavior tests. No further actionable secrecy, immutable-choice, activation or fallback finding remained in that review.

The classifier boundary shape was checked against the [OpenAI moderation API reference](https://developers.openai.com/api/reference/resources/moderations/methods/create). The existing fictional-combat policy remains unchanged.
