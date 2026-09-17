import React from 'react';
import { Image, Alert, StyleSheet, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import EditCharacterScreen from '@/app/(profile)/edit-character';
import {
  readInitialPortraitRecovery,
  reconcileInitialPortrait,
  renderLook,
  generatePortrait,
  loadPortraitRef,
  editCharacter,
} from '@/utils/characters';

let mockUser = { id: 'owner' };
const mockRefreshCredits = jest.fn();
const mockRefreshLock = jest.fn();
const mockLoadCharacter = jest.fn();
const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};
let mockParams: Record<string, string> = {};
let mockLocked = false;
const mockDispatch = jest.fn();
let mockPreventRemove: any;
let mockPricingError = false;
const mockPaidCheck = jest.fn();
const mockPaidStart = jest.fn();
let mockPaidState: Record<string, unknown> = {};
jest.mock('@/hooks/usePortraitOperationRecovery', () => ({
  usePortraitOperationRecovery: () => ({
    operation: null,
    result: null,
    blocked: false,
    loading: false,
    checking: false,
    dispatching: false,
    error: null,
    start: mockPaidStart,
    checkStatus: mockPaidCheck,
    dismiss: jest.fn(async () => true),
    ...mockPaidState,
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useNavigation: () => ({ dispatch: mockDispatch }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  useFocusEffect: (cb: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(cb, [cb]);
  },
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  usePreventRemove: (enabled: boolean, handler: any) => {
    if (enabled) mockPreventRemove = handler;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 60 }));
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({
    credits: 10,
    loading: false,
    refresh: mockRefreshCredits,
  }),
}));
jest.mock('@/hooks/useCharacterEditLock', () => ({
  useCharacterEditLock: () => ({
    locked: mockLocked,
    activeBattleCount: 0,
    refresh: mockRefreshLock,
  }),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: () => mockLoadCharacter(),
      };
      return q;
    },
  },
}));
jest.mock('@/utils/editCooldowns', () => ({
  ...jest.requireActual('@/utils/editCooldowns'),
  fetchEditPricing: async () => {
    if (mockPricingError) throw new Error('offline');
    return {
      prices: { render_look: { credits: 3 }, random_character: { credits: 5 } },
      cooldownMs: {},
    };
  },
}));
jest.mock('@/utils/characters', () => ({
  editCharacter: jest.fn(),
  readInitialPortraitRecovery: jest.fn(),
  reconcileInitialPortrait: jest.fn(),
  generatePortrait: jest.fn(),
  renderLook: jest.fn(),
  loadPortraitRef: jest.fn(),
  listSignatureItemsCatalog: async () => [],
  listPortraitHistory: async () => [],
  getPortraitFallbackUri: () => 'starter.png',
  resolveSignatureHex: () => '#000000',
}));
jest.mock('@/components/CharacterRespec', () => () => null);
jest.mock('@/components/RenderRevealSheet', () => () => null);
jest.mock('@/components', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text, View, TextInput } =
    jest.requireActual('react-native');
  const empty = () => null;
  return {
    Toast: empty,
    CreditChip: ({ onPress }: any) => (
      <Pressable accessibilityLabel="Open Wallet" onPress={onPress}>
        <Text>Credits</Text>
      </Pressable>
    ),
    IdentityPanel: ({ onStage, disabled }: any) => (
      <View>
        <Text>Identity panel</Text>
        <TextInput
          accessibilityLabel="Fighter name"
          editable={!disabled}
          onChangeText={(v: string) => onStage('name', v)}
        />
      </View>
    ),
    LookPanel: ({ onStage, disabled }: any) => (
      <View>
        <Text>Look panel</Text>
        <TextInput
          accessibilityLabel="Description"
          editable={!disabled}
          onChangeText={(v: string) => onStage('vibe', v)}
        />
      </View>
    ),
    GearPanel: () => <Text>Gear panel</Text>,
    ConfirmSheet: ({ visible, onConfirm, confirmLabel, title }: any) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          <Pressable
            accessibilityLabel="Confirm editor action"
            onPress={onConfirm}
          >
            <Text>{confirmLabel}</Text>
          </Pressable>
        </View>
      ) : null,
  };
});
jest.mock('@/utils/cosmetics', () => ({
  listCosmetics: async () => ({ items: [] }),
  unlockedColorSwatches: () => [],
  resolveEquippedCosmetics: () => ({}),
}));
const read = readInitialPortraitRecovery as jest.Mock;
const check = reconcileInitialPortrait as jest.Mock;
const row = {
  id: 'fighter',
  name: 'Fighter',
  archetype: 'strategist',
  draft_portrait_renders: 3,
  starter_asset_key: 'starter',
  signature_color: '#000000',
  art_style: 'painterly',
  portrait_id: null,
  avatar_portrait_id: null,
};
beforeEach(async () => {
  jest.clearAllMocks();
  mockUser = { id: 'owner' };
  const memory = new Map<string, string>();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(
    async (key: string) => memory.get(key) ?? null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(
    async (key: string, value: string) => {
      memory.set(key, value);
    },
  );
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(
    async (key: string) => {
      memory.delete(key);
    },
  );
  mockPaidState = {};
  mockParams = {};
  mockLocked = false;
  mockPricingError = false;
  mockRouter.canGoBack.mockReturnValue(true);
  (editCharacter as jest.Mock).mockResolvedValue({});
  mockLoadCharacter.mockResolvedValue({ data: row, error: null });
  read.mockResolvedValue({ requestId: 'last-free', status: 'reserved' });
});
it('opens the Look controls immediately on ordinary Edit look entry', async () => {
  const screen = render(<EditCharacterScreen />);
  await waitFor(() => expect(screen.getByText('Look panel')).toBeTruthy());
});
it('reopened editor at count 3 checks the pending free request and prevents both paid controls', async () => {
  check.mockResolvedValue({ requestId: 'last-free', status: 'reserved' });
  const screen = render(<EditCharacterScreen />);
  await waitFor(() => expect(screen.getByText('Check render')).toBeTruthy());
  fireEvent.press(screen.getByText('Check render'));
  fireEvent.press(screen.getByLabelText(/Shuffle/));
  await waitFor(() =>
    expect(check).toHaveBeenCalledWith('fighter', 'last-free'),
  );
  expect(screen.queryByLabelText('Confirm editor action')).toBeNull();
  expect(renderLook).not.toHaveBeenCalled();
  expect(generatePortrait).not.toHaveBeenCalled();
});
it.each(['succeeded', 'failed'])(
  'editor reloads art and allowance after %s without making a paid request',
  async (status) => {
    check.mockResolvedValue({ requestId: 'last-free', status });
    read
      .mockResolvedValueOnce({ requestId: 'last-free', status: 'reserved' })
      .mockResolvedValue(null);
    const screen = render(<EditCharacterScreen />);
    await waitFor(() => expect(screen.getByText('Check render')).toBeTruthy());
    mockLoadCharacter.mockResolvedValue({
      data: {
        ...row,
        draft_portrait_renders: status === 'failed' ? 2 : 3,
        portrait_id: 'fresh-art',
      },
      error: null,
    });
    (loadPortraitRef as jest.Mock).mockResolvedValue({
      url: 'fresh.png',
      appearanceVersion: 1,
    });
    fireEvent.press(screen.getByText('Check render'));
    await waitFor(() => expect(mockRefreshCredits).toHaveBeenCalledTimes(1));
    expect(loadPortraitRef).toHaveBeenCalledWith('fresh-art');
    expect(mockRefreshLock).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Confirm editor action')).toBeNull();
    expect(renderLook).not.toHaveBeenCalled();
    expect(generatePortrait).not.toHaveBeenCalled();
    if (status === 'failed')
      await waitFor(() =>
        expect(screen.getByText('Review & draw · Free (1 left)')).toBeTruthy(),
      );
  },
);

it('count-3 editor retains the guard when an old terminal attempt is followed by newer pending work', async () => {
  read
    .mockResolvedValueOnce({ requestId: 'old-second', status: 'succeeded' })
    .mockResolvedValue({ requestId: 'new-third', status: 'reserved' });
  check
    .mockResolvedValueOnce({ requestId: 'old-second', status: 'succeeded' })
    .mockResolvedValue({ requestId: 'new-third', status: 'reserved' });
  const screen = render(<EditCharacterScreen />);
  await waitFor(() => expect(screen.getByText('Check render')).toBeTruthy());
  fireEvent.press(screen.getByText('Check render'));
  await waitFor(() => expect(mockRefreshCredits).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByText('Check render')).toBeTruthy());
  fireEvent.press(screen.getByText('Check render'));
  fireEvent.press(screen.getByLabelText(/Shuffle/));
  await waitFor(() =>
    expect(check).toHaveBeenLastCalledWith('fighter', 'new-third'),
  );
  expect(screen.queryByLabelText('Confirm editor action')).toBeNull();
  expect(renderLook).not.toHaveBeenCalled();
  expect(generatePortrait).not.toHaveBeenCalled();
});

it.each([null, 'generated-art'])(
  'starter editor uses bundled art until a generated portrait exists (%s)',
  async (portraitId) => {
    const asset = jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({
      uri: 'bundled-strategist.jpg',
      width: 512,
      height: 512,
      scale: 1,
    });
    mockLoadCharacter.mockResolvedValue({
      data: {
        ...row,
        starter_asset_key: 'bundled:strategist',
        portrait_id: portraitId,
      },
      error: null,
    });
    (loadPortraitRef as jest.Mock).mockResolvedValue({
      url: 'generated.jpg',
      appearanceVersion: 1,
    });
    try {
      const screen = render(<EditCharacterScreen />);
      await waitFor(() => expect(screen.getByText('View card')).toBeTruthy());
      fireEvent.press(screen.getByText('View card'));
      await waitFor(() =>
        expect(
          screen
            .UNSAFE_getAllByType(Image)
            .some(
              (image) =>
                image.props.source?.uri ===
                (portraitId ? 'generated.jpg' : 'bundled-strategist.jpg'),
            ),
        ).toBe(true),
      );
      expect(asset).toHaveBeenCalledWith(getArchetypeAvatar('strategist'));
      expect(generatePortrait).not.toHaveBeenCalled();
    } finally {
      asset.mockRestore();
    }
  },
);

test('large text keeps horizontal categories and one form scroll with one keyboard owner', async () => {
  const rn = jest.requireActual<typeof import('react-native')>('react-native');
  const dimensions = jest
    .spyOn(rn, 'useWindowDimensions')
    .mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 1 });
  let view: ReturnType<typeof render> | undefined;
  try {
    const current = render(<EditCharacterScreen />);
    view = current;
    await waitFor(() => expect(current.getByText('Look panel')).toBeTruthy());
    fireEvent.press(view.getByRole('tab', { name: 'Gear' }));
    expect(view.getByText('Gear panel')).toBeTruthy();
    dimensions.mockReturnValue({
      width: 393,
      height: 852,
      scale: 3,
      fontScale: 3.1,
    });
    view.rerender(<EditCharacterScreen />);
    expect(view.getByText('Gear panel')).toBeTruthy();
    const scroll = view.getByTestId('edit-look-scroll');
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(false);
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop ?? 0,
    ).toBe(0);
    expect(view.getByLabelText('Editing category').props.horizontal).toBe(true);
    expect(view.queryByTestId('overlay-stage')).toBeNull();
  } finally {
    view?.unmount();
    dimensions.mockRestore();
  }
});

test('explicit Fighter color entry overrides a stored category without clearing its changes', async () => {
  read.mockResolvedValue(null);
  const first = render(<EditCharacterScreen />);
  await waitFor(() => expect(first.getByText('Look panel')).toBeTruthy());
  fireEvent.changeText(first.getByLabelText('Description'), 'bold');
  await act(async () => {
    await mockPreventRemove({ data: { action: { type: 'GO_BACK' } } });
  });
  await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
  first.unmount();
  mockParams = { section: 'fighter', focus: 'signature-color' };
  const view = render(<EditCharacterScreen />);
  await waitFor(() => expect(view.getByText('Identity panel')).toBeTruthy());
  expect(view.getByText('Draft restored')).toBeTruthy();
  expect(view.getByText('Save changes · Free').parent?.props).toBeDefined();
});

test('cold entry shows a Profile fallback', async () => {
  mockRouter.canGoBack.mockReturnValue(false);
  const view = render(<EditCharacterScreen />);
  await waitFor(() => expect(view.getByText('Look panel')).toBeTruthy());
  fireEvent.press(view.getByLabelText('Return to Profile'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/profile');
});

test('a battle lock arriving while confirmation is open prevents saving', async () => {
  read.mockResolvedValue(null);
  const view = render(<EditCharacterScreen />);
  await waitFor(() => expect(view.getByText('Look panel')).toBeTruthy());
  fireEvent.changeText(view.getByLabelText('Description'), 'bold');
  fireEvent.press(view.getByText('Save changes · Free'));
  expect(view.getByText('Save changes?')).toBeTruthy();
  mockLocked = true;
  view.rerender(<EditCharacterScreen />);
  fireEvent.press(view.getByLabelText('Confirm editor action'));
  expect(editCharacter).not.toHaveBeenCalled();
  expect(view.getByText('Manage battles')).toBeTruthy();
});

test('a partial save acknowledges identity once and keeps failed look edits for retry', async () => {
  read.mockResolvedValue(null);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = render(<EditCharacterScreen />);
  await waitFor(() => expect(view.getByText('Look panel')).toBeTruthy());
  fireEvent.changeText(view.getByLabelText('Description'), 'bold');
  fireEvent.press(view.getByRole('tab', { name: 'Fighter' }));
  fireEvent.changeText(view.getByLabelText('Fighter name'), 'New name');
  (editCharacter as jest.Mock)
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({});
  fireEvent.press(view.getByText('Save changes · Free'));
  fireEvent.press(view.getByLabelText('Confirm editor action'));
  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith(
      'Only part of your changes saved',
      expect.stringContaining('Already saved: identity'),
    ),
  );
  fireEvent.press(view.getByText('Save changes · Free'));
  fireEvent.press(view.getByLabelText('Confirm editor action'));
  await waitFor(() => expect(editCharacter).toHaveBeenCalledTimes(3));
  const calls = (editCharacter as jest.Mock).mock.calls;
  expect(calls.filter(([a]) => a.changes.identity)).toHaveLength(1);
  expect(calls[2][0].changes.look).toEqual({ vibe: 'bold' });
  alert.mockRestore();
});

test('free initial drawings also require review before generation', async () => {
  read.mockResolvedValue(null);
  mockLoadCharacter.mockResolvedValue({
    data: { ...row, draft_portrait_renders: 1 },
    error: null,
  });
  const view = render(<EditCharacterScreen />);
  await waitFor(() =>
    expect(view.getByText('Review & draw · Free (2 left)')).toBeTruthy(),
  );
  fireEvent.press(view.getByText('Review & draw · Free (2 left)'));
  expect(view.getByText('Draw this look?')).toBeTruthy();
  expect(generatePortrait).not.toHaveBeenCalled();
});

test('a resumed paid request checks status without calling generation or saving', async () => {
  read.mockResolvedValue(null);
  mockPaidState = {
    blocked: true,
    operation: { status: 'pending', requestKey: 'saved-operation' },
  };
  const view = render(<EditCharacterScreen />);
  await waitFor(() => expect(view.getByText('Look panel')).toBeTruthy());
  expect(view.getByLabelText('Description').props.editable).toBe(false);
  fireEvent.press(view.getAllByText('Check status')[0]);
  expect(mockPaidCheck).toHaveBeenCalledTimes(1);
  expect(mockPaidStart).not.toHaveBeenCalled();
  expect(renderLook).not.toHaveBeenCalled();
  expect(generatePortrait).not.toHaveBeenCalled();
  expect(editCharacter).not.toHaveBeenCalled();
});

test('unknown prices still allow free look saves and block paid drawing', async () => {
  read.mockResolvedValue(null);
  mockPricingError = true;
  const view = render(<EditCharacterScreen />);
  await waitFor(() => expect(view.getByText('Look panel')).toBeTruthy());
  fireEvent.changeText(view.getByLabelText('Description'), 'bold');
  fireEvent.press(view.getByText('Save changes · Free'));
  fireEvent.press(view.getByLabelText('Confirm editor action'));
  await waitFor(() =>
    expect(editCharacter).toHaveBeenCalledWith({
      characterId: 'fighter',
      changes: { look: { vibe: 'bold' } },
    }),
  );
  expect(mockPaidStart).not.toHaveBeenCalled();
  expect(view.getByText('Retry prices')).toBeTruthy();
});

test('each category restores its own scroll position in the durable draft', async () => {
  read.mockResolvedValue(null);
  const view = render(<EditCharacterScreen />);
  await waitFor(() => expect(view.getByText('Look panel')).toBeTruthy());
  fireEvent.scroll(view.getByTestId('edit-look-scroll'), {
    nativeEvent: { contentOffset: { y: 230, x: 0 } },
  });
  fireEvent.press(view.getByRole('tab', { name: 'Gear' }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 35));
  });
  fireEvent.scroll(view.getByTestId('edit-look-scroll'), {
    nativeEvent: { contentOffset: { y: 80, x: 0 } },
  });
  fireEvent.press(view.getByRole('tab', { name: 'Look' }));
  await waitFor(() =>
    expect(
      (AsyncStorage.setItem as jest.Mock).mock.calls.some(([, raw]) => {
        const saved = JSON.parse(raw);
        return (
          saved.scrollPositions?.look === 230 &&
          saved.scrollPositions?.gear === 80
        );
      }),
    ).toBe(true),
  );
});

test('account changes remount editor state while an older save is pending', async () => {
  read.mockResolvedValue(null);
  let finish!: () => void;
  (editCharacter as jest.Mock).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<EditCharacterScreen />);
  await waitFor(() => expect(view.getByText('Look panel')).toBeTruthy());
  fireEvent.changeText(view.getByLabelText('Description'), 'bold');
  fireEvent.press(view.getByText('Save changes · Free'));
  fireEvent.press(view.getByLabelText('Confirm editor action'));
  await waitFor(() => expect(editCharacter).toHaveBeenCalledTimes(1));
  mockUser = { id: 'other' };
  mockLoadCharacter.mockResolvedValue({
    data: { ...row, id: 'other-fighter', name: 'Other fighter' },
    error: null,
  });
  view.rerender(<EditCharacterScreen />);
  await waitFor(() =>
    expect(view.getByLabelText('Description').props.editable).toBe(true),
  );
  await act(async () => {
    finish();
  });
  expect(view.getByText('Other fighter')).toBeTruthy();
  expect(view.queryByText('Draft restored')).toBeNull();
  expect(view.getByLabelText('Description').props.editable).toBe(true);
});

test('a price refresh failure while review is open prevents paid dispatch', async () => {
  read.mockResolvedValue(null);
  const listeners: ((state: import('react-native').AppStateStatus) => void)[] =
    [];
  // RN's preset already supplies a jest.fn. mockRestore would erase its
  // original subscription implementation instead of restoring a real method.
  const subscription = AppState.addEventListener as jest.Mock;
  const originalSubscription = subscription.getMockImplementation();
  subscription.mockImplementation((_event, callback) => {
    listeners.push(callback);
    return { remove: jest.fn() };
  });
  try {
    const view = render(<EditCharacterScreen />);
    await waitFor(() =>
      expect(view.getByText('Draw another version · 3 credits')).toBeTruthy(),
    );
    fireEvent.press(view.getByText('Draw another version · 3 credits'));
    expect(view.getByText('Draw this look?')).toBeTruthy();
    mockPricingError = true;
    act(() => listeners.forEach((callback) => callback('active')));
    await waitFor(() => expect(view.getByText('Retry prices')).toBeTruthy());
    fireEvent.press(view.getByLabelText('Confirm editor action'));
    expect(mockPaidStart).not.toHaveBeenCalled();
    expect(generatePortrait).not.toHaveBeenCalled();
  } finally {
    subscription.mockImplementation(originalSubscription!);
  }
});

test('ordinary reopening starts on Look while preserving Gear draft work', async () => {
  read.mockResolvedValue(null);
  const first = render(<EditCharacterScreen />);
  await waitFor(() => expect(first.getByText('Look panel')).toBeTruthy());
  fireEvent.changeText(first.getByLabelText('Description'), 'bold');
  fireEvent.press(first.getByRole('tab', { name: 'Gear' }));
  await act(async () => {
    await mockPreventRemove({ data: { action: { type: 'GO_BACK' } } });
  });
  await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
  first.unmount();
  const view = render(<EditCharacterScreen />);
  await waitFor(() => expect(view.getByText('Draft restored')).toBeTruthy());
  expect(view.getByText('Look panel')).toBeTruthy();
  fireEvent.press(view.getByText('Save changes · Free'));
  fireEvent.press(view.getByLabelText('Confirm editor action'));
  await waitFor(() =>
    expect(editCharacter).toHaveBeenCalledWith({
      characterId: 'fighter',
      changes: { look: { vibe: 'bold' } },
    }),
  );
});
