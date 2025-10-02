import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { QuickStartsSection } from '@/components/organisms/home/QuickStartsSection';
import type { QuickStartTopic } from '@/components/organisms/home/QuickStartsSection';

const mockSectionHeader = jest.fn(() => null);
const mockQuickStartTile = jest.fn(({ title, onPress, disabled }: any) => (
  <Text accessibilityRole="button" onPress={disabled ? undefined : onPress}>
    {title}
  </Text>
));

jest.mock('@/components/molecules', () => {
  const { Text, View, TouchableOpacity } = require('react-native');
  return {
    SectionHeader: (props: any) => mockSectionHeader(props),
  };
});

jest.mock('@/components/organisms/home/QuickStartTile', () => ({
  QuickStartTile: (props: any) => mockQuickStartTile(props),
}));

const topics: QuickStartTopic[] = [
  { id: 'morning', emoji: '☀️', title: 'Morning boost', subtitle: 'Start your day' },
  { id: 'brainstorm', emoji: '💡', title: 'Brainstorm', subtitle: 'Generate ideas' },
];

describe('QuickStartsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders tiles and handles selection', () => {
    const onSelect = jest.fn();

    renderWithProviders(
      <QuickStartsSection topics={topics} onSelectTopic={onSelect} />
    );

    expect(mockQuickStartTile).toHaveBeenCalledTimes(2);
    mockQuickStartTile.mock.calls[0][0].onPress();
    expect(onSelect).toHaveBeenCalledWith(topics[0]);
  });

  it('disables tiles when section disabled', () => {
    const onSelect = jest.fn();

    renderWithProviders(
      <QuickStartsSection topics={topics} onSelectTopic={onSelect} disabled />
    );

    expect(mockQuickStartTile).toHaveBeenCalledWith(expect.objectContaining({ disabled: true }));
  });
});
