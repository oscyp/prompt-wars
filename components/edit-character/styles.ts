import { StyleSheet } from 'react-native';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

/**
 * Layout shared by the three editor panels.
 *
 * Panels are plain views inside the screen's single outer scroll (the Stage
 * collapses against that scroll), so there is no per-panel scroll style.
 * Colours are applied inline from `useThemedColors` at each use site, matching
 * the rest of the app; only geometry lives here.
 */
export const editStyles = StyleSheet.create({
  panel: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  flex1: { flex: 1 },
  cardTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  cardSub: {
    marginTop: 2,
    fontSize: Typography.sizes.sm,
    lineHeight: 19,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  cooledDown: { opacity: 0.45 },
  sectionLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: Spacing.sm,
  },
  input: {
    minHeight: 44,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.base,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  counter: {
    fontSize: Typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  primaryBtn: {
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  secondaryBtnText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  btnDisabled: { opacity: 0.45 },
  hint: {
    fontSize: Typography.sizes.xs,
    lineHeight: 17,
  },
  changedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
});
