import React from 'react';
import { Image } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import EditorItemArt from '@/components/edit-character/EditorItemArt';
import type { CatalogSignatureItem } from '@/utils/characters';

const legacy: CatalogSignatureItem = {
  id: 'legacy',
  name: 'Compass',
  description: 'My own compass',
  itemClass: 'tool',
  isCustom: true,
  iconUrl: 'https://example.com/my-compass.png',
};

describe('signature item artwork', () => {
  it('retains custom artwork even when its name matches a bundled item', () => {
    const ui = render(<EditorItemArt item={legacy} />);
    expect(ui.UNSAFE_getByType(Image).props.source).toEqual({
      uri: legacy.iconUrl,
    });
  });

  it('retries the same failed image without changing the item or invoking selection', () => {
    const onError = jest.fn();
    const ui = render(
      <EditorItemArt item={legacy} onError={onError} retryKey={0} />,
    );
    fireEvent(ui.UNSAFE_getByType(Image), 'error');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(ui.UNSAFE_queryByType(Image)).toBeNull();
    ui.rerender(<EditorItemArt item={legacy} onError={onError} retryKey={1} />);
    expect(ui.UNSAFE_getByType(Image).props.source).toEqual({
      uri: legacy.iconUrl,
    });
  });

  it('loads a refreshed signed URL after the prior URL fails', () => {
    const ui = render(<EditorItemArt item={legacy} />);
    fireEvent(ui.UNSAFE_getByType(Image), 'error');
    ui.rerender(
      <EditorItemArt
        item={{ ...legacy, iconUrl: 'https://example.com/refreshed.png' }}
      />,
    );
    expect(ui.UNSAFE_getByType(Image).props.source).toEqual({
      uri: 'https://example.com/refreshed.png',
    });
  });
});
