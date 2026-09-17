import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useInitialPortraitRecovery } from '@/hooks/useInitialPortraitRecovery';
import {
  readInitialPortraitRecovery,
  reconcileInitialPortrait,
} from '@/utils/characters';
jest.mock('@/utils/characters', () => ({
  readInitialPortraitRecovery: jest.fn(),
  reconcileInitialPortrait: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(cb, [cb]);
  },
}));
const read = readInitialPortraitRecovery as jest.Mock;
const check = reconcileInitialPortrait as jest.Mock;
const paid = jest.fn();
const refreshed = jest.fn();
// Uses the exact action guard consumed by edit-character; the paid-render boundary is external.
function EditorControls() {
  const recovery = useInitialPortraitRecovery('fighter', refreshed);
  const freeLeft = 0; // The third free slot is already reserved on remount.
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void recovery.runOrRecover(() => paid(freeLeft))}
    >
      <Text>{recovery.request ? 'Check render' : 'Draw portrait'}</Text>
    </Pressable>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  read.mockResolvedValue({ requestId: 'last-free', status: 'reserved' });
});
it('after restart the last reserved free slot checks the same request instead of paid rendering', async () => {
  check.mockResolvedValue({ requestId: 'last-free', status: 'reserved' });
  const screen = render(<EditorControls />);
  await waitFor(() => expect(screen.getByText('Check render')).toBeTruthy());
  fireEvent.press(screen.getByRole('button'));
  await waitFor(() =>
    expect(check).toHaveBeenCalledWith('fighter', 'last-free'),
  );
  expect(paid).not.toHaveBeenCalled();
  expect(refreshed).not.toHaveBeenCalled();
});
it.each(['succeeded', 'failed'])(
  'terminal %s refreshes quota/art before allowing a subsequent explicit render',
  async (status) => {
    check.mockResolvedValue({ requestId: 'last-free', status });
    read
      .mockResolvedValueOnce({ requestId: 'last-free', status: 'reserved' })
      .mockResolvedValue(null);
    const screen = render(<EditorControls />);
    await waitFor(() => expect(screen.getByText('Check render')).toBeTruthy());
    fireEvent.press(screen.getByRole('button'));
    await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
    expect(paid).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button'));
    await waitFor(() => expect(paid).toHaveBeenCalledTimes(1));
  },
);
it('status failure retains the pending identity and blocks new paid work', async () => {
  check.mockRejectedValue(new Error('offline'));
  const screen = render(<EditorControls />);
  await waitFor(() => expect(screen.getByText('Check render')).toBeTruthy());
  fireEvent.press(screen.getByRole('button'));
  await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Check render')).toBeTruthy();
  expect(paid).not.toHaveBeenCalled();
});

it('terminal check discovers a newer reservation before unblocking the paid action', async () => {
  read
    .mockResolvedValueOnce({ requestId: 'old', status: 'succeeded' })
    .mockResolvedValue({ requestId: 'third-free', status: 'reserved' });
  check
    .mockResolvedValueOnce({ requestId: 'old', status: 'succeeded' })
    .mockResolvedValue({ requestId: 'third-free', status: 'reserved' });
  const screen = render(<EditorControls />);
  await waitFor(() => expect(screen.getByText('Check render')).toBeTruthy());
  fireEvent.press(screen.getByRole('button'));
  await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByRole('button'));
  await waitFor(() =>
    expect(check).toHaveBeenLastCalledWith('fighter', 'third-free'),
  );
  expect(paid).not.toHaveBeenCalled();
});

it('failed active-reservation recheck keeps paid work blocked after terminal status', async () => {
  read
    .mockResolvedValueOnce({ requestId: 'old', status: 'succeeded' })
    .mockRejectedValue(new Error('offline'));
  check.mockResolvedValue({ requestId: 'old', status: 'succeeded' });
  const screen = render(<EditorControls />);
  await waitFor(() => expect(screen.getByText('Check render')).toBeTruthy());
  fireEvent.press(screen.getByRole('button'));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  await act(async () => {
    fireEvent.press(screen.getByRole('button'));
  });
  expect(paid).not.toHaveBeenCalled();
});
