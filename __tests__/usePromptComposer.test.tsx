import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePromptComposer } from '@/hooks/usePromptComposer';
import { createComposerState } from '@/utils/promptComposer';
it('remembers the account preference without overriding a restored draft', async () => {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('write');
  const hook = renderHook(() =>
    usePromptComposer('account', 'account:battle:1'),
  );
  await waitFor(() => expect(hook.result.current.preferenceReady).toBe(true));
  expect(hook.result.current.preferredMode).toBe('write');
  act(() =>
    hook.result.current.restore({
      ...createComposerState('build'),
      finalText: 'Restored complete move text.',
    }),
  );
  expect(hook.result.current.state.mode).toBe('build');
  act(() => hook.result.current.setMode('write'));
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    'prompt-authoring-mode:account',
    'write',
  );
});
it('late preference reads cannot leak across accounts and old confirmation cannot replace new scope', async () => {
  let finish!: (value: string) => void;
  (AsyncStorage.getItem as jest.Mock)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue('build');
  const hook = renderHook(
    ({ account }: { account: string }) =>
      usePromptComposer(account, `${account}:battle:1`),
    { initialProps: { account: 'one' } },
  );
  act(() => hook.result.current.edit('This is the first account writing.'));
  act(() =>
    hook.result.current.change({
      type: 'action',
      text: 'Replace me.',
      id: 'a',
    }),
  );
  const oldConfirmation = hook.result.current.confirm;
  hook.rerender({ account: 'two' });
  await waitFor(() => expect(hook.result.current.preferenceReady).toBe(true));
  act(() =>
    hook.result.current.restore({
      ...createComposerState(),
      finalText: 'The second account has its own draft.',
    }),
  );
  await act(async () => finish('write'));
  act(() => oldConfirmation());
  expect(hook.result.current.preferredMode).toBe('build');
  expect(hook.result.current.state.finalText).toBe(
    'The second account has its own draft.',
  );
});
