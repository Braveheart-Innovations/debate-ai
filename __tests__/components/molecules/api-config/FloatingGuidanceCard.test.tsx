import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock expo-blur
jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}));

const { FloatingGuidanceCard } = require('@/components/molecules/api-config/FloatingGuidanceCard');

const mockStep = {
  title: 'Sign in to your account',
  instruction: 'Use your existing credentials or create a new account',
  urlPattern: 'login',
};

describe('FloatingGuidanceCard', () => {
  const mockOnDismiss = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders when visible is true', () => {
      const { getByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={3}
          visible={true}
        />
      );
      expect(getByText('Sign in to your account')).toBeTruthy();
    });

    it('returns null when visible is false', () => {
      const { queryByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={3}
          visible={false}
        />
      );
      expect(queryByText('Sign in to your account')).toBeNull();
    });
  });

  describe('step content', () => {
    it('displays step title', () => {
      const { getByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={3}
          visible={true}
        />
      );
      expect(getByText('Sign in to your account')).toBeTruthy();
    });

    it('displays step instruction', () => {
      const { getByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={3}
          visible={true}
        />
      );
      expect(
        getByText('Use your existing credentials or create a new account')
      ).toBeTruthy();
    });

    it('displays step counter', () => {
      const { getByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={2}
          totalSteps={5}
          visible={true}
        />
      );
      expect(getByText('Step 2/5')).toBeTruthy();
    });
  });

  describe('dismiss functionality', () => {
    it('shows Hide button when onDismiss is provided', () => {
      const { getByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={3}
          visible={true}
          onDismiss={mockOnDismiss}
        />
      );
      expect(getByText('Hide')).toBeTruthy();
    });

    it('does not show Hide button when onDismiss is not provided', () => {
      const { queryByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={3}
          visible={true}
        />
      );
      expect(queryByText('Hide')).toBeNull();
    });

    it('calls onDismiss when Hide is pressed', () => {
      const { getByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={3}
          visible={true}
          onDismiss={mockOnDismiss}
        />
      );
      fireEvent.press(getByText('Hide'));
      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('position prop', () => {
    it('renders with top position (default)', () => {
      const { getByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={3}
          visible={true}
          position="top"
        />
      );
      expect(getByText('Sign in to your account')).toBeTruthy();
    });

    it('renders with bottom position', () => {
      const { getByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={3}
          visible={true}
          position="bottom"
        />
      );
      expect(getByText('Sign in to your account')).toBeTruthy();
    });
  });

  describe('testID prop', () => {
    it('renders with testID when provided', () => {
      const { getByTestId } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={3}
          visible={true}
          testID="guidance-card"
        />
      );
      expect(getByTestId('guidance-card')).toBeTruthy();
    });
  });

  describe('different step numbers', () => {
    it('renders first step correctly', () => {
      const { getByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={1}
          totalSteps={4}
          visible={true}
        />
      );
      expect(getByText('Step 1/4')).toBeTruthy();
    });

    it('renders last step correctly', () => {
      const { getByText } = renderWithProviders(
        <FloatingGuidanceCard
          step={mockStep}
          stepNumber={4}
          totalSteps={4}
          visible={true}
        />
      );
      expect(getByText('Step 4/4')).toBeTruthy();
    });
  });
});
