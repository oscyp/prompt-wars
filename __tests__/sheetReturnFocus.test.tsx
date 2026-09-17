import React from 'react';
import * as RN from 'react-native';
import { act, render } from '@testing-library/react-native';
import PortraitViewer from '@/components/PortraitViewer';
import RenderRevealSheet from '@/components/RenderRevealSheet';
import ConfirmSheet from '@/components/sheets/ConfirmSheet';
import FirstTimeOfferModal from '@/components/FirstTimeOfferModal';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
const noop = () => {};
type SharedSheetProps = {
  visible: boolean;
  returnFocusRef: React.RefObject<RN.View | null>;
};
const cases = [
  [
    'portrait',
    (props: SharedSheetProps) => (
      <PortraitViewer
        {...props}
        uri="https://example.com/art.png"
        onClose={noop}
      />
    ),
  ],
  [
    'render',
    (props: SharedSheetProps) => (
      <RenderRevealSheet
        {...props}
        characterName="Mira"
        accentColor="#ffffff"
        fighterUri="https://example.com/art.png"
        avatar={{ status: 'pending' }}
        mode="render"
        creditsSpent={3}
        canRetryAvatar={false}
        canRestorePrevious={false}
        onKeep={noop}
        onRestorePrevious={noop}
        onRetryAvatar={noop}
      />
    ),
  ],
  [
    'confirmation',
    (props: SharedSheetProps) => (
      <ConfirmSheet
        {...props}
        title="Buy?"
        confirmLabel="Buy"
        onConfirm={noop}
        onCancel={noop}
      />
    ),
  ],
  [
    'offer',
    (props: SharedSheetProps) => (
      <FirstTimeOfferModal
        {...props}
        offer={{
          slug: 'starter',
          product_id: 'ftuo_starter_legend',
          exclusive_cosmetic_slug: null,
          reference_price_usd: 2,
          title: 'Welcome',
          description: 'Starter pack',
          credits: 10,
          price_usd: 1,
        }}
        onClaim={async () => false}
        onDismiss={noop}
      />
    ),
  ],
] as const;

it.each(cases)(
  'restores the %s opener only once after dismissal',
  (_, sheet) => {
    const focus = jest
      .spyOn(RN.AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(noop);
    const opener = { current: 42 as unknown as RN.View };
    const view = render(sheet({ visible: true, returnFocusRef: opener }));
    const modal = view.UNSAFE_getByType(RN.Modal);
    act(() => modal.props.onShow());
    focus.mockClear();
    view.rerender(sheet({ visible: false, returnFocusRef: opener }));
    act(() => modal.props.onDismiss());
    expect(focus).toHaveBeenCalledWith(42);
    act(() => modal.props.onDismiss());
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  },
);

it('restores once on Android even if both the interaction task and native dismissal run', () => {
  const platform = jest.replaceProperty(RN.Platform, 'OS', 'android');
  let afterInteractions: (() => void) | undefined;
  const interactions = jest
    .spyOn(RN.InteractionManager, 'runAfterInteractions')
    .mockImplementation((task) => {
      if (typeof task === 'function') afterInteractions = task;
      return { cancel: jest.fn(), then: jest.fn(), done: jest.fn() } as never;
    });
  const focus = jest
    .spyOn(RN.AccessibilityInfo, 'setAccessibilityFocus')
    .mockImplementation(noop);
  const sheet = cases[2][1];
  const opener = { current: 73 as unknown as RN.View };
  const view = render(sheet({ visible: true, returnFocusRef: opener }));
  const modal = view.UNSAFE_getByType(RN.Modal);
  act(() => modal.props.onShow());
  focus.mockClear();
  view.rerender(sheet({ visible: false, returnFocusRef: opener }));
  act(() => afterInteractions?.());
  act(() => modal.props.onDismiss());
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledWith(73);
  focus.mockRestore();
  interactions.mockRestore();
  platform.restore();
});
