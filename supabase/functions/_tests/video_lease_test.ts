// Lease + inline-polling primitives for the Tier 1 video worker.
//
// These are pure helpers on purpose. The properties they encode are the ones
// that make inline polling safe -- that a worker yields before its claim
// lapses, and that a provider hiccup is never mistaken for a dead job -- and
// none of them should require a database or an HTTP stub to assert.

import {
  assertEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  classifyPollStatus,
  isLeaseExpired,
  isTransientPollError,
  pollScheduleFor,
  shouldContinuePolling,
  TIER1_HARD_TIMEOUT_S,
  VIDEO_LEASE_SECONDS,
  VIDEO_MAX_CONSECUTIVE_POLL_ERRORS,
  VIDEO_POLL_BUDGET_MS,
  VIDEO_POLL_FIRST_DELAY_MS,
  VIDEO_POLL_INTERVAL_MS,
} from '../_shared/video-constants.ts';

// --- the ordering that makes the whole scheme safe --------------------------

Deno.test('poll budget < lease < hard timeout', () => {
  // Each inequality is load-bearing:
  //   budget < lease        -> a worker can never still be polling after its
  //                            claim has lapsed and been stolen.
  //   lease  < hard timeout -> a CRASHED worker's job is reclaimed and retried
  //                            rather than sitting until it is force-failed
  //                            and refunded.
  // Drifting these apart is the realistic failure mode, so assert the shape
  // rather than the numbers.
  assertEquals(VIDEO_POLL_BUDGET_MS < VIDEO_LEASE_SECONDS * 1000, true);
  assertEquals(
    VIDEO_LEASE_SECONDS * 1000 < TIER1_HARD_TIMEOUT_S * 1000,
    true,
  );
});

// --- poll schedule ----------------------------------------------------------

Deno.test('the schedule opens with a long wait, then polls tightly', () => {
  const delays = pollScheduleFor();
  assertEquals(delays[0], VIDEO_POLL_FIRST_DELAY_MS);
  assertEquals(delays[1], VIDEO_POLL_INTERVAL_MS);
  assertEquals(
    delays.slice(1).every((d) => d === VIDEO_POLL_INTERVAL_MS),
    true,
  );
});

Deno.test('the schedule never overruns its budget', () => {
  const delays = pollScheduleFor();
  const total = delays.reduce((a, b) => a + b, 0);
  assertEquals(total <= VIDEO_POLL_BUDGET_MS, true);
});

Deno.test('a schedule shorter than the first delay polls not at all', () => {
  assertEquals(pollScheduleFor(1000), []);
});

Deno.test('the schedule is far shorter than a poll-from-zero one would be', () => {
  // Provider time is 52-133s, so polling every 5s from t=0 (the shape
  // dev-generate-video uses) spends ~8 round trips before the earliest
  // possible completion. Fewer polls is the same thing as less 429 exposure.
  const ours = pollScheduleFor().length;
  const naive = pollScheduleFor(VIDEO_POLL_BUDGET_MS, 5000, 5000).length;
  assertEquals(ours < naive, true);
});

// --- lease expiry -----------------------------------------------------------

Deno.test('a live lease is not expired; a lapsed one is', () => {
  const now = Date.parse('2026-09-17T12:00:00Z');
  assertEquals(
    isLeaseExpired('2026-09-17T12:00:30Z', now),
    false,
  );
  assertEquals(isLeaseExpired('2026-09-17T11:59:30Z', now), true);
});

Deno.test('a missing or unparsable lease reads as expired', () => {
  // Refusing to reclaim these would strand the job until its hard timeout --
  // the opposite of what a lease is for.
  assertEquals(isLeaseExpired(null), true);
  assertEquals(isLeaseExpired(undefined), true);
  assertEquals(isLeaseExpired('not a timestamp'), true);
});

// --- error classification ---------------------------------------------------

Deno.test('only an explicit 4xx is the provider having the last word', () => {
  assertEquals(classifyPollStatus(429), 'rate_limited');
  assertEquals(classifyPollStatus(500), 'server_error');
  assertEquals(classifyPollStatus(503), 'server_error');
  assertEquals(classifyPollStatus(404), 'client_error');
  assertEquals(classifyPollStatus(400), 'client_error');
});

Deno.test('rate limits, outages, network and timeouts are all transient', () => {
  // The bug this prevents: a single xAI 429 reaching the worker's catch-all
  // and terminally failing -- and refunding -- a job whose video was
  // generating perfectly well.
  assertEquals(isTransientPollError('rate_limited'), true);
  assertEquals(isTransientPollError('server_error'), true);
  assertEquals(isTransientPollError('network'), true);
  assertEquals(isTransientPollError('timeout'), true);
  assertEquals(isTransientPollError('client_error'), false);
  assertEquals(isTransientPollError(undefined), false);
  assertEquals(isTransientPollError('something_new'), false);
});

// --- the loop guard ---------------------------------------------------------

Deno.test('polling continues inside the budget with a healthy provider', () => {
  assertEquals(
    shouldContinuePolling({ elapsedMs: 1_000, consecutiveErrors: 0 }),
    true,
  );
});

Deno.test('polling stops at the budget', () => {
  assertEquals(
    shouldContinuePolling({
      elapsedMs: VIDEO_POLL_BUDGET_MS,
      consecutiveErrors: 0,
    }),
    false,
  );
});

Deno.test('polling stops after a run of transient errors', () => {
  assertEquals(
    shouldContinuePolling({
      elapsedMs: 0,
      consecutiveErrors: VIDEO_MAX_CONSECUTIVE_POLL_ERRORS,
    }),
    false,
  );
  // One below the limit still continues -- an isolated hiccup must not cost
  // the job its inline polling.
  assertEquals(
    shouldContinuePolling({
      elapsedMs: 0,
      consecutiveErrors: VIDEO_MAX_CONSECUTIVE_POLL_ERRORS - 1,
    }),
    true,
  );
});
