// Tests for shared video pipeline constants/helpers
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isPastHardTimeout, isRefundableTrigger } from '../_shared/video-constants.ts';

const NOW = Date.parse('2026-07-08T12:00:00Z');

Deno.test('isPastHardTimeout: job past the timeout window times out', () => {
  const startedAt = new Date(NOW - 301_000).toISOString(); // 301s ago, 300s timeout
  assertEquals(isPastHardTimeout(startedAt, 300, NOW), true);
});

Deno.test('isPastHardTimeout: job within the timeout window does not time out', () => {
  const startedAt = new Date(NOW - 299_000).toISOString();
  assertEquals(isPastHardTimeout(startedAt, 300, NOW), false);
});

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

Deno.test('isRefundableTrigger: on-demand triggers refund, subscriber-auto does not', () => {
  assertEquals(isRefundableTrigger('on_demand_credit'), true);
  assertEquals(isRefundableTrigger('on_demand_grant'), true);
  assertEquals(isRefundableTrigger('auto_subscriber'), false);
  assertEquals(isRefundableTrigger('series_end_legacy'), false);
  assertEquals(isRefundableTrigger(null), false);
});
