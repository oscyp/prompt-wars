/**
 * Tap routing for push notifications, and the once-per-tap guard on the
 * cold-start path.
 */
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  routeFromNotificationData,
  handleInitialNotification,
  addNotificationResponseListener,
} from '@/utils/notifications';

// babel-plugin-jest-hoist lifts these above the imports at transform time.
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
}));

const push = router.push as jest.Mock;
const getLast = Notifications.getLastNotificationResponseAsync as jest.Mock;
const addListener =
  Notifications.addNotificationResponseReceivedListener as jest.Mock;

function response(identifier: string, data: Record<string, unknown>) {
  return {
    actionIdentifier: 'default',
    notification: { request: { identifier, content: { data } } },
  };
}

describe('routeFromNotificationData', () => {
  beforeEach(() => push.mockClear());

  it('sends battle pushes to their battle screen', () => {
    routeFromNotificationData({ type: 'result_ready', battleId: 'b1' });
    routeFromNotificationData({ type: 'video_ready', battleId: 'b2' });
    routeFromNotificationData({ type: 'opponent_submitted', battleId: 'b3' });
    routeFromNotificationData({ type: 'round_start', battleId: 'b4' });
    expect(push.mock.calls.map((c) => c[0])).toEqual([
      '/(battle)/result?battleId=b1',
      '/(battle)/result?battleId=b2',
      '/(battle)/waiting?battleId=b3',
      '/(battle)/waiting?battleId=b4',
    ]);
  });

  it('does not navigate to a battle screen without a battle id', () => {
    routeFromNotificationData({ type: 'result_ready' });
    routeFromNotificationData({ type: 'opponent_submitted' });
    expect(push).not.toHaveBeenCalled();
  });

  it('lands the retention categories on the tab that owns them', () => {
    routeFromNotificationData({ type: 'daily_quest' });
    routeFromNotificationData({ type: 'season_ending' });
    routeFromNotificationData({ type: 'friend_challenge' });
    expect(push.mock.calls.map((c) => c[0])).toEqual([
      '/(tabs)/home',
      '/(tabs)/rankings',
      '/(tabs)/battles',
    ]);
  });

  it('ignores unknown types and empty payloads', () => {
    routeFromNotificationData({ type: 'mystery', battleId: 'b1' });
    routeFromNotificationData(null);
    routeFromNotificationData(undefined);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('cold-start handling', () => {
  beforeEach(() => {
    push.mockClear();
    getLast.mockReset();
    addListener.mockClear();
  });

  it('routes the launching notification once, however often the check re-runs', async () => {
    getLast.mockResolvedValue(
      response('n-1', { type: 'result_ready', battleId: 'b1' }),
    );
    await handleInitialNotification();
    await handleInitialNotification();
    await handleInitialNotification();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/(battle)/result?battleId=b1');
  });

  it('routes a different notification after the first', async () => {
    getLast.mockResolvedValue(response('n-2', { type: 'daily_quest' }));
    await handleInitialNotification();
    expect(push).toHaveBeenLastCalledWith('/(tabs)/home');
  });

  it('shares the guard with the foreground listener', async () => {
    addNotificationResponseListener();
    const listener = addListener.mock.calls[0][0] as (r: unknown) => void;
    listener(response('n-3', { type: 'season_ending' }));
    expect(push).toHaveBeenLastCalledWith('/(tabs)/rankings');

    push.mockClear();
    getLast.mockResolvedValue(response('n-3', { type: 'season_ending' }));
    await handleInitialNotification();
    expect(push).not.toHaveBeenCalled();
  });

  it('swallows a failing native call', async () => {
    getLast.mockRejectedValue(new Error('no native module'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(handleInitialNotification()).resolves.toBeUndefined();
    expect(push).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
