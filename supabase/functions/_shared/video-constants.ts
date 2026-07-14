// Shared constants for the AI video pipeline.
//
// Centralized so per-round vs single-format durations, retry policy, and
// timeouts stay consistent across generate-tier0-reveal, request-video-upgrade,
// and process-video-job.

/** Per-round Tier 1 target duration (Bo3). */
export const TIER1_PER_ROUND_DURATION_S = 8;

/** Single-format (legacy series-end) Tier 1 target duration. */
export const TIER1_SINGLE_FORMAT_DURATION_S = 12;

/** Hard timeout per Tier 1 round job before final-failure refund. */
export const TIER1_PER_ROUND_HARD_TIMEOUT_S = 120;

/** Max retry attempts (within the hard timeout window) per round job. */
export const TIER1_PER_ROUND_MAX_RETRIES = 3;

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
