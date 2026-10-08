// Shared constants for the AI video pipeline.
//
// Centralized so per-round vs single-format durations, retry policy, and
// timeouts stay consistent across generate-tier0-reveal, request-video-upgrade,
// and process-video-job.

/** Per-round Tier 1 target duration (Bo3). */
export const TIER1_PER_ROUND_DURATION_S = 8;

/** Single-format (legacy series-end) Tier 1 target duration. */
export const TIER1_SINGLE_FORMAT_DURATION_S = 12;

/** Hard timeout for a submitted/processing Tier 1 job before final-failure refund. */
export const TIER1_HARD_TIMEOUT_S = 300; // 5 minutes

/**
 * TTL for the signed portrait URLs handed to the video provider as reference
 * images.
 *
 * Must comfortably outlive TIER1_HARD_TIMEOUT_S: the provider fetches the URL
 * on ITS schedule, not ours, and a URL that expires mid-queue produces a video
 * that silently ignores the reference. Retries reuse the same job, so the
 * window covers all TIER1_MAX_RETRY_ATTEMPTS attempts.
 */
export const VIDEO_REFERENCE_SIGNED_URL_TTL_SECONDS = 1800; // 30 minutes

/** Max provider submission attempts per Tier 1 job before terminal failure. */
export const TIER1_MAX_RETRY_ATTEMPTS = 3;

/** Cost in abstract units per Tier 1 per-round job. */
export const TIER1_PER_ROUND_COST_UNITS = 1;

/** Frozen video prompt template version, bumped on schema changes. */
export const VIDEO_PROMPT_TEMPLATE_VERSION = 'v1-per-round-2026.05';

/** Triggers recognized by the worker for refund policy. */
export type VideoJobTrigger =
  | 'auto_free'
  | 'auto_subscriber'
  | 'on_demand_credit'
  | 'on_demand_grant'
  | 'series_end_legacy';

/** Triggers that DO get a refund on terminal failure / moderation rejection. */
export const REFUNDABLE_TRIGGERS: ReadonlySet<VideoJobTrigger> = new Set([
  'on_demand_credit',
  'on_demand_grant',
]);

export function isRefundableTrigger(t: string | null | undefined): boolean {
  return !!t && REFUNDABLE_TRIGGERS.has(t as VideoJobTrigger);
}

/**
 * §8.6 retry policy: a prior Tier 1 job only blocks a new upgrade request
 * while it is pending/active/succeeded. A terminally failed job that has been
 * refunded no longer blocks — the user may retry.
 *
 * Moderation rejections are excluded: the Tier 1 input payload is composed
 * from frozen battle rows, so re-submitting identical content would be
 * rejected again; offering that "retry" only burns provider cost.
 */
export function isRetryableFailedJob(job: {
  status: string;
  refunded?: boolean | null;
  error_code?: string | null;
  trigger?: string | null;
}): boolean {
  return (
    job.status === 'failed' &&
    (job.refunded === true || job.trigger === 'auto_free') &&
    job.error_code !== 'moderation_rejected'
  );
}

/**
 * True when a submitted/processing job has exceeded its hard timeout.
 * `startedAtIso` is `submitted_at` (fallback `created_at`); a missing or
 * unparsable timestamp never times out — the retry cap still bounds the job.
 */
export function isPastHardTimeout(
  startedAtIso: string | null | undefined,
  timeoutSeconds: number,
  nowMs: number = Date.now(),
): boolean {
  if (!startedAtIso) return false;
  const startedAtMs = Date.parse(startedAtIso);
  if (!Number.isFinite(startedAtMs)) return false;
  return nowMs - startedAtMs > timeoutSeconds * 1000;
}

// ---------------------------------------------------------------------------
// Lease + in-process polling
//
// The worker used to mark a job `submitted` and return, leaving the next
// minute-cron tick to poll it. That gap was up to 60s of the measured 68s p50.
// Polling inline removes it, but polling inline is only safe once two other
// things are true: a job can be CLAIMED (so the cron and the immediate kick
// cannot both drive the same job), and a transient provider error cannot be
// mistaken for a terminal one.
// ---------------------------------------------------------------------------

/**
 * How long a claim is held before another worker may steal it.
 *
 * Refreshed on every poll iteration rather than taken long up front. A lease
 * long enough to cover a whole poll budget would push a CRASHED worker's
 * recovery past TIER1_HARD_TIMEOUT_S, turning a crash into a refunded failure
 * instead of the retry it should be.
 */
export const VIDEO_LEASE_SECONDS = 120;

/**
 * Wall-clock budget for one invocation's inline polling.
 *
 * A time budget, not an iteration count: what matters is leaving room under
 * the worker's own wall-clock limit for everything that follows a success --
 * the storage copy, the videos row, captions, the moderation HTTP hop, the
 * write-backs and the push.
 *
 * Must stay below VIDEO_LEASE_SECONDS so a worker cannot still be polling
 * after its claim has lapsed. See the ordering assertion in the tests.
 */
export const VIDEO_POLL_BUDGET_MS = 100_000;

/**
 * Observed provider time is 52-133s, so polling from t=0 every 5s (the shape
 * dev-generate-video uses) burns roughly eight round trips before the earliest
 * possible completion. Waiting first and then polling tightly costs nothing in
 * latency and cuts poll volume ~4x -- which is the same thing as cutting the
 * 429 exposure that makes transient errors matter.
 */
export const VIDEO_POLL_FIRST_DELAY_MS = 40_000;
export const VIDEO_POLL_INTERVAL_MS = 8_000;

/** Consecutive transient poll failures tolerated before yielding to the cron. */
export const VIDEO_MAX_CONSECUTIVE_POLL_ERRORS = 5;

/** Why a poll failed. Only `client_error` is the provider's final word. */
export type VideoPollErrorCode =
  | 'rate_limited'
  | 'server_error'
  | 'client_error'
  | 'network'
  | 'timeout';

/**
 * Whether a poll failure says anything about the JOB, or only about this
 * attempt to ask after it.
 *
 * Everything except an explicit 4xx is transient. This matters more than it
 * looks: before this existed, one xAI 429 propagated to the worker's catch-all
 * and terminally failed the job -- refunding a player whose video was still
 * being generated perfectly well.
 */
export function isTransientPollError(
  code: string | null | undefined,
): boolean {
  return (
    code === 'rate_limited' ||
    code === 'server_error' ||
    code === 'network' ||
    code === 'timeout'
  );
}

/** Classifies an HTTP status from a poll into a VideoPollErrorCode. */
export function classifyPollStatus(status: number): VideoPollErrorCode {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'client_error';
}

/** True when a claim has lapsed and the job may be taken by another worker. */
export function isLeaseExpired(
  leaseExpiresAtIso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!leaseExpiresAtIso) return true;
  const expiresAtMs = Date.parse(leaseExpiresAtIso);
  // An unparsable lease is treated as expired: refusing to reclaim would
  // strand the job until its hard timeout.
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs <= nowMs;
}

/**
 * The delays between polls for one invocation, in order.
 *
 * Returned whole rather than computed in the loop so the schedule can be
 * asserted in a test instead of inferred from behaviour.
 */
export function pollScheduleFor(
  budgetMs: number = VIDEO_POLL_BUDGET_MS,
  firstDelayMs: number = VIDEO_POLL_FIRST_DELAY_MS,
  intervalMs: number = VIDEO_POLL_INTERVAL_MS,
): number[] {
  const delays: number[] = [];
  let elapsed = 0;
  let next = firstDelayMs;
  while (elapsed + next <= budgetMs) {
    delays.push(next);
    elapsed += next;
    next = intervalMs;
  }
  return delays;
}

/**
 * Whether this invocation should poll again.
 *
 * Note what is NOT here: the hard timeout. That is measured from
 * `submitted_at` by isPastHardTimeout and is checked independently, which is
 * exactly what makes swallowing transient errors safe -- no number of
 * swallowed errors can extend a job past TIER1_HARD_TIMEOUT_S.
 */
export function shouldContinuePolling(input: {
  elapsedMs: number;
  consecutiveErrors: number;
  budgetMs?: number;
  maxConsecutiveErrors?: number;
}): boolean {
  const budget = input.budgetMs ?? VIDEO_POLL_BUDGET_MS;
  const maxErrors =
    input.maxConsecutiveErrors ?? VIDEO_MAX_CONSECUTIVE_POLL_ERRORS;
  if (input.consecutiveErrors >= maxErrors) return false;
  return input.elapsedMs < budget;
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

/**
 * What one Tier 1 clip cost, in USD.
 *
 * Output-only fallback when the provider does not return actual billed usage.
 * The worker prefers measured per-request cost and sums both Plus stages.
 * This estimate excludes reference-image and input-video fees. An unset or
 * malformed rate returns `undefined`, so the row records
 * NULL rather than a confident wrong number. A NULL reads as "we do not know",
 * which is true; a zero would read as "free", which is not.
 *
 * `VIDEO_COST_USD_PER_SECOND__<MODEL>` (non-alphanumerics as underscores,
 * upper-cased) overrides the blanket rate, because a reference-capable model
 * is not priced like plain text-to-video.
 */
export function configuredVideoCostUsd(
  model: string | null | undefined,
  durationSeconds: number | null | undefined,
): number | undefined {
  if (!durationSeconds || durationSeconds <= 0) return undefined;

  const perSecond = model
    ? (readRate(
        `VIDEO_COST_USD_PER_SECOND__${model
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .toUpperCase()}`,
      ) ?? readRate('XAI_VIDEO_COST_USD_PER_SECOND'))
    : readRate('XAI_VIDEO_COST_USD_PER_SECOND');

  if (perSecond === undefined) return undefined;
  return perSecond * durationSeconds;
}

function readRate(key: string): number | undefined {
  let raw: string | undefined;
  try {
    raw = Deno.env.get(key);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
