/**
 * Realtime Battle Hook
 * Subscribe to battle, prompt, and video job updates via Supabase Realtime
 */

import { useEffect, useState, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';

export interface BattleUpdate {
  id: string;
  status: string;
  mode: string;
  theme: string | null;
  player_one_id: string;
  player_two_id: string | null;
  player_one_character_id: string;
  player_two_character_id: string | null;
  is_player_two_bot: boolean;
  winner_id: string | null;
  is_draw: boolean;
  score_payload: any;
  tier0_reveal_payload: any;
  created_at: string;
  completed_at: string | null;
}

export interface VideoJobUpdate {
  id: string;
  battle_id: string;
  status: string;
  video_url: string | null;
  thumbnail_url: string | null;
  moderation_status: string | null;
  error_message: string | null;
}

export interface PromptUpdate {
  id: string;
  battle_id: string;
  profile_id: string;
  is_locked: boolean;
  locked_at: string | null;
  moderation_status: string;
}

export function useRealtimeBattle(battleId: string | null) {
  const [battle, setBattle] = useState<BattleUpdate | null>(null);
  const [prompts, setPrompts] = useState<PromptUpdate[]>([]);
  const [videoJob, setVideoJob] = useState<VideoJobUpdate | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Fetch initial data
  const fetchBattleData = useCallback(async () => {
    if (!battleId) return;

    try {
      // Fetch battle
      const { data: battleData } = await supabase
        .from('battles')
        .select('*')
        .eq('id', battleId)
        .single();

      if (battleData) {
        setBattle(battleData as BattleUpdate);
      }

      // Fetch prompts
      const { data: promptData } = await supabase
        .from('battle_prompts')
        .select('*')
        .eq('battle_id', battleId);

      if (promptData) {
        setPrompts(promptData as PromptUpdate[]);
      }

      // Fetch video job if any
      const { data: videoData } = await supabase
        .from('video_jobs')
        .select('*')
        .eq('battle_id', battleId)
        .maybeSingle();

      if (videoData) {
        setVideoJob(videoData as VideoJobUpdate);
      }
    } catch (err) {
      console.error('Failed to fetch battle data:', err);
    }
  }, [battleId]);

  useEffect(() => {
    if (!battleId) {
      setIsSubscribed(false);
      return;
    }

    // Fetch initial data
    fetchBattleData();

    let channel: RealtimeChannel;

    // Subscribe to realtime updates
    const subscribe = async () => {
      channel = supabase
        .channel(`battle:${battleId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'battles',
            filter: `id=eq.${battleId}`,
          },
          (payload) => {
            console.log('Battle update:', payload);
            if (payload.new) {
              setBattle(payload.new as BattleUpdate);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'battle_prompts',
            filter: `battle_id=eq.${battleId}`,
          },
          (payload) => {
            console.log('Prompt update:', payload);
            if (payload.eventType === 'INSERT') {
              setPrompts((prev) => [...prev, payload.new as PromptUpdate]);
            } else if (payload.eventType === 'UPDATE') {
              setPrompts((prev) =>
                prev.map((p) =>
                  p.id === (payload.new as PromptUpdate).id
                    ? (payload.new as PromptUpdate)
                    : p
                )
              );
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'video_jobs',
            filter: `battle_id=eq.${battleId}`,
          },
          (payload) => {
            console.log('Video job update:', payload);
            if (payload.new) {
              setVideoJob(payload.new as VideoJobUpdate);
            }
          }
        )
        .subscribe((status) => {
          console.log('Realtime subscription status:', status);
          setIsSubscribed(status === 'SUBSCRIBED');
        });
    };

    subscribe();

    return () => {
      if (channel) {
        channel.unsubscribe();
      }
      setIsSubscribed(false);
    };
  }, [battleId, fetchBattleData]);

  return {
    battle,
    prompts,
    videoJob,
    isSubscribed,
    refetch: fetchBattleData,
  };
}
