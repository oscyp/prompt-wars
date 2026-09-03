/**
 * The list skeleton: N grey rows, announced once as busy, still rendered
 * (without motion) under Reduce Motion.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';
import ListSkeleton, {
  LIST_SKELETON_LABEL,
  LIST_SKELETON_ROWS,
} from '@/components/ListSkeleton';

function mockReduceMotion(enabled: boolean) {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(enabled);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as never);
}

describe('ListSkeleton', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('draws six rows by default and announces itself as busy', () => {
    mockReduceMotion(false);
    const { getByTestId, getAllByTestId, getByLabelText } = render(
      <ListSkeleton />,
    );
    expect(getAllByTestId('list-skeleton-row')).toHaveLength(
      LIST_SKELETON_ROWS,
    );
    const root = getByTestId('list-skeleton');
    expect(root.props.accessible).toBe(true);
    expect(root.props.accessibilityState).toEqual({ busy: true });
    getByLabelText(LIST_SKELETON_LABEL);
  });

  it('takes a row count and a label for what is loading', () => {
    mockReduceMotion(false);
    const { getAllByTestId, getByLabelText } = render(
      <ListSkeleton rows={3} label="Loading your battles" />,
    );
    expect(getAllByTestId('list-skeleton-row')).toHaveLength(3);
    getByLabelText('Loading your battles');
  });

  it('still renders, static, under Reduce Motion', async () => {
    mockReduceMotion(true);
    const { findByTestId, getAllByTestId } = render(<ListSkeleton rows={2} />);
    await findByTestId('list-skeleton');
    expect(getAllByTestId('list-skeleton-row')).toHaveLength(2);
  });
});
