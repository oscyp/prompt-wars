import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
/**
 * The frame pulse must respect Reduce Motion, while the spinner overlay keeps
 * saying that a render is in flight.
 */
import React from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
} from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import { Stop } from 'react-native-svg';
import { presentationFor, type FramePresentation } from '@/constants/Cosmetics';
import PortraitPreview from '@/components/PortraitPreview';
import {
  setAccessibilityPreference,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
} from '@/utils/accessibilitySettings';
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: jest.fn(() => true),
}));

describe('PortraitPreview', () => {
  beforeEach(() => {
    (useBattlePresentationActive as jest.Mock).mockReturnValue(true);
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    act(() =>
      setAccessibilityPreference(
        'reducedMotion',
        DEFAULT_ACCESSIBILITY_PREFERENCES.reducedMotion,
      ),
    );
    jest.restoreAllMocks();
  });

  it('does not start the pulse under Reduce Motion but still shows the spinner', () => {
    act(() => setAccessibilityPreference('reducedMotion', true));
    const loop = jest.spyOn(Animated, 'loop');

    const { UNSAFE_getByType } = render(
      <PortraitPreview uri="https://example.test/fighter.png" loading />,
    );

    expect(loop).not.toHaveBeenCalled();
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('pulses while loading when motion is allowed', () => {
    const loop = jest.spyOn(Animated, 'loop');

    render(<PortraitPreview uri="https://example.test/fighter.png" loading />);

    expect(loop).toHaveBeenCalled();
  });

  it('keeps loading feedback steady while the screen is backgrounded', () => {
    (useBattlePresentationActive as jest.Mock).mockReturnValue(false);
    const loop = jest.spyOn(Animated, 'loop');
    const view = render(<PortraitPreview uri="fighter" loading />);
    expect(loop).not.toHaveBeenCalled();
    expect(view.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('does not pulse or spin when idle', () => {
    const loop = jest.spyOn(Animated, 'loop');

    const { UNSAFE_queryByType } = render(
      <PortraitPreview uri="https://example.test/fighter.png" />,
    );

    expect(loop).not.toHaveBeenCalled();
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });
});

describe('frame rendering', () => {
  it('renders every purchased gradient stop instead of its first color', () => {
    const frame = presentationFor('founders_frame') as FramePresentation;
    const view = render(<PortraitPreview uri="fighter" frame={frame} />);
    expect(
      view.UNSAFE_getAllByType(Stop).map((stop) => stop.props.stopColor),
    ).toEqual(frame.colors);
  });

  it('reports image failures to the signing refresh owner', () => {
    const onImageError = jest.fn();
    const view = render(
      <PortraitPreview uri="expired" onImageError={onImageError} />,
    );
    fireEvent(view.getByLabelText('Character portrait'), 'error', {
      nativeEvent: { error: 'expired' },
    });
    expect(onImageError).toHaveBeenCalledTimes(1);
  });

  it('keeps the full fighter inside the measured opening, with art outside the mask', () => {
    const frame = presentationFor('astral_codex_frame') as FramePresentation;
    const view = render(
      <PortraitPreview
        uri="fighter"
        frame={frame}
        variant="fullBody"
        size={200}
      />,
    );
    const image = view.getByLabelText('Character portrait');
    expect(image.props.resizeMode).toBe('contain');
    const aperture = StyleSheet.flatten(
      view.getByTestId('frame-aperture').props.style,
    );
    expect(aperture.width).toBeCloseTo(200 * (1 - 0.1406 * 2));
    expect(aperture.height).toBeCloseTo(300 * (1 - 0.2324 - 0.2285));
    const overlay = view.getByTestId('frame-artwork', {
      includeHiddenElements: true,
    });
    expect(overlay.props.source).toEqual(frame.artwork?.portrait.source);
    // Bundled RN Images supply intrinsic width/height before caller styles;
    // absolute edges alone do not override a 1024x1536 source on iOS.
    expect(StyleSheet.flatten(overlay.props.style)).toMatchObject({
      width: 200,
      height: 300,
    });
    expect(
      view.getByTestId('frame-artwork-overlay', { includeHiddenElements: true })
        .props.pointerEvents,
    ).toBe('none');
    expect(overlay.props.accessible).toBe(false);
    expect(view.UNSAFE_getAllByType(Image)).toHaveLength(2);
  });
});

it.each([
  'astral_codex_frame',
  'emberforge_frame',
  'neon_circuit_frame',
  'laureate_frame',
])('uses a dedicated safe circular overlay at small sizes for %s', (slug) => {
  const frame = presentationFor(slug) as FramePresentation;
  const view = render(<PortraitPreview uri="avatar" frame={frame} size={48} />);
  expect(
    view.getByTestId('frame-artwork', { includeHiddenElements: true }).props
      .source,
  ).toEqual(frame.artwork?.avatar.source);
  expect(
    StyleSheet.flatten(
      view.getByTestId('frame-artwork', {
        includeHiddenElements: true,
      }).props.style,
    ),
  ).toMatchObject({ width: 48, height: 48 });
  const image = view.getByLabelText('Character portrait');
  expect(image.props.resizeMode).toBe('contain');
  const aperture = StyleSheet.flatten(
    view.getByTestId('frame-aperture').props.style,
  );
  expect(aperture.width).toBeCloseTo(
    48 * (1 - frame.artwork!.avatar.insets.left * 2),
  );
  expect(aperture.height).toBe(aperture.width);
});

it('preserves the original single-color border', () => {
  const frame = presentationFor('classic_frame') as FramePresentation;
  const view = render(<PortraitPreview uri="avatar" frame={frame} />);
  expect(
    StyleSheet.flatten(view.getByTestId('frame-solid').props.style),
  ).toMatchObject({ borderColor: '#8B8699', borderWidth: 3 });
  expect(view.UNSAFE_queryAllByType(Stop)).toHaveLength(0);
});
