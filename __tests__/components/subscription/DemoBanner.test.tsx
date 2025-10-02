import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

const mockFeatureAccess = jest.fn();

jest.mock('@/hooks/useFeatureAccess', () => {
  const mock = mockFeatureAccess;
  return {
    __esModule: true,
    default: mock,
    useFeatureAccess: mock,
  };
});

const { DemoBanner } = require('@/components/molecules/subscription/DemoBanner');

describe('DemoBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders banner content when demo mode active', () => {
    const onPress = jest.fn();
    mockFeatureAccess.mockReturnValue({ isDemo: true });

    const { getByText } = renderWithProviders(<DemoBanner onPress={onPress} />);

    expect(getByText('Demo Mode')).toBeTruthy();
    expect(getByText(/Simulated content/i)).toBeTruthy();

    fireEvent.press(getByText('Demo Mode'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not render when demo mode disabled', () => {
    mockFeatureAccess.mockReturnValue({ isDemo: false });

    const { queryByText } = renderWithProviders(<DemoBanner />);

    expect(queryByText('Demo Mode')).toBeNull();
  });
});
