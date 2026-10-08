import {
  FunctionInvokeError,
  invokeAuthenticatedFunction,
} from '@/utils/supabase';
import {
  rerollMoveStepSuggestions,
  MoveStepRequestError,
} from '@/utils/moveStepSuggestions';
jest.mock('@/utils/supabase', () => ({
  invokeAuthenticatedFunction: jest.fn(),
  FunctionInvokeError: class extends Error {
    status?: number;
    body?: unknown;
    constructor(message: string, status?: number, body?: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));
const request = {
  battleId: 'battle',
  roundNumber: 2,
  moveType: 'attack' as const,
  target: 'approach' as const,
  actionText: 'I brace the cable',
  intentText: 'to interrupt their charge',
  idempotencyKey: 'purchase-1',
  expectedCredits: 1,
};
const hints = [1, 2, 3].map((i) => ({
  id: `hint${i}`,
  text: `by timing the movement ${i}`,
}));
const reply = {
  ok: true,
  data: {
    status: 'ready',
    operation_id: 'operation',
    context_key: 'context',
    target: 'approach',
    composition_version: 3,
    credits_spent: 1,
    refunded: false,
    result: { approachHints: hints },
  },
};
beforeEach(() => jest.resetAllMocks());
it('sends an explicit paid request with exact parents and confirmed price', async () => {
  jest.mocked(invokeAuthenticatedFunction).mockResolvedValue(reply);
  const result = await rerollMoveStepSuggestions(request);
  expect(invokeAuthenticatedFunction).toHaveBeenCalledWith(
    'reroll-move-step-suggestions',
    {
      battle_id: 'battle',
      round_number: 2,
      move_type: 'attack',
      target: 'approach',
      action_text: request.actionText,
      intent_text: request.intentText,
      composition_version: 3,
      client_contract_version: 3,
      idempotency_key: 'purchase-1',
      expected_credits: 1,
    },
  );
  expect(result.approachHints).toEqual(hints);
  expect(result.operationId).toBe('operation');
});
it('treats a stale worker reply as pending instead of allowing another charge', async () => {
  jest
    .mocked(invokeAuthenticatedFunction)
    .mockResolvedValue({
      ok: true,
      data: { ...reply.data, status: 'stale', result: null },
    });
  expect((await rerollMoveStepSuggestions(request)).status).toBe('pending');
});
it('does not accept incomplete intention trees as delivered', async () => {
  jest
    .mocked(invokeAuthenticatedFunction)
    .mockResolvedValue({
      ok: true,
      data: { ...reply.data, target: 'intent', result: { intentHints: hints } },
    });
  await expect(
    rerollMoveStepSuggestions({
      ...request,
      target: 'intent',
      intentText: undefined,
    }),
  ).rejects.toMatchObject({ code: 'invalid_response' });
});
it('preserves typed rejection codes for storage recovery decisions', async () => {
  jest
    .mocked(invokeAuthenticatedFunction)
    .mockRejectedValue(
      new FunctionInvokeError('Price changed', 409, {
        error: { code: 'price_changed', message: 'Price changed' },
      }),
    );
  await expect(rerollMoveStepSuggestions(request)).rejects.toMatchObject({
    code: 'price_changed',
  });
});
it('keeps terminal refunds distinct from pending or unknown outcomes', async () => {
  jest
    .mocked(invokeAuthenticatedFunction)
    .mockResolvedValue({
      ok: true,
      data: {
        ...reply.data,
        status: 'failed',
        result: null,
        refunded: true,
        error: 'round_closed_before_delivery',
      },
    });
  expect(await rerollMoveStepSuggestions(request)).toMatchObject({
    status: 'failed',
    refunded: true,
    error: 'round_closed_before_delivery',
  });
});
it('rejects unknown prices before any request', async () => {
  await expect(
    rerollMoveStepSuggestions({ ...request, expectedCredits: 2 }),
  ).rejects.toBeInstanceOf(MoveStepRequestError);
  expect(invokeAuthenticatedFunction).not.toHaveBeenCalled();
});
