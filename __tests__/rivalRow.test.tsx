/**
 * A rival row reads as one sentence and colours the record by who is ahead.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';
import RivalRow, {
  rivalCountLabel,
  rivalRecordTone,
  rivalRowLabel,
} from '@/components/profile/RivalRow';
import { Colors } from '@/constants/Colors';

const RECORD = { wins: 3, losses: 1, draws: 0, total: 4 };

describe('rivalRowLabel', () => {
  it('composes name, record sentence and the 30-day count', () => {
    expect(
      rivalRowLabel({ name: 'Vex', record: RECORD, battlesCount: 4 }),
    ).toBe('Vex, 3 wins, 1 loss, 4 battles in 30 days');
  });

  it('uses the singular for one battle and includes draws when present', () => {
    expect(
      rivalRowLabel({
        name: 'Vex',
        record: { wins: 0, losses: 0, draws: 1, total: 1 },
        battlesCount: 1,
      }),
    ).toBe('Vex, 0 wins, 0 losses, 1 draw, 1 battle in 30 days');
    expect(rivalCountLabel(1)).toBe('1 battle · 30 days');
    expect(rivalCountLabel(4)).toBe('4 battles · 30 days');
  });
});

describe('rivalRecordTone', () => {
  it('is success when ahead, error when behind, text when level', () => {
    expect(rivalRecordTone(RECORD)).toBe('success');
    expect(rivalRecordTone({ wins: 1, losses: 3, draws: 0, total: 4 })).toBe(
      'error',
    );
    expect(rivalRecordTone({ wins: 2, losses: 2, draws: 1, total: 5 })).toBe(
      'text',
    );
    expect(rivalRecordTone({ wins: 0, losses: 0, draws: 0, total: 0 })).toBe(
      'text',
    );
  });
});

describe('RivalRow', () => {
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

  it('is one accessible element carrying the whole sentence', () => {
    const { getByLabelText } = render(
      <RivalRow
        name="Vex"
        archetype="trickster"
        signatureColor="#F59E0B"
        record={RECORD}
        battlesCount={4}
      />,
    );
    const row = getByLabelText('Vex, 3 wins, 1 loss, 4 battles in 30 days');
    expect(row.props.accessible).toBe(true);
  });

  it('shows the record label and the 30-day count', () => {
    const { getByText } = render(
      <RivalRow
        name="Vex"
        archetype="trickster"
        signatureColor={null}
        record={RECORD}
        battlesCount={4}
      />,
    );
    getByText('Vex');
    getByText('3–1');
    getByText('4 battles · 30 days');
  });

  it('colours the record by tone', () => {
    const flatten = (style: unknown) =>
      Object.assign(
        {},
        ...(Array.isArray(style) ? style.flat(Infinity) : [style]),
      );
    const ahead = render(
      <RivalRow
        name="Vex"
        archetype="titan"
        signatureColor={null}
        record={RECORD}
        battlesCount={4}
      />,
    );
    const behind = render(
      <RivalRow
        name="Vex"
        archetype="titan"
        signatureColor={null}
        record={{ wins: 1, losses: 3, draws: 0, total: 4 }}
        battlesCount={4}
      />,
    );
    const level = render(
      <RivalRow
        name="Vex"
        archetype="titan"
        signatureColor={null}
        record={{ wins: 2, losses: 2, draws: 0, total: 4 }}
        battlesCount={4}
      />,
    );
    const aheadColor = flatten(
      ahead.getByTestId('rival-record').props.style,
    ).color;
    const behindColor = flatten(
      behind.getByTestId('rival-record').props.style,
    ).color;
    const levelColor = flatten(
      level.getByTestId('rival-record').props.style,
    ).color;
    const palette = [Colors.dark, Colors.light];
    expect(palette.map((c) => c.success)).toContain(aheadColor);
    expect(palette.map((c) => c.error)).toContain(behindColor);
    expect(palette.map((c) => c.text)).toContain(levelColor);
  });
});
