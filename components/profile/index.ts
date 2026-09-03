/**
 * The Profile tab's building blocks: the fighter card, the progression strip,
 * rival rows and the loading skeleton.
 */

export {
  default as FighterHero,
  HERO_MIN_HEIGHT,
  joinedLabel,
} from './FighterHero';
export type { FighterHeroProps } from './FighterHero';
export {
  default as ProgressionStrip,
  PROGRESS_TITLE,
  PROGRESS_ERROR_COPY,
  ratingRowLabel,
} from './ProgressionStrip';
export type {
  ProgressionStripProps,
  ProgressionRoute,
} from './ProgressionStrip';
export {
  default as RivalRow,
  RIVAL_PORTRAIT_SIZE,
  rivalRecordTone,
  rivalCountLabel,
  rivalRowLabel,
} from './RivalRow';
export type { RivalRowProps, RivalRecordTone } from './RivalRow';
export { default as ProfileSkeleton, SKELETON_LABEL } from './ProfileSkeleton';
