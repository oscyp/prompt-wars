import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CreditChip from '@/components/CreditChip';
import CosmeticTitle from '@/components/CosmeticTitle';
import StatBar from '@/components/StatBar';
import PortraitPreview from '@/components/PortraitPreview';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: () => false,
}));

it('keeps the wallet action reachable and its balance free to wrap', () => {
  const onPress = jest.fn();
  const view = render(<CreditChip credits={1234567890} onPress={onPress} />);
  const control = view.getByRole('button', {
    name: 'View wallet, 1234567890 credits',
  });
  expect(control).toHaveStyle({ minHeight: 48, minWidth: 48 });
  fireEvent.press(control);
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(view.getByLabelText('1234567890 credits')).toHaveStyle({
    flexShrink: 1,
  });
});

it('shows a complete equipped title with system scaling', () => {
  const title = 'Łucja García · 冠軍 · Очень длинный титул';
  const view = render(
    <CosmeticTitle title={{ kind: 'title', label: title, color: '#C084FC' }} />,
  );
  expect(view.getByText(title).props.numberOfLines).toBeUndefined();
  expect(view.getByText(title).props.allowFontScaling).toBe(true);
});

it('lets a full stat label wrap while preserving its numeric semantics', () => {
  const label = 'LongUnbrokenFighterStatLabel';
  const view = render(
    <StatBar label={label} value={7} max={10} color="#60A5FA" />,
  );
  expect(view.getByText(label).props.numberOfLines).toBeUndefined();
  expect(view.getByText(label)).toHaveStyle({ flexShrink: 1 });
  expect(view.getByRole('progressbar').props.accessibilityValue).toEqual({
    min: 0,
    max: 10,
    now: 7,
  });
});

it('keeps portrait captions readable without an imposed line limit', () => {
  const caption =
    'Your complete fighter artwork is still loading. Retry without another render.';
  const view = render(<PortraitPreview uri="portrait" caption={caption} />);
  expect(view.getByText(caption).props.numberOfLines).toBeUndefined();
  expect(view.getByText(caption).props.allowFontScaling).toBe(true);
});
