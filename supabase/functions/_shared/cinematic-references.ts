import type {
  CinematicInputV2,
  CinematicSide,
  StorageAssetRef,
} from './cinematic-inputs.ts';
import { VIDEO_REFERENCE_SIGNED_URL_TTL_SECONDS } from './video-constants.ts';

export interface CinematicReference {
  side: CinematicSide;
  kind: 'fighter' | 'item';
  storageRef: StorageAssetRef;
}
export interface ResolvedCinematicReference extends CinematicReference {
  url: string;
  referenceIndex: number;
}
export interface CinematicAssetStore {
  isApproved(ref: StorageAssetRef): Promise<boolean>;
  sign(ref: StorageAssetRef, ttlSeconds: number): Promise<string>;
}
export class CinematicPreparationError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
    this.name = 'CinematicPreparationError';
  }
}

export async function resolveCinematicReferences(
  input: CinematicInputV2,
  store: CinematicAssetStore,
): Promise<ResolvedCinematicReference[]> {
  const refs: ResolvedCinematicReference[] = [];
  const add = async (
    side: CinematicSide,
    kind: 'fighter' | 'item',
    ref: StorageAssetRef,
  ) => {
    if (!(await store.isApproved(ref)))
      throw new CinematicPreparationError(
        `unapproved reference: ${side} ${kind}`,
        false,
      );
    const url = await store.sign(ref, VIDEO_REFERENCE_SIGNED_URL_TTL_SECONDS);
    if (!url.startsWith('https://'))
      throw new CinematicPreparationError(`Invalid reference URL: ${side}`);
    refs.push({
      side,
      kind,
      storageRef: ref,
      url,
      referenceIndex: refs.length,
    });
  };
  // Required identities first; optional item failures cannot renumber them.
  for (const side of ['p1', 'p2'] as const) {
    const ref = input.fighters[side].reference;
    if (!ref)
      throw new CinematicPreparationError(`Missing fighter reference: ${side}`);
    await add(side, 'fighter', ref);
  }
  for (const side of ['p1', 'p2'] as const) {
    const ref = input.fighters[side].item?.reference;
    if (!ref) {
      if (
        input.fighters[side].item &&
        !input.fighters[side].itemDepictedInFighter
      )
        throw new CinematicPreparationError(
          `Missing required item reference: ${side}`,
        );
      continue;
    }
    try {
      await add(side, 'item', ref);
    } catch (error) {
      // Takedowns are terminal, even when an item is also visible in the fighter.
      if (error instanceof CinematicPreparationError && !error.retryable)
        throw error;
      if (!input.fighters[side].itemDepictedInFighter)
        throw new CinematicPreparationError(
          `Required item reference unavailable: ${side}`,
        );
      console.warn(
        `Cinematic item close-up unavailable: ${side}; using frozen fighter artwork`,
      );
    }
  }
  return refs;
}
