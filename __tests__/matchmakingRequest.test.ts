const mockInvokeAuthenticatedFunction = jest.fn();
const mockGenerateIdempotencyKey = jest.fn(() => 'generated-request-id');

jest.mock('../utils/supabase', () => ({
  invokeAuthenticatedFunction: (...args: unknown[]) =>
    mockInvokeAuthenticatedFunction(...args),
  invokeFunctionResult: jest.fn(),
  supabase: {},
  FunctionInvokeError: class FunctionInvokeError extends Error {},
}));

jest.mock('../utils/characters', () => ({
  generateIdempotencyKey: () => mockGenerateIdempotencyKey(),
}));

import { startMatchmaking } from '../utils/battles';

describe('startMatchmaking request identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvokeAuthenticatedFunction.mockResolvedValue({
      battle_id: 'battle-1',
      matched: false,
      replayed_request: true,
    });
  });

  it('passes the same explicit request id and resume battle on retries', async () => {
    const options = {
      requestId: 'request-1',
      resumeBattleId: 'battle-1',
    };

    await startMatchmaking('fighter-1', 'ranked', options);
    await startMatchmaking('fighter-1', 'ranked', options);

    expect(mockInvokeAuthenticatedFunction).toHaveBeenNthCalledWith(
      1,
      'matchmaking',
      {
        character_id: 'fighter-1',
        mode: 'ranked',
        request_id: 'request-1',
        resume_battle_id: 'battle-1',
      },
    );
    expect(mockInvokeAuthenticatedFunction).toHaveBeenNthCalledWith(
      2,
      'matchmaking',
      expect.objectContaining({ request_id: 'request-1' }),
    );
    expect(mockGenerateIdempotencyKey).not.toHaveBeenCalled();
  });

  it('generates an id for compatibility callers that omit one', async () => {
    await startMatchmaking('fighter-1', 'bot');

    expect(mockGenerateIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(mockInvokeAuthenticatedFunction).toHaveBeenCalledWith(
      'matchmaking',
      {
        character_id: 'fighter-1',
        mode: 'bot',
        request_id: 'generated-request-id',
        resume_battle_id: undefined,
      },
    );
  });
});
