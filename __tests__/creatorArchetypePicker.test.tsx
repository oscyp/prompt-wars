import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CreatorArchetypePicker from '@/components/character/CreatorArchetypePicker';
import { ARCHETYPE_LIST } from '@/constants/Archetypes';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
it('starts unselected, exposes every preset in the sheet, and only stages an explicit choice', () => {
  const change = jest.fn();
  const view = render(
    <CreatorArchetypePicker value={null} onChange={change} />,
  );
  expect(change).not.toHaveBeenCalled();
  expect(view.queryAllByRole('radio')).toHaveLength(0);
  fireEvent.press(view.getByRole('button', { name: 'Choose archetype' }));
  expect(view.getAllByRole('radio')).toHaveLength(ARCHETYPE_LIST.length);
  for (const option of ARCHETYPE_LIST) {
    expect(view.getByText(option.description)).toBeTruthy();
    expect(
      view.getByLabelText(`Archetype: ${option.name}`).props.accessibilityState
        .selected,
    ).toBe(false);
  }
  fireEvent.press(view.getByLabelText('Archetype: The Mystic'));
  expect(change).toHaveBeenCalledWith('mystic');
  expect(view.queryAllByRole('radio')).toHaveLength(0);
});
