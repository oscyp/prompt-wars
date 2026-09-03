/**
 * The fighter card is one button that reads the fighter's identity and opens
 * Edit character; the render falls back to the archetype illustration; the
 * stats are individually readable progress bars.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import FighterHero, {
  joinedLabel,
  type FighterHeroProps,
} from '@/components/profile/FighterHero';
import { fighterCardCopy } from '@/utils/profileView';
import { NO_COSMETICS } from '@/utils/cosmetics';

const RENDER_URI = 'https://example.test/fighter.png';

function props(over: Partial<FighterHeroProps> = {}): FighterHeroProps {
  return {
    name: 'Nyx',
    archetype: 'titan',
    battleCry: 'Hold the line',
    itemName: 'Brass compass',
    renderUri: RENDER_URI,
    signatureColor: '#EF4444',
    stats: { strength: 8, stamina: 5, agility: 4, focus: 3 },
    cosmetics: NO_COSMETICS,
    onPress: jest.fn(),
    ...over,
  };
}

describe('FighterHero', () => {
  it('shows the name, the archetype · item subtitle and the quoted battle cry', () => {
    // The caption is hidden from the accessibility tree on purpose: the
    // button's label already reads it, so a screen reader hears it once.
    const hidden = { includeHiddenElements: true };
    const { getByText } = render(<FighterHero {...props()} />);
    getByText('Nyx', hidden);
    getByText('The Titan · Brass compass', hidden);
    getByText('“Hold the line”', hidden);
  });

  it('is one button labelled from fighterCardCopy that fires onPress', () => {
    const p = props();
    const copy = fighterCardCopy({
      name: p.name,
      archetype: p.archetype,
      battleCry: p.battleCry,
      itemName: p.itemName,
    });
    const { getByLabelText } = render(<FighterHero {...p} />);
    const button = getByLabelText(copy.accessibilityLabel);
    expect(button.props.accessibilityRole).toBe('button');
    fireEvent.press(button);
    expect(p.onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes each stat as a progress bar with the full stat name', () => {
    const { getByLabelText } = render(<FighterHero {...props()} />);
    const strength = getByLabelText('Strength 8 of 10');
    expect(strength.props.accessibilityRole).toBe('progressbar');
    expect(strength.props.accessibilityValue).toEqual({
      min: 0,
      max: 10,
      now: 8,
    });
    getByLabelText('Focus 3 of 10');
  });

  it('draws the signed render when there is one', () => {
    const { getByTestId } = render(<FighterHero {...props()} />);
    expect(
      getByTestId('fighter-hero-image', { includeHiddenElements: true }).props
        .source,
    ).toEqual({
      uri: RENDER_URI,
    });
  });

  it('falls back to the archetype illustration without a render', () => {
    const { getByTestId } = render(
      <FighterHero {...props({ renderUri: null })} />,
    );
    const source = getByTestId('fighter-hero-image', {
      includeHiddenElements: true,
    }).props.source;
    expect(source).toBeTruthy();
    expect(source).not.toEqual({ uri: RENDER_URI });
    expect(source?.uri).not.toBe(RENDER_URI);
  });

  it('omits the cry and the stats when the character has none', () => {
    const { queryByText, queryByLabelText } = render(
      <FighterHero {...props({ battleCry: null, stats: null })} />,
    );
    expect(queryByText(/“/, { includeHiddenElements: true })).toBeNull();
    expect(queryByLabelText(/of 10$/)).toBeNull();
  });
});

describe('joinedLabel', () => {
  it('names the month and year the account was created', () => {
    expect(joinedLabel('2026-09-03T10:00:00Z')).toBe('Joined September 2026');
  });

  it('is null for a missing or unparsable timestamp', () => {
    expect(joinedLabel(null)).toBeNull();
    expect(joinedLabel(undefined)).toBeNull();
    expect(joinedLabel('not a date')).toBeNull();
  });
});
