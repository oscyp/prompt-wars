// Unit tests for the dev-functions kill switch (fail-closed).
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isDevFunctionsEnabled } from '../_shared/dev-gate.ts';

function envWith(value: string | undefined) {
  return {
    get: (k: string) => (k === 'DEV_FUNCTIONS_ENABLED' ? value : undefined),
  };
}

Deno.test('isDevFunctionsEnabled: only the exact string "1" enables', () => {
  assertEquals(isDevFunctionsEnabled(envWith('1')), true);
});

Deno.test(
  'isDevFunctionsEnabled: fails closed when unset or any other value',
  () => {
    assertEquals(isDevFunctionsEnabled(envWith(undefined)), false);
    assertEquals(isDevFunctionsEnabled(envWith('')), false);
    assertEquals(isDevFunctionsEnabled(envWith('0')), false);
    assertEquals(isDevFunctionsEnabled(envWith('true')), false);
    assertEquals(isDevFunctionsEnabled(envWith('yes')), false);
  },
);
