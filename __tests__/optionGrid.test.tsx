import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import OptionGrid, { type OptionGridOption } from '@/components/OptionGrid';
import { hapticSelection } from '@/utils/haptics';

jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

const OPTIONS: OptionGridOption[] = [
  {
    value: 'heroic',
    label: 'Heroic',
    description: 'Noble stance, bright resolve.',
  },
  { value: 'sinister', label: 'Sinister', description: 'Shadowed menace.' },
  { value: 'regal', label: 'Regal' },
];

describe('OptionGrid', () => {
  beforeEach(() => {
    (hapticSelection as jest.Mock).mockClear();
  });

  it('labels every card with the group name for a screen reader', () => {
    const { getByLabelText } = render(
      <OptionGrid
        label="Vibe"
        options={OPTIONS}
        value="heroic"
        onChange={jest.fn()}
      />,
    );
    expect(getByLabelText('Vibe: Heroic')).toBeTruthy();
    expect(getByLabelText('Vibe: Sinister')).toBeTruthy();
    expect(getByLabelText('Vibe: Regal')).toBeTruthy();
  });

  it('exposes the chosen card as selected and checked, and only that one', () => {
    const { getByLabelText } = render(
      <OptionGrid
        label="Vibe"
        options={OPTIONS}
        value="sinister"
        onChange={jest.fn()}
      />,
    );
    const chosen = getByLabelText('Vibe: Sinister').props.accessibilityState;
    expect(chosen.selected).toBe(true);
    expect(chosen.checked).toBe(true);
    const other = getByLabelText('Vibe: Heroic').props.accessibilityState;
    expect(other.selected).toBe(false);
    expect(other.checked).toBe(false);
  });

  it('reports the tapped value and ticks', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <OptionGrid
        label="Vibe"
        options={OPTIONS}
        value="heroic"
        onChange={onChange}
      />,
    );
    fireEvent.press(getByLabelText('Vibe: Regal'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('regal');
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it('blocks taps while disabled and reads the reason as the hint', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <OptionGrid
        label="Vibe"
        options={OPTIONS}
        value="heroic"
        onChange={onChange}
        disabled
        disabledReason="Available in 3h"
      />,
    );
    const card = getByLabelText('Vibe: Sinister');
    fireEvent.press(card);
    expect(onChange).not.toHaveBeenCalled();
    expect(card.props.accessibilityHint).toBe('Available in 3h');
    expect(card.props.accessibilityState.disabled).toBe(true);
  });

  it('renders each description in full and reads it as the hint', () => {
    const { getByText, getByLabelText } = render(
      <OptionGrid
        label="Vibe"
        options={OPTIONS}
        value="heroic"
        onChange={jest.fn()}
      />,
    );
    expect(getByText('Noble stance, bright resolve.')).toBeTruthy();
    expect(getByLabelText('Vibe: Heroic').props.accessibilityHint).toBe(
      'Noble stance, bright resolve.',
    );
  });

  it('is headerless unless a title is passed', () => {
    const headerless = render(
      <OptionGrid
        label="Vibe"
        options={OPTIONS}
        value="heroic"
        onChange={jest.fn()}
      />,
    );
    // Inside EditCardShell the card draws the title; a second one is the
    // duplicate-title bug this control exists to avoid.
    expect(headerless.queryByText('Vibe')).toBeNull();

    const titled = render(
      <OptionGrid
        title="Vibe"
        label="Vibe"
        options={OPTIONS}
        value="heroic"
        onChange={jest.fn()}
      />,
    );
    expect(titled.getByText('Vibe').props.accessibilityRole).toBe('header');
  });

  it('selects nothing for an undefined value and never fires on mount', () => {
    // Onboarding's auto-render effect fires once all five traits are set, so a
    // synthesised default here would draw a portrait nobody asked for.
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <OptionGrid
        label="Vibe"
        options={OPTIONS}
        value={undefined}
        onChange={onChange}
      />,
    );
    for (const option of OPTIONS) {
      expect(
        getByLabelText(`Vibe: ${option.label}`).props.accessibilityState
          .selected,
      ).toBe(false);
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(hapticSelection).not.toHaveBeenCalled();
  });
});
