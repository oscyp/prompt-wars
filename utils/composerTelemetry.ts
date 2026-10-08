import { invokeAuthenticatedFunction } from './supabase';
import type { ComposerEvent } from '../supabase/functions/_shared/composer-events';
export type { ComposerEvent };
export class ActiveComposerClock {
  private total = 0;
  private started: number | null = null;
  setActive(active: boolean, now = Date.now()) {
    if (active && this.started === null) this.started = now;
    if (!active && this.started !== null) {
      this.total += Math.max(0, now - this.started);
      this.started = null;
    }
  }
  elapsed(now = Date.now()) {
    return Math.min(
      86400000,
      Math.round(
        this.total +
          (this.started === null ? 0 : Math.max(0, now - this.started)),
      ),
    );
  }
}
export async function recordComposerEvent(
  event: ComposerEvent,
  battleId: string,
  roundNumber: number,
  sessionId: string,
  durationMs = 0,
  choice?: 'builder' | 'write' | 'suggestion' | 'custom' | 'free' | 'paid',
  sequenceNumber?: number,
) {
  try {
    await invokeAuthenticatedFunction('record-funnel-event', {
      event,
      battle_id: battleId,
      round_number: roundNumber,
      session_id: sessionId,
      duration_ms: Math.min(86400000, Math.max(0, Math.round(durationMs))),
      choice,
      ...(sequenceNumber === undefined ? {} : { sequence_number: sequenceNumber }),
    });
  } catch {
    /* Analytics must never interrupt a move or expose its content. */
  }
}
