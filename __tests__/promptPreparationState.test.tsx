import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import PromptPreparationState, {
  PROMPT_PREPARATION_GRACE_MS,
  PROMPT_PREPARATION_SLOW_MS,
} from '@/components/prompt-preparation-state';

jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

describe('PromptPreparationState', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows personalized anticipation immediately during generation', () => {
    const onWriteOwn = jest.fn();
    const { getByLabelText, getByText } = render(
      <PromptPreparationState
        fighterName="Nova"
        moveType="attack"
        generating
        onWriteOwn={onWriteOwn}
      />,
    );

    getByLabelText("Preparing three prompt ideas for Nova's Attack move");
    getByText('Preparing your ideas');
    getByText(/Tailoring three prompts to Nova/);

    fireEvent.press(getByLabelText('Write your own prompt now'));
    expect(onWriteOwn).toHaveBeenCalledTimes(1);
  });

  it('does not flash for a fast existing-set read', () => {
    const screen = render(
      <PromptPreparationState
        fighterName="Nova"
        moveType="defense"
        generating={false}
        onWriteOwn={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('prompt-preparation')).toBeNull();
    act(() => jest.advanceTimersByTime(PROMPT_PREPARATION_GRACE_MS));
    screen.getByText('Loading your ideas');
    screen.getByLabelText(
      'Loading prompt ideas already prepared for this move',
    );
  });

  it('acknowledges a wait that lasts longer than five seconds', () => {
    const screen = render(
      <PromptPreparationState
        fighterName="Nova"
        moveType="finisher"
        generating
        onWriteOwn={jest.fn()}
      />,
    );

    expect(
      screen.queryByText(
        'Still working — personalized ideas can take a little longer.',
      ),
    ).toBeNull();

    act(() => jest.advanceTimersByTime(PROMPT_PREPARATION_SLOW_MS));
    screen.getByText(
      'Still working — personalized ideas can take a little longer.',
    );
  });
});
