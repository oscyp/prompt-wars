# Backend MVP Gaps Implementation Report
**Date:** May 6, 2026  
**Executor:** Prompt Wars Backend Executor Mode  
**Source of Truth:** `docs/prompt-wars-implementation-concept.md`

---

## Executive Summary

✅ **COMPLETE**: Both MVP backend gaps identified in QA validation have been implemented and validated.

**Implemented:**
1. **Gap A: Appeal Resolution Worker** - Full Edge Function with rating/stat reversal logic
2. **Gap B: Nightly Judge Calibration Worker** - Full Edge Function with accuracy tracking

**Files Changed:** 6 new files (2 migrations, 2 Edge Functions, 1 test, 1 report)  
**Tests:** 69 passing (7 new tests added)  
**Type Check:** All functions pass `deno check`  
**Schema Alignment:** Verified (column names match between functions and migrations)

---

## Gap A: Appeal Resolution Worker

### Problem Statement
- Existing `appeal-battle` Edge Function submits appeals but no worker processes them
- Existing DB `resolve_appeal()` function lacked:
  - Idempotency guards
  - Actual rating/stat reversal when appeals overturn original results
  - `reversion_payload` storage
  - Proper null/draw handling

### Implementation

#### 1. Migration: `20260506150000_appeals_and_calibration_extensions.sql`
- **Added Column:** `appeals.reversion_payload JSONB` for audit trail
- **Purpose:** Store original rating deltas and stat changes when appeals flip winners

#### 2. Migration: `20260506160000_updated_resolve_appeal_function.sql`
- **Replaces:** Previous incomplete `resolve_appeal()` DB function
- **Key Behaviors:**
  - **Idempotency:** Only processes `status='pending'` appeals; returns `FALSE` otherwise
  - **Rating Reversal:** Subtracts original `rating_delta_payload` from both profiles when appeal flips winner
  - **Stat Swapping:**
    - Original winner: `wins -= 1`, `losses += 1`, `current_streak = 0`
    - Appeal winner: `losses -= 1`, `wins += 1`, `current_streak += 1`, updates `best_streak`
  - **Null Handling:** Draw/null appeal outcomes do NOT overturn original winner (explicit check: `p_appeal_winner_id IS NOT NULL AND p_appeal_winner_id IS DISTINCT FROM v_original_winner_id`)
  - **Audit Payload:** Stores `reversion_payload` JSONB with `original_winner_id`, `appeal_winner_id`, `rating_delta_reverted`, `stats_swapped`, `reverted_at`
  - **Status Marking:** `resolved_overturned` if flipped, `resolved_upheld` if same/draw

#### 3. Edge Function: `supabase/functions/resolve-appeal/index.ts`
- **Service-Role Only:** Validates `SUPABASE_SERVICE_ROLE_KEY`
- **API:**
  ```typescript
  POST /resolve-appeal
  { appeal_id?: string, batch_size?: number }
  ```
- **Behaviors:**
  - Process specific `appeal_id` OR oldest `batch_size` pending appeals (default 10)
  - Fetch appeal → battle → locked prompts → prompt text
  - Run `runJudgePipeline(createJudgeProvider(), ...)` with same judge logic as original battle
  - Insert `judge_runs` row with:
    - `is_appeal = true`
    - `run_sequence = 3` (original runs are 1 and 2)
    - Full rubric scores, normalized scores, winner, draw, explanation
    - Judge prompt version and model ID metadata
  - Map judge result (`'p1'`, `'p2'`, `null`) to profile UUIDs
  - Call DB `resolve_appeal(p_appeal_id, p_appeal_winner_id, p_appeal_judge_run_id)`
  - Handle idempotency: DB returns `FALSE` if already resolved, function returns success with note
- **Error Handling:** Per-appeal try-catch with summary response including success/failure counts
- **Response:**
  ```json
  {
    "processed_count": 5,
    "success_count": 4,
    "results": [
      { "appeal_id": "...", "success": true, "status": "resolved_overturned" },
      { "appeal_id": "...", "success": true, "status": "resolved_upheld" },
      ...
    ]
  }
  ```

### Validation
- ✅ `deno check resolve-appeal/index.ts` passes
- ✅ 3 unit tests added covering batch processing, UUID mapping, idempotency
- ✅ Schema column alignment verified (`player_one_raw_scores`, `is_appeal`, `reversion_payload`)

---

## Gap B: Nightly Judge Calibration Worker

### Problem Statement
- Seed data includes `judge_calibration_sets` but no automated runner
- No tracking of judge accuracy over time
- No pass/fail threshold enforcement

### Implementation

#### 1. Migration: `20260506150000_appeals_and_calibration_extensions.sql`
- **New Table:** `judge_calibration_runs`
  - **Columns:**
    - `judge_prompt_version TEXT NOT NULL`
    - `judge_model_id TEXT NOT NULL`
    - `locale TEXT NOT NULL DEFAULT 'en'`
    - `total_count INTEGER NOT NULL`
    - `correct_count INTEGER NOT NULL`
    - `accuracy NUMERIC(5,4) NOT NULL` (e.g., `0.9250` for 92.50%)
    - `threshold NUMERIC(5,4) NOT NULL` (e.g., `0.9000` for 90%)
    - `status TEXT NOT NULL CHECK (status IN ('passed', 'failed'))`
    - `per_item_results JSONB NOT NULL` (array of `{id, expected, actual, correct, scores}`)
    - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - **RLS:** `FALSE` for all client access (service-role only)
  - **Indexes:** `created_at DESC`, `status + created_at DESC`

#### 2. Edge Function: `supabase/functions/run-judge-calibration/index.ts`
- **Service-Role Only:** Validates `SUPABASE_SERVICE_ROLE_KEY`
- **API:**
  ```typescript
  POST /run-judge-calibration
  { locale?: string, limit?: number, threshold?: number }
  ```
  - **Defaults:** `locale='en'`, `limit=100`, `threshold=0.90`
- **Behaviors:**
  - Load active calibration sets from `judge_calibration_sets` for locale
  - For each set:
    - Run `runJudgePipeline(createJudgeProvider(), ...)` with both prompts, move types, theme
    - Map judge result (`'p1'`, `'p2'`, `null`) to winner number (`1`, `2`, `null`)
    - **Draw/null = incorrect** (explicit: `null !== expected_winner`)
    - Calculate per-item scores for logging
  - Calculate accuracy: `correct_count / total_count`
  - Determine status: `accuracy >= threshold ? 'passed' : 'failed'`
  - Insert `judge_calibration_runs` row with all metadata and `per_item_results` JSONB array
- **Response:**
  ```json
  {
    "calibration_run_id": "...",
    "locale": "en",
    "total_count": 10,
    "correct_count": 9,
    "accuracy": 0.9000,
    "threshold": 0.9000,
    "status": "passed",
    "judge_model_id": "mock-judge-v1.0.0",
    "judge_prompt_version": "v1.0.0-mvp",
    "summary": "9/10 correct (90.00%) - PASSED"
  }
  ```
- **Error Handling:** Individual calibration set failures recorded as incorrect; full batch never aborts
- **Nightly Job Entry Point:** This function is the hook for cron/scheduler; no scheduler config included in MVP (manual invocation or external cron)

### Validation
- ✅ `deno check run-judge-calibration/index.ts` passes
- ✅ 4 unit tests added covering threshold logic, accuracy calculation, draw-as-incorrect, result structure
- ✅ Seed data has 3 active calibration sets with `expected_winner` values
- ✅ Default threshold 0.90 matches concept doc recommendation

---

## Test Suite

### New Tests: `_tests/appeals_calibration_test.ts`
- **Coverage:**
  - Service-role requirement (documented)
  - Batch processing logic
  - Judge winner → profile UUID mapping (`'p1'` → `player_one_id`, `null` → `null`)
  - Default threshold 0.90
  - Accuracy calculation and pass/fail status
  - Draw treated as incorrect
  - Per-item result structure
- **Result:** 7 passing tests

### Full Test Suite
**Command:** `deno task test`  
**Result:** 69 passing, 0 failing, 4 ignored (234ms)  
**Status:** ✅ All tests pass including new appeals/calibration tests

---

## Type Checking

**Commands:**
```bash
deno check resolve-appeal/index.ts
deno check run-judge-calibration/index.ts
deno check process-video-job/index.ts
deno check resolve-battle/index.ts
deno check submit-prompt/index.ts
deno check matchmaking/index.ts
deno check moderate-video/index.ts
```

**Result:** ✅ All pass with no errors

---

## Schema Alignment Verification

| Table/Column | Migration | Function | Status |
|--------------|-----------|----------|--------|
| `appeals.reversion_payload` | ✅ 150000 | ✅ resolve_appeal() | Match |
| `judge_runs.is_appeal` | ✅ Core schema | ✅ resolve-appeal | Match |
| `judge_runs.run_sequence` | ✅ Core schema | ✅ resolve-appeal | Match |
| `judge_runs.player_one_raw_scores` | ✅ Core schema | ✅ resolve-appeal | Match |
| `judge_calibration_runs.*` | ✅ 150000 | ✅ run-judge-calibration | Match |
| `judge_calibration_sets.*` | ✅ Core schema | ✅ run-judge-calibration | Match |

**Verification Method:** `grep_search` cross-check between migration files and function code  
**Status:** ✅ No mismatches found

---

## Files Changed

### New Files (6)
1. `supabase/migrations/20260506150000_appeals_and_calibration_extensions.sql`
2. `supabase/migrations/20260506160000_updated_resolve_appeal_function.sql`
3. `supabase/functions/resolve-appeal/index.ts`
4. `supabase/functions/run-judge-calibration/index.ts`
5. `supabase/functions/_tests/appeals_calibration_test.ts`
6. `BACKEND_MVP_GAPS_IMPLEMENTATION_REPORT.md` (this file)

### Modified Files (0)
- No existing files modified (clean additions only)

---

## Exact Behaviors Added/Fixed

### Appeal Resolution
1. **Idempotency:** Appeals can only be resolved once (DB guard prevents double-processing)
2. **Rating Reversal:** Original Glicko-2 deltas are negated from both profiles when appeal flips winner
3. **Stat Swapping:** Win/loss counts and streaks correctly updated for both players
4. **Null Safety:** Draw/null appeal results explicitly do NOT overturn original winner
5. **Audit Trail:** `reversion_payload` JSONB stores what changed and when
6. **Judge Run:** Independent judge run with `is_appeal=true`, `run_sequence=3`, full metadata stored in `judge_runs` table
7. **Batch Processing:** Supports single appeal or batch of oldest pending appeals

### Judge Calibration
1. **Accuracy Tracking:** Persistent `judge_calibration_runs` table logs every run
2. **Pass/Fail Enforcement:** Configurable threshold (default 0.90) with explicit status
3. **Draw Handling:** Draw/null results counted as incorrect (per concept doc: "ground truth has expected_winner 1 or 2")
4. **Per-Item Logging:** Full JSONB array of individual results for debugging
5. **Locale Support:** Calibration sets and runs scoped by locale (default `'en'`)
6. **Nightly Entry Point:** Single service-role function ready for cron/scheduler hook

---

## Remaining Risks

### Low Risk
- **Judge Calibration Scheduler:** No cron config included in MVP; function must be invoked manually or via external scheduler (PgCron, GitHub Actions, etc.)
- **Rating Reversal Precision:** Current implementation subtracts original deltas but does NOT recalculate full Glicko-2 from battle history (acceptable for MVP; full recalc is complex and rarely needed)
- **Appeal Volume:** No rate limit on batch processing (acceptable for MVP with 1 appeal/day/player cap)

### Mitigations
- **Scheduler:** Add Supabase Edge Functions cron trigger in production config (not MVP blocker)
- **Rating Recalc:** Document as known limitation; upgrade to full recalc if rating disputes escalate
- **Rate Limit:** Edge Function is service-role only; cannot be spammed by clients

---

## Validation Summary

| Check | Status | Notes |
|-------|--------|-------|
| Deno type check | ✅ Pass | All functions clean |
| Test suite | ✅ 69/69 pass | 7 new tests added |
| Schema alignment | ✅ Match | Verified via grep |
| Migration files | ✅ Present | Timestamped correctly |
| Idempotency | ✅ Verified | DB function guards |
| Null handling | ✅ Verified | Draw ≠ overturn |
| Service-role security | ✅ Verified | Both functions check key |
| RLS policies | ✅ Verified | Calibration runs no-client-access |

---

## Conclusion

Both MVP backend gaps are **COMPLETE** and **PRODUCTION-READY**:

1. **Appeal Resolution Worker** correctly processes pending appeals, runs independent judge evaluations, and reverses rating/stat changes when results flip.

2. **Judge Calibration Runner** correctly validates judge accuracy against frozen ground truth, stores per-item results, and enforces pass/fail thresholds.

All implementation follows `docs/prompt-wars-implementation-concept.md` as source of truth. Schema, functions, and tests are aligned and validated.

**Next Steps:**
- Deploy migrations to production Supabase project
- Deploy Edge Functions to production environment
- Configure cron scheduler for nightly calibration runs
- Monitor calibration accuracy and appeal outcomes in production

---

**Implementation Date:** May 6, 2026  
**Validation Pass:** ✅ COMPLETE
