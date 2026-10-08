import { act, renderHook } from '@testing-library/react-native';
import { useComposerResultTelemetry } from '@/hooks/useComposerResultTelemetry';
import { recordComposerEvent } from '@/utils/composerTelemetry';

jest.mock('@/utils/composerTelemetry', () => ({
  recordComposerEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/utils/characters', () => ({
  generateIdempotencyKey: () => '00000000-0000-4000-8000-000000000001',
}));

beforeEach(() => jest.clearAllMocks());

it('records explicit result interactions once per round without prompt content or writing duration', () => {
  const { result } = renderHook(() =>
    useComposerResultTelemetry('account', 'battle', true),
  );
  act(() => {
    result.current('composer_explanation_read', 1);
    result.current('composer_explanation_read', 1);
    result.current('composer_explanation_read', 2);
    result.current('composer_next_battle', 2);
  });
  expect(recordComposerEvent).toHaveBeenCalledTimes(3);
  expect(recordComposerEvent).toHaveBeenNthCalledWith(
    1,
    'composer_explanation_read',
    'battle',
    1,
    '00000000-0000-4000-8000-000000000001',
  );
});

it('does not count legacy results and resets scope after switching account or battle', () => {
  const { result, rerender } = renderHook(
    ({
      account,
      battle,
      enabled,
    }: {
      account: string;
      battle: string;
      enabled: boolean;
    }) => useComposerResultTelemetry(account, battle, enabled),
    { initialProps: { account: 'a', battle: 'b', enabled: false } },
  );
  act(() => result.current('composer_next_battle', 1));
  expect(recordComposerEvent).not.toHaveBeenCalled();
  rerender({ account: 'a', battle: 'b', enabled: true });
  act(() => result.current('composer_next_battle', 1));
  rerender({ account: 'other', battle: 'another', enabled: true });
  act(() => result.current('composer_next_battle', 1));
  expect(recordComposerEvent).toHaveBeenCalledTimes(2);
});
