import { supabase } from './supabase';

export interface DevGenerateVideoResult {
  success: boolean;
  video_job_id?: string;
  status?: string;
  error?: string;
}

export async function devGenerateVideo(battleId: string): Promise<DevGenerateVideoResult> {
  try {
    const { data, error } = await supabase.functions.invoke('dev-generate-video', {
      body: { battle_id: battleId },
    });
    if (error) {
      return { success: false, error: error.message || 'Function invoke failed' };
    }
    if (data?.error) {
      return { success: false, error: data.error, video_job_id: data.video_job_id, status: data.status };
    }
    return {
      success: true,
      video_job_id: data?.video_job_id,
      status: data?.status,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
