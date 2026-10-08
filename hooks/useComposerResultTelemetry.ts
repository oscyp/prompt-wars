import { useCallback, useMemo } from 'react';
import { generateIdempotencyKey } from '@/utils/characters';
import { recordComposerEvent } from '@/utils/composerTelemetry';

/** Explicit result interactions, kept separate from time spent writing. */
export function useComposerResultTelemetry(
  accountId: string | null | undefined,
  battleId: string | null | undefined,
  enabled: boolean,
) {
  const session = useMemo(
    () => ({
      scope: `${accountId}:${battleId}`,
      id: generateIdempotencyKey(),
      seen: new Set<string>(),
    }),
    [accountId, battleId],
  );
  return useCallback(
    (
      event: 'composer_explanation_read' | 'composer_next_battle',
      roundNumber: number,
    ) => {
      if (
        !enabled ||
        !accountId ||
        !battleId ||
        !Number.isInteger(roundNumber) ||
        roundNumber < 1 ||
        roundNumber > 3
      )
        return;
      const key = `${event}:${roundNumber}`;
      if (session.seen.has(key)) return;
      session.seen.add(key);
      void recordComposerEvent(event, battleId, roundNumber, session.id);
    },
    [accountId, battleId, enabled, session],
  );
}
