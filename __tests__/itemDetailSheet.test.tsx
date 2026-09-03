import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ItemDetailSheet from '@/components/edit-character/ItemDetailSheet';
import type { CatalogSignatureItem } from '@/utils/characters';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const LUCKY_COIN: CatalogSignatureItem = {
  id: 'coin',
  name: 'Lucky Coin',
  description: 'A coin that always lands your way.',
  itemClass: 'relic',
};

const RUBBER_DUCK: CatalogSignatureItem = {
  id: 'duck',
  name: 'Rubber Duck',
  description: 'Squeaks at the decisive moment.',
  itemClass: 'weaponized_mundane',
  isCustom: true,
};

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof ItemDetailSheet>> = {},
) {
  const props = {
    visible: true,
    item: LUCKY_COIN,
    equipped: false,
    onChoose: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { ...render(<ItemDetailSheet {...props} />), props };
}

describe('ItemDetailSheet', () => {
  it('shows the name, class and description', () => {
    const { getByText } = renderSheet();
    expect(getByText('Lucky Coin')).toBeTruthy();
    expect(getByText('Relic')).toBeTruthy();
    expect(getByText('A coin that always lands your way.')).toBeTruthy();
    expect(getByText('Applied when you save.')).toBeTruthy();
  });

  it('chooses the item by id', () => {
    const { getByLabelText, props } = renderSheet();
    fireEvent.press(getByLabelText('Choose Lucky Coin'));
    expect(props.onChoose).toHaveBeenCalledWith('coin');
  });

  it('reads Equipped for the staged item and does nothing on press', () => {
    const { getByText, queryByLabelText, props } = renderSheet({
      equipped: true,
    });
    const button = getByText('Equipped');
    expect(queryByLabelText('Choose Lucky Coin')).toBeNull();
    fireEvent.press(button);
    expect(props.onChoose).not.toHaveBeenCalled();
  });

  it('does not choose while disabled', () => {
    const { getByLabelText, props } = renderSheet({ disabled: true });
    fireEvent.press(getByLabelText('Choose Lucky Coin'));
    expect(props.onChoose).not.toHaveBeenCalled();
  });

  it('credits the player for their own items', () => {
    const { getByText, queryByText } = renderSheet({ item: RUBBER_DUCK });
    expect(getByText('Your creation')).toBeTruthy();
    expect(getByText('Weaponized Mundane')).toBeTruthy();
    expect(queryByText('Relic')).toBeNull();
  });

  it('closes from the close button', () => {
    const { getByLabelText, props } = renderSheet();
    fireEvent.press(getByLabelText('Close'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders no item while hidden', () => {
    const { queryByText } = renderSheet({ visible: false });
    expect(queryByText('Lucky Coin')).toBeNull();
  });

  it('tolerates a null item while hidden', () => {
    const { queryByText } = renderSheet({ visible: false, item: null });
    expect(queryByText('Applied when you save.')).toBeNull();
  });
});
