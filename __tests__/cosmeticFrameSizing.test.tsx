import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import CosmeticFrame from '@/components/CosmeticFrame';
import { presentationFor, type FramePresentation } from '@/constants/Cosmetics';

const source = { uri: 'https://example.test/avatar-square.png' };
const frames: [string, FramePresentation | null][] = [
  ['none', null],
  ['solid', { kind: 'frame', colors: ['#D5AD63'], width: 3 }],
  ['gradient', { kind: 'frame', colors: ['#D5AD63', '#C4AFFE'], width: 3 }],
  ['artwork', presentationFor('astral_codex_frame') as FramePresentation],
];
describe('cosmetic frame artwork aperture', () => {
  it.each(frames)(
    'fits the square avatar to the %s frame aperture',
    (_name, frame) => {
      const view = render(
        <CosmeticFrame
          source={source}
          frame={frame}
          variant="circle"
          size={96}
        />,
      );
      const aperture = StyleSheet.flatten(
        view.getByTestId('frame-aperture').props.style,
      );
      const portrait = view
        .UNSAFE_getAllByType(Image)
        .find((image) => image.props.source === source)!;
      const image = StyleSheet.flatten(portrait.props.style);
      expect(image.width).toBeCloseTo(aperture.width);
      expect(image.height).toBeCloseTo(aperture.height);
      expect(image.width).toBeCloseTo(image.height);
    },
  );
  it.each(frames)(
    'contains full fighter art inside the %s frame aperture',
    (_name, frame) => {
      const view = render(
        <CosmeticFrame
          source={source}
          frame={frame}
          variant="fullBody"
          size={240}
        />,
      );
      const aperture = StyleSheet.flatten(
        view.getByTestId('frame-aperture').props.style,
      );
      const portrait = view
        .UNSAFE_getAllByType(Image)
        .find((image) => image.props.source === source)!;
      expect(portrait.props.resizeMode).toBe('contain');
      expect(StyleSheet.flatten(portrait.props.style).height).toBeCloseTo(
        aperture.height,
      );
      expect(
        StyleSheet.flatten(view.getByTestId('cosmetic-frame').props.style)
          .height,
      ).toBe(360);
    },
  );
  it('reports only fighter image failures and keeps the decorative border inert', () => {
    const retry = jest.fn();
    const view = render(
      <CosmeticFrame
        source={source}
        frame={frames[3][1]}
        size={96}
        onImageError={retry}
      />,
    );
    const portrait = view
      .UNSAFE_getAllByType(Image)
      .find((image) => image.props.source === source)!;
    fireEvent(portrait, 'error');
    expect(retry).toHaveBeenCalledTimes(1);
    expect(
      view.getByTestId('frame-artwork-overlay', { includeHiddenElements: true })
        .props.pointerEvents,
    ).toBe('none');
  });
});
