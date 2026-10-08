import React from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import ResultMedia from '@/components/battle/ResultMedia';
import ResultActions from '@/components/battle/ResultActions';
import ResultMediaSection from '@/components/battle/ResultMediaSection';
import { GameText } from '@/components/game';
import { useResultMediaRecovery } from '@/hooks/useResultMediaRecovery';
import { requestVideoUpgrade } from '@/utils/monetization';

const mockEnterFullscreen = jest.fn<Promise<void>, []>();
const mockExitFullscreen = jest.fn<Promise<void>, []>();
const mockInvoke = jest.fn();
const mockFrom = jest.fn();

jest.mock('expo-font', () => ({
  isLoaded: jest.fn(() => false),
  loadAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-video', () => {
  // Jest hoists this factory above module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    VideoView: React.forwardRef(function MockVideoView(
      props: Record<string, unknown>,
      ref: React.ForwardedRef<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        enterFullscreen: mockEnterFullscreen,
        exitFullscreen: mockExitFullscreen,
      }));
      return React.createElement('VideoView', props);
    }),
  };
});
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: () => true,
}));
jest.mock('@/utils/supabase', () => ({
  invokeAuthenticatedFunction: (...args: unknown[]) => mockInvoke(...args),
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
jest.mock('@/utils/monetization', () => ({
  requestVideoUpgrade: jest.fn(),
}));

function player() {
  return {
    currentTime: 0,
    play: jest.fn(),
    pause: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnterFullscreen.mockResolvedValue();
  mockExitFullscreen.mockResolvedValue();
});

test('composes media then actions then rewards with one reviewed-media marker', () => {
  const fake = player();
  const view = render(
    <ResultMediaSection
      showMedia
      media={
        <ResultMedia
          videoUrl="https://example.com/reviewed.mp4"
          player={fake as never}
          playbackError={null}
          retry={() => {}}
          status={null}
          revised
          roundNumber={2}
        />
      }
      actions={
        <ResultActions
          videoPlayable
          revised
          busy={false}
          onShareCard={() => {}}
          onShareVideo={() => {}}
          onReplay={() => {}}
        />
      }
      rewards={<GameText>Rewards fixture</GameText>}
    />,
  );

  expect(
    view.getAllByTestId(/^result-section-/).map((node) => node.props.testID),
  ).toEqual([
    'result-section-media',
    'result-section-actions',
    'result-section-rewards',
  ]);
  expect(view.getAllByText('Before review')).toHaveLength(1);
  expect(view.getByText('Sharing unavailable')).toBeTruthy();
});

test('result signing recovery has no caption query or purchase path', async () => {
  mockInvoke.mockResolvedValue({
    signed_url: 'https://example.com/signed.mp4',
  });
  const hook = renderHook(() =>
    useResultMediaRecovery({
      accountId: 'player-1',
      battleId: 'battle-1',
      videoJob: { id: 'job-1', status: 'succeeded' },
    }),
  );
  await waitFor(() =>
    expect(hook.result.current.videoUrl).toBe('https://example.com/signed.mp4'),
  );

  expect(mockInvoke).toHaveBeenCalledWith('sign-battle-video', {
    video_job_id: 'job-1',
  });
  expect(mockFrom).not.toHaveBeenCalled();
  expect(requestVideoUpgrade).not.toHaveBeenCalled();

  await act(async () => hook.result.current.retry());
  expect(mockFrom).not.toHaveBeenCalled();
  expect(requestVideoUpgrade).not.toHaveBeenCalled();
});

test('composed signing and fullscreen retries cannot request generation', async () => {
  const retryMedia = jest.fn();
  const fake = player();
  const signing = render(
    <ResultMediaSection
      showMedia
      media={
        <ResultMedia
          videoUrl={null}
          player={fake as never}
          playbackError="signing failed"
          retry={retryMedia}
          status={null}
          revised={false}
          roundNumber={null}
        />
      }
      actions={<GameText>Actions</GameText>}
      rewards={<GameText>Rewards</GameText>}
    />,
  );
  fireEvent.press(signing.getByRole('button', { name: 'Retry loading media' }));
  expect(retryMedia).toHaveBeenCalledTimes(1);
  expect(requestVideoUpgrade).not.toHaveBeenCalled();
  signing.unmount();

  mockEnterFullscreen.mockRejectedValueOnce(new Error('presentation failed'));
  const presentation = render(
    <ResultMediaSection
      showMedia
      media={
        <ResultMedia
          videoUrl="https://example.com/signed.mp4"
          player={fake as never}
          playbackError={null}
          retry={retryMedia}
          status={null}
          revised={false}
          roundNumber={1}
        />
      }
      actions={<GameText>Actions</GameText>}
      rewards={<GameText>Rewards</GameText>}
    />,
  );
  await act(async () => {
    fireEvent.press(
      presentation.getByRole('button', { name: 'Play cinematic' }),
    );
  });
  mockEnterFullscreen.mockResolvedValue();
  await act(async () => {
    fireEvent.press(
      presentation.getByRole('button', { name: 'Retry opening cinematic' }),
    );
  });
  expect(mockEnterFullscreen).toHaveBeenCalledTimes(2);
  expect(requestVideoUpgrade).not.toHaveBeenCalled();
});
