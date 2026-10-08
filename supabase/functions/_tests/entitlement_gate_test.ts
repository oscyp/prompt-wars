import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { finalizeRoundUpgradeEntitlement } from "../_shared/entitlement-gate.ts";

Deno.test("round funding reconciliation never reports success for a failed finalization", async () => {
  const base = { profile_id: "profile", battle_id: "battle", round_number: 2 };
  const errorClient = {
    rpc: () => Promise.resolve({ error: { message: "database unavailable" } }),
  };
  await assertRejects(
    () =>
      finalizeRoundUpgradeEntitlement(
        { ...base, source: "credit", reservation_id: "reservation" },
        "failed",
        errorClient as any,
      ),
    Error,
    "database unavailable",
  );
  await assertRejects(
    () =>
      finalizeRoundUpgradeEntitlement(
        { ...base, source: "subscriber_round", reservation_id: null },
        "succeeded",
        errorClient as any,
      ),
    Error,
    "database unavailable",
  );
  await assertRejects(
    () =>
      finalizeRoundUpgradeEntitlement(
        { ...base, source: "new_user_grant", reservation_id: null },
        "failed",
        errorClient as any,
      ),
    Error,
    "reservation",
  );
  // A failed subscriber clip consumes no allowance and needs no RPC.
  let calls = 0;
  const client = {
    rpc: () => {
      calls++;
      return Promise.resolve({ error: null });
    },
  };
  await finalizeRoundUpgradeEntitlement(
    { ...base, source: "subscriber_round", reservation_id: null },
    "failed",
    client as any,
  );
  assertEquals(calls, 0);
});
