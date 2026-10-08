import { completeMoveSuggestion, ensureFreeMoveSuggestionBanks, submitPrompt } from '@/utils/battles';
import { invokeAuthenticatedFunction } from '@/utils/supabase';

jest.mock('@/utils/supabase', () => ({
  FunctionInvokeError: class FunctionInvokeError extends Error {},
  invokeAuthenticatedFunction: jest.fn(),
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

it('requests a free batch and preserves independent ready, pending and failed outcomes', async () => {
  jest.mocked(invokeAuthenticatedFunction).mockResolvedValue({
    ok: true,
    data: {
      results: [
        {
          move_type: 'attack',
          status: 'ready',
          id: 'a',
          operation_id: 'op-a',
          suggestions: [{ title: 'A', body: 'A complete move text.' }],
          is_paid: false,
          credits_spent: 0,
        },
        { move_type: 'defense', status: 'pending', operation_id: 'op-d' },
        {
          move_type: 'finisher',
          status: 'failed',
          operation_id: 'op-f',
          error: 'moderation_rejected',
        },
      ],
    },
  });
  const result = await ensureFreeMoveSuggestionBanks('battle', 2);
  expect(invokeAuthenticatedFunction).toHaveBeenCalledWith(
    'generate-move-suggestions',
    {
      battle_id: 'battle',
      round_number: 2,
      operation: 'ensure_free',
      move_types: ['attack', 'defense', 'finisher'],
      client_contract_version: 3,
      composition_version: 3,
    },
  );
  expect(result.attack).toMatchObject({
    status: 'ready',
    set: { id: 'a', isPaid: false },
  });
  expect(result.defense).toMatchObject({
    status: 'pending',
    operationId: 'op-d',
    set: null,
  });
  expect(result.finisher).toMatchObject({
    status: 'failed',
    failure: 'failed',
    code: 'moderation_rejected',
  });
});

it('requests a free context-bound completion without purchase fields', async () => {
  jest.mocked(invokeAuthenticatedFunction).mockResolvedValue({ ok: true, data: {
    status: 'ready', context_key: 'ctx', operation_id: 'op', remaining_adaptations: 5,
    approachHints: [1, 2, 3].map(i => ({ id: `a${i}`, text: 'by waiting for their next step' })),
  } });
  const result = await completeMoveSuggestion('battle', 2, 'defense', 'approach', 'I brace the cable', 'to interrupt their charge');
  expect(result).toMatchObject({ status: 'ready', contextKey: 'ctx', remainingAdaptations: 5 });
  expect(invokeAuthenticatedFunction).toHaveBeenCalledWith('complete-move-suggestion', {
    battle_id: 'battle', round_number: 2, move_type: 'defense', target: 'approach',
    action_text: 'I brace the cable', intent_text: 'to interrupt their charge',
    composition_version: 3, client_contract_version: 3,
  });
});

it('classifies an unclaimed per-type limit and missing result as failures, not empty free slots', async () => {
  jest
    .mocked(invokeAuthenticatedFunction)
    .mockResolvedValue({
      ok: true,
      data: { results: [{ move_type: 'attack', error: 'rate_limited' }] },
    });
  const result = await ensureFreeMoveSuggestionBanks('battle', 1, [
    'attack',
    'defense',
  ]);
  expect(result.attack).toMatchObject({
    set: null,
    failure: 'rate_limited',
    code: 'rate_limited',
  });
  expect(result.defense).toMatchObject({ set: null, failure: 'unavailable' });
});

it('never falls back to individual purchases after a malformed or failed batch', async () => {
  jest
    .mocked(invokeAuthenticatedFunction)
    .mockRejectedValue(new Error('offline'));
  const result = await ensureFreeMoveSuggestionBanks('battle', 1);
  expect(invokeAuthenticatedFunction).toHaveBeenCalledTimes(1);
  expect(Object.values(result).every((r) => r?.failure === 'unavailable')).toBe(
    true,
  );
});

it('submits origin only as optional analytical metadata', async () => {
  jest.mocked(invokeAuthenticatedFunction).mockResolvedValue({ success: true });
  await submitPrompt(
    'battle',
    'defense',
    'I use the pillar to shelter my retreat.',
    1,
    'mixed',
  );
  expect(invokeAuthenticatedFunction).toHaveBeenCalledWith(
    'submit-prompt',
    expect.objectContaining({
      authoring_origin: 'mixed',
      custom_prompt_text: 'I use the pillar to shelter my retreat.',
    }),
  );
});
