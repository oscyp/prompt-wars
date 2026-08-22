import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SegmentedCategoryBar, {
  SegmentedCategoryItem,
} from '@/components/SegmentedCategoryBar';

const items: SegmentedCategoryItem[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'traits', label: 'Traits', badge: true },
  { key: 'portrait', label: 'Portrait' },
];

describe('SegmentedCategoryBar', () => {
  it('renders every segment as a selectable tab', () => {
    const { getByLabelText } = render(
      <SegmentedCategoryBar items={items} value="identity" onChange={() => {}} />,
    );
    for (const item of items) {
      expect(getByLabelText(item.label)).toBeTruthy();
    }
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
});
