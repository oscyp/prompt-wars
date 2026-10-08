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

test('reveals the selected Gear tab after the rail becomes horizontally scrollable', () => {
  const scrollTo = jest
    .spyOn(ReactNative.ScrollView.prototype, 'scrollTo')
    .mockImplementation(() => {});
  const ui = render(
    <EditorTabs
      value="gear"
      dirty={{ look: false, identity: false, gear: false }}
      onChange={jest.fn()}
    />,
  );
  try {
    fireEvent(ui.UNSAFE_getByType(ReactNative.ScrollView), 'layout', {
      nativeEvent: { layout: { width: 320, height: 80 } },
    });
    fireEvent(ui.getByRole('tab', { name: 'Gear' }), 'layout', {
      nativeEvent: { layout: { x: 440, width: 180, height: 80 } },
    });
    expect(scrollTo).toHaveBeenCalledWith({ x: 316, animated: false });
  } finally {
    ui.unmount();
    scrollTo.mockRestore();
  }
});
test('footer preserves independent save and review actions without a price', () => {
  const onSave = jest.fn(),
    onRender = jest.fn();
  const view = render(
    <EditorFooter
      status="Unsaved changes"
      renderLabel="Review & draw"
      saveDisabled={false}
      renderDisabled
      onSave={onSave}
      onRender={onRender}
    />,
  );
  fireEvent.press(view.getByRole('button', { name: 'Save changes' }));
  expect(onSave).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByRole('button', { name: 'Review & draw' }));
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
  expect(view.queryByText(/current artwork/i)).toBeNull();
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
        status="Unsaved changes"
        renderLabel="Review & draw"
        saveDisabled
        renderDisabled={false}
        onSave={jest.fn()}
        onRender={jest.fn()}
      />,
    );
    for (const name of ['Save changes', 'Review & draw']) {
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

test('typing footer dismisses keyboard without saving or drawing', () => {
  const dismiss = jest.spyOn(ReactNative.Keyboard, 'dismiss');
  const onSave = jest.fn(),
    onRender = jest.fn();
  const view = render(
    <EditorFooter
      status="Unsaved changes"
      renderLabel="Review & draw"
      saveDisabled={false}
      renderDisabled={false}
      keyboardVisible
      onSave={onSave}
      onRender={onRender}
    />,
  );
  expect(view.queryByRole('button', { name: 'Review & draw' })).toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Done' }));
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(onSave).not.toHaveBeenCalled();
  expect(onRender).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Save changes' }));
  expect(onSave).toHaveBeenCalledTimes(1);
  dismiss.mockRestore();
});

test('large text keyboard footer keeps Save and Done side by side and omits verbose status', () => {
  const dimensions = jest
    .spyOn(ReactNative, 'useWindowDimensions')
    .mockReturnValue({ width: 375, height: 812, scale: 3, fontScale: 2.14 });
  const view = render(
    <EditorFooter
      keyboardVisible
      status="2 included draws remaining"
      renderLabel="Review & draw"
      saveDisabled={false}
      renderDisabled={false}
      onSave={jest.fn()}
      onRender={jest.fn()}
    />,
  );
  try {
    const save = view.getByRole('button', { name: 'Save changes' });
    const done = view.getByRole('button', { name: 'Done' });
    expect(ReactNative.StyleSheet.flatten(save.props.style).flex).toBe(2);
    expect(ReactNative.StyleSheet.flatten(done.props.style).flex).toBe(1);
    expect(view.queryByText('2 included draws remaining')).toBeNull();
  } finally {
    view.unmount();
    dimensions.mockRestore();
  }
});
