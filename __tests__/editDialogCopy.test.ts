/**
 * The edit screen's spend and save copy, pinned.
 *
 * Same rules as leaveDialogCopy: the price never appears in a title, prose uses
 * the sentence form ("3 credits") and the chip form ("3 cr") appears only in
 * button labels.
 */
import type { DraftChange } from '@/hooks/useCharacterEditDraft';
import {
  spendRows,
  shortfallFor,
  saveConfirmCopy,
  renderConfirmCopy,
  randomConfirmCopy,
  customItemConfirmCopy,
  topUpCopy,
  discardDraftCopy,
  avatarPendingCopy,
  renderButtonCopy,
  randomButtonCopy,
  customItemButtonCopy,
  renderingCaption,
  RENDER_EXPECTED_DURATION,
  RENDER_PHASE_LABEL,
} from '@/utils/editDialogCopy';

const NAME: DraftChange = {
  key: 'name',
  section: 'identity',
  label: 'Name',
  to: 'Golota',
  locksFor: '7 days',
};
const ERA: DraftChange = {
  key: 'era',
  section: 'look',
  label: 'Era',
  to: 'Cyberpunk',
};

const CHIP = /\b\d+ cr\b/;

describe('spendRows', () => {
  it('lists price, balance and the balance after', () => {
    expect(spendRows(3, 7)).toEqual([
      { label: 'Price', value: '3 credits' },
      { label: 'Balance', value: '7 credits' },
      { label: 'After', value: '4 credits' },
    ]);
  });

  it('never shows a negative balance after', () => {
    expect(spendRows(3, 1)).toContainEqual({
      label: 'After',
      value: '0 credits',
    });
  });

  it('shows only the price while the balance is unknown', () => {
    expect(spendRows(3, null)).toEqual([
      { label: 'Price', value: '3 credits' },
    ]);
  });

  it('collapses to Free for a free action', () => {
    expect(spendRows(0, 7)).toEqual([{ label: 'Price', value: 'Free' }]);
  });

  it('spells credits out; the chip form is for buttons', () => {
    for (const row of spendRows(3, 7)) expect(row.value).not.toMatch(CHIP);
  });
});

describe('shortfallFor', () => {
  it('is the gap when short, zero otherwise', () => {
    expect(shortfallFor(3, 1)).toBe(2);
    expect(shortfallFor(3, 3)).toBe(0);
    expect(shortfallFor(3, 9)).toBe(0);
  });

  it('never claims a shortfall on an unknown balance', () => {
    expect(shortfallFor(3, null)).toBe(0);
  });
});

describe('titles never carry a price', () => {
  it('across every sheet', () => {
    const copies = [
      saveConfirmCopy({ changes: [NAME] }),
      renderConfirmCopy({ price: 3, balance: 7, changes: [NAME] }),
      randomConfirmCopy({ price: 5, balance: 7, changes: [] }),
      customItemConfirmCopy({
        price: 3,
        balance: 7,
        itemName: 'Lucky Coin',
        itemClassLabel: 'Symbol',
      }),
      topUpCopy({ price: 3, balance: 1 }),
    ];
    for (const copy of copies) {
      // "Not enough credits" is fine; "3 credits" in a title is not.
      expect(copy.title).not.toMatch(/\d+\s*credit/i);
      expect(copy.title).not.toMatch(CHIP);
      for (const line of copy.lines) expect(line).not.toMatch(CHIP);
    }
  });
});

describe('saveConfirmCopy', () => {
  it('lists each change and what it locks', () => {
    const copy = saveConfirmCopy({ changes: [NAME, ERA] });
    expect(copy.title).toBe('Save changes?');
    expect(copy.subtitle).toBe('Free');
    expect(copy.lines).toEqual(['Name: Golota', 'Era: Cyberpunk']);
    expect(copy.footnote).toBe('Name locks for 7 days.');
    expect(copy.confirmLabel).toBe('Save');
    expect(copy.rows).toEqual([]);
  });

  it('omits the lock footnote for look-only changes', () => {
    expect(saveConfirmCopy({ changes: [ERA] }).footnote).toBeUndefined();
  });
});

describe('renderConfirmCopy', () => {
  it('says it saves first only when there is something to save', () => {
    const dirty = renderConfirmCopy({ price: 3, balance: 7, changes: [ERA] });
    expect(dirty.lines[0]).toBe('Saves your changes first:');
    expect(dirty.lines).toContain('Era: Cyberpunk');

    const clean = renderConfirmCopy({ price: 3, balance: 7, changes: [] });
    expect(clean.lines).toEqual([]);
  });

  it('carries the spend rows and the verb', () => {
    const copy = renderConfirmCopy({ price: 3, balance: 7, changes: [] });
    expect(copy.title).toBe('Draw this look?');
    expect(copy.rows).toHaveLength(3);
    expect(copy.confirmLabel).toBe('Draw this look');
  });
});

describe('randomConfirmCopy', () => {
  it('names the staged changes it will discard', () => {
    const copy = randomConfirmCopy({
      price: 5,
      balance: 7,
      changes: [NAME, ERA],
    });
    expect(copy.lines[1]).toBe('Discards 2 staged changes: Name, Era');
    expect(copy.confirmLabel).toBe('Shuffle and draw');
  });

  it('says nothing about discarding when the draft is clean', () => {
    const copy = randomConfirmCopy({ price: 5, balance: 7, changes: [] });
    expect(copy.lines).toHaveLength(1);
    expect(copy.lines[0]).not.toContain('Discards');
  });
});

describe('customItemConfirmCopy', () => {
  it('names the item and its class', () => {
    const copy = customItemConfirmCopy({
      price: 3,
      balance: 7,
      itemName: 'Lucky Coin',
      itemClassLabel: 'Symbol',
    });
    expect(copy.lines[0]).toBe('Lucky Coin · Symbol');
    expect(copy.confirmLabel).toBe('Create');
  });
});

describe('topUpCopy', () => {
  it('states the shortfall and routes to the wallet', () => {
    const copy = topUpCopy({ price: 3, balance: 1 });
    expect(copy.title).toBe('Not enough credits');
    expect(copy.lines[0]).toContain('2 more credits');
    expect(copy.confirmLabel).toBe('Top up');
  });
});

describe('discardDraftCopy', () => {
  it('pluralises the count', () => {
    expect(discardDraftCopy(1).message).toBe('You have 1 unsaved change.');
    expect(discardDraftCopy(2).message).toBe('You have 2 unsaved changes.');
    expect(discardDraftCopy(2).title).toBe('Discard changes?');
    expect(discardDraftCopy(2).confirmLabel).toBe('Discard');
  });
});

describe('avatarPendingCopy', () => {
  it('promises a free retry only when the server offers one', () => {
    expect(avatarPendingCopy(true)).toEqual({
      text: 'Your avatar didn’t render. Retry free.',
      actionLabel: 'Retry',
    });
    const old = avatarPendingCopy(false);
    expect(old.actionLabel).toBeUndefined();
    expect(old.text).not.toContain('Retry');
  });
});

describe('renderButtonCopy', () => {
  const base = {
    dirty: false,
    price: 3,
    balance: 7,
    hasPortrait: true,
    pricingVerified: true,
    locked: false,
  };

  it('is a free first portrait before any render exists', () => {
    const copy = renderButtonCopy({ ...base, hasPortrait: false });
    expect(copy.label).toBe('Draw first portrait · Free');
    expect(copy.intent).toBe('render');
  });

  it('is disabled while prices are unknown', () => {
    const copy = renderButtonCopy({ ...base, pricingVerified: false });
    expect(copy.intent).toBe('disabled');
    expect(copy.caption).toBe('Checking prices…');
  });

  it('is disabled during a battle', () => {
    expect(renderButtonCopy({ ...base, locked: true }).intent).toBe('disabled');
  });

  it('routes to the wallet when short and says by how much', () => {
    const copy = renderButtonCopy({ ...base, balance: 1 });
    expect(copy.label).toBe('Draw this look · 3 cr');
    expect(copy.caption).toBe('Need 2 more credits');
    expect(copy.intent).toBe('topUp');
    expect(copy.accessibilityLabel).toContain('You need 2 more credits');
  });

  it('says it saves first when the draft is dirty', () => {
    const copy = renderButtonCopy({ ...base, dirty: true });
    expect(copy.label).toBe('Draw this look · 3 cr');
    expect(copy.caption).toBe('Saves your changes first');
    expect(copy.intent).toBe('render');
  });

  it('is a plain draw when clean and affordable', () => {
    const copy = renderButtonCopy(base);
    expect(copy.label).toBe('Draw this look · 3 cr');
    expect(copy.caption).toBeUndefined();
    expect(copy.intent).toBe('render');
    expect(copy.accessibilityLabel).toBe('Draw this look for 3 credits');
  });

  it('never claims a shortfall while the balance is loading', () => {
    const copy = renderButtonCopy({ ...base, balance: null });
    expect(copy.intent).toBe('render');
  });
});

describe('randomButtonCopy', () => {
  it('is a top-up when short and a render when affordable', () => {
    const short = randomButtonCopy({
      price: 5,
      balance: 2,
      pricingVerified: true,
      locked: false,
    });
    expect(short.intent).toBe('topUp');
    expect(short.caption).toBe('Need 3 more credits');
    expect(short.label).toBe('Shuffle random character · 5 cr');

    const ok = randomButtonCopy({
      price: 5,
      balance: 9,
      pricingVerified: true,
      locked: false,
    });
    expect(ok.intent).toBe('render');
    expect(ok.accessibilityLabel).toBe(
      'Generate a random character, 5 credits',
    );
  });
});

describe('customItemButtonCopy', () => {
  it('follows the same three intents', () => {
    expect(
      customItemButtonCopy({ price: 3, balance: 9, pricingVerified: true })
        .label,
    ).toBe('Create · 3 cr');
    expect(
      customItemButtonCopy({ price: 3, balance: 1, pricingVerified: true })
        .intent,
    ).toBe('topUp');
    expect(
      customItemButtonCopy({ price: 3, balance: 9, pricingVerified: false })
        .intent,
    ).toBe('disabled');
  });
});

describe('drawing copy', () => {
  it('pins the expected duration and phase labels', () => {
    // Calibrated against portrait_jobs on 2026-09-02; see the constant's comment.
    expect(RENDER_EXPECTED_DURATION).toBe('Usually under a minute');
    expect(RENDER_PHASE_LABEL.saving).toBe('Saving your changes…');
    expect(RENDER_PHASE_LABEL.fighter).toBe('Drawing your fighter…');
    expect(RENDER_PHASE_LABEL.avatar).toBe('Drawing your avatar…');
  });

  it('prefers the player’s own words and truncates long ones', () => {
    expect(
      renderingCaption({ portraitPromptRaw: '  A knight of glass ' }),
    ).toBe('A knight of glass');
    const long = 'x'.repeat(200);
    const caption = renderingCaption({ portraitPromptRaw: long });
    expect(caption.length).toBe(120);
    expect(caption.endsWith('…')).toBe(true);
  });

  it('falls back to the described look', () => {
    const caption = renderingCaption({
      portraitPromptRaw: null,
      vibe: 'heroic',
      artStyle: 'anime',
    });
    expect(caption).toContain('champion');
    expect(caption).toContain('anime');
  });
});
