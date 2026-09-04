// Tests for shared video pipeline constants/helpers
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  isPastHardTimeout,
  isRefundableTrigger,
  isRetryableFailedJob,
} from '../_shared/video-constants.ts';

const NOW = Date.parse('2026-07-08T12:00:00Z');

Deno.test('isPastHardTimeout: job past the timeout window times out', () => {
  const startedAt = new Date(NOW - 301_000).toISOString(); // 301s ago, 300s timeout
  assertEquals(isPastHardTimeout(startedAt, 300, NOW), true);
});

Deno.test(
  'isPastHardTimeout: job within the timeout window does not time out',
  () => {
    const startedAt = new Date(NOW - 299_000).toISOString();
    assertEquals(isPastHardTimeout(startedAt, 300, NOW), false);
  },
);

Deno.test('isPastHardTimeout: exact boundary does not time out', () => {
  const startedAt = new Date(NOW - 300_000).toISOString();
  assertEquals(isPastHardTimeout(startedAt, 300, NOW), false);
});

Deno.test('isPastHardTimeout: missing timestamp never times out', () => {
  assertEquals(isPastHardTimeout(null, 300, NOW), false);
  assertEquals(isPastHardTimeout(undefined, 300, NOW), false);
});

Deno.test('isPastHardTimeout: unparsable timestamp never times out', () => {
  assertEquals(isPastHardTimeout('not-a-date', 300, NOW), false);
});

Deno.test(
  'isRefundableTrigger: on-demand triggers refund, subscriber-auto does not',
  () => {
    assertEquals(isRefundableTrigger('on_demand_credit'), true);
    assertEquals(isRefundableTrigger('on_demand_grant'), true);
    assertEquals(isRefundableTrigger('auto_subscriber'), false);
    assertEquals(isRefundableTrigger('series_end_legacy'), false);
    assertEquals(isRefundableTrigger(null), false);
  },
);

Deno.test(
  'isRetryableFailedJob: refunded and free-auto failures can retry safely',
  () => {
    // §8.6 retry after storage/provider/timeout failure that was refunded.
    assertEquals(
      isRetryableFailedJob({
        status: 'failed',
        refunded: true,
        error_code: 'storage_failed',
      }),
      true,
    );
    assertEquals(
      isRetryableFailedJob({
        status: 'failed',
        refunded: true,
        error_code: 'hard_timeout',
      }),
      true,
    );
    // Missing error_code (null) is still retryable.
    assertEquals(
      isRetryableFailedJob({
        status: 'failed',
        refunded: true,
        error_code: null,
      }),
      true,
    );

    // Moderation rejections are excluded: re-submitting frozen content re-rejects.
    assertEquals(
      isRetryableFailedJob({
        status: 'failed',
        refunded: true,
        error_code: 'moderation_rejected',
      }),
      false,
    );
    // A failure that was not yet refunded must keep blocking (no double refund).
    assertEquals(
      isRetryableFailedJob({
        status: 'failed',
        refunded: false,
        error_code: 'storage_failed',
      }),
      false,
    );
    // A free automatic job has no ledger refund to wait for. Its failed row may
    // be cleared so a participant can explicitly retry through the paid path.
    assertEquals(
      isRetryableFailedJob({
        status: 'failed',
        refunded: false,
        error_code: 'provider_failed',
        trigger: 'auto_free',
      }),
      true,
    );
    assertEquals(
      isRetryableFailedJob({
        status: 'failed',
        refunded: false,
        error_code: 'moderation_rejected',
        trigger: 'auto_free',
      }),
      false,
    );
    // Non-terminal / in-flight / succeeded jobs always block a new request.
    assertEquals(
      isRetryableFailedJob({ status: 'queued', refunded: false }),
      false,
    );
    assertEquals(
      isRetryableFailedJob({ status: 'processing', refunded: false }),
      false,
    );
    assertEquals(
      isRetryableFailedJob({ status: 'succeeded', refunded: false }),
      false,
    );
  },
);
