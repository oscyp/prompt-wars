import { createServiceClient, getSupabaseSecretKey } from "./utils.ts";

export const AUTO_VIDEO_DAILY_PER_PROFILE = 1;
export const AUTO_VIDEO_GLOBAL_DAILY_CAP = 100;

interface AutoVideoTarget {
  battleId: string;
  battleRoundId?: string | null;
  roundNumber?: number | null;
}

/**
 * Queue one shared, free cinematic after a battle finishes.
 *
 * The database RPC owns the atomic per-profile and global daily limits. This
 * wrapper only computes a deterministic idempotency hash and gives the worker
 * an immediate best-effort kick; the minute cron remains the durable fallback.
 * The whole task runs in the Edge Runtime background and never gates Tier 0 or
 * battle completion.
 */
export function enqueueAutoBattleVideo(target: AutoVideoTarget): void {
  const task = enqueue(target).catch((error) => {
    console.error(
      "Automatic battle video enqueue failed (non-blocking):",
      error,
    );
  });

  // @ts-ignore EdgeRuntime is provided by Supabase in production.
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore EdgeRuntime is provided by Supabase in production.
    EdgeRuntime.waitUntil(task);
  }
}

async function enqueue(target: AutoVideoTarget): Promise<void> {
  const supabase = createServiceClient();
  const requestHash = await sha256(
    JSON.stringify({
      policy: "daily-auto-v1",
      battle_id: target.battleId,
      battle_round_id: target.battleRoundId ?? null,
      round_number: target.roundNumber ?? null,
    }),
  );

  const { data: videoJobId, error } = await supabase.rpc(
    "enqueue_auto_battle_video",
    {
      p_battle_id: target.battleId,
      p_battle_round_id: target.battleRoundId ?? null,
      p_round_number: target.roundNumber ?? null,
      p_request_payload_hash: requestHash,
    },
  );

  if (error) {
    throw new Error(error.message);
  }
  if (!videoJobId) return; // Daily/global cap reached or a job already exists.

  await invokeVideoWorker(videoJobId as string);
}

async function invokeVideoWorker(videoJobId: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSupabaseSecretKey();
  if (!supabaseUrl || !secretKey) return;

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/process-video-job`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: secretKey,
        },
        body: JSON.stringify({ video_job_id: videoJobId }),
      },
    );
    if (!response.ok) {
      console.error(
        "Immediate video worker kick failed:",
        await response.text(),
      );
    }
  } catch (error) {
    console.error("Immediate video worker kick threw:", error);
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
