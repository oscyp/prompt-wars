import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ColorSwatchGrid, {
  withCustomOption,
  selectedValueForHex,
  type ColorSwatchOption,
} from '@/components/ColorSwatchGrid';

const OPTIONS: ColorSwatchOption[] = [
  { value: 'ember', label: 'Ember', hex: '#F97316' },
  { value: 'ocean', label: 'Ocean', hex: '#0EA5E9' },
];

describe('withCustomOption', () => {
  it('leaves the presets alone when the colour matches one', () => {
    expect(withCustomOption(OPTIONS, '#F97316')).toHaveLength(2);
  });

  it('matches a preset regardless of hex casing', () => {
    expect(withCustomOption(OPTIONS, '#f97316')).toHaveLength(2);
  });

  it('appends a Custom swatch for a colour with no preset', () => {
    // A legacy character used to render with nothing selected at all.
    const result = withCustomOption(OPTIONS, '#123456');
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({
      value: '#123456',
      label: 'Custom',
      hex: '#123456',
    });
  });

  it('ignores a value that is not a hex colour', () => {
    expect(withCustomOption(OPTIONS, 'not-a-colour')).toHaveLength(2);
  });
});

describe('selectedValueForHex', () => {
  it('maps a stored hex back to its option value', () => {
    expect(selectedValueForHex(OPTIONS, '#0EA5E9')).toBe('ocean');
  });

  it('returns null for an unknown colour', () => {
    expect(selectedValueForHex(OPTIONS, '#000000')).toBeNull();
  });
});

describe('ColorSwatchGrid', () => {
  it('marks the selected swatch as selected for a screen reader', () => {
    const { getByLabelText } = render(
      <ColorSwatchGrid
        groupLabel="Signature colour"
        options={OPTIONS}
        value="ocean"
        onChange={jest.fn()}
      />,
    );
    expect(
      getByLabelText('Signature colour: Ocean').props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      getByLabelText('Signature colour: Ember').props.accessibilityState
        .selected,
    ).toBe(false);
  });

  it('reports the selected colour by name, not by border alone', () => {
    const { getByText } = render(
      <ColorSwatchGrid
        groupLabel="Signature colour"
        options={OPTIONS}
        value="ember"
        onChange={jest.fn()}
      />,
    );
    expect(getByText('Ember')).toBeTruthy();
  });

  it('does not stage a change while on cooldown', () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText } = render(
      <ColorSwatchGrid
        groupLabel="Outfit palette"
        options={OPTIONS}
        value="ember"
        onChange={onChange}
        disabled
        disabledReason="Available in 3h"
      />,
    );
    fireEvent.press(getByLabelText('Outfit palette: Ocean'));
    expect(onChange).not.toHaveBeenCalled();
    expect(getByText('Available in 3h')).toBeTruthy();
  });
});
