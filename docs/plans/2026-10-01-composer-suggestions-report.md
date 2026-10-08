# Composer suggestions implementation evidence

> Superseded activation policy: The subsequent 1 October user decision removes PROMPT_COMPOSER_AI_ENABLED and PROMPT_SUGGESTIONS_PAID_ENABLED together with the composer mode/approval switches. AI and explicit paid rerolls are available by default, while moderation, price confirmation, idempotency, leases/refunds and the existing emergency generation/prefetch switches remain. The flag descriptions and original test counts below record the preceding implementation. See [the current release instructions](2026-10-01-composer-release.md).

Task 2 implementation completed in the existing checkout; no commit, remote migration, deployment, live provider call or feature activation was performed.

## Contracts and behavior

- Existing snake-case transport is retained: `battle_id`, `move_type`, `round_number`; new fields are `operation: ensure_free | reroll`, `idempotency_key`, `expected_credits`. Missing operation is always free-only. Paid requests require integer `client_contract_version >= 3`, a stable key and the displayed integer price. Unsupported paid clients receive HTTP 426 / `client_update_required` before reservation; legacy omitted operations stay free-only.
- Successful envelopes contain `data.status: ready | pending | failed` (a fenced stale worker yields HTTP 202 and `stale`), `operation_id`, `id`, `is_paid`, `credits_spent`, and ready-only suggestions. Pending/failed results never expose placeholders or lease tokens. A failed operation can include `error` and `refunded`.
- Definitive business errors retain their codes: `price_changed` (with `error.current_credits`), `insufficient_credits`, `idempotency_conflict`, `purchase_confirmation_required`, `round_not_open`, `prompt_locked`, `rate_limited`, `generation_disabled`, `rerolls_disabled`, `price_unavailable`. Transport/server errors are ambiguous: retry the same paid key, never automatically allocate another.
- New private operation ledger binds owner/battle/round/move/operation. Reservation, current-price check and wallet debit commit together. Original operation/price replay precedes new-generation flag and price checks. Zero-price and staff rerolls do not collide with the first-free index.
- A 60-second lease is renewed throughout generation/moderation at 10-second intervals and before completion. All row writes, failures, cleanup and refunds are fenced. Reclaim never spends twice. Three generation attempts bound automatic recovery; failed paid operations are terminal. A minute cron sweeper refunds operations abandoned for four minutes beyond lease expiry, including ended battles.
- No new client writes or paid provenance in judge input. Public suggestion rows retain owner-only RLS; operation table and worker capabilities are private. Authentication uses existing eligibility helpers, without guest-specific restrictions.
- Structured sets retain title/body and add server-assigned stable IDs, `structureVersion: 2`, action and exactly three `{id,text}` intents. Each complete pair is within existing prompt limits. Generator validates duplicate/oversized actions and intents; moderation sees every fragment, body and assembled pair in a bounded input per option. Any rejected/reviewed option fails the complete structured set and refunds a purchase. Legacy full ideas retain their existing shape.
- Composer generation uses the stored round situation, never private opponent text. One shared service runs foreground and the three-move prefetch. Free authored fallback belongs to the client catalogue and is never sold/persisted as purchased AI success.

## Flags

- `PROMPT_COMPOSER_AI_ENABLED=true`: enables structured AI for experience 2; default false.
- `PROMPT_SUGGESTIONS_PAID_ENABLED=true`: enables explicit new rerolls; default false.
- `SUGGESTIONS_AI_DISABLED=true`: emergency stop for all new generation, including legacy; default false.
- Existing `SUGGESTIONS_PREFETCH_ENABLED=0` still disables prefetch. Existing legacy free generation stays operational otherwise. Flags do not prevent recovery of completed operations.

## Owned files

- `supabase/functions/_shared/move-suggestions.ts`
- `supabase/functions/_shared/suggestion-service.ts`
- `supabase/functions/generate-move-suggestions/index.ts`
- `supabase/functions/prefetch-move-suggestions/index.ts`
- `supabase/migrations/20261001190848_composer_suggestion_operations.sql` (created with repository Supabase CLI; global installed CLI was SIGKILL)
- `supabase/functions/_tests/structured_suggestions_test.ts`
- `supabase/functions/_tests/suggestion_service_test.ts`
- `supabase/functions/_tests/suggestion_endpoint_test.ts`
- `supabase/tests/composer_suggestions.sql`
- `scripts/test-suggestion-db.py`
- `scripts/test-suggestion-concurrency.py`

## Verification actually run

1. Red baseline: structured validator failed three behavior assertions because it stripped action/intent fields and accepted invalid structures. SQL baseline failed on the missing reservation RPC after fixing fixture enum/best-of values.
2. `rtk deno test --config supabase/functions/deno.json --allow-all supabase/functions/_tests/suggestion_endpoint_test.ts supabase/functions/_tests/suggestion_service_test.ts supabase/functions/_tests/structured_suggestions_test.ts supabase/functions/_tests/move_suggestions_test.ts`: **33 passed, 5 HTTP substeps**, no failures.
3. Both Edge Functions pass `deno check` with the project config.
4. Seven owned TypeScript files pass `deno lint --rules-exclude=no-import-prefix`. The excluded new Deno rule conflicts with this repository's existing URL-import convention; `require-await` findings in new test stubs were fixed.
5. `rtk proxy python3 scripts/test-suggestion-db.py`: **passed**, applies pending prerequisites plus the suggestion migration to existing local PostgreSQL in one rolled-back transaction. Covers free/prefetch, price mismatch, replay after price/flag changes, idempotency binding, lease takeover, stale failure, refund once, free retry, historical cache, zero price, insufficient funds, sweeper, terminal battle, owner/outsider RLS and private RPC/table privileges.
6. `rtk proxy python3 scripts/test-suggestion-concurrency.py`: **four real concurrency cases passed**. Creates a disposable PostgreSQL cluster within the existing local container; copies schema only, applies prerequisites there, and stops/deletes only its own temporary cluster. Eight concurrent free requests produce one claim; eight same-key purchases produce one debit; concurrent lease reclaims grant one owner and old failure cannot refund new success; eight distinct purchases competing for the last credit yield one success and seven insufficient-funds results. Existing database contents remain unchanged.

## Release and operational limits

- Full app/Edge suite and cross-domain integration are root-owned verification; the tests above do not establish live provider latency, structured generation quality, production migration state, human calibration or pilot readiness.
- Deployment must replace both foreground and prefetch endpoints together after the migration. Drain older in-flight workers before enabling new generation; the previous deployed worker code performed unfenced writes and cannot be retroactively fenced by new TypeScript.
- Cron availability and expiry/refund health need deployment checks. Cleanup RPC failures deliberately leave a recoverable operation for the sweeper; a transport error is not a promise that refund already completed.
- Provider cost metadata (including failed moderation outcomes) is retained on the private operation. Existing daily cost view still reads successful suggestion rows; failures are not newly included in that historical view.
- Standalone concurrency harness relies on the local container's PostgreSQL binaries/extensions and is intended for local verification, not the linked project.

## Integration follow-up: client gates and ranked assignment

Root delegated the lifecycle compatibility follow-up to this agent after its initial review. Additional edited files: `supabase/functions/matchmaking/index.ts`, `supabase/functions/submit-prompt/index.ts`, `utils/battles.ts`, `supabase/migrations/20261001191306_prompt_composer_context.sql`, `supabase/tests/prompt_composer_context.sql`, `supabase/functions/_tests/composer_client_gates_test.ts`, `__tests__/submitPromptContract.test.ts`. The judge agent owns the imported `composer-ranked-gate.ts` helper and its tests.

- Actual stored experience 2 now requires integer client contract >=3 at submission, before moderation, audit writes, rate-limit writes or prompt locking. Participant ownership is checked first. The app declares contract3. Legacy single/Bo3 submission with an omitted contract still succeeds, including eligible guests.
- Verified root's replay guards for explicit resume, mapped request replay and accepted invitation. A compatible accepted invitation retries `start_battle_face_off`; the HTTP regression observes that RPC after the interrupted match-to-face-off transition.
- SQL stored-row guards cover literal request mapping, compatibility request column and natural queue reuse. Reordered target client validation before requested-experience mismatch so a raced v2 target yields an upgrade error, not a silent false. New tests proved the failure before correction and prove a denied replay creates no mapping.
- All five matchmaking composer-RPC error branches preserve SQL `client_update_required` as HTTP426 and include minimum contract3.
- New ranked experience2 assignment invokes `composerRankedGate` and returns HTTP503 / `composer_ranked_unavailable` when the exact configured real provider/model lacks current reviewed multilingual calibration. Pinned queue/resume behavior is preserved. No flag was enabled or real calibration claimed.
- Paid reroll HTTP/parser tests proved an unsupported client could previously reach reservation; the new gate rejects missing, string, fractional and <3 contracts before reservation. Both valid paid replays and free legacy requests remain supported.

Final follow-up validation: **40 Deno tests +24 HTTP substeps passed** across composer client/ranked gates and all suggestion suites; submission contract Jest regression passed; changed Edge endpoints type-check. `scripts/test-composer-db.py` passed all pending local migrations and context/suggestion/calibration SQL suites in a rolled-back transaction. Targeted lint excludes only the repository-incompatible `no-import-prefix` rule; existing bare EdgeRuntime ignores in the edited submit endpoint now explain their runtime reason. This adds no live provider, remote production or rollout verification.

Final queue-order review: the existing preflight natural-queue lookup already runs before combat, composer and ranked-calibration gates, so no production change was needed. Four additional HTTP regression steps verify fresh request IDs without `resume_battle_id`: old clients retain existing legacy unranked/ranked queues after all rollout flags are enabled; stored v2 queues still reject contract2 with flags off, and contract3 retains the frozen v2 queue without calibration/rate-limit work. Assertions include player/mode/character query filters and the unchanged request ID, mode, character and pinned versions passed to the atomic mapping RPC. Focused suite: **2 tests /22 steps passed**, lint passed.
