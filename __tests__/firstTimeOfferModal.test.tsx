/**
 * The offer is one per account and its dismissal is permanent server-side, so
 * the two things that must not happen are a silent dismiss and a Claim that
 * fires after the countdown has ended.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import FirstTimeOfferModal, {
  OFFER_DISMISS_COPY,
  OFFER_ENDED_LABEL,
  formatRemaining,
} from '@/components/FirstTimeOfferModal';

const offer = {
  slug: 'starter_legend',
  title: 'Legend Starter Pack',
  description: 'Everything you need for your first week.',
  product_id: 'ftuo_starter_legend',
  credits: 50,
  exclusive_cosmetic_slug: 'founders_frame',
  price_usd: 4.99,
  reference_price_usd: 12.99,
};

function lastAlertButtons() {
  const spy = Alert.alert as unknown as jest.Mock;
  return spy.mock.calls[spy.mock.calls.length - 1][2] as {
    text: string;
    style?: string;
    onPress?: () => void;
  }[];
}

describe('FirstTimeOfferModal', () => {
  let onClaim: jest.Mock;
  let onDismiss: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    onClaim = jest.fn().mockResolvedValue(true);
    onDismiss = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('disables Claim and says the offer ended once the countdown is over', () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    const { getByLabelText, getByText } = render(
      <FirstTimeOfferModal
        visible
        offer={offer}
        expiresAt={expired}
        onClaim={onClaim}
        onDismiss={onDismiss}
      />,
    );

    const claim = getByLabelText(OFFER_ENDED_LABEL);
    expect(claim.props.accessibilityState.disabled).toBe(true);
    getByText('This offer has ended.');

    fireEvent.press(claim);
    expect(onClaim).not.toHaveBeenCalled();
  });

  it('lets an ended offer close without a confirmation', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    const { getByLabelText } = render(
      <FirstTimeOfferModal
        visible
        offer={offer}
        expiresAt={expired}
        onClaim={onClaim}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(getByLabelText('Close'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('confirms before dismissing a live offer', () => {
    const live = new Date(Date.now() + 3 * 3600_000).toISOString();
    const { getByLabelText } = render(
      <FirstTimeOfferModal
        visible
        offer={offer}
        expiresAt={live}
        onClaim={onClaim}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.press(getByLabelText('Maybe later'));
    expect(Alert.alert).toHaveBeenCalledWith(
      OFFER_DISMISS_COPY.title,
      OFFER_DISMISS_COPY.message,
      expect.any(Array),
    );
    expect(onDismiss).not.toHaveBeenCalled();

    const buttons = lastAlertButtons();
    expect(buttons.find((b) => b.style === 'cancel')?.text).toBe(
      OFFER_DISMISS_COPY.keep,
    );
    buttons.find((b) => b.style === 'destructive')?.onPress?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('claims while live and dismisses on success', async () => {
    const live = new Date(Date.now() + 3600_000).toISOString();
    const { getByLabelText, getByText } = render(
      <FirstTimeOfferModal
        visible
        offer={offer}
        expiresAt={live}
        onClaim={onClaim}
        onDismiss={onDismiss}
      />,
    );
    getByText(/^Ends in /);
    await act(async () => {
      fireEvent.press(getByLabelText('Claim one-time offer'));
    });
    expect(onClaim).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('prefers the store price string over the USD fallback', () => {
    const { getByText, queryByText } = render(
      <FirstTimeOfferModal
        visible
        offer={offer}
        priceString="4,99 €"
        referencePriceString="12,99 €"
        onClaim={onClaim}
        onDismiss={onDismiss}
      />,
    );
    getByText('4,99 €');
    getByText('12,99 €');
    expect(queryByText('$4.99')).toBeNull();
  });

  it('hides the USD reference when the caller suppresses it for a non-USD store', () => {
    const { getByText, queryByText, queryByLabelText } = render(
      <FirstTimeOfferModal
        visible
        offer={offer}
        priceString="4,99 €"
        referencePriceString={null}
        onClaim={onClaim}
        onDismiss={onDismiss}
      />,
    );
    getByText('4,99 €');
    expect(queryByText('$12.99')).toBeNull();
    expect(queryByLabelText(/^Usually /)).toBeNull();
  });

  it('falls back to the USD reference numbers without a store price', () => {
    const { getByText } = render(
      <FirstTimeOfferModal
        visible
        offer={offer}
        onClaim={onClaim}
        onDismiss={onDismiss}
      />,
    );
    getByText('$4.99');
    getByText('$12.99');
  });

  it('renders nothing without an offer', () => {
    const { toJSON } = render(
      <FirstTimeOfferModal
        visible
        offer={undefined}
        onClaim={onClaim}
        onDismiss={onDismiss}
      />,
    );
    expect(toJSON()).toBeNull();
  });
});

describe('formatRemaining', () => {
  it('shows hours and minutes above an hour, minutes and seconds below', () => {
    expect(formatRemaining(2 * 3600_000 + 5 * 60_000)).toBe('2h 5m');
    expect(formatRemaining(5 * 60_000 + 7_000)).toBe('5m 7s');
    expect(formatRemaining(0)).toBe('0m 0s');
    expect(formatRemaining(-5)).toBe('0m 0s');
  });
});
