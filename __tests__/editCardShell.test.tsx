import React from 'react';
import { render } from '@testing-library/react-native';
import EditCardShell from '@/components/edit-character/EditCardShell';

test('paid field badge displays a structured amount with spoken credits', () => {
  const view = render(<EditCardShell title="Signature item" cost={3} />);
  expect(view.getByLabelText('3 credits')).toBeTruthy();
  expect(view.queryByText('3 cr')).toBeNull();
});

test('zero price adds no routine badge and cooldown takes priority over a price', () => {
  const view = render(<EditCardShell title="Name" cost={0} />);
  expect(view.queryByText('Free')).toBeNull();
  expect(view.queryByLabelText('0 credits')).toBeNull();
  view.rerender(<EditCardShell title="Name" cost={3} cooldownMs={3600000} />);
  expect(view.getByText(/Available in/)).toBeTruthy();
  expect(view.queryByLabelText('3 credits')).toBeNull();
});
