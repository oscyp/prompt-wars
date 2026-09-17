import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import TutorialCoach from '@/components/TutorialCoach';
import PracticeReplayButton from '@/components/PracticeReplayButton';
import { invokeAuthenticatedFunction, supabase } from '@/utils/supabase';
import type { TutorialState } from '@/utils/tutorialState';
jest.mock('@/utils/supabase', () => ({
  invokeAuthenticatedFunction: jest.fn(),
  supabase: { from: jest.fn() },
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/providers/AuthProvider', () => {
  const value = { user: { id: 'owner' } };
  return { useAuth: () => value };
});
jest.mock('@/hooks/useThemedColors', () => ({
  useThemedColors: () => ({
    text: '#fff',
    card: '#111',
    primary: '#ddd',
    textSecondary: '#aaa',
  }),
}));
let saved: TutorialState;
beforeEach(() => {
  saved = {
    battle_id: 'practice-one',
    dismissed_hints: [],
    completed_at: null,
  };
  mockPush.mockReset();
  (supabase.from as jest.Mock).mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { ...saved }, error: null }),
      }),
    }),
  }));
  (invokeAuthenticatedFunction as jest.Mock).mockImplementation(
    async (name, body) => {
      if (name === 'record-funnel-event') return { recorded: true };
      if (body.action === 'dismiss')
        saved = {
          ...saved,
          dismissed_hints: [...saved.dismissed_hints, body.hint],
        };
      if (body.action === 'complete')
        saved = { ...saved, completed_at: '2026-09-13' };
      if (body.action === 'replay')
        saved = {
          battle_id: 'practice-two',
          dismissed_hints: [],
          completed_at: null,
        };
      return { state: { ...saved } };
    },
  );
});
test('dismissed guidance stays dismissed after unmount and resume', async () => {
  const first = render(<TutorialCoach battleId="practice-one" stage="theme" />);
  await waitFor(() => expect(first.getByText('Practice guide')).toBeTruthy());
  fireEvent.press(first.getByLabelText('Dismiss practice hint'));
  await waitFor(() => expect(first.queryByText('Practice guide')).toBeNull());
  first.unmount();
  const resumed = render(
    <TutorialCoach battleId="practice-one" stage="theme" />,
  );
  await waitFor(() => expect(saved.dismissed_hints).toContain('theme'));
  expect(resumed.queryByText('Practice guide')).toBeNull();
});
test('payoff completes practice and gives a reachable customization invitation', async () => {
  const screen = render(
    <TutorialCoach battleId="practice-one" stage="result" />,
  );
  await waitFor(() => expect(saved.completed_at).toBe('2026-09-13'));
  fireEvent.press(screen.getByText('Make your fighter your own · Customize'));
  expect(mockPush).toHaveBeenCalledWith('/(profile)/edit-character');
});
test('replay explicitly requests another guided practice and navigates to returned battle', async () => {
  saved.completed_at = '2026-09-13';
  const screen = render(<PracticeReplayButton />);
  fireEvent.press(screen.getByText('Replay practice guide'));
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith(
      '/(battle)/prompt-entry?battleId=practice-two',
    ),
  );
  expect(saved.dismissed_hints).toEqual([]);
  expect(saved.completed_at).toBeNull();
});
test('progress error offers retry and does not mark an unrelated battle completed', async () => {
  (supabase.from as jest.Mock).mockImplementationOnce(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: null,
          error: { message: 'offline' },
        }),
      }),
    }),
  }));
  const screen = render(
    <TutorialCoach battleId="other-battle" stage="result" />,
  );
  await waitFor(() =>
    expect(screen.getByText('Retry practice guidance')).toBeTruthy(),
  );
  fireEvent.press(screen.getByText('Retry practice guidance'));
  await waitFor(() =>
    expect(screen.queryByText('Retry practice guidance')).toBeNull(),
  );
  expect(saved.completed_at).toBeNull();
  expect(screen.queryByText('Practice guide')).toBeNull();
});
