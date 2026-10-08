import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import EditorArtStyles from '@/components/edit-character/EditorArtStyles';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

test('written mode keeps every style available through its current-style row', () => {
  const onChange = jest.fn();
  const view = render(
    <EditorArtStyles compact value="comic" onChange={onChange} />,
  );
  fireEvent.press(view.getByLabelText('View art styles, Comic Book'));
  const options = view
    .getAllByRole('button')
    .filter((button) =>
      button.props.accessibilityLabel?.startsWith('Art style:'),
    );
  expect(options).toHaveLength(8);
  fireEvent.press(view.getByLabelText('Art style: Painterly'));
  expect(onChange).toHaveBeenCalledWith('painterly');
  expect(view.queryByLabelText('Art style: Painterly')).toBeNull();
});

test('a style sheet remains readable and closeable when changes become locked', () => {
  const onChange = jest.fn();
  const view = render(
    <EditorArtStyles compact value="comic" onChange={onChange} />,
  );
  fireEvent.press(view.getByLabelText('View art styles, Comic Book'));
  view.rerender(
    <EditorArtStyles compact value="comic" onChange={onChange} disabled />,
  );
  const option = view.getByLabelText('Art style: Painterly');
  expect(option.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(option);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText('Done'));
  expect(view.queryByLabelText('Art style: Painterly')).toBeNull();
});
