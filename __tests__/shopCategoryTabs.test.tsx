import React from 'react';
import { Dimensions, ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ShopCategoryTabs } from '@/components/shop/ShopCategoryTabs';

it('exposes controlled native tabs with full labels and 48 point targets', () => {
  const onChange = jest.fn();
  const screen = render(<ShopCategoryTabs value="frame" onChange={onChange} />);
  screen.UNSAFE_getByProps({ accessibilityRole: 'tablist' });
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  for (const tab of screen.getAllByRole('tab'))
    expect(
      StyleSheet.flatten(tab.props.style).minHeight,
    ).toBeGreaterThanOrEqual(48);
  fireEvent.press(screen.getByRole('tab', { name: 'Colours' }));
  expect(onChange).toHaveBeenCalledWith('color');
  expect(
    screen.getByRole('tab', { name: 'Frames' }).props.accessibilityState
      .selected,
  ).toBe(true);
});

it('reveals the selected tab after selecting it and resizing the viewport', () => {
  const scrollTo = jest
    .spyOn(ScrollView.prototype, 'scrollTo')
    .mockImplementation(() => {});
  const onChange = jest.fn();
  const screen = render(<ShopCategoryTabs value="frame" onChange={onChange} />);
  fireEvent(screen.getByTestId('shop-category-scroll'), 'layout', {
    nativeEvent: { layout: { width: 220 } },
  });
  fireEvent(screen.getByRole('tab', { name: 'Colours' }), 'layout', {
    nativeEvent: { layout: { x: 320, width: 90 } },
  });
  screen.rerender(<ShopCategoryTabs value="color" onChange={onChange} />);
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 255, animated: true });
  fireEvent(screen.getByTestId('shop-category-scroll'), 'layout', {
    nativeEvent: { layout: { width: 180 } },
  });
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 275, animated: true });
  scrollTo.mockRestore();
});

it('rechecks selected-tab visibility when native text scale changes', () => {
  const original = Dimensions.get('window');
  const scrollTo = jest
    .spyOn(ScrollView.prototype, 'scrollTo')
    .mockImplementation(() => {});
  const screen = render(
    <ShopCategoryTabs value="color" onChange={jest.fn()} />,
  );
  fireEvent(screen.getByTestId('shop-category-scroll'), 'layout', {
    nativeEvent: { layout: { width: 350 } },
  });
  fireEvent(screen.getByRole('tab', { name: 'Colours' }), 'layout', {
    nativeEvent: { layout: { x: 320, width: 90 } },
  });
  scrollTo.mockClear();
  act(() =>
    Dimensions.set({
      window: { ...original, fontScale: original.fontScale + 0.5 },
    }),
  );
  expect(scrollTo).toHaveBeenCalledWith({ x: 190, animated: true });
  screen.unmount();
  act(() => Dimensions.set({ window: original }));
  scrollTo.mockRestore();
});
