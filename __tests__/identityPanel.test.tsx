import React from 'react';
import { render } from '@testing-library/react-native';
import IdentityPanel from '@/components/edit-character/IdentityPanel';
import type { EditPricing } from '@/utils/editCooldowns';

jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

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
  it('labels each archetype card for a screen reader', () => {
    const { getByLabelText } = renderPanel(pricing());
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
