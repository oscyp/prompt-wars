import { computeDraft, DRAFT_FIELDS } from '@/hooks/useCharacterEditDraft';
import type { EditPricing } from '@/utils/editCooldowns';

const character = {
  name: 'AndrewGolota',
  archetype: 'strategist',
  battle_cry: 'Come and take it',
  signature_color: '#3B82F6',
  art_style: 'painterly',
  portrait_prompt_raw: null,
  palette_key: 'ember',
  vibe: 'heroic',
  silhouette: 'lean_duelist',
  era: 'modern',
  expression: 'calm',
  signature_item_id: 'item-1',
};

const pricing: EditPricing = {
  prices: {
    rename: { credits: 0, cooldownSeconds: 604800 },
    archetype: { credits: 0, cooldownSeconds: 1209600 },
    battle_cry: { credits: 0, cooldownSeconds: 86400 },
    signature_color: { credits: 0, cooldownSeconds: 86400 },
    render_look: { credits: 3, cooldownSeconds: 0 },
    random_character: { credits: 5, cooldownSeconds: 0 },
  },
  cooldownMs: {},
};

const draft = (values: Record<string, string | null>) =>
  computeDraft({
    character,
    values: values as never,
    pricing,
    itemName: (id) => (id === 'item-2' ? 'Lucky Coin' : id),
  });

describe('computeDraft', () => {
  it('is clean when nothing is staged', () => {
    expect(draft({}).dirty).toBe(false);
  });

  it('ignores a field staged back to its saved value', () => {
    // Would otherwise bump appearance_version and falsely mark the portrait
    // stale over an edit the player did not make.
    expect(draft({ name: 'AndrewGolota', vibe: 'heroic' }).changeCount).toBe(0);
  });

  it('marks the tab each change belongs to', () => {
    const d = draft({ name: 'Golota', era: 'cyberpunk', signatureItemId: 'item-2' });
    expect(d.dirtySections).toEqual({ identity: true, look: true, gear: true });
    expect(d.changeCount).toBe(3);
  });

  it('reports how long each identity field will lock for', () => {
    const byLabel = Object.fromEntries(
      draft({ name: 'Golota', archetype: 'titan' }).changes.map((c) => [c.label, c.locksFor]),
    );
    expect(byLabel.Name).toBe('7 days');
    expect(byLabel.Archetype).toBe('14 days');
  });

  it('never claims a look change locks anything', () => {
    // Describing is free and unrestricted; only identity carries cooldowns.
    for (const c of draft({ era: 'cyberpunk', palette: 'neon' }).changes) {
      expect(c.locksFor).toBeUndefined();
    }
  });

  it('treats clearing the prompt as a change, not an absent field', () => {
    // This is exactly what switching from "your own words" back to Guided does.
    const withPrompt = { ...character, portrait_prompt_raw: 'a knight of glass' };
    const d = computeDraft({
      character: withPrompt,
      values: { portraitPromptRaw: null } as never,
      pricing,
    });
    expect(d.changeCount).toBe(1);
    expect(d.changes[0].to).toBe('None');
  });

  it('does not treat clearing an already-empty prompt as a change', () => {
    expect(draft({ portraitPromptRaw: null }).changeCount).toBe(0);
  });

  it('names the item rather than showing a uuid', () => {
    expect(draft({ signatureItemId: 'item-2' }).changes[0].to).toBe('Lucky Coin');
  });

  it('shows readable labels for trait values', () => {
    const d = draft({ era: 'far_future', archetype: 'titan' });
    const tos = d.changes.map((c) => c.to);
    expect(tos).toContain('Far Future');
    expect(tos).toContain('The Titan');
  });

  it('builds one identity payload and one look payload', () => {
    // Gear rides with look: both are free describing fields on one write.
    const d = draft({ name: 'Golota', era: 'cyberpunk', signatureItemId: 'item-2' });
    expect(d.changes.filter((c) => c.section === 'identity')).toHaveLength(1);
    expect(d.changes.filter((c) => c.section !== 'identity')).toHaveLength(2);
  });

  it('covers every draft field with a column that exists on the character', () => {
    for (const f of DRAFT_FIELDS) {
      expect(Object.keys(character)).toContain(f.column);
    }
  });

  it('returns an empty summary with no character loaded', () => {
    expect(
      computeDraft({ character: null, values: {}, pricing }).dirty,
    ).toBe(false);
  });
});
