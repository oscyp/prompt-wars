# Composer remediation — private bot policy evidence

Implemented locally on 2 October 2026. No remote deployment, database reset, or commit performed by this implementer.

## Behavior and files

- `supabase/migrations/20261002130317_private_bot_policy.sql`: additive `bot_policy_version` defaults to 1. All existing battles, including queues and invitations, remain 1. Three RLS-enabled private tables hold 45 independently authored tactics, 32-byte random per-series seeds with catalog version, and copied immutable round choices. Private HMAC selection uses only the series seed and round number; the frozen situation selects the appropriate authored text. A round INSERT creates its choice in the same transaction, including human-versus-human series that may later use a bot. A prompt INSERT/UPDATE fails closed if policy 2 lacks its prepared choice. No private tables enter Realtime. Client roles cannot read the tables or invoke their functions; service-only RPC returns text, type and word count.
- `supabase/migrations/20261002130332_activate_private_bot_policy.sql`: flips the INSERT default to 2, leaving existing rows untouched. Legacy experience/single-format rows remain policy 1. **Apply only after deploying compatible resolver and matchmaking code.** Deployment order is additive schema → compatible consumers → activation. The SQL cannot prove which Edge Function revision has been deployed.
- `supabase/functions/_shared/private-bot.ts` and `round-resolve/index.ts`: read and validate a previously prepared private choice before claiming the round. Missing/corrupt input returns HTTP 503 with `bot_choice_unavailable` and `retryable: true`; there is no public generator fallback for policy 2. Only text/type/count reach frozen reveal/judge inputs. Policy 1 keeps the existing public-hash and legacy-library behavior. `prompt-situations.ts` now explicitly labels that public function as policy-1 compatibility.
- `matchmaking/index.ts`: preserves the queued policy in candidate filtering. The matching RPC also checks a previous queue's frozen policy before moving it into a target series. Request replays and existing natural queues keep their original row/version.
- `_shared/start-face-off.ts` and `battle-advance/index.ts`: prefetch only for stored experience 1. Round-1 kickoff is centralized in face-off, including legacy single-format and already-revealed retry recovery; matchmaking no longer sends duplicate kickoff calls. Composer 2 waits for Build entry.

Combat rules, scenes, judge versions, and assigned deadlines retain their existing behavior. Private immutability allows account/battle erasure cascades, but blocks changing or removing state from a live series.

## Verification

- Meaningful RED: `scripts/test-private-bot-db.py` failed with `FAIL: new series must pin their bot policy` before schema implementation. After implementing the schema, the lifecycle suite passes.
- Meaningful RED: `private_bot_resolver_test.ts` expected HTTP 503 for a missing policy-2 choice but received HTTP 200 before resolver integration. It passes after integration.
- Independent review caught missing legacy single-format prefetch after centralizing kickoff. The new legacy-single case failed with zero calls instead of one, then passed after restoring the guarded kickoff. Legacy already-revealed retry recovery was preserved as well.
- `rtk proxy python3 scripts/test-private-bot-db.py`: PASS. Tests activation with preexisting queues/invitations, replay/natural-queue retention, private seed creation before matchmaking, policy mismatch, first/next rounds, same deadline on retry, human-to-bot fallback, human-text independence, immutable seed/choice/catalog, missing-choice prompt denial, legacy single policy, actual authenticated denial, service RPC access, and absence from Realtime. Everything runs in one rolled-back transaction. Log: `/tmp/prompt-wars-private-bot-db-test.log`.
- `rtk proxy python3 scripts/test-private-bot-concurrency.py`: PASS. Eight separate PostgreSQL connections race first-round opening, next-round opening, and human submission versus round-opening retries. Exactly one first open/choice exists; all next-round retries return the same scene, deadline and choice; human submission does not replace either choice. Uses a temporary schema-only PostgreSQL cluster, then removes only that temporary cluster. Log: `/tmp/prompt-wars-private-bot-concurrency.log`.
- `rtk proxy deno test --config supabase/functions/deno.json --allow-all supabase/functions/_tests/private_bot_resolver_test.ts`: five tests PASS (missing-state recovery, legacy state independence, actual frozen inputs for policies 1/2, first-round prefetch, later-round prefetch).
- `deno check` on matchmaking, round-resolve and battle-advance: PASS.
- Full Deno suite: **467 passed, 58 steps, zero failed, seven ignored**. That run preceded addition of the fifth bot-specific prefetch regression, which separately passes. Remote tests stayed gated; some gated tests report successful skips in the existing runner.
- Existing `scripts/test-composer-db.py`: PASS after the suggestions owner corrected their transient `round_status='resolved'` test fixture to `result_ready`. Composer context, suggestions and calibration SQL all passed with the private bot migrations included.

The isolated concurrency fixture initially needed its required signature item and full pending migration set; both test-harness errors were corrected before the passing run. No production behavior was relaxed to accommodate them.

## Independent cross-review

- Reviewed suggestion delivery and money paths: reported heartbeat/finalization race, fail-open partial moderation wire responses, and retry attempt timestamps falling outside current rate windows. Owners corrected all three; independent delayed-finalization repro became green, final migration/provider guards reviewed without remaining blocker.
- Reviewed root origin migration/submit, batch client parsing and paid metadata, authored catalog/scene metadata, and appeal error states. No actionable findings. Targeted root Jest checks passed (27 tests); combined origin/private rollback SQL passed against current migrations.
- Reviewed mobile reducer, v3 draft/storage, per-type bank/purchase hooks, route and panel. Independently ran 73 tests across eight suites, all passed. Reported a separately reproduced coordinator recovery bug: one bank failure disappeared when another pending bank succeeded. Mobile owner fixed accumulated per-type failures and added permanent initial-read/poll regressions; independent rereview and seven-test coordinator suite passed. No remaining actionable mobile code-review findings. Native keyboard and accessibility behavior still requires device QA.

## Live QA follow-up: completed bot round labels

Live QA found completed bot-won rounds labelled Pending in the final round list and Waiting for the judge in the round header. `round-resolve` correctly persists `judge_payload.combat.winner = 2`; `round_winner_id` is null because bots have no profile ID. The client had treated every null winner ID as unresolved.

- Added RED regressions for the pure outcome helper, final round mini view, and actual round-result route; all three reproduced the incorrect pending display.
- `utils/battleCopy.ts` now falls back to the frozen winner side only when the explicit profile winner is absent and a viewer side is known. Result-ready status, draw, and explicit winner-ID precedence remain unchanged. Missing/invalid winner side or unknown viewer remains pending. No scores are compared.
- `utils/resultView.ts` and `app/(battle)/round-result.tsx` pass the frozen combat winner and viewer side to that helper. No backend or stored result changes.
- GREEN: 88 tests across battleCopy, resultView, roundResultScreen and resultDetails. Full TypeScript `--noEmit`, scoped ESLint and diff whitespace checks passed. Root/mobile owner notified for native result reopening and release rebuild.
