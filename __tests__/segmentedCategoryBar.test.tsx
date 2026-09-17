import { contrastRatio } from '@/utils/contrast';
import { GameBevel } from '@/components/game';
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SegmentedCategoryBar, {
  SegmentedCategoryItem,
} from '@/components/SegmentedCategoryBar';
import { hapticSelection } from '@/utils/haptics';

jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

const ReactNative =
  jest.requireActual<typeof import('react-native')>('react-native');
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

const items: SegmentedCategoryItem[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'traits', label: 'Traits', badge: true },
  { key: 'portrait', label: 'Portrait' },
];

describe('SegmentedCategoryBar', () => {
  beforeEach(() => {
    (hapticSelection as jest.Mock).mockClear();
  });

  it('renders every segment as a selectable tab', () => {
    const { getByLabelText } = render(
      <SegmentedCategoryBar
        items={items}
        value="identity"
        onChange={() => {}}
      />,
    );
    for (const item of items) {
      expect(getByLabelText(item.label)).toBeTruthy();
    }
  });

  it('exposes the bar as a tablist of three tabs', () => {
    const { UNSAFE_queryAllByProps, getAllByRole } = render(
      <SegmentedCategoryBar
        items={items}
        value="identity"
        onChange={() => {}}
      />,
    );
    // The bar is a plain View (not `accessible`, or it would swallow its tabs
    // for VoiceOver), so RNTL's role query cannot see it; match the prop.
    expect(
      UNSAFE_queryAllByProps({ accessibilityRole: 'tablist' }).length,
    ).toBeGreaterThan(0);
    expect(getAllByRole('tab')).toHaveLength(3);
  });

  it('marks the active segment as selected', () => {
    const { getByLabelText } = render(
      <SegmentedCategoryBar items={items} value="traits" onChange={() => {}} />,
    );
    expect(getByLabelText('Traits').props.accessibilityState.selected).toBe(
      true,
    );
    expect(getByLabelText('Identity').props.accessibilityState.selected).toBe(
      false,
    );
  });

  it('fires onChange with the tapped segment key', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <SegmentedCategoryBar
        items={items}
        value="identity"
        onChange={onChange}
      />,
    );
    fireEvent.press(getByLabelText('Portrait'));
    expect(onChange).toHaveBeenCalledWith('portrait');
  });

  it('ticks a haptic only when the selection actually changes', () => {
    const { getByLabelText } = render(
      <SegmentedCategoryBar
        items={items}
        value="identity"
        onChange={() => {}}
      />,
    );
    fireEvent.press(getByLabelText('Identity'));
    expect(hapticSelection).not.toHaveBeenCalled();
    fireEvent.press(getByLabelText('Portrait'));
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });
});

test('large-text categories stack full labels and use readable selected ink', () => {
  const dimensions = jest
    .spyOn(ReactNative, 'useWindowDimensions')
    .mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 3.1 });
  const onChange = jest.fn();
  const view = render(
    <SegmentedCategoryBar items={items} value="identity" onChange={onChange} />,
  );
  const selected = view.getByLabelText('Identity');
  const selectedStyle = ReactNative.StyleSheet.flatten(selected.props.style);
  expect(selectedStyle.minHeight).toBeGreaterThanOrEqual(48);
  expect(selectedStyle.flex).toBe(0);
  for (const item of items)
    expect(view.getByText(item.label).props.numberOfLines).toBeUndefined();
  const fill = selected.findByType(GameBevel).props.fill;
  const ink = ReactNative.StyleSheet.flatten(
    view.getByText('Identity').props.style,
  ).color;
  expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(4.5);
  expect(view.getByLabelText('Traits').props.accessibilityHint).toBe(
    'Contains unsaved changes',
  );
  fireEvent.press(view.getByLabelText('Portrait'));
  expect(onChange).toHaveBeenCalledWith('portrait');
  dimensions.mockRestore();
});
