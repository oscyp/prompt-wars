import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { COMPOSER_OCCURRENCE_EVENTS } from '@/supabase/functions/_shared/composer-events';
import { useFocusEffect } from 'expo-router';
import { generateIdempotencyKey } from '@/utils/characters';
import {
  ActiveComposerClock,
  recordComposerEvent,
  type ComposerEvent,
} from '@/utils/composerTelemetry';

export function useComposerTelemetry({
  accountId,
  battleId,
  roundNumber,
  enabled,
}: {
  accountId?: string | null;
  battleId?: string | null;
  roundNumber: number;
  enabled: boolean;
}) {
  const state = useMemo(
    () => ({
      scope: `${accountId}:${battleId}:${roundNumber}`,
      clock: new ActiveComposerClock(),
      sessionId: generateIdempotencyKey(),
      seen: new Set<ComposerEvent>(),
      sequence: 0,
    }),
    [accountId, battleId, roundNumber],
  );
  const focused = useRef(false);
  const foreground = useRef(AppState.currentState === 'active');
  const track = useCallback(
    (
      event: ComposerEvent,
      choice?: 'builder' | 'write' | 'suggestion' | 'custom' | 'free' | 'paid',
    ) => {
      if (!enabled || !accountId || !battleId) return;
      const occurrence = COMPOSER_OCCURRENCE_EVENTS.includes(event);
      if (!occurrence && event !== 'composer_session_ended' && state.seen.has(event)) return;
      if (occurrence && state.sequence >= 10000) return;
      state.seen.add(event);
      void recordComposerEvent(
        event,
        battleId,
        roundNumber,
        state.sessionId,
        state.clock.elapsed(),
        choice,
        occurrence ? ++state.sequence : undefined,
      );
    },
    [accountId, battleId, enabled, roundNumber, state],
  );
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      state.clock.setActive(enabled && foreground.current);
      track('composer_opened');
      return () => {
        focused.current = false;
        state.clock.setActive(false);
        track('composer_session_ended');
      };
    }, [enabled, state, track]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      foreground.current = next === 'active';
      state.clock.setActive(enabled && focused.current && foreground.current);
      if (!foreground.current) track('composer_session_ended');
    });
    return () => sub.remove();
  }, [enabled, state, track]);
  return { track, activeDurationMs: () => state.clock.elapsed() };
}
