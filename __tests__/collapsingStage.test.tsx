/**
 * The collapsing Stage under the Reanimated mock: worklets are no-ops, so this
 * checks structure and the measurement → onMetrics contract only. Animated
 * style values are never asserted here (see jest.setup.js).
 */
import React from 'react';
import { Text, AccessibilityInfo } from 'react-native';

import { render, fireEvent } from '@testing-library/react-native';
import { useSharedValue } from 'react-native-reanimated';
import CollapsingStage from '@/components/edit-character/CollapsingStage';
import type { StageMetrics } from '@/components/edit-character/stageMath';

// Reanimated's Jest mock re-exports from its real entry, which initialises
// react-native-worklets; under jest-expo the `.native` platform checker is
// resolved, so worklets tries the native module and throws. Its own JS mock
// ships at lib/module/mock (no `./mock` export in 0.7.4). Belongs in
// jest.setup.js ahead of the Reanimated mock; kept here until it lands there.
// (`jest.mock` is hoisted above the imports by babel-plugin-jest-hoist.)
jest.mock('react-native-worklets', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-worklets/lib/module/mock'),
);

const INITIAL: StageMetrics = { expandedHeight: 519, compactHeight: 242 };

function Harness({ onMetrics }: { onMetrics: (m: StageMetrics) => void }) {
  const scrollY = useSharedValue(0);
  return (
    <CollapsingStage
      scrollY={scrollY}
      headerHeight={64}
      expanded={<Text>Expanded stage</Text>}
      compact={<Text>Compact hero</Text>}
      tabBar={<Text>Tabs</Text>}
      backgroundColor="#0B0B0F"
      onMetrics={onMetrics}
      initialMetrics={INITIAL}
    />
  );
}

function layout(el: unknown, height: number) {
  fireEvent(el as never, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  });
}

// The compact slot is accessibility-hidden at rest, so its measurement wrapper
// has to be looked up with hidden elements included.
const HIDDEN = { includeHiddenElements: true };

describe('CollapsingStage', () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders both slots and the tab bar', () => {
    const { getByText } = render(<Harness onMetrics={jest.fn()} />);
    expect(getByText('Expanded stage')).toBeTruthy();
    expect(getByText('Tabs')).toBeTruthy();
    // The compact slot is mounted but, at rest, hidden from accessibility.
    expect(
      getByText('Compact hero', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('hides the inactive slot from the accessibility tree while expanded', () => {
    const { queryByText, getByText } = render(
      <Harness onMetrics={jest.fn()} />,
    );
    expect(queryByText('Compact hero')).toBeNull();
    expect(getByText('Expanded stage')).toBeTruthy();
  });

  it('reports metrics once every slot has been measured', () => {
    const onMetrics = jest.fn();
    const { getByTestId } = render(<Harness onMetrics={onMetrics} />);
    expect(onMetrics).not.toHaveBeenCalled();

    layout(getByTestId('collapsing-stage-expanded'), 457);
    layout(getByTestId('collapsing-stage-compact', HIDDEN), 180);
    expect(onMetrics).not.toHaveBeenCalled();

    layout(getByTestId('collapsing-stage-tab-bar'), 62);
    expect(onMetrics).toHaveBeenCalledTimes(1);
    expect(onMetrics).toHaveBeenCalledWith({
      expandedHeight: 457 + 62,
      compactHeight: 180 + 62,
    });
  });

  it('does not re-report unchanged metrics, but does report a change', () => {
    const onMetrics = jest.fn();
    const { getByTestId } = render(<Harness onMetrics={onMetrics} />);
    layout(getByTestId('collapsing-stage-expanded'), 457);
    layout(getByTestId('collapsing-stage-compact', HIDDEN), 180);
    layout(getByTestId('collapsing-stage-tab-bar'), 62);
    expect(onMetrics).toHaveBeenCalledTimes(1);

    layout(getByTestId('collapsing-stage-expanded'), 457);
    expect(onMetrics).toHaveBeenCalledTimes(1);

    // A notice appears: the expanded slot grows, the compact one does not.
    layout(getByTestId('collapsing-stage-expanded'), 509);
    expect(onMetrics).toHaveBeenCalledTimes(2);
    expect(onMetrics).toHaveBeenLastCalledWith({
      expandedHeight: 509 + 62,
      compactHeight: 180 + 62,
    });
  });
});
