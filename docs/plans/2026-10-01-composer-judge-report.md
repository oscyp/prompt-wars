# Composer judge implementation and evidence

> Superseded activation policy: The subsequent 1 October user decision removes the six composer rollout flags and primary ranked-calibration request gate, enabling new composer series in all modes by default. The earlier implementation and test record below is historical. Calibration tools/evidence, independent appeal calibration and fallback/rating protections remain; no real calibration or human review is retroactively claimed. See [the current release instructions](2026-10-01-composer-release.md).

## Implemented

- Actual provider-template dispatch distinguishes `v1.0.0-mvp` from `v2.0.0-ideas`. The legacy template and normalization remain the default for old rows; unknown versions fail instead of silently selecting a policy.
- The v2 template scores action/intent clarity, useful originality, concrete causality, coherent shared context, internal consistency and legible scene consequence. Existing six JSON keys and 0–10 ranges remain compatible with persistence and combat code.
- V2 does not reward style, length, keyword/prop repetition, automatic-victory claims or guessed authoring/purchase source. Comprehensible PL, EN and mixed-language plans use the same stated standard. Equal ideas can receive equal scores. This is an instruction contract, not a claim of proven model fairness.
- V2 removes the word-only normalization penalty; v1 retains it. Combat, damage, HP, rating, stat modifiers and type counters are unchanged.
- Both resolution handlers select the frozen battle policy. All primary calls, the second call, any tiebreak and independent appeals use the same immutable round situation. Results retain the provider's existing explanation; no advice-generation call was added.
- Frozen payload shape: `frozen_inputs.{player_one,player_two}` contains `{text,moveType,wordCount}`, accompanied by `theme`, `judge_policy_version` and `situation_snapshot`. V2 bot moves use the shared authored situation tactic and server seed, with frozen bot text preferred on retry. Legacy bot behavior is retained.
- The v2 mock returns neutral equal scores, carries mock/fallback provenance and never supplies fairness evidence. Primary outages still have a fallback; independent appeals still require an independent real model.
- V2 appeal availability checks the same policy and a `multilingual` calibration run. Legacy calibration evidence cannot enable v2 appeals.
- New ranked v2 assignments additionally pass `composerRankedGate`: explicit `xai` provider/model/credentials, latest exact-model/v2/multilingual eligible evidence and a default 168-hour freshness bound. Failed, missing, unreviewed, stale or fallback evidence and query failures return unavailable; stored resumes retain their policy. Ranked enable and manual season approval remain separate requirements. HTTP and shared-helper regression tests cover this boundary.

## Evaluation data and gates

`supabase/functions/_shared/judge-evaluation-corpus.ts` contains **240 authored candidate cases**: 24 distinct scenario families × 10 controlled comparisons. Sixteen complete families are tuning (160 cases); eight different families are holdout (80 cases). Families do not cross the split. These are assistant-authored expected outcomes, **not independently human-reviewed gold**.

Each case has an explicit expected winner, including `null` for a draw, and a rationale. Coverage includes short/verbose equivalents, identical-text authoring invariance, PL/EN/mixed-language equivalence, keyword abuse, useful actions without named props, unsupported victory claims, contradictions and vague plans. All five archetypes, three move types and human/bot contexts appear as coverage metadata. Authoring, spending, archetype and bot metadata never enter the judge request.

The runner makes actual pipeline calls for the candidate policy, the legacy baseline and swapped player positions. Combat comparisons use identical fixed stats and deterministic fresh/damaged HP contexts for both policies. These are paired offline samples, not observed production or pilot rates.

Promotion evaluation requires all of:

- Complete holdout with at least 80 cases and required coverage.
- Independently reviewed labels imported through a review artifact bound by SHA-256 to the exact text, move types and situation. The shipped corpus remains marked `authored_candidate`.
- Every candidate, baseline and swapped call reports the expected actual model, version and no fallback.
- Holdout accuracy at least 90%, with expected draws counted as correct when the actual result is a draw.
- Absolute signed verbosity advantage no greater than 1 aggregate point out of 60, separately for EN and PL.
- Swapped outcomes agree and swapped per-player scores change by no more than 1 aggregate point.
- Cross-language and identical-text comparisons draw, with score gaps no greater than 1 aggregate point.
- Absolute draw-rate and KO-rate changes no greater than 5 percentage points against the paired legacy baseline.
- Median aggregate-gap change no greater than 20%; a zero baseline cannot justify an arbitrary increase.

Passing numerical gates does not enable ranked rollout or waive season-boundary approval. Human review, real-model execution and actual player validation remain release work. Do not tune against holdout results; revise the tuning set first and version any replacement holdout before the next promotion attempt.

## Executable tooling

Safe offline export, with no network/model calls:

```sh
rtk proxy deno run --config supabase/functions/deno.json --allow-read --allow-write=/tmp --allow-env supabase/functions/evaluation/evaluate-composer-judge.ts --split=all --out=/tmp/prompt-wars-composer-candidates.json
```

The export includes case digests. An independently obtained review artifact has this shape; every selected case must have its real review record:

```json
{
  "datasetVersion": "ideas-candidates-2026-10-01-v1",
  "reviews": [
    {
      "id": "case id from export",
      "digest": "exact digest from export",
      "reviewer": "actual reviewer identity",
      "reviewedAt": "actual review timestamp",
      "rationale": "reviewer's reasoning",
      "expectedWinner": null
    }
  ]
}
```

Paid runs require configured `JUDGE_MODEL_ID`, `JUDGE_API_KEY` or `XAI_API_KEY`, explicit `--run-paid`, and a positive `--max-calls=N` ceiling. Each case makes 6–9 provider calls; the 80-case holdout therefore permits at most 720 calls. Configure/review actual model pricing before authorizing a run. The ceiling limits calls, not dollars. The CLI writes incremental evidence, known cost and whether reported cost is complete, and exits nonzero unless promotion passes. No paid run was authorized or executed here.

The optional CLI `--persist` flag requires `--run-paid` and database service credentials understood by `createServiceClient`. It validates database configuration before evaluation and writes the recomputed evidence to `judge_calibration_runs` after saving the local report. It prints the persisted run ID. Offline/default execution does not construct a database client or write a row; `--persist` without `--run-paid` fails before doing any evaluation. A budget stop, incomplete run, candidate-only labels, tuning run or failed gate persists `failed`, never `passed`, and exits nonzero. A persistence error preserves the local evidence and fails the command. No persistence was executed against a real database here.

The service-role `run-judge-calibration` endpoint accepts `judge_policy_version`, `split`, `max_provider_calls` and optional `human_review`; v2 uses the bundled versioned corpus and stores evaluation evidence under `evaluation_metadata`. Endpoint and CLI share `buildComposerCalibrationRecord`, which recomputes all gates from cases and actual observations, preserves expected draws and per-item calls, and rejects a threshold below 90%. Both live evaluation entry points instantiate an explicit-model adapter, which requires the actual model ID in the provider response; they cannot substitute the configured name when provenance is missing. The CLI with explicit persistence is preferable for a complete corpus because a long synchronous Edge Function run can exceed its hosting timeout. A local JSON without `--persist` alone does not enable the ranked gate. Existing v1 database calibration remains available and is isolated by policy version.

Migration `20261001191303_composer_judge_calibration.sql` was generated with the repository Supabase CLI. It permits expected draws, adds conservative candidate/tuning/legacy defaults to old calibration rows and adds run metadata. It changes no RLS grants, enables no rollout and inserts no purported review results.

## Verification actually performed

- New policy tests were first run red: all five failed for the missing v2 behavior, then passed after implementation.
- Promotion gate tests were first run red for expected-draw accuracy and absent gate evaluation, then passed.
- Targeted judge, evaluation, provider, appeal and combat suites: **64 passed** after formatting.
- Full local Deno suite with `PROMPT_WARS_REMOTE_FUNCTION_TESTS=0`: **446 passed (21 steps), 0 failed, 7 ignored**. Initial full run found two old mock-test fixtures using unsupported `v1.0.0-test`; fixtures now use the real legacy policy, and the full rerun passed. Log: `/tmp/prompt-wars-composer-deno-full.log`.
- Final full Deno rerun after ranked/client-gate integration, stricter calibration provenance and explicit CLI persistence: **456 passed (45 steps), 0 failed, 7 ignored**; log `/tmp/prompt-wars-composer-deno-final.log`. New ranked helper has four tests; the earlier combined appeal/evaluation/ranked/HTTP subset passed 19 tests and 18 steps. New helpers/evaluation CLI Deno lint passed.
- `deno check` passed for resolution, calibration, appeal handlers and the offline evaluation CLI.
- Offline export executed successfully: 240 cases written to `/tmp/prompt-wars-composer-candidate-export.json`; **zero real-model calls**.
- Persistence guard/evidence tests verify complete synthetic pass records, expected draws, unchanged per-item provenance, rejected candidate labels and failed partial/fallback records. The default CLI was rerun without network permission, exporting 240 candidates to `/tmp/prompt-wars-composer-final-export.json`. An actual CLI invocation with `--persist` but no `--run-paid` failed as intended before provider/database work.
- A final direct HTTP regression proves a v2 threshold of 0.8 returns 400 with zero provider/database requests. The guard precedes provider construction and the billable loop. This new endpoint test plus the seven evidence tests passed (8 total); no production code changed after the full-suite result above.
- Root integration executed the local context, finance and calibration SQL suites inside a transaction with rollback; all passed. `supabase/tests/composer_judge_calibration.sql` covers expected draws, conservative defaults, invalid labels and negative client read/write access. Log: `/tmp/prompt-wars-composer-db-test.log`.

No deployment, paid evaluation, human-review completion, fairness certification or ranked activation is claimed.
