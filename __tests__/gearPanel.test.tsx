import React from 'react';
import { render, fireEvent, within } from '@testing-library/react-native';
import GearPanel from '@/components/edit-character/GearPanel';
import type { CatalogSignatureItem } from '@/utils/characters';

jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const LUCKY_COIN: CatalogSignatureItem = {
  id: 'coin',
  name: 'Lucky Coin',
  description: 'A coin that always lands your way.',
  itemClass: 'relic',
};

const WRENCH: CatalogSignatureItem = {
  id: 'wrench',
  name: 'Wrench',
  description: 'Loosens anything, including arguments.',
  itemClass: 'tool',
};

const RUBBER_DUCK: CatalogSignatureItem = {
  id: 'duck',
  name: 'Rubber Duck',
  description: 'Squeaks at the decisive moment.',
  itemClass: 'weaponized_mundane',
  isCustom: true,
};

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof GearPanel>> = {},
) {
  const props = {
    items: [RUBBER_DUCK, LUCKY_COIN, WRENCH],
    equippedId: 'coin',
    loading: false,
    error: null,
    onRetry: jest.fn(),
    onEquip: jest.fn(),
    ...overrides,
  };
  return { ...render(<GearPanel {...props} />), props };
}

const SHEET = 'item-detail-sheet';

describe('GearPanel', () => {
  it('opens the tapped catalogue item in a sheet and highlights its tile', () => {
    const { getByLabelText, getByTestId, queryByTestId } = renderPanel();
    expect(queryByTestId(SHEET)).toBeNull();

    const tile = getByLabelText('Preview Wrench');
    fireEvent.press(tile);

    const sheet = within(getByTestId(SHEET));
    expect(sheet.getByText('Wrench')).toBeTruthy();
    expect(
      sheet.getByText('Loosens anything, including arguments.'),
    ).toBeTruthy();
    expect(getByLabelText('Use Wrench · Free')).toBeTruthy();
  });

  it('stages the chosen item and closes the sheet', () => {
    const { getByLabelText, queryByTestId, props } = renderPanel();
    fireEvent.press(getByLabelText('Preview Wrench'));
    fireEvent.press(getByLabelText('Use Wrench · Free'));

    expect(props.onEquip).toHaveBeenCalledWith('wrench');
    expect(queryByTestId(SHEET)).toBeNull();
  });

  it('opens the equipped tile in the Equipped state', () => {
    const { getByLabelText, getByTestId, queryByLabelText } = renderPanel();
    fireEvent.press(getByLabelText('Preview Lucky Coin'));

    const sheet = within(getByTestId(SHEET));
    expect(sheet.getByText('Selected')).toBeTruthy();
    expect(queryByLabelText('Use Lucky Coin · Free')).toBeNull();
  });

  it('shows only predefined catalogue items', () => {
    const { queryByLabelText, queryByText } = renderPanel();
    expect(queryByLabelText('Preview Rubber Duck')).toBeNull();
    expect(queryByText('Your items')).toBeNull();
    expect(queryByLabelText('Create your own signature item')).toBeNull();
  });

  it('closes without staging when dismissed', () => {
    const { getByLabelText, queryByTestId, props } = renderPanel();
    fireEvent.press(getByLabelText('Preview Wrench'));
    fireEvent.press(getByLabelText('Close item details'));
    expect(props.onEquip).not.toHaveBeenCalled();
    expect(queryByTestId(SHEET)).toBeNull();
  });

  it('ignores tile taps while a save is in flight', () => {
    const { getByLabelText, queryByTestId } = renderPanel({ busy: true });
    fireEvent.press(getByLabelText('Preview Wrench'));
    expect(queryByTestId(SHEET)).toBeNull();
  });

  it('spells the catalogue the way the heading does', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      ...WRENCH,
      id: `item-${index}`,
      name: `Item ${index}`,
    }));
    const { getByText, getByPlaceholderText, getByLabelText } = renderPanel({
      items,
      equippedId: 'item-0',
    });

    fireEvent.press(getByText('Browse all 8 items'));
    expect(getByPlaceholderText('Search the catalogue')).toBeTruthy();
    expect(getByLabelText('Search the item catalogue')).toBeTruthy();
  });

  it('shows two catalogue rows before asking the player to browse all', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      ...WRENCH,
      id: `item-${index}`,
      name: `Item ${index}`,
    }));
    const {
      getByText,
      getByLabelText,
      queryByLabelText,
      queryByPlaceholderText,
    } = renderPanel({ items, equippedId: 'item-0' });

    expect(getByLabelText('Preview Item 5')).toBeTruthy();
    expect(queryByLabelText('Preview Item 6')).toBeNull();
    expect(queryByPlaceholderText('Search the catalogue')).toBeNull();

    fireEvent.press(getByText('Browse all 8 items'));
    expect(getByLabelText('Preview Item 7')).toBeTruthy();
  });
});
