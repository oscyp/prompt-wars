# Tester Feedback Beta Runbook

This runbook verifies the corrected tester journey without mixing repository
validation with deployment validation. The database migration and compatible
Edge Functions must ship before the client containing the new request fields.

## Release identity

Record these before each session:

| Field                                      | Value                                     |
| ------------------------------------------ | ----------------------------------------- |
| Client version / build number              |                                           |
| Distribution channel                       | TestFlight / Internal App Sharing / other |
| Supabase project ref / environment label   |                                           |
| Latest deployed migration                  |                                           |
| Edge Function deployment version or commit |                                           |
| Scheduled `expire-battles` cadence         |                                           |
| Device / OS                                |                                           |
| Session start in UTC                       |                                           |

Do not put email addresses, prompts, access tokens, provider responses, or raw
backend errors into the session record. Correlate failures with UTC timestamps,
battle IDs, matchmaking request IDs, and the structured safe error code.

## Deployment parity gate

Before inviting testers:

1. Confirm Auth email confirmation mode and redirect URLs for the distributed
   build. Exercise both expected signup outcomes: confirmation required and an
   immediate session.
2. Compare the remote migration list with the repository. Confirm
   `20260904165156_tester_feedback_reliability.sql` is present.
3. Confirm `matchmaking`, `leave-battle`, and `expire-battles` are deployed from
   the same release commit.
4. Confirm the minute worker invokes `expire-battles` and its last successful
   run is recent. The worker now cancels ranked/unranked queue rows that remain
   `created` for more than five minutes.
5. Confirm the app points at that same Supabase project. Stop the beta if any of
   these identifiers disagree; fix deployment drift before changing UX code.

## Full-journey script

Use a fresh account and screen-record with tester consent:

1. Sign up while affirming 18+. Complete email confirmation if requested.
2. Verify the app enters onboarding and creates a fighter.
3. Start one ranked and one unranked or bot battle using intentional prompts.
   Double-tap Start once during the exercise; only one search/bot battle may be
   created for that action.
4. Background and reopen the waiting screen. It must resume the same battle ID.
5. Open the fighter editor during an active battle. It must say **View only**,
   show the active battle count, and provide **Manage N battles**.
6. Leave an eligible battle from the waiting screen and from a Battles-list
   row. Double-tap the confirmation once; the list must update immediately and
   the server may charge at most once.
7. Open a battle in `resolving`, `result_ready`, or `generating_video`. It must
   not offer Leave; it must explain that the battle is finishing and offer
   **Return to Arena**.
8. Verify theme music starts after theme reveal, stops when the battle route is
   no longer foregrounded, and is silent throughout result reveal. Toggle Music
   and Sound Effects independently in Settings.

For each defect record only: step, expected/actual result, UTC time, client
build, environment label, battle ID, request ID when visible in logs, and safe
event/error code.

## Five-session acceptance cohort

Run five independent task-based sessions on the corrected beta. Do not coach
after giving each task. Every tester must be able to:

- register and reach onboarding;
- identify the next battle action from Arena's first viewport;
- understand why fighter editing is locked and reach the relevant battle;
- leave an eligible battle without assistance.

The cohort passes only if all four tasks pass for all five testers and median
install-to-first-battle remains below three minutes. Keep qualitative notes on
option overload, but defer broad navigation/onboarding redesign until this
corrected path is measured.

## Monitoring and rollback signals

Monitor by release and platform:

- signup completion and confirmation-to-onboarding transition;
- count of duplicate open queue keys (target: zero);
- `matchmaking.request_replayed`, `matchmaking.candidate_raced`, and safe failure
  codes;
- leave success/failure by battle status, plus repeat claim attempts;
- age of `resolving` battles and stale queues canceled by the minute worker;
- median install-to-first-battle;
- `daily_provider_costs.cost_per_resolved_battle_usd`, including portrait and
  prompt-suggestion spend.

Pause the client rollout if duplicate queues reappear, leave double-charges are
observed, signup completion regresses materially, or result reveal is blocked.
Database compatibility supports the previous client, so the client can be
rolled back without rolling back the reliability migration.

## Provider-cost decision gate

Review at least one representative release window from `daily_provider_costs`
before changing credit prices, allowances, caps, or models. Keep Tier 0 local
and instant and retain the existing Tier 1 daily/project caps. Unknown provider
costs must stay `NULL`; set the documented per-image deployment variables from
the actual portrait-provider contract rather than guessing.

Do not start proprietary-judge training in this phase. If measured cost per
resolved battle exceeds the approved budget, benchmark cheaper models behind
the existing judge adapter against the frozen calibration set. A candidate is
eligible for promotion only when accuracy remains above 90% and it meets the
existing blind, normalized, double-run/tiebreak contract. Promotion remains a
separate reviewed release decision.
