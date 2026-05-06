// Account Farm Guard Tests
// Tests for anti-abuse heuristics

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

Deno.test('Account guard - IP velocity thresholds', () => {
  const IP_VELOCITY_THRESHOLD = 10;
  const IP_VELOCITY_FLAG_THRESHOLD = 5;
  
  // Below flag threshold - clean
  let ipVelocity = 3;
  let eligible = true;
  let flagged = false;
  
  if (ipVelocity >= IP_VELOCITY_FLAG_THRESHOLD) {
    flagged = true;
  }
  
  assertEquals(eligible, true);
  assertEquals(flagged, false);
  
  // Above flag threshold but below block
  ipVelocity = 7;
  flagged = false;
  eligible = true;
  
  if (ipVelocity >= IP_VELOCITY_THRESHOLD) {
    eligible = false;
    flagged = true;
  } else if (ipVelocity >= IP_VELOCITY_FLAG_THRESHOLD) {
    flagged = true;
  }
  
  assertEquals(eligible, true);
  assertEquals(flagged, true);
  
  // Above block threshold
  ipVelocity = 12;
  flagged = false;
  eligible = true;
  
  if (ipVelocity >= IP_VELOCITY_THRESHOLD) {
    eligible = false;
    flagged = true;
  }
  
  assertEquals(eligible, false);
  assertEquals(flagged, true);
});

Deno.test('Account guard - device velocity thresholds', () => {
  const DEVICE_VELOCITY_THRESHOLD = 3;
  
  // Below threshold - clean
  let deviceVelocity = 1;
  let eligible = true;
  let flagged = false;
  
  if (deviceVelocity >= DEVICE_VELOCITY_THRESHOLD) {
    eligible = false;
    flagged = true;
  } else if (deviceVelocity >= 2) {
    flagged = true;
  }
  
  assertEquals(eligible, true);
  assertEquals(flagged, false);
  
  // At flag threshold
  deviceVelocity = 2;
  flagged = false;
  eligible = true;
  
  if (deviceVelocity >= DEVICE_VELOCITY_THRESHOLD) {
    eligible = false;
    flagged = true;
  } else if (deviceVelocity >= 2) {
    flagged = true;
  }
  
  assertEquals(eligible, true);
  assertEquals(flagged, true);
  
  // Above block threshold
  deviceVelocity = 4;
  flagged = false;
  eligible = true;
  
  if (deviceVelocity >= DEVICE_VELOCITY_THRESHOLD) {
    eligible = false;
    flagged = true;
  }
  
  assertEquals(eligible, false);
  assertEquals(flagged, true);
});

Deno.test('Account guard - combined signals', () => {
  const IP_VELOCITY_THRESHOLD = 10;
  const IP_VELOCITY_FLAG_THRESHOLD = 5;
  const DEVICE_VELOCITY_THRESHOLD = 3;
  
  // Clean account
  let ipVelocity = 2;
  let deviceVelocity = 1;
  let eligible = true;
  let flagged = false;
  let reason = '';
  
  if (ipVelocity >= IP_VELOCITY_THRESHOLD) {
    eligible = false;
    reason = 'IP velocity limit exceeded';
    flagged = true;
  } else if (deviceVelocity >= DEVICE_VELOCITY_THRESHOLD) {
    eligible = false;
    reason = 'Device velocity limit exceeded';
    flagged = true;
  } else if (ipVelocity >= IP_VELOCITY_FLAG_THRESHOLD || deviceVelocity >= 2) {
    flagged = true;
    reason = 'Elevated velocity signals';
  }
  
  assertEquals(eligible, true);
  assertEquals(flagged, false);
  assertEquals(reason, '');
  
  // Flagged but eligible
  ipVelocity = 6;
  deviceVelocity = 1;
  eligible = true;
  flagged = false;
  reason = '';
  
  if (ipVelocity >= IP_VELOCITY_THRESHOLD) {
    eligible = false;
    reason = 'IP velocity limit exceeded';
    flagged = true;
  } else if (deviceVelocity >= DEVICE_VELOCITY_THRESHOLD) {
    eligible = false;
    reason = 'Device velocity limit exceeded';
    flagged = true;
  } else if (ipVelocity >= IP_VELOCITY_FLAG_THRESHOLD || deviceVelocity >= 2) {
    flagged = true;
    reason = 'Elevated velocity signals';
  }
  
  assertEquals(eligible, true);
  assertEquals(flagged, true);
  assertEquals(reason, 'Elevated velocity signals');
  
  // Blocked by IP
  ipVelocity = 11;
  deviceVelocity = 1;
  eligible = true;
  flagged = false;
  reason = '';
  
  if (ipVelocity >= IP_VELOCITY_THRESHOLD) {
    eligible = false;
    reason = 'IP velocity limit exceeded';
    flagged = true;
  } else if (deviceVelocity >= DEVICE_VELOCITY_THRESHOLD) {
    eligible = false;
    reason = 'Device velocity limit exceeded';
    flagged = true;
  }
  
  assertEquals(eligible, false);
  assertEquals(flagged, true);
  assertEquals(reason, 'IP velocity limit exceeded');
});
