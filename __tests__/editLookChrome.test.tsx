import React from 'react';
import * as ReactNative from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import {
  EditorTabs,
  EditorFooter,
  EditorPreview,
} from '@/components/edit-character/EditorChrome';
import { NO_COSMETICS } from '@/utils/cosmetics';
jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

test('category rail keeps labels, selected state and unsaved indicators accessible', () => {
  const onChange = jest.fn();
  const view = render(
    <EditorTabs
      value="look"
      dirty={{ look: true, identity: false, gear: false }}
      onChange={onChange}
    />,
  );
  expect(
    view.getByRole('tab', { name: 'Look' }).props.accessibilityState.selected,
  ).toBe(true);
  expect(
    view.getByRole('tab', { name: 'Look' }).props.accessibilityHint,
  ).toContain('Unsaved');
  fireEvent.press(view.getByRole('tab', { name: 'Gear' }));
  expect(onChange).toHaveBeenCalledWith('gear');
});
test('footer preserves independent free save and priced draw actions', () => {
  const onSave = jest.fn(),
    onRender = jest.fn();
  const view = render(
    <EditorFooter
      status="Unsaved changes"
      renderLabel="Review & draw · 7 credits"
      saveDisabled={false}
      renderDisabled
      onSave={onSave}
      onRender={onRender}
    />,
  );
  fireEvent.press(view.getByRole('button', { name: 'Save changes · Free' }));
  expect(onSave).toHaveBeenCalledTimes(1);
  fireEvent.press(
    view.getByRole('button', { name: 'Review & draw · 7 credits' }),
  );
  expect(onRender).not.toHaveBeenCalled();
});
test('compact fighter keeps explicit preview and history actions', () => {
  const onView = jest.fn(),
    onHistory = jest.fn();
  const view = render(
    <EditorPreview
      name="Żaneta 星"
      archetype="mystic"
      avatarUri={null}
      cosmetics={NO_COSMETICS}
      accentColor="#ad76df"
      onView={onView}
      onHistory={onHistory}
    />,
  );
  expect(view.getByText('Current artwork')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'View card' }));
  expect(onView).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByRole('button', { name: 'Previous looks' }));
  expect(onHistory).toHaveBeenCalledTimes(1);
});

test('stacked accessibility footer actions keep intrinsic text height', () => {
  const dimensions = jest
    .spyOn(ReactNative, 'useWindowDimensions')
    .mockReturnValue({ width: 375, height: 812, scale: 3, fontScale: 1.79 });
  let view: ReturnType<typeof render> | undefined;
  try {
    view = render(
      <EditorFooter
        status="Current artwork"
        renderLabel="Draw another version · 3 credits"
        saveDisabled
        renderDisabled={false}
        onSave={jest.fn()}
        onRender={jest.fn()}
      />,
    );
    for (const name of [
      'Save changes · Free',
      'Draw another version · 3 credits',
    ]) {
      const button = view.getByRole('button', { name });
      const flat = ReactNative.StyleSheet.flatten(button.props.style);
      expect(flat.flex ?? 0).toBe(0);
      expect(flat.minHeight).toBeGreaterThanOrEqual(48);
    }
  } finally {
    view?.unmount();
    dimensions.mockRestore();
  }
});
