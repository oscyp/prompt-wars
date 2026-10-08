import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { traitOptions } from '@/utils/traitOptions';
import LookPanel from '@/components/edit-character/LookPanel';
import GearPanel from '@/components/edit-character/GearPanel';
import IdentityPanel from '@/components/edit-character/IdentityPanel';

jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const look = {
  artStyle: 'comic' as const,
  palette: null,
  vibe: null,
  silhouette: null,
  era: null,
  expression: null,
  portraitPromptRaw: null,
};

test('trait sheet stages selection then closes; closing alone leaves the draft unchanged', () => {
  const onStage = jest.fn();
  const view = render(
    <LookPanel look={look} changedKeys={new Set()} onStage={onStage} />,
  );
  fireEvent.press(view.getByRole('button', { name: /Vibe,/ }));
  fireEvent.press(view.getAllByRole('radio')[0]);
  expect(onStage).toHaveBeenCalledWith('vibe', expect.any(String));
  expect(view.queryByRole('button', { name: 'Close Vibe choices' })).toBeNull();
  onStage.mockClear();
  fireEvent.press(view.getByRole('button', { name: /Vibe,/ }));
  fireEvent.press(view.getByRole('button', { name: 'Close Vibe choices' }));
  expect(onStage).not.toHaveBeenCalled();
});

test('written mode hides inactive trait controls and keeps the description readable when locked', () => {
  const view = render(
    <LookPanel
      look={{ ...look, portraitPromptRaw: '星の守り手' }}
      changedKeys={new Set()}
      disabled
      onStage={jest.fn()}
    />,
  );
  expect(view.getByLabelText('Your portrait description').props.editable).toBe(
    false,
  );
  expect(view.queryByRole('button', { name: /Vibe,/ })).toBeNull();
  expect(view.getByText('Your guided choices are kept')).toBeTruthy();
});

test('current legacy gear is retained while new selection stays curated and explicit', () => {
  const onEquip = jest.fn();
  const view = render(
    <GearPanel
      items={[
        {
          id: 'legacy',
          name: 'Lipstick',
          description: 'My signature',
          itemClass: 'relic',
          isCustom: true,
        },
        {
          id: 'coin',
          name: 'Lucky Coin',
          description: 'A lucky coin',
          itemClass: 'relic',
        },
      ]}
      equippedId="legacy"
      loading={false}
      error={null}
      onRetry={jest.fn()}
      onEquip={onEquip}
    />,
  );
  expect(view.getByText('Lipstick')).toBeTruthy();
  expect(view.getByText('Retained custom item')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Preview Lucky Coin' }));
  expect(onEquip).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Use Lucky Coin' }));
  expect(onEquip).toHaveBeenCalledWith('coin');
  expect(view.queryByRole('button', { name: 'Preview Lipstick' })).toBeNull();
});

test('battle locked fighter fields expose real read-only state and do not stage edits', () => {
  const onStage = jest.fn();
  const view = render(
    <IdentityPanel
      character={{
        name: 'Żaneta',
        archetype: 'mystic',
        battle_cry: 'Stars',
        signature_color: '#EF4444',
      }}
      staged={{}}
      changedKeys={new Set()}
      pricing={{ prices: {}, cooldownMs: {} }}
      disabled
      onStage={onStage}
    />,
  );
  expect(view.getByLabelText('Fighter name').props.editable).toBe(false);
  expect(view.getByLabelText('Battle cry').props.editable).toBe(false);
  fireEvent.changeText(view.getByLabelText('Fighter name'), 'Changed');
  expect(onStage).not.toHaveBeenCalled();
});

test.each(['vibe', 'silhouette', 'era', 'expression'] as const)(
  'retains every %s key and prevents locked selections',
  (group) => {
    const onStage = jest.fn();
    const title = group[0].toUpperCase() + group.slice(1);
    const view = render(
      <LookPanel
        look={look}
        expandedGroups={{ [group]: true }}
        changedKeys={new Set()}
        disabled
        onStage={onStage}
      />,
    );
    expect(view.queryAllByRole('radio')).toHaveLength(0);
    fireEvent.press(view.getByRole('button', { name: `${title}, Choose` }));
    const choices = view.getAllByRole('radio');
    expect(choices).toHaveLength(traitOptions(group).length);
    choices.forEach((choice) => {
      expect(choice.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(choice);
    });
    expect(onStage).not.toHaveBeenCalled();
    expect(
      view.getByRole('button', { name: `Close ${title} choices` }),
    ).toBeTruthy();
  },
);

test('Browse all reveals the catalogue without a search field', () => {
  const items = Array.from({ length: 9 }, (_, index) => ({
    id: String(index),
    name: `Relic ${index}`,
    description: 'A relic',
    itemClass: 'relic' as const,
  }));
  const view = render(
    <GearPanel
      items={items}
      equippedId="0"
      loading={false}
      error={null}
      onRetry={jest.fn()}
      onEquip={jest.fn()}
    />,
  );
  expect(view.queryByRole('button', { name: 'Preview Relic 8' })).toBeNull();
  fireEvent.press(view.getByRole('button', { name: 'Browse all 9 items' }));
  expect(view.getByRole('button', { name: 'Preview Relic 8' })).toBeTruthy();
  expect(view.queryByLabelText('Search the item catalogue')).toBeNull();
});

test('bundled trait images cannot impose their intrinsic dimensions on the choice grid', () => {
  const view = render(
    <LookPanel look={look} changedKeys={new Set()} onStage={jest.fn()} />,
  );
  fireEvent.press(view.getByRole('button', { name: /Vibe,/ }));
  for (const option of traitOptions('vibe')) {
    const frame = view.getByTestId(
      `trait-reference-frame-vibe:${option.value}`,
    );
    expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
      width: '100%',
      aspectRatio: 1,
      overflow: 'hidden',
    });
    const art = view.getByTestId(`trait-reference-art-vibe:${option.value}`);
    expect(StyleSheet.flatten(art.props.style)).toMatchObject({
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100%',
      height: '100%',
    });
    fireEvent(art, 'error');
    expect(
      view.getByRole('radio', { name: `Vibe: ${option.label}` }),
    ).toBeTruthy();
    expect(
      view.queryByTestId(`trait-reference-art-vibe:${option.value}`),
    ).toBeNull();
    expect(
      view.getByTestId(`trait-reference-frame-vibe:${option.value}`),
    ).toBeTruthy();
  }
});
