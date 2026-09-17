import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CustomItemSheet, {
  type CustomItemSheetProps,
} from '@/components/edit-character/CustomItemSheet';

const ReactNative =
  jest.requireActual<typeof import('react-native')>('react-native');
afterEach(() => jest.restoreAllMocks());

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

function renderSheet(over: Partial<CustomItemSheetProps> = {}) {
  const props: CustomItemSheetProps = {
    visible: true,
    cost: 3,
    balance: 10,
    pricingVerified: true,
    onClose: jest.fn(),
    onSubmit: jest.fn(),
    onTopUp: jest.fn(),
    ...over,
  };
  const utils = render(<CustomItemSheet {...props} />);
  const fill = () => {
    fireEvent.changeText(utils.getByLabelText('Custom item name'), ' Lantern ');
    fireEvent.changeText(
      utils.getByLabelText('Custom item description'),
      'A lamp that never goes out.',
    );
  };
  return { ...utils, props, fill };
}

describe('CustomItemSheet', () => {
  it('prices the button and creates the item when affordable', () => {
    const { getByText, getByLabelText, props, fill } = renderSheet();
    fill();
    expect(getByText('Create · 3 cr')).toBeTruthy();
    fireEvent.press(getByLabelText('Create item for 3 credits'));
    expect(props.onSubmit).toHaveBeenCalledWith({
      name: 'Lantern',
      description: 'A lamp that never goes out.',
      itemClass: 'tool',
    });
    expect(props.onTopUp).not.toHaveBeenCalled();
  });

  it('shows Price, Balance and After before the tap', () => {
    const { getByText } = renderSheet();
    expect(getByText('Price')).toBeTruthy();
    expect(getByText('3 credits')).toBeTruthy();
    expect(getByText('Balance')).toBeTruthy();
    expect(getByText('10 credits')).toBeTruthy();
    expect(getByText('After')).toBeTruthy();
    expect(getByText('7 credits')).toBeTruthy();
  });

  it('reads the shortfall and opens the wallet instead when short', () => {
    const { getByText, props, fill } = renderSheet({ balance: 1 });
    fill();
    expect(getByText('Need 2 more credits')).toBeTruthy();
    fireEvent.press(getByText('Create · 3 cr'));
    expect(props.onTopUp).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('will not submit an empty form', () => {
    const { getByLabelText, props } = renderSheet();
    const button = getByLabelText('Create item for 3 credits');
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('waits for prices rather than guessing', () => {
    const { getByText, getByLabelText, fill } = renderSheet({
      pricingVerified: false,
    });
    fill();
    expect(getByText('Checking prices…')).toBeTruthy();
    expect(
      getByLabelText('Create item. Checking prices.').props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('lets the player pick a class', () => {
    const { getByLabelText, props, fill } = renderSheet();
    fill();
    fireEvent.press(getByLabelText('Class: Relic'));
    fireEvent.press(getByLabelText('Create item for 3 credits'));
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ itemClass: 'relic' }),
    );
  });
});

test('large text stacks price labels and amounts and keeps the commit action outside the scroll body', () => {
  const dimensions = jest
    .spyOn(ReactNative, 'useWindowDimensions')
    .mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 3.1 });
  const view = renderSheet();
  for (const label of ['Price', 'Balance', 'After']) {
    let row = view.getByText(label).parent;
    while (
      row &&
      !ReactNative.StyleSheet.flatten(row.props.style)?.flexDirection
    )
      row = row.parent;
    expect(ReactNative.StyleSheet.flatten(row!.props.style).flexDirection).toBe(
      'column',
    );
  }
  const scroll = view.UNSAFE_getByType(ReactNative.ScrollView);
  expect(
    scroll.findAllByProps({ accessibilityLabel: 'Create item for 3 credits' }),
  ).toHaveLength(0);
  expect(
    view.getByLabelText('Create item for 3 credits').props.accessibilityState
      .disabled,
  ).toBe(true);
  expect(view.props.onSubmit).not.toHaveBeenCalled();
  dimensions.mockRestore();
});
