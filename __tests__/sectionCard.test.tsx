import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import SectionCard from '@/components/SectionCard';

describe('SectionCard', () => {
  it('announces the title as a heading', () => {
    const { getByText } = render(
      <SectionCard title="Daily Quests">
        <Text>body</Text>
      </SectionCard>,
    );
    expect(getByText('Daily Quests').props.accessibilityRole).toBe('header');
  });

  it('renders the subtitle under the title', () => {
    const { getByText } = render(
      <SectionCard title="Daily Quests" subtitle="1 of 3 complete">
        <Text>body</Text>
      </SectionCard>,
    );
    getByText('1 of 3 complete');
  });

  it('renders the trailing slot next to the header', () => {
    const { getByText } = render(
      <SectionCard title="Active Battles" trailing={<Text>2 your turn</Text>}>
        <Text>body</Text>
      </SectionCard>,
    );
    getByText('2 your turn');
    getByText('body');
  });

  it('renders no header row when nothing is given for it', () => {
    const { queryByRole, getByText } = render(
      <SectionCard>
        <Text>body</Text>
      </SectionCard>,
    );
    expect(queryByRole('header')).toBeNull();
    getByText('body');
  });
});
