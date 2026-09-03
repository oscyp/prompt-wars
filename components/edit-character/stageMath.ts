/**
 * Geometry for the collapsing Stage on the edit-character screen.
 *
 * Pure numbers, no React and no Reanimated. Every function that runs inside a
 * UI-thread worklet carries the `'worklet'` directive; the interpolation is
 * written by hand rather than through Reanimated's `interpolate` so the Jest
 * mock (which returns `undefined` from `interpolate`) cannot hide a wrong curve
 * behind a passing test.
 */

export interface StageMetrics {
  /** Full header height at rest: notice + fighter + meta + actions + tab bar. */
  expandedHeight: number;
  /** Header height once collapsed: compact hero + tab bar. */
  compactHeight: number;
}

export interface StageFrame {
  height: number;
  expandedOpacity: number;
  compactOpacity: number;
}

/** Scroll distance over which the Stage goes from expanded to compact. */
export function collapseRange(m: StageMetrics): number {
  'worklet';
  return Math.max(0, m.expandedHeight - m.compactHeight);
}

/**
 * Linear interpolation with both ends clamped (`Extrapolation.CLAMP`).
 *
 * A degenerate input range (`inMax <= inMin`) snaps to the output end rather
 * than dividing by zero, which is what a zero collapse range needs.
 */
function lerpClamped(
  x: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  'worklet';
  if (inMax <= inMin) return x >= inMax ? outMax : outMin;
  const t = Math.min(1, Math.max(0, (x - inMin) / (inMax - inMin)));
  return outMin + (outMax - outMin) * t;
}

// The expanded slot has faded out well before the compact one fades in, so
// the two never overlap at half opacity over the same pixels.
const EXPANDED_FADE_END = 0.6;
const COMPACT_FADE_START = 0.45;

/**
 * Container height and slot opacities for a scroll offset.
 *
 * Under Reduce Motion there is no cross-fade: the Stage is either fully
 * expanded or fully compact, switching once the scroll passes the collapse
 * range.
 */
export function stageFrame(
  scrollY: number,
  m: StageMetrics,
  reduceMotion: boolean,
): StageFrame {
  'worklet';
  const range = collapseRange(m);
  const expandedState = {
    height: m.expandedHeight,
    expandedOpacity: 1,
    compactOpacity: 0,
  };
  // Nothing to collapse into: stay expanded, matching `isCollapsed`.
  if (range <= 0) return expandedState;
  if (reduceMotion) {
    return scrollY >= range
      ? { height: m.compactHeight, expandedOpacity: 0, compactOpacity: 1 }
      : expandedState;
  }
  const y = Math.min(range, Math.max(0, scrollY));
  return {
    height: m.expandedHeight - y,
    expandedOpacity: lerpClamped(y, 0, EXPANDED_FADE_END * range, 1, 0),
    compactOpacity: lerpClamped(y, COMPACT_FADE_START * range, range, 0, 1),
  };
}

/**
 * Which slot should receive touches and be visible to a screen reader.
 *
 * Switches at the midpoint of the cross-fade so the slot that is visually
 * dominant is the one that is interactive; under Reduce Motion it matches the
 * snap point exactly.
 */
export function isCollapsed(
  scrollY: number,
  m: StageMetrics,
  reduceMotion: boolean,
): boolean {
  'worklet';
  const range = collapseRange(m);
  if (range <= 0) return false;
  return reduceMotion ? scrollY >= range : scrollY >= range * 0.5;
}

// --- Vertical budget (JS thread only) --------------------------------------

/** SegmentedCategoryBar: 44pt segments + 4pt padding + 1pt border, each side. */
const TAB_BAR_HEIGHT = 54;
/** Breathing room under the tab bar (Spacing.sm). */
const TAB_BAR_PADDING = 8;
/** The least amount of panel that must peek out under the expanded Stage. */
const PANEL_PEEK = 72;
/** Name + meta + actions block under the fighter. */
const META_BLOCK = 150;
/** Same, plus the "changed since last render" line. */
const META_BLOCK_STALE = 170;
/** One InlineBanner row plus its gap. */
const NOTICE_HEIGHT = 52;
/** Compact hero content, without the header or tab bar. */
const COMPACT_HERO = 100;
const COMPACT_GAP = 16;

const FIGHTER_MIN = 160;
const FIGHTER_MAX = 380;
const FIGHTER_SHARE = 0.42;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export interface FighterHeightInput {
  windowHeight: number;
  headerHeight: number;
  /** Height the SaveBar takes when shown. Always reserved, dirty or not. */
  saveBarHeight: number;
  hasNotice: boolean;
  isStale: boolean;
}

/**
 * How tall the full-body fighter render may be.
 *
 * Aims for 42% of the window and yields to whatever the rest of the Stage and
 * a minimum panel peek need. The SaveBar's space is always reserved so the
 * fighter does not jump when the first edit is staged.
 */
export function fighterHeight(i: FighterHeightInput): number {
  const available =
    i.windowHeight -
    i.headerHeight -
    TAB_BAR_HEIGHT -
    TAB_BAR_PADDING -
    (PANEL_PEEK + i.saveBarHeight) -
    (i.isStale ? META_BLOCK_STALE : META_BLOCK) -
    (i.hasNotice ? NOTICE_HEIGHT : 0);
  const target = Math.round(FIGHTER_SHARE * i.windowHeight);
  return clamp(Math.min(target, available), FIGHTER_MIN, FIGHTER_MAX);
}

/** Avatar circle (72) plus its caption, above the history rows. */
const SIDE_COLUMN_HEAD = 88;
const HISTORY_ROW = 44;
const HISTORY_MAX_ROWS = 3;

/**
 * Number of 44pt history rows that fit beside the fighter, under the avatar.
 * History sits in the side column, so it costs the Stage no height.
 */
export function historyRowsThatFit(fighterH: number): number {
  return clamp(
    Math.floor((fighterH - SIDE_COLUMN_HEAD) / HISTORY_ROW),
    0,
    HISTORY_MAX_ROWS,
  );
}

export interface EstimateMetricsInput {
  headerHeight: number;
  fighterHeight: number;
  hasNotice: boolean;
  isStale: boolean;
}

/**
 * First-frame metrics, before `onLayout` has measured anything. Close enough
 * that the panel does not visibly jump once real measurements arrive.
 */
export function estimateMetrics(i: EstimateMetricsInput): StageMetrics {
  return {
    expandedHeight:
      i.headerHeight +
      (i.hasNotice ? NOTICE_HEIGHT : 0) +
      i.fighterHeight +
      (i.isStale ? META_BLOCK_STALE : META_BLOCK) +
      TAB_BAR_HEIGHT +
      TAB_BAR_PADDING,
    compactHeight:
      i.headerHeight +
      COMPACT_HERO +
      COMPACT_GAP +
      TAB_BAR_HEIGHT +
      TAB_BAR_PADDING,
  };
}
