/**
 * The expanded Stage. Everything the player can tap is checked by its
 * accessibility label, and the paid button reads exactly what `renderButtonCopy`
 * says, because that string is the price disclosure.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import StageExpanded, {
  type StageExpandedProps,
} from '@/components/edit-character/StageExpanded';
import { NO_COSMETICS } from '@/utils/cosmetics';
import type { ButtonCopy } from '@/utils/editDialogCopy';
import type { PortraitHistoryEntry } from '@/utils/characters';

const RENDER: ButtonCopy = {
  label: 'Draw this look · 3 cr',
  caption: 'Saves your changes first',
  accessibilityLabel: 'Draw this look for 3 credits. Saves your changes first.',
  intent: 'render',
};

const RANDOM: ButtonCopy = {
  label: 'Shuffle random character · 5 cr',
  accessibilityLabel: 'Generate a random character, 5 credits',
  intent: 'render',
};

function history(n: number): PortraitHistoryEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    portraitId: `p-${i}`,
    imageUrl: `https://example.test/${i}.png`,
    createdAt: '2026-09-01T00:00:00Z',
  }));
}

function props(over: Partial<StageExpandedProps> = {}): StageExpandedProps {
  return {
    name: 'Nyx',
    subtitle: 'Strategist · Painterly',
    fighterUri: 'https://example.test/fighter.png',
    avatarUri: 'https://example.test/avatar.png',
    hasPortrait: true,
    accentColor: '#8B5CF6',
    cosmetics: NO_COSMETICS,
    fighterHeight: 243,
    busy: false,
    portraitStale: false,
    changedFields: [],
    notice: null,
    history: [],
    restoringId: null,
    renderButton: RENDER,
    randomButton: RANDOM,
    rendering: false,
    renderPhase: null,
    renderStartedAt: null,
    renderExpectedCopy: 'Usually 20–40 seconds',
    renderingCaption: 'A heroic champion with a lean duelist build.',
    onRender: jest.fn(),
    onRandom: jest.fn(),
    onOpenViewer: jest.fn(),
    onSelectHistory: jest.fn(),
    ...over,
  };
}

const VIEWER_LABEL = "View Nyx's portrait full screen";

describe('StageExpanded', () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
    jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('opens the viewer from the fighter', () => {
    const p = props();
    const { getByLabelText } = render(<StageExpanded {...p} />);
    fireEvent.press(getByLabelText(VIEWER_LABEL));
    expect(p.onOpenViewer).toHaveBeenCalledTimes(1);
  });

  it('does not open the viewer without a portrait', () => {
    const p = props({ hasPortrait: false });
    const { getByLabelText } = render(<StageExpanded {...p} />);
    const fighter = getByLabelText(VIEWER_LABEL);
    expect(fighter.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(fighter);
    expect(p.onOpenViewer).not.toHaveBeenCalled();
  });

  it('fires onRandom from the dice', () => {
    const p = props();
    const { getByLabelText } = render(<StageExpanded {...p} />);
    fireEvent.press(getByLabelText(RANDOM.accessibilityLabel));
    expect(p.onRandom).toHaveBeenCalledTimes(1);
  });

  it('reads the Draw button from renderButton', () => {
    const p = props();
    const { getByText, getByLabelText } = render(<StageExpanded {...p} />);
    expect(getByText('Draw this look · 3 cr')).toBeTruthy();
    expect(getByText('Saves your changes first')).toBeTruthy();
    fireEvent.press(getByLabelText(RENDER.accessibilityLabel));
    expect(p.onRender).toHaveBeenCalledTimes(1);
  });

  it('keeps a shortfall button live so it can route to the wallet', () => {
    const p = props({
      renderButton: {
        ...RENDER,
        caption: 'Need 2 more credits',
        intent: 'topUp',
      },
    });
    const { getByLabelText, getByText } = render(<StageExpanded {...p} />);
    expect(getByText('Need 2 more credits')).toBeTruthy();
    fireEvent.press(getByLabelText(RENDER.accessibilityLabel));
    expect(p.onRender).toHaveBeenCalledTimes(1);
  });

  it('disables the paid buttons when their copy says so', () => {
    const p = props({
      renderButton: { ...RENDER, intent: 'disabled' },
      randomButton: { ...RANDOM, intent: 'disabled' },
    });
    const { getByLabelText } = render(<StageExpanded {...p} />);
    fireEvent.press(getByLabelText(RENDER.accessibilityLabel));
    fireEvent.press(getByLabelText(RANDOM.accessibilityLabel));
    expect(p.onRender).not.toHaveBeenCalled();
    expect(p.onRandom).not.toHaveBeenCalled();
    expect(
      getByLabelText(RENDER.accessibilityLabel).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('names what changed since the last render', () => {
    const { getByText } = render(
      <StageExpanded
        {...props({ portraitStale: true, changedFields: ['Era', 'Art style'] })}
      />,
    );
    expect(getByText('Changed since last render: Era, Art style')).toBeTruthy();
  });

  it('falls back to the generic stale line and hides it when current', () => {
    const stale = render(
      <StageExpanded {...props({ portraitStale: true, changedFields: [] })} />,
    );
    expect(stale.getByText('Look changed since last render')).toBeTruthy();

    const current = render(
      <StageExpanded
        {...props({ portraitStale: false, changedFields: ['Era'] })}
      />,
    );
    expect(current.queryByText(/since last render/)).toBeNull();
  });

  it('renders an alert only when there is a notice', () => {
    const quiet = render(<StageExpanded {...props()} />);
    expect(
      quiet.UNSAFE_queryAllByProps({ accessibilityRole: 'alert' }),
    ).toHaveLength(0);

    const onAction = jest.fn();
    const loud = render(
      <StageExpanded
        {...props({
          notice: {
            tone: 'error',
            text: "Couldn't check credit prices, so paid actions are paused.",
            actionLabel: 'Retry',
            onAction,
          },
        })}
      />,
    );
    expect(
      loud.UNSAFE_queryAllByProps({ accessibilityRole: 'alert' }).length,
    ).toBeGreaterThan(0);
    expect(
      loud.getByText(
        "Couldn't check credit prices, so paid actions are paused.",
      ),
    ).toBeTruthy();
    fireEvent.press(loud.getByLabelText('Retry'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('shows as many history rows as fit beside the fighter', () => {
    const tall = render(
      <StageExpanded {...props({ fighterHeight: 300, history: history(3) })} />,
    );
    expect(tall.getAllByLabelText('Preview this earlier render')).toHaveLength(
      3,
    );
    expect(tall.getByText('Previous renders · free to restore')).toBeTruthy();

    const short = render(
      <StageExpanded {...props({ fighterHeight: 160, history: history(3) })} />,
    );
    expect(short.getAllByLabelText('Preview this earlier render')).toHaveLength(
      1,
    );
  });

  it('opens a history entry and locks the rows while restoring', () => {
    const p = props({ history: history(2) });
    const { getAllByLabelText, rerender } = render(<StageExpanded {...p} />);
    fireEvent.press(getAllByLabelText('Preview this earlier render')[1]);
    expect(p.onSelectHistory).toHaveBeenCalledWith('p-1');

    rerender(<StageExpanded {...p} restoringId="p-0" />);
    const rows = getAllByLabelText('Preview this earlier render');
    fireEvent.press(rows[1]);
    expect(p.onSelectHistory).toHaveBeenCalledTimes(1);
    expect(rows[1].props.accessibilityState.disabled).toBe(true);
  });

  it('hides the history block entirely when there is none', () => {
    const { queryByText } = render(<StageExpanded {...props()} />);
    expect(queryByText('Previous renders · free to restore')).toBeNull();
  });

  it('replaces the actions with the drawing block while rendering', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-02T10:00:12.000Z'));
    const p = props({
      rendering: true,
      renderPhase: 'fighter',
      renderStartedAt: Date.parse('2026-09-02T10:00:00.000Z'),
    });
    const { getByText, queryByLabelText } = render(<StageExpanded {...p} />);

    expect(getByText('Drawing your fighter…')).toBeTruthy();
    expect(getByText('12s')).toBeTruthy();
    expect(getByText('Usually 20–40 seconds')).toBeTruthy();
    expect(
      getByText('A heroic champion with a lean duelist build.'),
    ).toBeTruthy();
    expect(queryByLabelText(RENDER.accessibilityLabel)).toBeNull();
    expect(queryByLabelText(RANDOM.accessibilityLabel)).toBeNull();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Drawing your fighter…',
    );

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(getByText('15s')).toBeTruthy();
  });

  it('announces each phase change and falls back to a generic label', () => {
    const p = props({
      rendering: true,
      renderPhase: null,
      renderStartedAt: null,
    });
    const { getByText, rerender } = render(<StageExpanded {...p} />);
    expect(getByText('Drawing…')).toBeTruthy();
    expect(getByText('0s')).toBeTruthy();

    rerender(<StageExpanded {...p} renderPhase="avatar" />);
    expect(getByText('Drawing your avatar…')).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(
      'Drawing your avatar…',
    );
  });

  it('shows the equipped title and badge beside the name', () => {
    const { getByText, getByLabelText } = render(
      <StageExpanded
        {...props({
          cosmetics: {
            ...NO_COSMETICS,
            title: { kind: 'title', label: 'Champion', color: '#F5C542' },
            badge: {
              kind: 'badge',
              icon: 'ribbon',
              color: '#F5C542',
              label: 'Season one',
            },
          },
        })}
      />,
    );
    expect(getByText('Nyx')).toBeTruthy();
    expect(getByLabelText('Title: Champion')).toBeTruthy();
    expect(getByLabelText('Badge: Season one')).toBeTruthy();
  });
});
