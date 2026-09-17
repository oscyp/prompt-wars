import { requestVideoUpgrade } from '@/utils/monetization';
import { invokeFunctionResult } from '@/utils/supabase';
jest.mock('@/utils/supabase', () => ({
  supabase: {},
  invokeFunctionResult: jest.fn(async () => ({
    data: { success: true },
    error: null,
  })),
}));
it('purchases the explicitly named round with the authenticated function helper', async () => {
  await requestVideoUpgrade('battle', true, 'round-3');
  expect(invokeFunctionResult).toHaveBeenCalledWith('request-video-upgrade', {
    battle_id: 'battle',
    auto_spend: true,
    battle_round_id: 'round-3',
  });
});
