import { submitPrompt } from '@/utils/battles';
import { invokeAuthenticatedFunction } from '@/utils/supabase';

jest.mock('@/utils/supabase', () => ({
  invokeAuthenticatedFunction: jest.fn(),
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

it('declares support for the published situation when submitting canonical text', async () => {
  jest.mocked(invokeAuthenticatedFunction).mockResolvedValue({ success: true, prompt_id: 'prompt' });
  expect(await submitPrompt('battle', 'attack', 'I sidestep. I want a clear angle.', 2)).toMatchObject({ success: true });
  expect(invokeAuthenticatedFunction).toHaveBeenCalledWith('submit-prompt', {
    battle_id: 'battle', move_type: 'attack', custom_prompt_text: 'I sidestep. I want a clear angle.',
    round_number: 2, client_contract_version: 3,
  });
});
