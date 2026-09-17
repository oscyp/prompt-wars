import React from 'react';
import { AppState, StyleSheet, Modal, AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import Shop from '@/app/(profile)/shop';
import { useCosmeticShop } from '@/hooks/useCosmeticShop';
const ReactNative =
  jest.requireActual<typeof import('react-native')>('react-native');
jest.mock('@/hooks/useCosmeticShop');
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({
    push: mockPush,
    canGoBack: () => false,
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useFocusEffect: (cb: () => void) =>
    jest.requireActual('react').useEffect(cb, [cb]),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user' } }),
}));
const item = {
  id: 'gold',
  slug: 'gold_frame',
  name: 'Gold Frame',
  cosmetic_type: 'frame',
  rarity: 'rare',
  description: 'Gold trim',
  acquisition: 'credits',
  price_credits: 15,
  owned: true,
};
const refresh = jest.fn();
beforeEach(() => {
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: jest.fn() }));
  (useCosmeticShop as jest.Mock).mockReturnValue({
    items: [
      item,
      { ...item, slug: 'other', name: 'Other Frame', owned: false },
      {
        ...item,
        slug: 'noir_reveal',
        cosmetic_type: 'reveal_style',
        name: 'Noir',
      },
    ],
    equipped: { frame: 'gold_frame' },
    character: {
      id: 'fighter',
      name: 'Fighter',
      portraitUri: 'portrait',
      avatarUri: 'avatar',
      signatureColor: '#333333',
    },
    characterStatus: 'ready',
    credits: 50,
    profile: null,
    refresh,
    equip: jest.fn(async () => ({ success: true })),
    purchase: jest.fn(),
    onArtworkError: jest.fn(),
  });
});
it('hides unsupported reveals and filters owned items', () => {
  const screen = render(<Shop />);
  expect(screen.queryByText('Noir')).toBeNull();
  fireEvent.press(screen.getByLabelText('Owned filter'));
  expect(screen.queryByText('Other Frame')).toBeNull();
  expect(screen.queryByLabelText('Remove Gold Frame')).toBeNull();
  fireEvent.press(screen.getByLabelText('Preview Gold Frame'));
  screen.getByLabelText('Remove Gold Frame');
});
it('puts the full header in the scroller and previews in a bounded sheet', () => {
  const screen = render(<Shop />);
  expect(
    screen
      .getByTestId('shop-scroll')
      .findAllByProps({ accessibilityRole: 'header' }).length,
  ).toBeGreaterThan(0);
  fireEvent.press(screen.getByLabelText('Preview Gold Frame'));
  screen.getByText('Previewing Gold Frame');
  screen.getByLabelText('Portrait context');
  screen.getByLabelText('Avatar context');
  fireEvent.press(screen.getByLabelText('Clear preview'));
  expect(screen.queryByText('Previewing Gold Frame')).toBeNull();
});

it('clears the preview after equip succeeds', async () => {
  const screen = render(<Shop />);
  fireEvent.press(screen.getByLabelText('Preview Gold Frame'));
  fireEvent.press(screen.getAllByLabelText('Remove Gold Frame').at(-1)!);
  await waitFor(() =>
    expect(screen.queryByText('Previewing Gold Frame')).toBeNull(),
  );
});
it('refreshes on focus and foreground while keeping the category/filter', () => {
  const listener = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: jest.fn() }));
  const screen = render(<Shop />);
  expect(refresh).toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Owned filter'));
  const onChange = listener.mock.calls.at(-1)![1];
  act(() => {
    onChange('active');
  });
  expect(screen.queryByText('Other Frame')).toBeNull();
  expect(refresh.mock.calls.length).toBeGreaterThan(1);
  screen.unmount();
  listener.mockRestore();
});
it('keeps actions at least 48 points with wrapping layout and untruncated text', () => {
  const screen = render(<Shop />);
  for (const button of screen.getAllByRole('button')) {
    expect(
      StyleSheet.flatten(button.props.style).minHeight,
    ).toBeGreaterThanOrEqual(48);
  }
  const name = screen.getByText('Gold Frame');
  expect(name.props.numberOfLines).toBeUndefined();
});

it('returns purchase confirmation to Preview without stealing focus during replacement', () => {
  const focus = jest
    .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
    .mockImplementation(() => {});
  const findNode = jest
    .spyOn(ReactNative, 'findNodeHandle')
    .mockImplementation((target) =>
      (target as import('react-native').View | null)?.props
        ?.accessibilityLabel === 'Preview Other Frame'
        ? 61
        : null,
    );
  const screen = render(<Shop />);
  fireEvent.press(screen.getByLabelText('Preview Other Frame'));
  const preview = screen.UNSAFE_getAllByType(Modal)[0];
  act(() => preview.props.onShow());
  fireEvent.press(screen.getByRole('button', { name: /Buy Other Frame/ }));
  const confirmation = screen.UNSAFE_getAllByType(Modal)[1];
  act(() => confirmation.props.onShow());
  focus.mockClear();
  act(() => preview.props.onDismiss());
  expect(focus).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  act(() => confirmation.props.onDismiss());
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledWith(61);
  focus.mockRestore();
  findNode.mockRestore();
});

it('keeps all equipment slots discoverable behind the compact summary', () => {
  const screen = render(<Shop />);
  expect(screen.queryByText('Title: None')).toBeNull();
  fireEvent.press(
    screen.getByRole('button', { name: /Show complete loadout/ }),
  );
  screen.getByText('Frame: Gold Frame');
  screen.getByText('Title: None');
  screen.getByText('Aura: None');
  screen.getByText('Badge: None');
  fireEvent.press(
    screen.getByRole('button', { name: 'Edit character colours' }),
  );
  expect(mockPush).toHaveBeenCalledWith('/(profile)/edit-character');
});

it('selects all five categories and retains the owned filter across them', () => {
  const screen = render(<Shop />);
  fireEvent.press(screen.getByLabelText('Owned filter'));
  for (const label of ['Titles', 'Auras', 'Badges', 'Colours']) {
    fireEvent.press(screen.getByRole('tab', { name: label }));
    expect(
      screen.getByRole('tab', { name: label }).props.accessibilityState
        .selected,
    ).toBe(true);
    screen.getByText('No owned cosmetics in this category yet.');
  }
  fireEvent.press(screen.getByRole('tab', { name: 'Frames' }));
  expect(screen.queryByText('Other Frame')).toBeNull();
  fireEvent.press(screen.getByLabelText('All filter'));
  screen.getByText('Other Frame');
});

it('routes owned colour previews to Edit character without equipping', () => {
  const state = (useCosmeticShop as jest.Mock)();
  (useCosmeticShop as jest.Mock).mockReturnValue({
    ...state,
    items: [
      { ...item, slug: 'violet_color', name: 'Violet', cosmetic_type: 'color' },
    ],
  });
  const screen = render(<Shop />);
  fireEvent.press(screen.getByRole('tab', { name: 'Colours' }));
  screen.getByText('Signature colour');
  fireEvent.press(screen.getByLabelText('Preview Violet'));
  fireEvent.press(
    screen.getByRole('button', { name: 'Wear Violet. Opens Edit character' }),
  );
  expect(mockPush).toHaveBeenCalledWith('/(profile)/edit-character');
  expect(state.equip).not.toHaveBeenCalled();
});

it('keeps the trust footer inside the scroller after an unavailable collection', () => {
  const state = (useCosmeticShop as jest.Mock)();
  (useCosmeticShop as jest.Mock).mockReturnValue({
    ...state,
    items: [],
    loading: false,
    error: 'Offline',
  });
  const screen = render(<Shop />);
  screen.getByText('Catalog unavailable. Retry to check this category.');
  expect(
    screen
      .getByTestId('shop-scroll')
      .findAllByProps({ testID: 'shop-trust-footer' }).length,
  ).toBeGreaterThan(0);
  screen.getByText('Cosmetics never affect battle stats.');
  fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(refresh).toHaveBeenCalled();
});

it('does not show an empty collection message while loading', () => {
  const state = (useCosmeticShop as jest.Mock)();
  (useCosmeticShop as jest.Mock).mockReturnValue({
    ...state,
    items: [],
    loading: true,
  });
  const screen = render(<Shop />);
  expect(screen.queryByText('No cosmetics in this category yet.')).toBeNull();
});

it('keeps catalog tiles non-actionable and the full price visible before Preview', () => {
  const state = (useCosmeticShop as jest.Mock)();
  (useCosmeticShop as jest.Mock).mockReturnValue({
    ...state,
    items: [
      {
        ...item,
        slug: 'long-frame',
        name: 'A long frame name that must stay complete',
        owned: false,
        price_credits: 12345,
      },
    ],
  });
  const screen = render(<Shop />);
  const collection = screen.getByTestId('shop-collection');
  const actions = collection.findAllByProps({ accessibilityRole: 'button' });
  expect(
    actions.every(
      (button) =>
        button.props.accessibilityLabel ===
        'Preview A long frame name that must stay complete',
    ),
  ).toBe(true);
  expect(
    screen.getByText('A long frame name that must stay complete').props
      .numberOfLines,
  ).toBeUndefined();
  expect(screen.getByText(/12345 credits/).props.numberOfLines).toBeUndefined();
  expect(state.purchase).not.toHaveBeenCalled();
  expect(state.equip).not.toHaveBeenCalled();
});
