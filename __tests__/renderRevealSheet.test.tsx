import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import RenderRevealSheet from '@/components/RenderRevealSheet';
import {
  setAccessibilityPreference,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
} from '@/utils/accessibilitySettings';
import { hapticSuccess } from '@/utils/haptics';

jest.mock('@/utils/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticSelection: jest.fn(),
}));

const baseProps = {
  visible: true,
  characterName: 'Golota',
  accentColor: '#EF4444',
  fighterUri: 'https://example.test/fighter.jpg',
  avatar: { status: 'ready' as const, uri: 'https://example.test/avatar.jpg' },
  mode: 'render' as const,
  creditsSpent: 3,
  canRetryAvatar: true,
  canRestorePrevious: true,
  onKeep: jest.fn(),
  onRestorePrevious: jest.fn(),
  onRetryAvatar: jest.fn(),
};

describe('RenderRevealSheet', () => {
  beforeEach(() => {
    // Reduce Motion: the reveal lands instantly, so the haptic fires on mount.
    setAccessibilityPreference('reducedMotion', true);
    (hapticSuccess as jest.Mock).mockReset();
    baseProps.onKeep.mockReset();
    baseProps.onRestorePrevious.mockReset();
    baseProps.onRetryAvatar.mockReset();
  });

  afterEach(() => {
    act(() =>
      setAccessibilityPreference(
        'reducedMotion',
        DEFAULT_ACCESSIBILITY_PREFERENCES.reducedMotion,
      ),
    );
  });

  it('fires one success haptic when it appears', () => {
    render(<RenderRevealSheet {...baseProps} />);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });

  it('captions the spend in sentence form', () => {
    const { getByText, queryByText } = render(
      <RenderRevealSheet {...baseProps} />,
    );
    getByText('Golota · New look · 3 credits spent');
    // The in-app AI disclosure was removed as a product decision (042c59a);
    // this surface must not quietly reintroduce it.
    expect(queryByText('AI-GENERATED')).toBeNull();
  });

  it('keeps on the primary action', () => {
    const { getByLabelText } = render(<RenderRevealSheet {...baseProps} />);
    fireEvent.press(getByLabelText('Keep'));
    expect(baseProps.onKeep).toHaveBeenCalledTimes(1);
  });

  it('restores the previous pair when allowed', () => {
    const { getByLabelText } = render(<RenderRevealSheet {...baseProps} />);
    fireEvent.press(getByLabelText('Restore previous, free'));
    expect(baseProps.onRestorePrevious).toHaveBeenCalledTimes(1);
  });

  it('disables restore on a first render', () => {
    const { getByLabelText } = render(
      <RenderRevealSheet {...baseProps} canRestorePrevious={false} />,
    );
    expect(
      getByLabelText('Restore previous, free').props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('offers the free avatar retry only when the server supports it', () => {
    const failed = { status: 'failed' as const };
    const withRetry = render(
      <RenderRevealSheet {...baseProps} avatar={failed} canRetryAvatar />,
    );
    withRetry.getByText('Your avatar didn’t render. Retry free.');
    fireEvent.press(withRetry.getByLabelText('Retry'));
    expect(baseProps.onRetryAvatar).toHaveBeenCalledTimes(1);

    const withoutRetry = render(
      <RenderRevealSheet
        {...baseProps}
        avatar={failed}
        canRetryAvatar={false}
      />,
    );
    expect(withoutRetry.queryByLabelText('Retry')).toBeNull();
    expect(withoutRetry.queryByText(/Retry free/)).toBeNull();
  });

  it('says so when the avatar is still drawing', () => {
    const { getByLabelText } = render(
      <RenderRevealSheet {...baseProps} avatar={{ status: 'pending' }} />,
    );
    getByLabelText('Avatar still drawing');
  });
});
