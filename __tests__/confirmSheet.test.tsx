import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ConfirmSheet from '@/components/sheets/ConfirmSheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const baseProps = {
  visible: true,
  title: 'Draw this look?',
  subtitle: 'Redraws your fighter and avatar together.',
  lines: ['Saves your changes first:', 'Era: Cyberpunk'],
  rows: [
    { label: 'Price' as const, value: '3 credits' },
    { label: 'Balance' as const, value: '7 credits' },
    { label: 'After' as const, value: '4 credits' },
  ],
  footnote: 'Name locks for 7 days.',
  confirmLabel: 'Draw this look',
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
};

describe('ConfirmSheet', () => {
  beforeEach(() => {
    baseProps.onConfirm.mockReset();
    baseProps.onCancel.mockReset();
  });

  it('renders the copy it is given', () => {
    const { getByText } = render(<ConfirmSheet {...baseProps} />);
    getByText('Draw this look?');
    getByText('Redraws your fighter and avatar together.');
    getByText('• Saves your changes first:');
    getByText('• Era: Cyberpunk');
    getByText('Price');
    getByText('3 credits');
    getByText('After');
    getByText('4 credits');
    getByText('Name locks for 7 days.');
  });

  it('confirms and cancels through labelled buttons', () => {
    const { getByLabelText } = render(<ConfirmSheet {...baseProps} />);
    fireEvent.press(getByLabelText('Draw this look'));
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText('Cancel'));
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while busy', () => {
    const { getByLabelText, queryByText } = render(
      <ConfirmSheet {...baseProps} busy />,
    );
    expect(getByLabelText('Cancel').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(
      getByLabelText('Draw this look').props.accessibilityState.disabled,
    ).toBe(true);
    // The label gives way to a spinner.
    expect(queryByText('Draw this look')).toBeNull();
  });

  it('renders nothing when hidden', () => {
    const { queryByText } = render(
      <ConfirmSheet {...baseProps} visible={false} />,
    );
    expect(queryByText('Draw this look?')).toBeNull();
  });
});
