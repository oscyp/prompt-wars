import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PromptComposerPanel } from '@/components/battle/PromptComposerPanel';
import {
  composerReducer,
  createComposerState,
  type ComposerState,
} from '@/utils/promptComposer';
import type { ComposerActionSuggestion, MoveType } from '@/utils/battles';
jest.mock('@/components/game', () => {
  const { Text, Pressable, TextInput } = jest.requireActual('react-native');
  return {
    ...jest.requireActual('@/components/game'),
    GameText: Text,
    GameButton: ({ label, onPress, selected, ...props }: any) => (
      <Pressable
        {...props}
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={onPress}
      >
        <Text>{label}</Text>
      </Pressable>
    ),
    GameField: ({ label, ...props }: any) => (
      <TextInput accessibilityLabel={label} {...props} />
    ),
  };
});
const types: MoveType[] = ['attack', 'defense', 'finisher'];
const suggestions: ComposerActionSuggestion[] = types.flatMap((moveType) =>
  [1, 2, 3].map((n) => ({
    id: `${moveType}-${n}`,
    moveType,
    source: 'authored',
    title: `${moveType} ${n}`,
    action: `${moveType} action ${n}`,
    body: `${moveType} action ${n}`,
    affordanceIds: n === 1 ? ['rope'] : ['wall'],
    intentHints: [1, 2, 3].map((i) => ({
      id: `i${i}`,
      text: `Intention ${i}`,
      approachHints: [1, 2, 3].map((j) => ({
        id: `i${i}-a${j}`,
        text: `by timing approach ${j}`,
      })),
    })),
  })),
);
function Harness({
  filter = null,
  paidIds = [],
  stage = 'action',
  remountStages = false,
  initialState,
}: {
  filter?: string | null;
  paidIds?: string[];
  stage?: 'action' | 'intent' | 'approach';
  remountStages?: boolean;
  initialState?: ComposerState;
}) {
  const [state, dispatch] = React.useReducer(
    composerReducer,
    undefined,
    () => initialState ?? createComposerState(),
  );
  return (
    <PromptComposerPanel
      key={remountStages ? stage : undefined}
      state={state}
      suggestions={suggestions}
      disabled={false}
      onChange={(change) => dispatch({ type: 'change', change })}
      onUndo={() => dispatch({ type: 'undo' })}
      stage={stage}
      onMoveType={(moveType) => dispatch({ type: 'move-type', moveType })}
      affordanceId={filter}
      paidIds={paidIds}
    />
  );
}
it('requires an explicit type before showing exactly three actions', () => {
  const screen = render(<Harness />);
  expect(screen.queryByLabelText('attack action 1')).toBeNull();
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  fireEvent.press(screen.getByLabelText('Attack'));
  expect(screen.getByLabelText('attack action 1')).toBeTruthy();
  expect(screen.queryByLabelText('defense action 1')).toBeNull();
  expect(screen.getAllByRole('radio')).toHaveLength(6);
  fireEvent.press(screen.getByLabelText('attack action 2'));
  expect(
    screen.getByLabelText('attack action 2').props.accessibilityState.selected,
  ).toBe(true);
  expect(screen.queryByLabelText('Intention 1')).toBeNull();
});

it('contains no editable fields or AI provenance labels on any builder view', () => {
  const screen = render(<Harness />);
  fireEvent.press(screen.getByLabelText('Attack'));
  fireEvent.press(screen.getByLabelText('attack action 1'));
  for (const stage of ['action', 'intent', 'approach'] as const) {
    screen.rerender(<Harness stage={stage} />);
    expect(screen.queryByLabelText('Your action')).toBeNull();
    expect(screen.queryByLabelText('Your intention')).toBeNull();
    expect(screen.queryByLabelText('Your approach')).toBeNull();
    expect(
      screen.queryByText(
        /Write an action|Edit your action|Write an intention|Edit your intention|Write an approach|Edit your approach/,
      ),
    ).toBeNull();
    expect(screen.queryByText(/AI idea|Purchased AI idea/)).toBeNull();
  }
});

it('keeps intention and approach on separate views and retains selection on Back', () => {
  const screen = render(<Harness />);
  fireEvent.press(screen.getByLabelText('Finisher'));
  fireEvent.press(screen.getByLabelText('finisher action 2'));
  screen.rerender(<Harness stage="intent" />);
  expect(screen.queryByText('finisher action 2')).toBeNull();
  const recap = () => screen.getByRole('button', { name: /^Your choices/ });
  expect(recap().props.accessibilityState.expanded).toBe(false);
  fireEvent.press(recap());
  expect(screen.getByText('finisher action 2')).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  fireEvent.press(screen.getByLabelText('Intention 2'));
  expect(recap().props.accessibilityState.expanded).toBe(true);
  screen.rerender(<Harness stage="approach" />);
  expect(recap().props.accessibilityState.expanded).toBe(false);
  expect(screen.queryByText('finisher action 2')).toBeNull();
  expect(screen.queryByText('Intention 2')).toBeNull();
  fireEvent.press(recap());
  expect(screen.getByText('finisher action 2')).toBeTruthy();
  expect(screen.getByText('Intention 2')).toBeTruthy();
  expect(screen.getByText('How will you make it work?')).toBeTruthy();
  expect(screen.queryByText('What are you trying to achieve?')).toBeNull();
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  fireEvent.press(screen.getByLabelText('by timing approach 2'));
  expect(recap().props.accessibilityState.expanded).toBe(true);
  fireEvent.press(recap());
  expect(screen.queryByText('finisher action 2')).toBeNull();
  expect(screen.queryByText('Intention 2')).toBeNull();
  screen.rerender(<Harness stage="intent" />);
  expect(
    screen.getByLabelText('Intention 2').props.accessibilityState.selected,
  ).toBe(true);
  screen.rerender(<Harness stage="approach" />);
  expect(
    screen.getByLabelText('by timing approach 2').props.accessibilityState
      .selected,
  ).toBe(true);
});

it('shows a purchased intention set without changing the selected prompt until a choice is pressed', () => {
  const state = composerReducer(createComposerState(), {
    type: 'change',
    change: {
      type: 'action',
      id: 'attack-1',
      text: 'attack action 1',
      moveType: 'attack',
      intentHints: suggestions[0].intentHints,
    },
  });
  const onChange = jest.fn();
  const purchased = [1, 2, 3].map((i) => ({
    id: `paid-i${i}`,
    text: `New intention ${i}`,
    approachHints: [{ id: 'paid-a1', text: 'by waiting for the opening' }],
  }));
  const screen = render(
    <PromptComposerPanel
      state={state}
      stage="intent"
      suggestions={suggestions}
      intentHints={purchased}
      onMoveType={jest.fn()}
      onChange={onChange}
      disabled={false}
    />,
  );
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  expect(screen.queryByLabelText('Intention 1')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('New intention 2'));
  expect(onChange).toHaveBeenCalledWith({
    type: 'intent',
    id: 'paid-i2',
    text: 'New intention 2',
    approachHints: purchased[1].approachHints,
  });
});
