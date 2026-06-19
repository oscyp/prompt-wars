/**
 * Realtime Battle Hook
 * Subscribe to battle, prompt, round, and video job updates via Supabase Realtime.
 *
 * Backwards compatible with single-format consumers: legacy fields are still
 * returned and new Bo3 fields default to safe values when missing.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import { BattleFormat, BattleRound, StatBlock } from '@/types/battle';

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
  bot_persona_id?: string | null;
  winner_id: string | null;
  is_draw: boolean;
  score_payload: unknown;
  tier0_reveal_payload: unknown;
  created_at: string;
  completed_at: string | null;

  // Bo3 columns (may be null on legacy rows)
  format?: BattleFormat;
  best_of?: number;
  current_round?: number;
  player_one_hp?: number | null;
  player_two_hp?: number | null;
  player_one_hp_max?: number | null;
  player_two_hp_max?: number | null;
  player_one_rounds_won?: number;
  player_two_rounds_won?: number;
  face_off_revealed_at?: string | null;
  player_one_stats_snapshot?: Partial<StatBlock> | null;
  player_two_stats_snapshot?: Partial<StatBlock> | null;
}

export interface VideoJobUpdate {
  id: string;
  battle_id: string;
  /** Nullable for legacy single-format jobs. Set for Bo3 per-round jobs. */
  battle_round_id?: string | null;
  status: string;
  video_url: string | null;
  thumbnail_url: string | null;
  moderation_status: string | null;
  error_message: string | null;
  /** Newest-first ordering uses this. */
  created_at?: string;
}

export interface PromptUpdate {
  id: string;
  battle_id: string;
  profile_id: string;
  is_locked: boolean;
  locked_at: string | null;
  moderation_status: string;
  round_number?: number;
  move_type?: 'attack' | 'defense' | 'finisher';
}

const DEFAULT_STATS: StatBlock = {
  strength: 5,
  stamina: 5,
  agility: 5,
  focus: 5,
};

function normalizeStats(raw: Partial<StatBlock> | null | undefined): StatBlock {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATS };
  return {
    strength: Number(raw.strength ?? DEFAULT_STATS.strength),
    stamina: Number(raw.stamina ?? DEFAULT_STATS.stamina),
    agility: Number(raw.agility ?? DEFAULT_STATS.agility),
    focus: Number(raw.focus ?? DEFAULT_STATS.focus),
  };
}

export function useRealtimeBattle(battleId: string | null) {
  const [battle, setBattle] = useState<BattleUpdate | null>(null);
  const [prompts, setPrompts] = useState<PromptUpdate[]>([]);
  const [videoJobs, setVideoJobs] = useState<VideoJobUpdate[]>([]);
  const [rounds, setRounds] = useState<BattleRound[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const fetchBattleData = useCallback(async () => {
    if (!battleId) return;

    try {
      const [battleRes, promptRes, videoRes, roundsRes] = await Promise.all([
        supabase.from('battles').select('*').eq('id', battleId).single(),
        supabase
          .from('battle_prompts')
          .select('*')
          .eq('battle_id', battleId),
        supabase
          .from('video_jobs')
          .select('*')
          .eq('battle_id', battleId)
          .order('created_at', { ascending: false }),
        supabase
          .from('battle_rounds')
          .select('*')
          .eq('battle_id', battleId)
          .order('round_number', { ascending: true }),
      ]);

      if (battleRes.data) {
        setBattle(battleRes.data as BattleUpdate);
      }
      if (promptRes.data) {
        setPrompts(promptRes.data as PromptUpdate[]);
      }
      if (videoRes.data) {
        setVideoJobs(videoRes.data as VideoJobUpdate[]);
      }
      if (roundsRes.data) {
        setRounds(roundsRes.data as BattleRound[]);
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

    fetchBattleData();

    let channel: RealtimeChannel;

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
            if (payload.new) {
              setBattle(payload.new as BattleUpdate);
            }
          },
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
            if (payload.eventType === 'INSERT') {
              setPrompts((prev) => [...prev, payload.new as PromptUpdate]);
            } else if (payload.eventType === 'UPDATE') {
              setPrompts((prev) =>
                prev.map((p) =>
                  p.id === (payload.new as PromptUpdate).id
                    ? (payload.new as PromptUpdate)
                    : p,
                ),
              );
            }
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'battle_rounds',
            filter: `battle_id=eq.${battleId}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setRounds((prev) =>
                [...prev, payload.new as BattleRound].sort(
                  (a, b) => a.round_number - b.round_number,
                ),
              );
            } else if (payload.eventType === 'UPDATE') {
              setRounds((prev) =>
                prev
                  .map((r) =>
                    r.id === (payload.new as BattleRound).id
                      ? (payload.new as BattleRound)
                      : r,
                  )
                  .sort((a, b) => a.round_number - b.round_number),
              );
            } else if (payload.eventType === 'DELETE') {
              setRounds((prev) =>
                prev.filter(
                  (r) => r.id !== (payload.old as BattleRound).id,
                ),
              );
            }
          },
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
            if (payload.eventType === 'INSERT') {
              const next = payload.new as VideoJobUpdate;
              setVideoJobs((prev) => {
                if (prev.some((j) => j.id === next.id)) return prev;
                return [next, ...prev].sort((a, b) =>
                  (b.created_at ?? '').localeCompare(a.created_at ?? ''),
                );
              });
            } else if (payload.eventType === 'UPDATE') {
              const next = payload.new as VideoJobUpdate;
              setVideoJobs((prev) => {
                const exists = prev.some((j) => j.id === next.id);
                const merged = exists
                  ? prev.map((j) => (j.id === next.id ? next : j))
                  : [next, ...prev];
                return merged.sort((a, b) =>
                  (b.created_at ?? '').localeCompare(a.created_at ?? ''),
                );
              });
            } else if (payload.eventType === 'DELETE') {
              const old = payload.old as VideoJobUpdate;
              setVideoJobs((prev) => prev.filter((j) => j.id !== old.id));
            }
          },
        )
        .subscribe((status) => {
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

  // Derived Bo3 fields.
  const derived = useMemo(() => {
    const format: BattleFormat = (battle?.format ?? 'single') as BattleFormat;
    const currentRound = battle?.current_round ?? 1;
    const series_score = {
      p1: battle?.player_one_rounds_won ?? 0,
      p2: battle?.player_two_rounds_won ?? 0,
    };
    const hp = {
      p1: battle?.player_one_hp ?? battle?.player_one_hp_max ?? 100,
      p2: battle?.player_two_hp ?? battle?.player_two_hp_max ?? 100,
    };
    const hp_max = {
      p1: battle?.player_one_hp_max ?? 100,
      p2: battle?.player_two_hp_max ?? 100,
    };
    const stats_snapshot = {
      p1: normalizeStats(battle?.player_one_stats_snapshot),
      p2: normalizeStats(battle?.player_two_stats_snapshot),
    };
    const current_round_data =
      rounds.find((r) => r.round_number === currentRound) ?? null;
    return {
      format,
      current_round: currentRound,
      series_score,
      hp,
      hp_max,
      stats_snapshot,
      current_round_data,
    };
  }, [battle, rounds]);

  // Derive single-format / legacy video job: prefer latest job with
  // `battle_round_id IS NULL` (legacy single-format pipeline). If no legacy
  // job exists, fall back to the latest job overall so single-format Tier 1
  // continues to work even if the backend started tagging jobs with a round.
  const videoJob = useMemo<VideoJobUpdate | null>(() => {
    if (videoJobs.length === 0) return null;
    const legacy = videoJobs.find(
      (j) => j.battle_round_id === null || j.battle_round_id === undefined,
    );
    return legacy ?? videoJobs[0] ?? null;
  }, [videoJobs]);

  // Map round_number -> latest video job for that round.
  const videoJobsByRound = useMemo<Record<number, VideoJobUpdate | null>>(() => {
    const map: Record<number, VideoJobUpdate | null> = {};
    for (const round of rounds) {
      // `videoJobs` is already ordered newest-first, so the first match wins.
      const job =
        videoJobs.find((j) => j.battle_round_id === round.id) ?? null;
      map[round.round_number] = job;
    }
    return map;
  }, [videoJobs, rounds]);

  const getRoundVideoJob = useCallback(
    (roundNumber: number): VideoJobUpdate | null => {
      return videoJobsByRound[roundNumber] ?? null;
    },
    [videoJobsByRound],
  );

  return {
    battle,
    prompts,
    videoJob,
    videoJobs,
    videoJobsByRound,
    getRoundVideoJob,
    rounds,
    isSubscribed,
    refetch: fetchBattleData,
    ...derived,
  };
}
