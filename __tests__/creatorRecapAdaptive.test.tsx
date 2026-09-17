import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { RecapCard } from '@/app/(onboarding)/create-character';
import { INITIAL_DRAFT, STEP, type Draft } from '@/utils/onboardingDraft';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 430, height: 900, scale: 3, fontScale: 1 })),
}));
jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => false) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-router', () => ({
  useNavigation: jest.fn(),
  useRouter: jest.fn(),
}));
jest.mock('@/components', () => ({}));
jest.mock('@/utils/supabase', () => ({
  supabase: {},
  invokeAuthenticatedFunction: jest.fn(),
}));
jest.mock('@/utils/haptics', () => ({
  hapticError: jest.fn(),
  hapticSelection: jest.fn(),
  hapticSuccess: jest.fn(),
}));

const draft: Draft = {
  ...INITIAL_DRAFT,
  name: 'Żaneta Nightwhisper',
  archetype: 'strategist',
  signatureItem: {
    id: 'instrument',
    name: 'Extraordinary Clockwork Orchestra',
    description: 'An elaborate instrument.',
    itemClass: 'instrument',
  },
  battleCry: 'Every careful word makes the next impossible thing possible!',
};

it.each([
  { width: 320, fontScale: 1 },
  { width: 320, fontScale: 2 },
  { width: 430, fontScale: 2 },
])(
  'keeps final recap values and Change reachable at $width points and $fontScale text',
  ({ width, fontScale }) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width, height: 640, scale: 2, fontScale });
    const onFix = jest.fn();
    const view = render(<RecapCard draft={draft} onFix={onFix} />);
    for (const [label, value, step] of [
      ['Name', draft.name, STEP.name],
      ['Signature item', draft.signatureItem!.name, STEP.item],
    ] as const) {
      const row = view.getByRole('button', { name: `${label}: ${value}` });
      expect(StyleSheet.flatten(row.props.style)).toMatchObject({
        flexDirection: 'column',
        alignItems: 'stretch',
        minHeight: 48,
      });
      const text = within(row).getByText(value);
      expect(StyleSheet.flatten(text.props.style)).toMatchObject({
        width: '100%',
        flex: 0,
        textAlign: 'left',
      });
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.allowFontScaling).toBe(true);
      expect(
        StyleSheet.flatten(within(row).getByText(label).props.style).width,
      ).toBe('100%');
      fireEvent.press(within(row).getByText('Change'));
      expect(onFix).toHaveBeenLastCalledWith(step);
    }
    // Non-actionable look/style values get the same full-width treatment.
    const look = view.getByText('Archetype default look');
    expect(StyleSheet.flatten(look.props.style)).toMatchObject({
      width: '100%',
      flex: 0,
    });
    expect(view.getByText(`“${draft.battleCry}”`)).toBeTruthy();
  },
);
