/**
 * The colour note has to match what the shop actually does: owning a colour
 * unlocks a swatch in Edit character. It must not suggest the shop applies it.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import CosmeticPreview from '@/components/CosmeticPreview';
import { NO_COSMETICS } from '@/utils/cosmetics';
import { presentationFor } from '@/constants/Cosmetics';

const baseProps = {
  portraitUri: 'https://example.test/fighter.jpg',
  characterName: 'Golota',
  signatureColor: '#3B82F6',
  equipped: NO_COSMETICS,
};

describe('CosmeticPreview', () => {
  it('explains that a colour unlocks a swatch in Edit character', () => {
    const { getByText } = render(
      <CosmeticPreview
        {...baseProps}
        preview={presentationFor('crimson_color')}
      />,
    );
    getByText(
      'Owning a colour unlocks it as a signature colour swatch in Edit character.',
    );
  });

  it('flags reveal styles as not in the game yet', () => {
    const { getByText } = render(
      <CosmeticPreview
        {...baseProps}
        preview={presentationFor('noir_reveal')}
      />,
    );
    getByText("Reveal styles aren't in the game yet.");
  });

  it('shows no note for a frame', () => {
    const { queryByText } = render(
      <CosmeticPreview
        {...baseProps}
        preview={presentationFor('gold_frame')}
      />,
    );
    expect(queryByText(/signature colour swatch/)).toBeNull();
    expect(queryByText(/Reveal styles/)).toBeNull();
  });

  it('labels the portrait as the player wearing the selection', () => {
    const { getByLabelText } = render(
      <CosmeticPreview
        {...baseProps}
        preview={presentationFor('gold_frame')}
      />,
    );
    getByLabelText('Golota wearing the selected cosmetic');
  });
});
