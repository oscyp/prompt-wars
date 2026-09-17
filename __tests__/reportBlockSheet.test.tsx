import React from 'react';
import * as RN from 'react-native';
import { act } from '@testing-library/react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ReportBlockSheet from '@/components/ReportBlockSheet';
import { blockUser, reportContent } from '@/utils/safety';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/utils/safety', () => ({
  blockUser: jest.fn(async () => {}),
  reportContent: jest.fn(async () => ({ blocked: false })),
}));
it('blocks independently without filing a report', async () => {
  const onDone = jest.fn();
  const view = render(
    <ReportBlockSheet
      visible
      onClose={() => {}}
      reportedType="profile"
      reportedId="opponent"
      subjectLabel="Rival"
      onDone={onDone}
    />,
  );
  fireEvent.press(
    view.getByRole('button', { name: 'Block player without reporting' }),
  );
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
  expect(blockUser).toHaveBeenCalledWith('opponent');
  expect(reportContent).not.toHaveBeenCalled();
});

it('does not move focus for initially hidden sheets and restores once after a real dismissal', () => {
  const focus = jest
    .spyOn(RN.AccessibilityInfo, 'setAccessibilityFocus')
    .mockImplementation(() => {});
  const props = {
    visible: false,
    onClose: () => {},
    reportedType: 'profile' as const,
    reportedId: 'other',
    returnFocusRef: { current: 42 as unknown as RN.View },
  };
  const view = render(<ReportBlockSheet {...props} />);
  expect(focus).not.toHaveBeenCalled();
  view.rerender(<ReportBlockSheet {...props} visible />);
  act(() => view.UNSAFE_getByType(RN.Modal).props.onShow());
  focus.mockClear();
  const modal = view.UNSAFE_getByType(RN.Modal);
  view.rerender(<ReportBlockSheet {...props} />);
  expect(focus).not.toHaveBeenCalled();
  act(() => modal.props.onDismiss());
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledWith(42);
  act(() => modal.props.onDismiss());
  expect(focus).toHaveBeenCalledTimes(1);
  focus.mockRestore();
});
it('separates the reporting heading from the complete subject name', () => {
  const view = render(
    <ReportBlockSheet
      visible
      onClose={() => {}}
      reportedType="profile"
      reportedId="other"
      subjectLabel="AndrewTwo"
    />,
  );
  expect(view.getByRole('header').props.children).toBe('Report');
  expect(view.getByText('AndrewTwo')).toBeTruthy();
});
