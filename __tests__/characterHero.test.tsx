/**
 * The compact Stage row. Same controls as the expanded Stage at row scale, so
 * the same things are checked: portrait tap, dice, Draw copy, status line.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import CharacterHero, {
  type CharacterHeroProps,
} from '@/components/edit-character/CharacterHero';
import { NO_COSMETICS } from '@/utils/cosmetics';
import type { ButtonCopy } from '@/utils/editDialogCopy';

const RENDER: ButtonCopy = {
  label: 'Draw this look · 3 cr',
  accessibilityLabel: 'Draw this look for 3 credits',
  intent: 'render',
};

const RANDOM: ButtonCopy = {
  label: 'Shuffle random character · 5 cr',
  accessibilityLabel: 'Generate a random character, 5 credits',
  intent: 'render',
};

function props(over: Partial<CharacterHeroProps> = {}): CharacterHeroProps {
  return {
    name: 'Nyx',
    subtitle: 'Strategist · Painterly',
    portraitUri: 'https://example.test/fighter.png',
    accentColor: '#8B5CF6',
    hasPortrait: true,
    portraitStale: false,
    renderButton: RENDER,
    randomButton: RANDOM,
    onRender: jest.fn(),
    onRandom: jest.fn(),
    onOpenViewer: jest.fn(),
    ...over,
  };
}

const VIEWER_LABEL = "View Nyx's portrait full screen";

describe('CharacterHero', () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the viewer from the thumb', () => {
    const p = props();
    const { getByLabelText } = render(<CharacterHero {...p} />);
    fireEvent.press(getByLabelText(VIEWER_LABEL));
    expect(p.onOpenViewer).toHaveBeenCalledTimes(1);
  });

  it('disables the thumb without a portrait', () => {
    const p = props({ hasPortrait: false });
    const { getByLabelText } = render(<CharacterHero {...p} />);
    const thumb = getByLabelText(VIEWER_LABEL);
    expect(thumb.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(thumb);
    expect(p.onOpenViewer).not.toHaveBeenCalled();
  });

  it('no longer has the separate "View full screen" link', () => {
    const { queryByLabelText, queryByText } = render(
      <CharacterHero {...props()} />,
    );
    expect(queryByLabelText('View portrait full screen')).toBeNull();
    expect(queryByText('View full screen')).toBeNull();
  });

  it('reads the Draw button from renderButton and fires onRender', () => {
    const p = props({
      renderButton: { ...RENDER, caption: 'Saves your changes first' },
    });
    const { getByText, getByLabelText } = render(<CharacterHero {...p} />);
    expect(getByText('Draw this look · 3 cr')).toBeTruthy();
    expect(getByText('Saves your changes first')).toBeTruthy();
    fireEvent.press(getByLabelText(RENDER.accessibilityLabel));
    expect(p.onRender).toHaveBeenCalledTimes(1);
  });

  it('has a dice button that fires onRandom', () => {
    const p = props();
    const { getByLabelText } = render(<CharacterHero {...p} />);
    fireEvent.press(getByLabelText(RANDOM.accessibilityLabel));
    expect(p.onRandom).toHaveBeenCalledTimes(1);
  });

  it('disables paid buttons from their copy and while rendering', () => {
    const p = props({ renderButton: { ...RENDER, intent: 'disabled' } });
    const { getByLabelText, rerender } = render(<CharacterHero {...p} />);
    fireEvent.press(getByLabelText(RENDER.accessibilityLabel));
    expect(p.onRender).not.toHaveBeenCalled();

    rerender(<CharacterHero {...props({ rendering: true })} />);
    fireEvent.press(getByLabelText(RANDOM.accessibilityLabel));
    expect(
      getByLabelText(RANDOM.accessibilityLabel).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('shows a tappable status line when given one', () => {
    const onStatusPress = jest.fn();
    const { getByText, queryByText, rerender } = render(
      <CharacterHero
        {...props({ statusLabel: 'Prices unavailable · Retry', onStatusPress })}
      />,
    );
    fireEvent.press(getByText('Prices unavailable · Retry'));
    expect(onStatusPress).toHaveBeenCalledTimes(1);

    rerender(<CharacterHero {...props({ statusLabel: null })} />);
    expect(queryByText('Prices unavailable · Retry')).toBeNull();
  });

  it('names what changed since the last render', () => {
    const { getByText, queryByText, rerender } = render(
      <CharacterHero
        {...props({ portraitStale: true, changedFields: ['Era', 'Vibe'] })}
      />,
    );
    expect(getByText('Changed since last render: Era, Vibe')).toBeTruthy();
    expect(queryByText('Portrait needs updating')).toBeNull();

    rerender(<CharacterHero {...props({ portraitStale: true })} />);
    expect(getByText('Look changed since last render')).toBeTruthy();

    rerender(<CharacterHero {...props({ portraitStale: false })} />);
    expect(queryByText(/since last render/)).toBeNull();
  });

  it('accepts equipped cosmetics for the thumb frame', () => {
    const { getByText } = render(
      <CharacterHero
        {...props({
          cosmetics: {
            ...NO_COSMETICS,
            frame: { kind: 'frame', colors: ['#F5C542'], width: 4 },
          },
        })}
      />,
    );
    expect(getByText('Nyx')).toBeTruthy();
  });
});
