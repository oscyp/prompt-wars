import React from 'react';
import { render } from '@testing-library/react-native';
import { FighterStatTray } from '@/components/game/FighterStatTray';

const stats = { strength: 10, stamina: 1, agility: 5, focus: 4 };
it('keeps four ordered stats in one deliberate row with three separators', () => {
  const v = render(
    <FighterStatTray stats={stats} availableWidth={342} fontScale={1} />,
  );
  expect(v.getAllByTestId(/stat-tray-row-/)).toHaveLength(1);
  expect(
    v.getAllByTestId(/stat-tray-divider-/, { includeHiddenElements: true }),
  ).toHaveLength(3);
  expect(
    v.getAllByRole('progressbar').map((x) => x.props.accessibilityLabel),
  ).toEqual([
    'Strength 10 of 10',
    'Stamina 1 of 10',
    'Agility 5 of 10',
    'Focus 4 of 10',
  ]);
});
it.each([
  [342, 1.5],
  [270, 1],
])(
  'uses two balanced rows at width %s and scale %s',
  (availableWidth, fontScale) => {
    const v = render(
      <FighterStatTray
        stats={stats}
        availableWidth={availableWidth}
        fontScale={fontScale}
      />,
    );
    expect(v.getAllByTestId(/stat-tray-row-/)).toHaveLength(2);
    expect(v.getByTestId('stat-tray-row-0')).toHaveTextContent(/STRENGTH/);
    expect(v.getByTestId('stat-tray-row-0')).toHaveTextContent(/STAMINA/);
    expect(v.getByTestId('stat-tray-row-1')).toHaveTextContent(/AGILITY/);
    expect(v.getByTestId('stat-tray-row-1')).toHaveTextContent(/FOCUS/);
  },
);
