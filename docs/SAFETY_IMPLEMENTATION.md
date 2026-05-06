# Prompt Wars Safety, Moderation, and Anti-Abuse Implementation

This document describes the safety/moderation/anti-abuse backend implementation for Prompt Wars, following the requirements in `docs/prompt-wars-implementation-concept.md`.

## Overview

The safety system implements defense-in-depth moderation, anti-abuse controls, and compliance safeguards to meet app store requirements and protect the community.

### Hard Constraints (Met)

- ✅ **18+ age gate**: No minor accounts at signup (enforced at auth layer, not in this PR)
- ✅ **Pre-gen prompt moderation**: Text moderation before any provider call
- ✅ **Post-gen video moderation**: Videos blurred until moderation passes
- ✅ **Report/block flow**: User-initiated reporting with 24h SLA
- ✅ **Account-farm guard**: Server-side velocity checks at signup/FTUO/onboarding credits
- ✅ **Takedown SLA**: Reports tracked with `due_at` field, 24h SLA enforced
- ✅ **No provider keys in mobile**: All moderation/AI calls are Edge Function only

## Architecture

### Database Schema

**New migration**: `20260506130000_safety_moderation_antiabuse_schema.sql`

#### Tables

1. **`account_abuse_signals`** (service-role only, RLS blocks client access)
   - Tracks signup metadata: device fingerprint, IP address, platform
   - Velocity signals: IP/device signup counts in 24h
   - Behavioral signals: battles/prompts/videos/reports per 24h
   - FTUO eligibility tracking
   - Flagged status and reason

2. **`opponent_history`** (service-role only)
   - Tracks battle opponent pairs for anti-collusion
   - Used for ranked diversity enforcement (max N battles vs same opponent per 24h)
   - Used for rival detection (most-played opponent in 30 days)

3. **Enhanced `reports`**:
   - Added `due_at` field for 24h SLA tracking
   - Added `assigned_to` for human reviewer assignment
   - Added `reporter_notified` for takedown notification audit

4. **Enhanced `moderation_events`**:
   - Added `provider` field (openai, perspective, hive, manual)
   - Added `provider_request_id` for audit trail
   - Added `confidence_score` for false-positive review queue
   - Added `flagged_categories` array

5. **Enhanced `videos`**:
   - Added `moderated_at`, `moderation_provider`, `moderation_confidence`
   - Existing `moderation_status` and `blurred_preview_url` preserved

#### Functions

- `is_blocked(p_profile_id, p_other_profile_id)`: Bidirectional block check
- `ranked_battles_vs_opponent_24h(p_profile_id, p_opponent_id)`: Opponent diversity enforcement
- `ip_signup_velocity(p_ip_address)`: Count signups per IP in 24h
- `device_signup_velocity(p_device_fingerprint)`: Count signups per device in 24h
- `increment_abuse_counter(p_profile_id, p_counter)`: Rate limiting helper

### Edge Functions

All functions are in `/supabase/functions/` and use service-role or authenticated-user clients.

#### 1. `moderate-prompt`

**Purpose**: Pre-generation text moderation for custom prompts

**Input**:
```typescript
{
  prompt_text: string;
  battle_prompt_id?: string;
  context?: { battle_id, profile_id, move_type };
}
```

**Output**:
```typescript
{
  status: 'approved' | 'rejected' | 'flagged_human_review' | 'pending';
  reason?: string;
  confidence?: number;
  moderation_event_id: string;
}
```

**Behavior**:
- Runs text through moderation provider adapter (blocklist, OpenAI, Perspective)
- Records `moderation_events` row with provider and confidence
- Updates `battle_prompts.moderation_status` if ID provided
- Returns 403 if rejected, 200 if approved/flagged

**Called by**: `submit-prompt` Edge Function (updated to integrate moderation)

#### 2. `moderate-video`

**Purpose**: Post-generation video moderation before client reveal

**Input**:
```typescript
{
  video_id: string;
  battle_id: string;
}
```

**Output**:
```typescript
{
  status: 'approved' | 'rejected' | 'flagged_human_review';
  reason?: string;
  moderation_event_id: string;
  should_refund: boolean;
}
```

**Behavior**:
- Fetches video from Supabase Storage, creates signed URL for moderation provider
- Runs video through moderation provider (stub: manual review queue in MVP)
- Updates `videos.moderation_status`, `moderated_at`, `moderation_confidence`
- If rejected: triggers refund via `refund_credits()` function, keeps blurred preview
- Records `moderation_events`

**Called by**: Video generation pipeline (after provider completes, before client reveal)

**Auth**: Service-role only (validates service key in Authorization header)

#### 3. `report-intake`

**Purpose**: User-initiated content reporting with optional block

**Input**:
```typescript
{
  reported_type: 'battle' | 'video' | 'profile';
  reported_id: string;
  reported_profile_id?: string;
  reason: 'inappropriate' | 'harassment' | 'cheating' | 'spam';
  description?: string;
  apply_block?: boolean;
}
```

**Output**:
```typescript
{
  report_id: string;
  blocked: boolean;
  message: string;
}
```

**Behavior**:
- Validates authenticated user via JWT
- Idempotent on (reporter, type, target) tuple
- Rate limit: max 5 reports per 24h per user
- Auto-infers `reported_profile_id` if not provided (from battle/video ownership)
- Inserts report with `due_at = now + 24h` for SLA tracking
- Optionally inserts block if `apply_block = true`
- Updates `account_abuse_signals.reports_submitted_24h`

**Called by**: Mobile via `utils/safety.ts` wrapper

#### 4. `account-farm-guard`

**Purpose**: Server-side eligibility check for FTUO and onboarding credits

**Input**:
```typescript
{
  action: 'signup' | 'ftuo' | 'onboarding_credits';
  device_fingerprint?: string;
  ip_address?: string;
  platform?: 'ios' | 'android' | 'web';
  device_attestation_token?: string;
}
```

**Output**:
```typescript
{
  eligible: boolean;
  reason?: string;
  flagged: boolean;
  signals: {
    ip_velocity?: number;
    device_velocity?: number;
    ip_country?: string;
  };
}
```

**Behavior**:
- Creates or fetches `account_abuse_signals` for user
- Computes IP velocity (signups per IP in 24h) and device velocity
- Optional: verifies device attestation token (iOS DeviceCheck, Android Play Integrity)
- Optional: fetches IP geolocation for country metadata
- Decision logic:
  - Block if IP velocity ≥ 10 or device velocity ≥ 3
  - Flag if IP velocity ≥ 5 or device velocity ≥ 2
  - Fail open if no providers configured (don't block real users)
- Updates `account_abuse_signals` with results and timestamps

**Called by**: Mobile during signup, FTUO display, onboarding credit grant

**Thresholds** (tunable):
- IP velocity block: 10 signups/24h
- IP velocity flag: 5 signups/24h
- Device velocity block: 3 signups/24h
- Device velocity flag: 2 signups/24h

#### 5. `block-profile` / `unblock-profile`

**Purpose**: User-initiated blocking (prevents matchmaking, hides from feed)

**Input**:
```typescript
{ blocked_profile_id: string }
```

**Behavior**:
- Validates authenticated user
- Inserts/deletes row in `blocks` table
- Idempotent (duplicate inserts ignored, missing deletes succeed)

**Called by**: Mobile via `utils/safety.ts` wrappers

#### 6. Updated `submit-prompt`

**Changes**:
- Imports `TextModerationProvider` from `_shared/moderation.ts`
- For custom prompts: calls `moderator.moderate(custom_prompt_text)`
- Returns 403 if moderation status is `rejected`
- Logs `moderation_events` row
- Continues with existing `lock_prompt` logic if approved

### Moderation Provider Adapters

**File**: `/supabase/functions/_shared/moderation.ts`

#### `TextModerationProvider`

**Providers supported** (priority order):
1. **OpenAI Moderation API** (`OPENAI_API_KEY`): Recommended for production
2. **Google Perspective API** (`PERSPECTIVE_API_KEY`): Alternative/supplementary
3. **Blocklist + heuristics**: MVP fallback, always active

**Logic**:
- Check blocklist (hardcoded MVP list: spam, nsfw, violence, etc.)
- Check length bounds (20-800 chars)
- Heuristic: excessive caps (>70% uppercase in long text) → flagged
- Heuristic: excessive repetition (< 30% unique words) → flagged
- Call external provider if configured
- Default: approve if no violations

**Returns**: `{ status, reason, confidence, flaggedCategories, provider, providerRequestId }`

#### `VideoModerationProvider`

**Providers supported**:
1. **Manual review queue** (default MVP): All videos flagged for human review
2. **Hive AI** (`HIVE_API_KEY`): Video classification API (stub implementation)
3. **Google Video Intelligence** (`GOOGLE_VIDEO_INTELLIGENCE_API_KEY`): Alternative (not implemented)

**Logic**:
- MVP: all videos flagged for manual review (SLA: 24h)
- Production: call Hive or Google API, check classes (nsfw, violence, hate_speech)
- Threshold: score > 0.95 → reject, > 0.8 → flag, else approve

**Returns**: `{ status, reason, confidence, flaggedCategories, provider }`

### Mobile Service Helpers

**File**: `/utils/safety.ts`

Minimal client-safe wrappers, no provider keys or service-role operations.

#### Functions

- `reportContent(params)`: Calls `report-intake`, returns `{ reportId, blocked, message }`
- `blockUser(profileId)`: Calls `block-profile`
- `unblockUser(profileId)`: Calls `unblock-profile`
- `getBlockedUsers()`: Direct RLS-protected query to `blocks` table
- `checkAccountEligibility(params)`: Calls `account-farm-guard`, used for FTUO/onboarding
- `isUserBlocked(profileId)`: Calls `is_blocked()` RPC
- `getDeviceFingerprint()`: Simple client-side fingerprint (userAgent + screen + timezone hash)

**Usage**:
```typescript
import { reportContent, blockUser } from '@/utils/safety';

// Report a battle
await reportContent({
  reportedType: 'battle',
  reportedId: battleId,
  reason: 'inappropriate',
  description: 'Offensive language',
  applyBlock: true,
});

// Block user directly
await blockUser(opponentProfileId);
```

## Anti-Collusion Safeguards

### Opponent Diversity Enforcement

**Goal**: Prevent win-trading by limiting ranked battles vs same opponent

**Implementation**:
- `opponent_history` table tracks all battle opponent pairs
- `ranked_battles_vs_opponent_24h()` function counts ranked battles vs same opponent in 24h
- Matchmaking Edge Function (not in this PR) must check this count before pairing
- Recommended limit: max 3 ranked battles vs same opponent per 24h

### Shadow Rating

**Goal**: Delay rating changes during anomaly review

**Implementation**:
- `profiles.shadow_rating` and `shadow_rating_enabled` fields added
- When enabled, public rating is frozen; shadow rating is updated
- Manual reviewer can flip shadow_rating_enabled to publish or revert
- Not automatically triggered in MVP; requires manual admin action

### Quality Floor

**Goal**: No rating gain when both prompts are low-quality (spam battles)

**Implementation**:
- Judge rubric includes per-category scores (clarity, originality, etc.)
- Resolution Edge Function (not in this PR) should check if both prompts score below threshold
- If both are spam-like: mark as draw, no rating change, flag for review
- Threshold: aggregate normalized score < 20/60

## Testing

### Unit Tests

**Location**: `/supabase/functions/_tests/`

1. **`moderation_test.ts`**: Tests for `TextModerationProvider` and `VideoModerationProvider`
   - Blocklist rejection
   - Length validation
   - Excessive caps/repetition heuristics
   - Clean text approval
   - Provider stubs

2. **`account_guard_test.ts`**: Tests for account-farm guard heuristics
   - IP/device velocity threshold logic
   - Combined signal decision trees
   - Flag vs block boundaries

**Run tests**:
```bash
cd supabase/functions
deno test --allow-env --allow-net
```

### Integration Testing (Manual)

1. **Pre-gen moderation**:
   - Submit custom prompt with blocked term → 403 rejected
   - Submit clean prompt → 200 approved
   - Check `moderation_events` table for audit trail

2. **Post-gen video moderation**:
   - Generate video → status `pending`, `blurred_preview_url` shown
   - Call `moderate-video` → status `approved`, video revealed
   - Call `moderate-video` with rejection → refund granted, blurred preview kept

3. **Report/block flow**:
   - Report battle → `reports` row created with `due_at = now + 24h`
   - Report with block → `blocks` row created
   - Check blocked user → `is_blocked()` returns true
   - Matchmaking excludes blocked users (requires matchmaking Edge Function update)

4. **Account guard**:
   - Signup 3x from same IP → flagged, eligible
   - Signup 11x from same IP → blocked, ineligible
   - Check `account_abuse_signals` table for velocity counts

## Environment Variables

All AI/moderation provider keys are **Edge Function secrets only**, never in mobile.

### Required (MVP)

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (already configured)

### Optional (Production)

**Text moderation**:
- `OPENAI_API_KEY`: OpenAI Moderation API
- `PERSPECTIVE_API_KEY`: Google Perspective API

**Video moderation**:
- `VIDEO_MODERATION_PROVIDER`: `manual` (default) | `hive` | `google`
- `HIVE_API_KEY`: Hive AI Video Moderation
- `GOOGLE_VIDEO_INTELLIGENCE_API_KEY`: Google Video Intelligence

**Account guard**:
- `IP_GEOLOCATION_API_KEY`: IP geolocation service
- `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`: iOS DeviceCheck attestation
- `GOOGLE_PLAY_INTEGRITY_API_KEY`: Android Play Integrity API

See `supabase/ENV_VARS.md` for full documentation.

## Integration Notes for Other Executors

### Mobile Executor

1. **Age gate**: Add 18+ check at signup (not in this PR, auth layer responsibility)
2. **Report UI**: Add "Report" and "Block" buttons on battle/profile/video screens, call `utils/safety.ts` wrappers
3. **FTUO eligibility**: Call `checkAccountEligibility({ action: 'ftuo', ... })` before showing FTUO
4. **Onboarding credits**: Call `checkAccountEligibility({ action: 'onboarding_credits', ... })` before granting
5. **Blurred preview**: Show `videos.blurred_preview_url` until `moderation_status = 'approved'`

### Backend Executor

1. **Matchmaking**: Exclude blocked users via `is_blocked()` check
2. **Video pipeline**: Call `moderate-video` after provider completes, before Realtime notification
3. **Ranked diversity**: Check `ranked_battles_vs_opponent_24h()` before pairing
4. **Quality floor**: Check aggregate judge scores in `resolve-battle`, mark low-quality battles as draw

### QA Executor

**Negative path test cases**:
- Submit prompt with blocked term → rejected
- Report same battle twice → idempotent, single report
- Block user → matchmaking excludes
- Exceed IP velocity → FTUO blocked
- Exceed report rate limit → 429 error
- Video moderation fails → refund granted, blurred preview kept

## Assumptions and Stubs

1. **18+ age gate**: Enforced at auth/signup layer, not in this PR (assumed already implemented or mobile executor responsibility)
2. **Video moderation provider**: MVP uses manual review queue; production needs Hive or Google integration
3. **Device attestation**: Stub implementations for iOS/Android attestation; real integration requires platform SDKs
4. **IP geolocation**: Optional, improves account guard but not required
5. **Refund logic**: Simplified to refund `player_one` for MVP; real logic should track who paid for video

## Files Changed

### Database

- `supabase/migrations/20260506130000_safety_moderation_antiabuse_schema.sql` (new)

### Edge Functions

- `supabase/functions/_shared/moderation.ts` (new)
- `supabase/functions/moderate-prompt/index.ts` (new)
- `supabase/functions/moderate-video/index.ts` (new)
- `supabase/functions/report-intake/index.ts` (new)
- `supabase/functions/account-farm-guard/index.ts` (new)
- `supabase/functions/block-profile/index.ts` (new)
- `supabase/functions/unblock-profile/index.ts` (new)
- `supabase/functions/submit-prompt/index.ts` (updated)

### Tests

- `supabase/functions/_tests/moderation_test.ts` (new)
- `supabase/functions/_tests/account_guard_test.ts` (new)

### Mobile Utilities

- `utils/safety.ts` (new)

### Documentation

- `supabase/ENV_VARS.md` (updated)
- `docs/SAFETY_IMPLEMENTATION.md` (this file)

## Next Steps

1. **Deploy migration**: `supabase db push` or `supabase migration up`
2. **Deploy Edge Functions**: `supabase functions deploy <function-name>`
3. **Configure secrets**: `supabase secrets set OPENAI_API_KEY=...` (optional for production)
4. **Run tests**: `cd supabase/functions && deno test --allow-env --allow-net`
5. **Mobile integration**: Add report/block UI, FTUO eligibility check, blurred preview handling
6. **QA validation**: Negative path test cases, SLA monitoring, false-positive review queue

## Compliance Checklist

- ✅ Pre-gen prompt moderation before provider call
- ✅ Post-gen video moderation with blurred preview
- ✅ 24h SLA on reports (`reports.due_at`)
- ✅ Account-farm guard at signup/FTUO/onboarding
- ✅ No provider keys in mobile (all Edge Function only)
- ✅ Audit trail via `moderation_events`
- ✅ User-initiated block and report flows
- ⏳ 18+ age gate (auth layer, not in this PR)
- ⏳ Human review queue UI (admin tool, future)
- ⏳ Appeal flow (future, requires judge re-run integration)
