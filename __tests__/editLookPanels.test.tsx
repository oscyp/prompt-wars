import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
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

test('guided editor exposes style and palette while trait options use disclosures', () => {
  const view = render(
    <LookPanel look={look} changedKeys={new Set()} onStage={jest.fn()} />,
  );
  expect(view.getByText('Choose traits')).toBeTruthy();
  expect(view.getByRole('button', { name: 'View all styles' })).toBeTruthy();
  const group = view.getByRole('button', { name: /Vibe,/ });
  expect(group.props.accessibilityState.expanded).toBe(false);
  fireEvent.press(group);
  expect(
    view.getByRole('button', { name: /Vibe,/ }).props.accessibilityState
      .expanded,
  ).toBe(true);
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
  fireEvent.press(view.getByRole('button', { name: 'Use Lucky Coin · Free' }));
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
