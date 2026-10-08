import type { SituationSnapshot } from './prompt-situations.ts';

export const JUDGE_PROMPT_VERSION = 'v1.0.0-mvp';
export const IDEAS_JUDGE_PROMPT_VERSION = 'v2.0.0-ideas';
export type JudgePolicyVersion =
  | typeof JUDGE_PROMPT_VERSION
  | typeof IDEAS_JUDGE_PROMPT_VERSION;

/** A missing version means a legacy row; an unknown version must never silently change policy. */
export function judgePolicyVersion(value?: string | null): JudgePolicyVersion {
  if (value == null || value === JUDGE_PROMPT_VERSION)
    return JUDGE_PROMPT_VERSION;
  if (value === IDEAS_JUDGE_PROMPT_VERSION) return IDEAS_JUDGE_PROMPT_VERSION;
  throw new Error(`Unsupported judge policy: ${value}`);
}

/** Copy only the published context. Do not forward authoring, purchase or player metadata. */
export function judgeSituation(
  version: string,
  value?: SituationSnapshot | null,
): SituationSnapshot | undefined {
  if (judgePolicyVersion(version) === JUDGE_PROMPT_VERSION) return undefined;
  if (
    !value ||
    value.catalogVersion !== 1 ||
    !value.id?.trim() ||
    !value.environmentId?.trim() ||
    !value.text?.trim()
  ) {
    throw new Error(
      'Ideas judge requires the immutable round situation snapshot',
    );
  }
  return Object.freeze({
    id: value.id,
    catalogVersion: 1,
    environmentId: value.environmentId,
    text: value.text,
  });
}
