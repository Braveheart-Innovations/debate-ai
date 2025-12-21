import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

// Mock the useFeatureAccess hook
jest.mock('@/hooks/useFeatureAccess', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    isDemo: true,
    hasUsedTrial: false,
    canStartTrial: true,
  })),
}));

const { DemoBanner } = require('@/components/molecules/subscription/DemoBanner');
const useFeatureAccess = require('@/hooks/useFeatureAccess').default;

describe('DemoBanner', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default mock values
    useFeatureAccess.mockReturnValue({
      isDemo: true,
      hasUsedTrial: false,
      canStartTrial: true,
    });
  });

  describe('visibility', () => {
    it('renders when isDemo is true', () => {
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      expect(getByText('Demo Mode')).toBeTruthy();
    });

    it('returns null when isDemo is false', () => {
      useFeatureAccess.mockReturnValue({
        isDemo: false,
        hasUsedTrial: false,
        canStartTrial: true,
      });
      const { queryByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      expect(queryByText('Demo Mode')).toBeNull();
    });
  });

  describe('demo mode content', () => {
    it('displays Demo Mode title when trial not used', () => {
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      expect(getByText('Demo Mode')).toBeTruthy();
    });

    it('displays default subtitle when not provided', () => {
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      expect(getByText('Simulated content — no live API calls.')).toBeTruthy();
    });

    it('displays custom subtitle when provided', () => {
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} subtitle="Custom subtitle text" />
      );
      expect(getByText('Custom subtitle text')).toBeTruthy();
    });

    it('displays Start 7-Day Free Trial CTA when canStartTrial is true', () => {
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      expect(getByText('Start 7‑Day Free Trial')).toBeTruthy();
    });
  });

  describe('trial ended state', () => {
    beforeEach(() => {
      useFeatureAccess.mockReturnValue({
        isDemo: true,
        hasUsedTrial: true,
        canStartTrial: false,
      });
    });

    it('displays Trial Ended title when trial has been used', () => {
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      expect(getByText('Trial Ended')).toBeTruthy();
    });

    it('displays trial ended subtitle', () => {
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      expect(
        getByText('Your trial has ended. Upgrade to continue.')
      ).toBeTruthy();
    });

    it('displays Upgrade to Premium CTA', () => {
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      expect(getByText('Upgrade to Premium')).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('calls onPress when banner is pressed', () => {
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      fireEvent.press(getByText('Demo Mode'));
      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('works without onPress handler', () => {
      const { getByText } = renderWithProviders(<DemoBanner />);
      // Should not throw when pressed without handler
      fireEvent.press(getByText('Demo Mode'));
      expect(getByText('Demo Mode')).toBeTruthy();
    });
  });

  describe('can start trial state', () => {
    it('shows trial CTA when canStartTrial is true', () => {
      useFeatureAccess.mockReturnValue({
        isDemo: true,
        hasUsedTrial: false,
        canStartTrial: true,
      });
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      expect(getByText('Start 7‑Day Free Trial')).toBeTruthy();
    });

    it('shows upgrade CTA when canStartTrial is false', () => {
      useFeatureAccess.mockReturnValue({
        isDemo: true,
        hasUsedTrial: false,
        canStartTrial: false,
      });
      const { getByText } = renderWithProviders(
        <DemoBanner onPress={mockOnPress} />
      );
      expect(getByText('Upgrade to Premium')).toBeTruthy();
    });
  });
});
