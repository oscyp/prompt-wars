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

    const tile = getByLabelText('Signature item: Wrench, Tool');
    fireEvent.press(tile);

    const sheet = within(getByTestId(SHEET));
    expect(sheet.getByText('Wrench')).toBeTruthy();
    expect(
      sheet.getByText('Loosens anything, including arguments.'),
    ).toBeTruthy();
    expect(
      getByLabelText('Signature item: Wrench, Tool').props.accessibilityState
        .expanded,
    ).toBe(true);
  });

  it('stages the chosen item and closes the sheet', () => {
    const { getByLabelText, queryByTestId, props } = renderPanel();
    fireEvent.press(getByLabelText('Signature item: Wrench, Tool'));
    fireEvent.press(getByLabelText('Choose Wrench'));

    expect(props.onEquip).toHaveBeenCalledWith('wrench');
    expect(queryByTestId(SHEET)).toBeNull();
    expect(
      getByLabelText('Signature item: Wrench, Tool').props.accessibilityState
        .expanded,
    ).toBeUndefined();
  });

  it('opens the equipped tile in the Equipped state', () => {
    const { getByLabelText, getByTestId, queryByLabelText } = renderPanel();
    fireEvent.press(getByLabelText('Signature item: Lucky Coin, Relic'));

    const sheet = within(getByTestId(SHEET));
    expect(sheet.getByText('Equipped')).toBeTruthy();
    expect(queryByLabelText('Choose Lucky Coin')).toBeNull();
  });

  it('shows only predefined catalogue items', () => {
    const { queryByLabelText, queryByText } = renderPanel();
    expect(
      queryByLabelText('Signature item: Rubber Duck, Weaponized Mundane'),
    ).toBeNull();
    expect(queryByText('Your items')).toBeNull();
    expect(queryByLabelText('Create your own signature item')).toBeNull();
  });

  it('closes without staging when dismissed', () => {
    const { getByLabelText, queryByTestId, props } = renderPanel();
    fireEvent.press(getByLabelText('Signature item: Wrench, Tool'));
    fireEvent.press(getByLabelText('Close'));
    expect(props.onEquip).not.toHaveBeenCalled();
    expect(queryByTestId(SHEET)).toBeNull();
  });

  it('ignores tile taps while a save is in flight', () => {
    const { getByLabelText, queryByTestId } = renderPanel({ busy: true });
    fireEvent.press(getByLabelText('Signature item: Wrench, Tool'));
    expect(queryByTestId(SHEET)).toBeNull();
  });

  it('spells the catalogue the way the heading does', () => {
    const { getByPlaceholderText, getByLabelText } = renderPanel();
    expect(getByPlaceholderText('Search the catalogue')).toBeTruthy();
    expect(getByLabelText('Search the item catalogue')).toBeTruthy();
  });
});
