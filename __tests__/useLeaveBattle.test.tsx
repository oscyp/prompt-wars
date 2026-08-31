/**
 * The leave flow's client half.
 *
 * The cases that matter are the ones where getting it wrong costs a player
 * money or strands them in a battle: a 402 must not navigate, a double-tap
 * must not fire two requests, and "have I locked?" must be about THIS player.
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLeaveBattle } from '@/hooks/useLeaveBattle';
import { leaveBattle } from '@/utils/battles';
import type { PromptUpdate } from '@/hooks/useRealtimeBattle';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock('@/utils/battles', () => ({
  ...jest.requireActual('@/utils/battles'),
  leaveBattle: jest.fn(),
}));

jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { credits: 2 } }),
        }),
      }),
    }),
  },
}));

const mockedLeave = leaveBattle as jest.MockedFunction<typeof leaveBattle>;

const ME = 'me-profile-id';
const OPPONENT = 'opponent-profile-id';
const BATTLE = 'battle-1';

function prompt(profileId: string, isLocked: boolean): PromptUpdate {
  return {
    id: `p-${profileId}`,
    battle_id: BATTLE,
    profile_id: profileId,
    is_locked: isLocked,
    locked_at: isLocked ? new Date().toISOString() : null,
    moderation_status: 'approved',
  };
}

function setup(prompts: PromptUpdate[] = []) {
  return renderHook(() =>
    useLeaveBattle(BATTLE, {
      format: 'single',
      mode: 'ranked',
      isBot: false,
      prompts,
      myProfileId: ME,
    }),
  );
}

/** Fires the destructive button in the most recent Alert. */
function confirmAlert() {
  const spy = Alert.alert as unknown as jest.Mock;
  const buttons = spy.mock.calls[spy.mock.calls.length - 1][2];
  const destructive = buttons.find(
    (b: { style?: string }) => b.style === 'destructive',
  );
  return destructive.onPress();
}

describe('useLeaveBattle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  describe('iHaveLocked', () => {
    it('is false when nobody has locked', async () => {
      const { result } = setup([]);
      expect(result.current.iHaveLocked).toBe(false);
    });

    it('is false when only the OPPONENT has locked', async () => {
      // The old server gate counted locked prompts battle-wide, so the
      // opponent locking first took away your free exit. Yours is what counts.
      const { result } = setup([prompt(OPPONENT, true)]);
      expect(result.current.iHaveLocked).toBe(false);
    });

    it('is true once this player has locked', async () => {
      const { result } = setup([prompt(OPPONENT, true), prompt(ME, true)]);
      expect(result.current.iHaveLocked).toBe(true);
    });

    it('is false while this player has an unlocked draft', async () => {
      const { result } = setup([prompt(ME, false)]);
      expect(result.current.iHaveLocked).toBe(false);
    });
  });

  describe('price', () => {
    it('reads the live price from the table', async () => {
      const { result } = setup();
      await waitFor(() => expect(result.current.price).toBe(2));
    });
  });

  describe('leaving', () => {
    it('navigates home on success', async () => {
      mockedLeave.mockResolvedValue({ success: true, action: 'forfeited' });
      const { result } = setup([prompt(ME, true)]);

      await act(async () => {
        result.current.confirmLeave();
        await confirmAlert();
      });

      expect(mockedLeave).toHaveBeenCalledWith(BATTLE);
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
    });

    it('completes the pending navigation when one was handed in', async () => {
      // The back-guard path: the player was already going somewhere, and
      // completing that beats redirecting them home.
      mockedLeave.mockResolvedValue({ success: true, action: 'forfeited' });
      const onLeft = jest.fn();
      const { result } = setup([prompt(ME, true)]);

      await act(async () => {
        result.current.confirmLeave(onLeft);
        await confirmAlert();
      });

      expect(onLeft).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('does not fire twice on a double tap', async () => {
      mockedLeave.mockResolvedValue({ success: true, action: 'forfeited' });
      const { result } = setup([prompt(ME, true)]);

      await act(async () => {
        result.current.confirmLeave();
        const first = confirmAlert();
        result.current.confirmLeave();
        await first;
      });

      expect(mockedLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe('insufficient credits', () => {
    it('offers the shop and does NOT navigate away', async () => {
      mockedLeave.mockResolvedValue({
        success: false,
        code: 'insufficient_credits',
        price: 2,
        balance: 1,
        shortfall: 1,
        error: 'Not enough credits to leave this battle',
      });
      const { result } = setup([prompt(ME, true)]);

      await act(async () => {
        result.current.confirmLeave();
        await confirmAlert();
      });

      // Still in the battle — the exit is blocked, not silently swallowed.
      expect(mockReplace).not.toHaveBeenCalled();

      const spy = Alert.alert as unknown as jest.Mock;
      const [title, message, buttons] =
        spy.mock.calls[spy.mock.calls.length - 1];
      expect(title).toBe('Not enough credits');
      expect(message).toBe(
        'You need 1 more credit for this. Top up in the shop.',
      );

      // Telling a player to top up from a screen with no route to the wallet
      // is the exact failure this button exists to prevent.
      const topUp = buttons.find((b: { text: string }) => b.text === 'Top up');
      expect(topUp).toBeDefined();
      topUp.onPress();
      expect(mockPush).toHaveBeenCalledWith('/(profile)/wallet');
    });

    it('allows a retry after the failure', async () => {
      mockedLeave.mockResolvedValueOnce({
        success: false,
        code: 'insufficient_credits',
        shortfall: 1,
      });
      const { result } = setup([prompt(ME, true)]);

      await act(async () => {
        result.current.confirmLeave();
        await confirmAlert();
      });
      await waitFor(() => expect(result.current.isLeaving).toBe(false));

      mockedLeave.mockResolvedValueOnce({ success: true, action: 'forfeited' });
      await act(async () => {
        result.current.confirmLeave();
        await confirmAlert();
      });

      expect(mockedLeave).toHaveBeenCalledTimes(2);
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
    });
  });
});
