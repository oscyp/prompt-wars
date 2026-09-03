/**
 * The Stage's geometry, pinned so a wrong curve cannot hide behind the
 * Reanimated mock (which returns undefined from `interpolate`).
 */
import {
  collapseRange,
  stageFrame,
  isCollapsed,
  fighterHeight,
  historyRowsThatFit,
  estimateMetrics,
} from '@/components/edit-character/stageMath';

// iPhone SE (3rd gen) common case from the plan's vertical budget.
const M = { expandedHeight: 519, compactHeight: 242 };
const RANGE = 277;

describe('collapseRange', () => {
  it('is the distance between the two heights, never negative', () => {
    expect(collapseRange(M)).toBe(RANGE);
    expect(collapseRange({ expandedHeight: 100, compactHeight: 140 })).toBe(0);
  });
});

describe('stageFrame', () => {
  it('is fully expanded at rest', () => {
    expect(stageFrame(0, M, false)).toEqual({
      height: 519,
      expandedOpacity: 1,
      compactOpacity: 0,
    });
  });

  it('is fully compact once the collapse range is passed', () => {
    expect(stageFrame(RANGE, M, false)).toEqual({
      height: 242,
      expandedOpacity: 0,
      compactOpacity: 1,
    });
  });

  it('clamps beyond both ends', () => {
    expect(stageFrame(-80, M, false)).toEqual(stageFrame(0, M, false));
    expect(stageFrame(5000, M, false)).toEqual(stageFrame(RANGE, M, false));
  });

  it('shrinks the height linearly with the scroll', () => {
    expect(stageFrame(100, M, false).height).toBe(419);
    expect(stageFrame(RANGE / 2, M, false).height).toBeCloseTo(380.5);
  });

  it('fades the expanded slot out before the compact slot fades in', () => {
    // Expanded fades over [0, 0.6·range]; compact fades in over [0.45·range, range].
    const early = stageFrame(0.3 * RANGE, M, false);
    expect(early.expandedOpacity).toBeCloseTo(0.5);
    expect(early.compactOpacity).toBe(0);

    const late = stageFrame(0.6 * RANGE, M, false);
    expect(late.expandedOpacity).toBeCloseTo(0);
    expect(late.compactOpacity).toBeCloseTo((0.6 - 0.45) / 0.55);

    const almost = stageFrame(0.9 * RANGE, M, false);
    expect(almost.expandedOpacity).toBe(0);
    expect(almost.compactOpacity).toBeGreaterThan(0.8);
    expect(almost.compactOpacity).toBeLessThan(1);
  });

  it('under reduce motion snaps between two states at the range', () => {
    expect(stageFrame(0, M, true)).toEqual({
      height: 519,
      expandedOpacity: 1,
      compactOpacity: 0,
    });
    expect(stageFrame(RANGE - 1, M, true)).toEqual({
      height: 519,
      expandedOpacity: 1,
      compactOpacity: 0,
    });
    expect(stageFrame(RANGE, M, true)).toEqual({
      height: 242,
      expandedOpacity: 0,
      compactOpacity: 1,
    });
    // No intermediate values anywhere in between.
    const mid = stageFrame(RANGE / 2, M, true);
    expect([0, 1]).toContain(mid.expandedOpacity);
    expect([0, 1]).toContain(mid.compactOpacity);
  });

  it('stays expanded when there is nothing to collapse into', () => {
    const flat = { expandedHeight: 200, compactHeight: 200 };
    expect(stageFrame(50, flat, false)).toEqual({
      height: 200,
      expandedOpacity: 1,
      compactOpacity: 0,
    });
    expect(stageFrame(50, flat, true)).toEqual(stageFrame(50, flat, false));
  });
});

describe('isCollapsed', () => {
  it('switches at half the range so the dominant slot is the live one', () => {
    expect(isCollapsed(0, M, false)).toBe(false);
    expect(isCollapsed(138, M, false)).toBe(false);
    expect(isCollapsed(139, M, false)).toBe(true);
    expect(isCollapsed(RANGE, M, false)).toBe(true);
  });

  it('under reduce motion switches exactly where the frame snaps', () => {
    expect(isCollapsed(RANGE - 1, M, true)).toBe(false);
    expect(isCollapsed(RANGE, M, true)).toBe(true);
  });

  it('is never collapsed with a zero range', () => {
    const flat = { expandedHeight: 200, compactHeight: 200 };
    expect(isCollapsed(999, flat, false)).toBe(false);
    expect(isCollapsed(999, flat, true)).toBe(false);
  });
});

describe('fighterHeight', () => {
  it('gives the SE-class phone 243pt with the SaveBar reserved', () => {
    expect(
      fighterHeight({
        windowHeight: 667,
        headerHeight: 64,
        saveBarHeight: 76,
        hasNotice: false,
        isStale: false,
      }),
    ).toBe(243);
  });

  it('gives an iPhone 15 355pt', () => {
    expect(
      fighterHeight({
        windowHeight: 852,
        headerHeight: 103,
        saveBarHeight: 110,
        hasNotice: false,
        isStale: false,
      }),
    ).toBe(355);
  });

  it('gives up height to a notice and the stale line', () => {
    expect(
      fighterHeight({
        windowHeight: 667,
        headerHeight: 64,
        saveBarHeight: 76,
        hasNotice: true,
        isStale: true,
      }),
    ).toBe(171);
  });

  it('never drops below 160', () => {
    expect(
      fighterHeight({
        windowHeight: 500,
        headerHeight: 64,
        saveBarHeight: 76,
        hasNotice: true,
        isStale: true,
      }),
    ).toBe(160);
  });

  it('never grows past 380', () => {
    expect(
      fighterHeight({
        windowHeight: 2000,
        headerHeight: 64,
        saveBarHeight: 76,
        hasNotice: false,
        isStale: false,
      }),
    ).toBe(380);
  });
});

describe('historyRowsThatFit', () => {
  it('fits three rows beside a 243pt fighter', () => {
    expect(historyRowsThatFit(243)).toBe(3);
  });

  it('fits one row beside the worst-case SE fighter', () => {
    expect(historyRowsThatFit(171)).toBe(1);
    expect(historyRowsThatFit(160)).toBe(1);
  });

  it('rounds down at the boundary', () => {
    expect(historyRowsThatFit(175)).toBe(1);
    expect(historyRowsThatFit(176)).toBe(2);
  });

  it('is clamped to [0, 3]', () => {
    expect(historyRowsThatFit(88)).toBe(0);
    expect(historyRowsThatFit(10)).toBe(0);
    expect(historyRowsThatFit(1000)).toBe(3);
  });
});

describe('estimateMetrics', () => {
  it('matches the plan budget for the SE common case', () => {
    expect(
      estimateMetrics({
        headerHeight: 64,
        fighterHeight: 243,
        hasNotice: false,
        isStale: false,
      }),
    ).toEqual({ expandedHeight: 519, compactHeight: 242 });
  });

  it('matches the plan budget for an iPhone 15', () => {
    expect(
      estimateMetrics({
        headerHeight: 103,
        fighterHeight: 355,
        hasNotice: false,
        isStale: false,
      }),
    ).toEqual({ expandedHeight: 670, compactHeight: 281 });
  });

  it('adds the notice and stale line to the expanded height only', () => {
    const plain = estimateMetrics({
      headerHeight: 64,
      fighterHeight: 171,
      hasNotice: false,
      isStale: false,
    });
    const busy = estimateMetrics({
      headerHeight: 64,
      fighterHeight: 171,
      hasNotice: true,
      isStale: true,
    });
    expect(busy.expandedHeight - plain.expandedHeight).toBe(52 + 20);
    expect(busy.compactHeight).toBe(plain.compactHeight);
  });
});
