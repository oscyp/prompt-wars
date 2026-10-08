import {
  getCinematicCapabilities,
  requestVideoUpgrade,
} from '@/utils/monetization';
import { invokeFunctionResult, supabase } from '@/utils/supabase';
jest.mock('@/utils/supabase', () => ({
  supabase: { rpc: jest.fn() },
  invokeFunctionResult: jest.fn(async () => ({
    data: { success: true },
    error: null,
  })),
}));
beforeEach(() => jest.clearAllMocks());
it('preserves frozen metadata from the created job response', async () => {
  (invokeFunctionResult as jest.Mock).mockResolvedValueOnce({
    data: {
      success: true,
      video_job_id: 'job',
      cinematic_profile: 'plus',
      target_duration_seconds: 20,
      duration_policy_version: 'cinematics-v3',
    },
    error: null,
  });
  expect(await requestVideoUpgrade('battle', true)).toMatchObject({
    video_job_id: 'job',
    cinematic_profile: 'plus',
    target_duration_seconds: 20,
    duration_policy_version: 'cinematics-v3',
  });
});
it('preserves a retry message when another request holds the shared cinematic funding', async () => {
  (invokeFunctionResult as jest.Mock).mockResolvedValueOnce({
    data: {
      success: false,
      can_upgrade: false,
      request_in_progress: true,
      error: 'Another cinematic request is finishing. Please try again.',
    },
    error: null,
  });
  expect(await requestVideoUpgrade('battle', true)).toMatchObject({
    request_in_progress: true,
    error: 'Another cinematic request is finishing. Please try again.',
  });
});
it('purchases the explicitly named round with the authenticated function helper', async () => {
  await requestVideoUpgrade('battle', true, 'round-3');
  expect(invokeFunctionResult).toHaveBeenCalledWith('request-video-upgrade', {
    battle_id: 'battle',
    auto_spend: true,
    battle_round_id: 'round-3',
  });
});

it('confirms the preview duration and funding quote without deriving them from subscription status', async () => {
  await requestVideoUpgrade('battle', true, 'round-3', {
    can_upgrade: true,
    method: 'credit',
    cost_credits: 1,
    cinematic_profile: 'plus',
    target_duration_seconds: 20,
    duration_policy_version: 'cinematics-v3',
  });
  expect(invokeFunctionResult).toHaveBeenCalledWith('request-video-upgrade', {
    battle_id: 'battle',
    auto_spend: true,
    battle_round_id: 'round-3',
    expected_cinematic_policy: {
      cinematic_profile: 'plus',
      target_duration_seconds: 20,
      duration_policy_version: 'cinematics-v3',
    },
    expected_funding_quote: { method: 'credit', cost_credits: 1 },
  });
});

it('preserves a changed quote response so the player can reconfirm before spending', async () => {
  const refreshed = {
    can_upgrade: true,
    method: 'credit',
    cost_credits: 2,
    cinematic_profile: 'standard',
    target_duration_seconds: 8,
    duration_policy_version: 'cinematics-v3',
  };
  (invokeFunctionResult as jest.Mock).mockResolvedValueOnce({
    data: {
      success: false,
      can_upgrade: false,
      quote_changed: true,
      entitlement_check: refreshed,
    },
    error: null,
  });
  expect(await requestVideoUpgrade('battle', true)).toMatchObject({
    success: false,
    can_upgrade: false,
    quote_changed: true,
    entitlement_check: refreshed,
  });
});

it('confirms a disabled-rollout policy with its null version so rollout changes require reconfirmation', async () => {
  await requestVideoUpgrade('battle', true, undefined, {
    can_upgrade: true,
    method: 'subscriber_full',
    cost_credits: 0,
    cinematic_profile: 'standard',
    target_duration_seconds: 12,
    duration_policy_version: null,
  });
  expect(invokeFunctionResult).toHaveBeenCalledWith('request-video-upgrade', {
    battle_id: 'battle',
    auto_spend: true,
    expected_cinematic_policy: {
      cinematic_profile: 'standard',
      target_duration_seconds: 12,
      duration_policy_version: null,
    },
    expected_funding_quote: { method: 'subscriber_full', cost_credits: 0 },
  });
});

it.each([
  null,
  { enabled: false, plus_duration_seconds: 20 },
  { enabled: true, plus_duration_seconds: 12 },
])(
  'fails closed for unavailable or incompatible cinematic benefit capability %j',
  async (data) => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data, error: null });
    expect(await getCinematicCapabilities()).toEqual({
      enabled: false,
      plus_duration_seconds: 20,
    });
  },
);

it('reads the enabled benefit from the authenticated server capability', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValueOnce({
    data: { enabled: true, plus_duration_seconds: 20 },
    error: null,
  });
  expect(await getCinematicCapabilities()).toEqual({
    enabled: true,
    plus_duration_seconds: 20,
  });
  expect(supabase.rpc).toHaveBeenCalledWith('get_cinematic_capabilities');
});
