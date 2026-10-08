import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import IdentityPanel from '@/components/edit-character/IdentityPanel';
import type { EditPricing } from '@/utils/editCooldowns';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const CHARACTER = {
  name: 'Rook',
  archetype: 'titan' as const,
  battle_cry: 'Steel meets bone.',
  signature_color: '#EF4444',
};

const FOURTEEN_DAYS = 14 * 24 * 60 * 60;

function pricing(over: Partial<EditPricing> = {}): EditPricing {
  return {
    prices: {
      archetype: { credits: 0, cooldownSeconds: FOURTEEN_DAYS },
      rename: { credits: 0, cooldownSeconds: 7 * 24 * 60 * 60 },
    },
    cooldownMs: {},
    ...over,
  };
}

function renderPanel(p: EditPricing) {
  return render(
    <IdentityPanel
      character={CHARACTER}
      staged={{}}
      changedKeys={new Set()}
      pricing={p}
      onStage={jest.fn()}
    />,
  );
}

const LOCK_LINE = 'A change locks it for 14 days.';

describe('IdentityPanel archetype card', () => {
  it('keeps the chosen archetype compact and exposes all presets on demand', () => {
    const { getByLabelText, queryByLabelText } = renderPanel(pricing());
    expect(queryByLabelText('Archetype: The Mystic')).toBeNull();
    fireEvent.press(getByLabelText('View archetypes, The Titan'));
    expect(getByLabelText('Archetype: The Titan')).toBeTruthy();
    expect(getByLabelText('Archetype: The Mystic')).toBeTruthy();
    expect(
      getByLabelText('Archetype: The Titan').props.accessibilityState.selected,
    ).toBe(true);
  });

  it('says what a change locks before the player makes one', () => {
    const { getByText } = renderPanel(pricing());
    expect(getByText(LOCK_LINE)).toBeTruthy();
  });

  it('drops the lock line while a cooldown is already running', () => {
    // The card badge shows the countdown then; repeating the length would say
    // the same thing twice.
    const { queryByText } = renderPanel(
      pricing({ cooldownMs: { archetype: 3 * 60 * 60 * 1000 } }),
    );
    expect(queryByText(LOCK_LINE)).toBeNull();
  });

  it('says nothing about a lock when the server sets no cooldown', () => {
    const { queryByText } = renderPanel(
      pricing({ prices: { archetype: { credits: 0, cooldownSeconds: 0 } } }),
    );
    expect(queryByText(/locks it for/)).toBeNull();
  });
});

test('an open archetype sheet respects a battle lock that arrives while browsing', () => {
  const onStage = jest.fn();
  const props = {
    character: CHARACTER,
    staged: {},
    changedKeys: new Set<string>(),
    pricing: pricing(),
    onStage,
  };
  const view = render(<IdentityPanel {...props} />);
  fireEvent.press(view.getByLabelText('View archetypes, The Titan'));
  fireEvent.press(view.getByLabelText('Archetype: The Mystic'));
  expect(onStage).toHaveBeenCalledWith('archetype', 'mystic');
  onStage.mockClear();
  view.rerender(<IdentityPanel {...props} disabled />);
  expect(
    view.getByLabelText('Archetype: The Mystic').props.accessibilityState
      .disabled,
  ).toBe(true);
  fireEvent.press(view.getByLabelText('Archetype: The Mystic'));
  expect(onStage).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText('Done'));
  expect(view.queryByLabelText('Archetype: The Mystic')).toBeNull();
});

test('cooling archetypes can be inspected without changing the saved fighter', () => {
  const view = renderPanel(pricing({ cooldownMs: { archetype: 3600000 } }));
  fireEvent.press(view.getByLabelText('View archetypes, The Titan'));
  expect(
    view.getByLabelText('Archetype: The Mystic').props.accessibilityState
      .disabled,
  ).toBe(true);
});

test('archetype identity copy makes no scoring advantage claim', () => {
  const view = renderPanel(pricing());
  expect(
    view.getByText(
      'Identity preset for your fighter and portrait. No scoring bonus.',
    ),
  ).toBeTruthy();
  expect(view.queryByText(/judge weighs/)).toBeNull();
});

test('an unfamiliar saved archetype remains readable instead of crashing the editor', () => {
  const view = render(
    <IdentityPanel
      character={{
        ...CHARACTER,
        archetype: 'legacy-preset' as typeof CHARACTER.archetype,
      }}
      staged={{}}
      changedKeys={new Set()}
      pricing={pricing()}
      onStage={jest.fn()}
    />,
  );
  expect(view.getByLabelText('View archetypes, legacy-preset')).toBeTruthy();
  fireEvent.press(view.getByLabelText('View archetypes, legacy-preset'));
  expect(view.getByLabelText('Archetype: The Titan')).toBeTruthy();
});
