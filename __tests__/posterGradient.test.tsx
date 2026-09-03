/**
 * The poster gradient measures itself before drawing, and two on one screen
 * must not share a `<Defs>` id (the inline original hardcoded `posterGrad`).
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Rect } from 'react-native-svg';
import PosterGradient from '@/components/PosterGradient';

function layout(el: unknown, width: number, height: number) {
  fireEvent(el as never, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });
}

describe('PosterGradient', () => {
  it('draws nothing until measured, then fills the measured box', () => {
    const { getByTestId, UNSAFE_queryAllByType } = render(
      <PosterGradient base="#8B5CF6" testID="poster" />,
    );
    expect(UNSAFE_queryAllByType(Rect)).toHaveLength(0);

    layout(getByTestId('poster'), 320, 200);

    const rects = UNSAFE_queryAllByType(Rect);
    expect(rects).toHaveLength(1);
    expect(rects[0].props.width).toBe(320);
    expect(rects[0].props.height).toBe(200);
    expect(rects[0].props.fill).toMatch(/^url\(#posterGrad-[A-Za-z0-9_-]+\)$/);
  });

  it('gives two instances different gradient ids', () => {
    const { getByTestId, UNSAFE_getAllByType } = render(
      <>
        <PosterGradient base="#111111" testID="a" />
        <PosterGradient base="#222222" testID="b" />
      </>,
    );
    layout(getByTestId('a'), 100, 100);
    layout(getByTestId('b'), 100, 100);

    const fills = UNSAFE_getAllByType(Rect).map((r) => r.props.fill as string);
    expect(fills).toHaveLength(2);
    expect(fills[0]).not.toBe(fills[1]);
  });
});
