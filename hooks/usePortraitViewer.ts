/**
 * Opening a fighter's portrait full-screen from an avatar tap.
 *
 * The avatars in the versus strip are 42pt circle crops of art rendered at
 * 1024×1536. Players paid credits for those renders and then only ever saw a
 * thumbnail of them, on their own character and on the one they were fighting.
 *
 * Prefers the full-body fighter render and falls back to whatever the strip is
 * already showing, which matters for characters that predate avatars: they
 * have one render, so there is nothing "fuller" to open, and the tap should
 * still enlarge what exists rather than doing nothing.
 */

import { useCallback, useState } from 'react';
import type { BattleCharacterInfo } from '@/hooks/useBattleCharacters';

interface ViewerState {
  uri: string;
  caption: string;
  /** 2:3 for a fighter render, 1:1 for an avatar. */
  aspect: number;
}

export function usePortraitViewer(onSignedUrlExpired?: () => void) {
  const [state, setState] = useState<ViewerState | null>(null);

  const open = useCallback((character: BattleCharacterInfo | null) => {
    if (!character) return;
    const uri = character.fighterUrl ?? character.portraitUrl;
    if (!uri) return;
    setState({
      uri,
      caption: character.name,
      aspect: character.fighterUrl ? 1.5 : 1,
    });
  }, []);

  const close = useCallback(() => setState(null), []);

  /**
   * A signed URL that has expired renders as a broken frame with no error the
   * player can act on. Re-sign once and close, so the next tap works rather
   * than showing the same dead image again.
   */
  const handleError = useCallback(() => {
    onSignedUrlExpired?.();
    setState(null);
  }, [onSignedUrlExpired]);

  /** True when this character has anything to show — gates the tap handler. */
  const canOpen = useCallback(
    (character: BattleCharacterInfo | null) =>
      Boolean(character?.fighterUrl ?? character?.portraitUrl),
    [],
  );

  return {
    viewer: state,
    open,
    close,
    handleError,
    canOpen,
    visible: state !== null,
  };
}
