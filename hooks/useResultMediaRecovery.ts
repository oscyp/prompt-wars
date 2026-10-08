import { useMediaRecovery } from '@/hooks/useMediaRecovery';
import { invokeAuthenticatedFunction } from '@/utils/supabase';

export function useResultMediaRecovery(_options: {
  accountId: string | null;
  battleId: string | null;
  videoJob: { id: string; status: string } | null;
}) {
  const { accountId, battleId, videoJob } = _options;
  return useMediaRecovery({
    assetKey:
      accountId && battleId && videoJob?.id
        ? `${accountId}:${battleId}:${videoJob.id}`
        : null,
    enabled: videoJob?.status === 'succeeded',
    resolveVideoUrl: async () => {
      const signed = await invokeAuthenticatedFunction<{ signed_url: string }>(
        'sign-battle-video',
        { video_job_id: videoJob?.id },
      );
      return signed.signed_url;
    },
  });
}
