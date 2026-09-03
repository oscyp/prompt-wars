/**
 * The sparkline is one image node with a spoken label, labels its ends, and
 * says why it is absent rather than drawing nothing.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Circle, Polyline } from 'react-native-svg';
import Sparkline, {
  SPARKLINE_HEIGHT,
  sparklinePath,
} from '@/components/Sparkline';

function layout(el: unknown, width: number, height: number) {
  fireEvent(el as never, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });
}

describe('sparklinePath', () => {
  it('spaces points evenly and maps min to the bottom, max to the top', () => {
    const path = sparklinePath([10, 30, 20], 100, 50, 5);
    expect(path.map((p) => p.x)).toEqual([5, 50, 95]);
    expect(path[0].y).toBe(45);
    expect(path[1].y).toBe(5);
    expect(path[2].y).toBe(25);
  });

  it('draws a flat series mid-height', () => {
    const path = sparklinePath([1500, 1500, 1500], 100, 50, 5);
    expect(path.every((p) => p.y === 25)).toBe(true);
  });

  it('is empty before measurement or with fewer than two points', () => {
    expect(sparklinePath([1, 2], 0, 50)).toEqual([]);
    expect(sparklinePath([1], 100, 50)).toEqual([]);
    expect(sparklinePath([], 100, 50)).toEqual([]);
  });
});

describe('Sparkline', () => {
  it('is one image node with the given label and labelled ends', () => {
    const { getByLabelText, getByText } = render(
      <Sparkline
        points={[1506.4, 1526, 1518, 1529.6]}
        accessibilityLabel="Rating over your last 3 ranked battles, from 1506 to 1530"
        emptyText="Nothing yet"
        testID="trend"
      />,
    );
    const node = getByLabelText(
      'Rating over your last 3 ranked battles, from 1506 to 1530',
    );
    expect(node.props.accessibilityRole).toBe('image');
    getByText('1506');
    getByText('1530');
  });

  it('draws a line and a dot per point once it has a width', () => {
    const { getByLabelText, UNSAFE_queryAllByType } = render(
      <Sparkline
        points={[1500, 1512, 1498]}
        accessibilityLabel="trend"
        emptyText="Nothing yet"
      />,
    );
    expect(UNSAFE_queryAllByType(Polyline)).toHaveLength(0);

    const wrapper = getByLabelText('trend');
    // The measured box is the first child of the accessible wrapper.
    layout(wrapper.children[0], 300, SPARKLINE_HEIGHT);

    const lines = UNSAFE_queryAllByType(Polyline);
    expect(lines).toHaveLength(1);
    expect(lines[0].props.points.split(' ')).toHaveLength(3);
    expect(UNSAFE_queryAllByType(Circle)).toHaveLength(3);
  });

  it('shows the empty text instead of a chart with fewer than two points', () => {
    const { getByText, queryByLabelText, UNSAFE_queryAllByType } = render(
      <Sparkline
        points={[1500]}
        accessibilityLabel="trend"
        emptyText="Your rating trend appears after your first ranked battle."
      />,
    );
    getByText('Your rating trend appears after your first ranked battle.');
    expect(queryByLabelText('trend')).toBeNull();
    expect(UNSAFE_queryAllByType(Polyline)).toHaveLength(0);
  });
});
