/**
 * The entrance card reads as one sentence, draws the signed portrait when
 * there is one and the archetype illustration otherwise, and holds still
 * under Reduce Motion.
 */
import React from 'react';
import { Animated, Image } from 'react-native';
import { render } from '@testing-library/react-native';
import FighterEntrance, {
  archetypeDisplayName,
  fighterEntranceLabel,
  type FighterEntranceProps,
} from '@/components/FighterEntrance';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { NO_COSMETICS } from '@/utils/cosmetics';

jest.mock('@/utils/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticSelection: jest.fn(),
  hapticWarning: jest.fn(),
}));

const PORTRAIT_URL = 'https://example.test/avatar.png';
const ILLUSTRATION_URI = 'asset://archetype-illustration';

function props(over: Partial<FighterEntranceProps> = {}): FighterEntranceProps {
  return {
    name: 'Nyx',
    archetype: 'titan',
    signatureColor: '#EF4444',
    portraitUrl: PORTRAIT_URL,
    cosmetics: NO_COSMETICS,
    modeLabel: 'Ranked Battle',
    reduceMotion: true,
    ...over,
  };
}

describe('fighterEntranceLabel', () => {
  it('reads name, archetype and mode as one sentence', () => {
    expect(
      fighterEntranceLabel({
        name: 'Nyx',
        archetype: 'titan',
        modeLabel: 'Ranked Battle',
      }),
    ).toBe('Nyx, The Titan, entering the Ranked Battle arena');
  });

  it('drops the archetype when there is none to name', () => {
    expect(
      fighterEntranceLabel({
        name: 'You',
        archetype: '',
        modeLabel: 'Casual Battle',
      }),
    ).toBe('You, entering the Casual Battle arena');
    expect(
      fighterEntranceLabel({
        name: 'You',
        archetype: null,
        modeLabel: 'Practice vs Bot',
      }),
    ).toBe('You, entering the Practice vs Bot arena');
  });
});

describe('archetypeDisplayName', () => {
  it('uses the archetype registry for known ids and capitalises the rest', () => {
    expect(archetypeDisplayName('mystic')).toBe('The Mystic');
    expect(archetypeDisplayName('Titan')).toBe('The Titan');
    expect(archetypeDisplayName('fighter')).toBe('Fighter');
    expect(archetypeDisplayName('')).toBeNull();
    expect(archetypeDisplayName(undefined)).toBeNull();
  });
});

describe('FighterEntrance', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is one accessible element carrying the composed label', () => {
    const { getByLabelText } = render(<FighterEntrance {...props()} />);
    const card = getByLabelText(
      'Nyx, The Titan, entering the Ranked Battle arena',
    );
    expect(card.props.accessible).toBe(true);
  });

  it('shows the name, the archetype name and the mode badge in capitals', () => {
    const { getByText } = render(<FighterEntrance {...props()} />);
    getByText('Nyx');
    getByText('The Titan');
    getByText('RANKED BATTLE');
  });

  it('draws the signed portrait when there is one', () => {
    const { UNSAFE_getByType } = render(<FighterEntrance {...props()} />);
    expect(UNSAFE_getByType(Image).props.source).toEqual({
      uri: PORTRAIT_URL,
    });
  });

  it('falls back to the neutral archetype illustration without a portrait', () => {
    const resolve = jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({
      uri: ILLUSTRATION_URI,
      width: 1,
      height: 1,
      scale: 1,
    });
    const { UNSAFE_getByType, queryByText } = render(
      <FighterEntrance
        {...props({ name: 'You', archetype: '', portraitUrl: null })}
      />,
    );
    expect(resolve).toHaveBeenCalledWith(getArchetypeAvatar(''));
    expect(UNSAFE_getByType(Image).props.source).toEqual({
      uri: ILLUSTRATION_URI,
    });
    // No archetype, no archetype line.
    expect(queryByText('The Titan')).toBeNull();
    expect(queryByText('Fighter')).toBeNull();
  });

  it('does not start the glow loop under Reduce Motion', () => {
    const loop = jest.spyOn(Animated, 'loop');
    render(<FighterEntrance {...props({ reduceMotion: true })} />);
    expect(loop).not.toHaveBeenCalled();
  });

  it('breathes under motion', () => {
    const loop = jest.spyOn(Animated, 'loop');
    render(<FighterEntrance {...props({ reduceMotion: false })} />);
    expect(loop).toHaveBeenCalledTimes(1);
  });
});
