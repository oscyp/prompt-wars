/**
 * Reusable UI components for Prompt Wars
 */

export { default as PortraitPreview } from './PortraitPreview';
export { default as PortraitViewer } from './PortraitViewer';
export type { PortraitViewerProps } from './PortraitViewer';
export { default as PortraitHistoryStrip } from './PortraitHistoryStrip';
export type { PortraitHistoryStripProps } from './PortraitHistoryStrip';
export { default as ItemGrid } from './ItemGrid';
export type { ItemGridItem } from './ItemGrid';
export { default as ArtStylePicker } from './ArtStylePicker';
export { default as SectionCard } from './SectionCard';
export { default as BackButton } from './BackButton';
export { default as HeaderLeaveButton } from './HeaderLeaveButton';
export type { HeaderLeaveButtonProps } from './HeaderLeaveButton';
export { default as HPBar } from './HPBar';
export type { HPBarProps } from './HPBar';
export { default as StatBar } from './StatBar';
export type { StatBarProps } from './StatBar';
export { default as StatAllocator } from './StatAllocator';
export type { StatAllocatorProps } from './StatAllocator';
export { default as SeriesScoreIndicator } from './SeriesScoreIndicator';
export type { SeriesScoreIndicatorProps } from './SeriesScoreIndicator';
export { default as FaceOffPortraits } from './FaceOffPortraits';
export type { FaceOffPortraitsProps, FaceOffPlayer } from './FaceOffPortraits';
export { default as RoundResultCinematic } from './RoundResultCinematic';
export type {
  RoundResultCinematicProps,
  Tier0Payload,
  RevealSpec,
  RevealBattleCryVoice,
} from './RoundResultCinematic';
export { default as MoveTypeChipRow } from './MoveTypeChipRow';
export type { MoveTypeChipRowProps } from './MoveTypeChipRow';
export { default as RubricBars } from './RubricBars';
export type { RubricBarsProps } from './RubricBars';
export { default as StreakMeter } from './StreakMeter';
export type { StreakMeterProps } from './StreakMeter';
export { default as FirstTimeOfferModal } from './FirstTimeOfferModal';
export type { FirstTimeOfferModalProps } from './FirstTimeOfferModal';
export { default as AnimatedCounter } from './AnimatedCounter';
export type { AnimatedCounterProps } from './AnimatedCounter';
export { default as SubscriberBadge } from './SubscriberBadge';
export type { SubscriberBadgeProps } from './SubscriberBadge';
export { default as ModeCard } from './ModeCard';
export type { ModeCardProps } from './ModeCard';
export {
  default as BattleModeSheet,
  BattleSheetProvider,
  useBattleSheet,
} from './BattleModeSheet';
export type { BattleModeSheetProps } from './BattleModeSheet';
export { default as VersusStrip } from './VersusStrip';
export type { VersusStripProps, VersusStripPlayer } from './VersusStrip';
export { default as SegmentedCategoryBar } from './SegmentedCategoryBar';
export type {
  SegmentedCategoryBarProps,
  SegmentedCategoryItem,
} from './SegmentedCategoryBar';
export { default as ReportBlockSheet } from './ReportBlockSheet';
export type { ReportBlockSheetProps } from './ReportBlockSheet';
export { default as OptionGrid } from './OptionGrid';
export type { OptionGridOption, OptionGridProps } from './OptionGrid';
export { default as PosterGradient } from './PosterGradient';
export type { PosterGradientProps } from './PosterGradient';

// --- Sheets ----------------------------------------------------------------
export { default as BottomSheet } from './sheets/BottomSheet';
export type { BottomSheetProps } from './sheets/BottomSheet';
export { default as ConfirmSheet } from './sheets/ConfirmSheet';
export type { ConfirmSheetProps } from './sheets/ConfirmSheet';
export { default as RenderRevealSheet } from './RenderRevealSheet';
export type { RenderRevealSheetProps, RevealAvatar } from './RenderRevealSheet';

// --- Shared primitives lifted out of the edit-character screen -------------
export { default as Toast } from './Toast';
export type { ToastProps } from './Toast';
export { default as CreditChip } from './CreditChip';
export type { CreditChipProps } from './CreditChip';
export { default as InlineBanner } from './InlineBanner';
export type { InlineBannerProps, BannerTone } from './InlineBanner';
export {
  default as ColorSwatchGrid,
  withCustomOption,
  selectedValueForHex,
} from './ColorSwatchGrid';
export type {
  ColorSwatchGridProps,
  ColorSwatchOption,
} from './ColorSwatchGrid';

// --- Cosmetics -------------------------------------------------------------
export { default as CosmeticTitle } from './CosmeticTitle';
export type { CosmeticTitleProps } from './CosmeticTitle';
export { default as CosmeticBadge } from './CosmeticBadge';
export type { CosmeticBadgeProps } from './CosmeticBadge';
export { default as CosmeticPreview } from './CosmeticPreview';
export type { CosmeticPreviewProps } from './CosmeticPreview';

// --- Edit-character panels -------------------------------------------------
export * from './edit-character';

// --- Result reveal ---------------------------------------------------------
export * from './reveal';
export { default as ResultShareCard } from './ResultShareCard';
export type { ResultShareCardProps, ShareCardFighter } from './ResultShareCard';
