import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ItemGrid from '@/components/ItemGrid';
import { hapticSelection } from '@/utils/haptics';
import type { CatalogSignatureItem } from '@/utils/characters';

jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

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

const ITEMS = [LUCKY_COIN, WRENCH];

describe('ItemGrid', () => {
  beforeEach(() => {
    (hapticSelection as jest.Mock).mockClear();
  });

  it('marks the equipped tile selected and names its class in the label', () => {
    const { getByLabelText } = render(
      <ItemGrid items={ITEMS} selectedId="coin" onSelect={jest.fn()} />,
    );
    const tile = getByLabelText('Signature item: Lucky Coin, Relic');
    expect(tile.props.accessibilityState.selected).toBe(true);
    expect(tile.props.accessibilityState.expanded).toBeUndefined();
  });

  it('marks the previewing tile expanded but not selected', () => {
    const { getByLabelText } = render(
      <ItemGrid
        items={ITEMS}
        selectedId="coin"
        previewId="wrench"
        onSelect={jest.fn()}
      />,
    );
    const tile = getByLabelText('Signature item: Wrench, Tool');
    expect(tile.props.accessibilityState.expanded).toBe(true);
    expect(tile.props.accessibilityState.selected).toBe(false);
  });

  it('never reads a tile as previewing when it is the equipped one', () => {
    // The panel passes the equipped id as previewId when its sheet opens on
    // the equipped tile; that tile must stay "selected", not flip to expanded.
    const { getByLabelText } = render(
      <ItemGrid
        items={ITEMS}
        selectedId="coin"
        previewId="coin"
        onSelect={jest.fn()}
      />,
    );
    const tile = getByLabelText('Signature item: Lucky Coin, Relic');
    expect(tile.props.accessibilityState.selected).toBe(true);
    expect(tile.props.accessibilityState.expanded).toBeUndefined();
  });

  it('shows the class under the name', () => {
    const { getByText } = render(
      <ItemGrid items={ITEMS} selectedId="coin" onSelect={jest.fn()} />,
    );
    expect(getByText('Relic')).toBeTruthy();
    expect(getByText('Tool')).toBeTruthy();
  });

  it('reports the tapped item and ticks', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <ItemGrid items={ITEMS} selectedId="coin" onSelect={onSelect} />,
    );
    fireEvent.press(getByLabelText('Signature item: Wrench, Tool'));
    expect(onSelect).toHaveBeenCalledWith('wrench');
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it('shows the Create tile only when a handler is supplied', () => {
    const onCreateCustom = jest.fn();
    const withTile = render(
      <ItemGrid
        items={ITEMS}
        selectedId="coin"
        onSelect={jest.fn()}
        onCreateCustom={onCreateCustom}
      />,
    );
    fireEvent.press(withTile.getByLabelText('Create your own signature item'));
    expect(onCreateCustom).toHaveBeenCalledTimes(1);

    const withoutTile = render(
      <ItemGrid items={ITEMS} selectedId="coin" onSelect={jest.fn()} />,
    );
    expect(
      withoutTile.queryByLabelText('Create your own signature item'),
    ).toBeNull();
  });
});
