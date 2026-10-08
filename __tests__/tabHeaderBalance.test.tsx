import React from 'react';
import { render } from '@testing-library/react-native';
import { TabBalanceProvider } from '@/providers/TabBalanceProvider';
import { TabScreenHeader } from '@/components/game/ScreenHeaders';
import CreditChip from '@/components/CreditChip';

const mockRefresh = jest.fn();
const mockReader = jest.fn((_id: string) => ({
  credits: 8,
  loading: false,
  error: false,
  refresh: mockRefresh,
}));
let mockPath = '/home';
jest.mock('@/hooks/useCredits', () => ({
  useCredits: (id: string) => mockReader(id),
}));
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'account-one' } }),
}));
jest.mock('expo-router', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

function Tabs() {
  return (
    <TabBalanceProvider>
      {['Arena', 'Battles', 'Rankings', 'Profile'].map((title) => (
        <TabScreenHeader key={title} title={title} />
      ))}
    </TabBalanceProvider>
  );
}

it('uses one account reader for all four headers and preserves separate return-focus targets', () => {
  mockReader.mockClear();
  mockRefresh.mockClear();
  const view = render(<Tabs />);
  expect(mockReader).toHaveBeenCalledTimes(1);
  expect(mockReader).toHaveBeenCalledWith('account-one');
  expect(
    view.getAllByRole('button', { name: 'View wallet, 8 credits' }),
  ).toHaveLength(4);
  const before = view
    .UNSAFE_getAllByType(CreditChip)
    .map((node) => node.props.focusRef);
  expect(new Set(before).size).toBe(4);
  mockPath = '/profile';
  view.rerender(<Tabs />);
  mockPath = '/home';
  view.rerender(<Tabs />);
  expect(mockRefresh).toHaveBeenCalledTimes(2);
  expect(view.UNSAFE_getAllByType(CreditChip)[0].props.focusRef).toBe(
    before[0],
  );
});
