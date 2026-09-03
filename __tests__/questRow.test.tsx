/**
 * A quest row: title and description, a progress track, the count or the
 * Claim button — one grouped label for the text, the button on its own.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import QuestRow, {
  questDescription,
  questProgress,
  questRowLabel,
  questTitle,
} from '@/components/QuestRow';
import type { DailyQuest } from '@/utils/dailyMeta';

function quest(overrides: Partial<DailyQuest> = {}): DailyQuest {
  return {
    id: 'q1',
    daily_quest_id: 'dq1',
    current_value: 1,
    completed: false,
    completed_at: null,
    quest_date: '2026-09-03',
    quest: {
      id: 'def1',
      title: 'Win a battle',
      description: 'Win any battle today',
      quest_type: 'win',
      target_value: 3,
      reward_credits: 5,
      reward_xp: 0,
    },
    ...overrides,
  };
}

describe('quest copy helpers', () => {
  it('prefers the title, then the description, then a placeholder', () => {
    expect(questTitle(quest())).toBe('Win a battle');
    expect(
      questTitle(
        quest({
          quest: { ...quest().quest!, title: '  ', description: 'Do it' },
        }),
      ),
    ).toBe('Do it');
    expect(questTitle(quest({ quest: null }))).toBe('Quest');
  });

  it('drops a description that only repeats the title', () => {
    expect(questDescription(quest())).toBe('Win any battle today');
    expect(
      questDescription(
        quest({
          quest: { ...quest().quest!, description: 'win a battle ' },
        }),
      ),
    ).toBeNull();
    expect(questDescription(quest({ quest: null }))).toBeNull();
  });

  it('clamps progress and knows claimable from complete', () => {
    expect(questProgress(quest())).toEqual({
      value: 1,
      target: 3,
      fraction: 1 / 3,
      completed: false,
      claimable: false,
    });
    expect(questProgress(quest({ current_value: 5 }))).toMatchObject({
      fraction: 1,
      claimable: true,
      completed: false,
    });
    expect(
      questProgress(quest({ current_value: 3, completed: true })),
    ).toMatchObject({ fraction: 1, claimable: false, completed: true });
    // A zero target never divides by zero.
    expect(
      questProgress(
        quest({
          current_value: 0,
          quest: { ...quest().quest!, target_value: 0 },
        }),
      ),
    ).toMatchObject({ target: 1, fraction: 0 });
  });

  it('labels progress, a waiting reward and completion', () => {
    expect(questRowLabel(quest())).toBe('Win a battle, 1 of 3, +5 credits');
    expect(questRowLabel(quest({ current_value: 3 }))).toBe(
      'Win a battle, 3 of 3',
    );
    expect(questRowLabel(quest({ completed: true }))).toBe(
      'Win a battle, complete',
    );
    expect(
      questRowLabel(quest({ quest: { ...quest().quest!, reward_credits: 0 } })),
    ).toBe('Win a battle, 1 of 3');
  });
});

describe('QuestRow', () => {
  it('groups title, description and count under one label', () => {
    const { getByLabelText, getByText, queryByRole } = render(
      <QuestRow quest={quest()} onClaim={jest.fn()} />,
    );
    const body = getByLabelText('Win a battle, 1 of 3, +5 credits');
    expect(body.props.accessible).toBe(true);
    getByText('Win a battle');
    getByText('Win any battle today');
    getByText('1/3');
    getByText('+5 credits');
    expect(queryByRole('button')).toBeNull();
  });

  it('fills the track in proportion', () => {
    const { getByTestId } = render(
      <QuestRow quest={quest()} onClaim={jest.fn()} />,
    );
    const fill = getByTestId('quest-fill');
    const flat = Object.assign({}, ...[fill.props.style].flat());
    expect(flat.width).toBe('33%');
  });

  it('shows the Claim button as its own control when the target is reached', () => {
    const onClaim = jest.fn();
    const done = quest({ current_value: 3 });
    const { getByRole, getByLabelText, queryByText } = render(
      <QuestRow quest={done} onClaim={onClaim} />,
    );
    getByLabelText('Win a battle, 3 of 3');
    const button = getByRole('button', { name: 'Claim 5 credits' });
    expect(queryByText('3/3')).toBeNull();
    fireEvent.press(button);
    expect(onClaim).toHaveBeenCalledWith(done);
  });

  it('disables the Claim button while a claim is in flight', () => {
    const { getByRole } = render(
      <QuestRow
        quest={quest({ current_value: 3 })}
        claiming
        onClaim={jest.fn()}
      />,
    );
    const button = getByRole('button', { name: 'Claim 5 credits' });
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
  });

  it('says complete once the reward has been taken', () => {
    const { getByLabelText, getByText, queryByRole } = render(
      <QuestRow
        quest={quest({ current_value: 3, completed: true })}
        onClaim={jest.fn()}
      />,
    );
    getByLabelText('Win a battle, complete');
    getByText('Complete');
    expect(queryByRole('button')).toBeNull();
  });
});
