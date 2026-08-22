import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  getAuthUserId,
  successResponse,
} from "../_shared/utils.ts";

interface SignBattleVideoRequest {
  video_job_id: string;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const { video_job_id }: SignBattleVideoRequest = await req.json();
    if (!video_job_id) return errorResponse("video_job_id required");

    const supabase = createServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .select("id, battle_id, status")
      .eq("id", video_job_id)
      .single();
    if (jobError || !job) return errorResponse("Video job not found", 404);
    if (job.status !== "succeeded") {
      return errorResponse("Video is not ready", 409);
    }

    const { data: battle, error: battleError } = await supabase
      .from("battles")
      .select("player_one_id, player_two_id")
      .eq("id", job.battle_id)
      .single();
    if (battleError || !battle) return errorResponse("Battle not found", 404);
    if (battle.player_one_id !== userId && battle.player_two_id !== userId) {
      return errorResponse("Battle participant required", 403);
    }

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("storage_path, moderation_status")
      .eq("video_job_id", video_job_id)
      .single();
    if (videoError || !video) {
      return errorResponse("Video asset not found", 404);
    }
    if (video.moderation_status !== "approved") {
      return errorResponse("Video has not passed moderation", 409);
    }

    const { data: signed, error: signError } = await supabase.storage
      .from("battle-videos")
      .createSignedUrl(video.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      return errorResponse("Unable to sign video asset", 500);
    }

    return successResponse({
      video_job_id,
      signed_url: signed.signedUrl,
      expires_in: SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Internal error",
      500,
    );
  }
});
