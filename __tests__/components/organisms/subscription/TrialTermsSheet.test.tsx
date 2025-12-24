import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Mock Linking.openURL
jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve());

const { TrialTermsSheet } = require('@/components/organisms/subscription/TrialTermsSheet');

describe('TrialTermsSheet', () => {
  const mockOnClose = jest.fn();
  const mockOnAcceptTerms = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('header', () => {
    it('displays title', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(getByText('Start Your Free Trial')).toBeTruthy();
    });

    it('displays Cancel button', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(getByText('Cancel')).toBeTruthy();
    });

    it('calls onClose when Cancel is pressed', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      fireEvent.press(getByText('Cancel'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('trial features', () => {
    it('displays trial duration', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(getByText('7 days free, then $5.99/month')).toBeTruthy();
    });

    it('displays cancel anytime feature', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(getByText('Cancel anytime before trial ends')).toBeTruthy();
    });

    it('displays full access feature', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(getByText('Full access to all premium features')).toBeTruthy();
    });
  });

  describe('terms section', () => {
    it('displays terms agreement header', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(getByText('By starting your trial, you agree to:')).toBeTruthy();
    });

    it('displays auto-renewal term', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(
        getByText(
          'Subscription auto-renews at $5.99/mo unless canceled at least 24 hours before the trial ends'
        )
      ).toBeTruthy();
    });
  });

  describe('legal links', () => {
    it('displays Privacy Policy link', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(getByText('Privacy Policy')).toBeTruthy();
    });

    it('displays Terms of Service link', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(getByText('Terms of Service')).toBeTruthy();
    });

    it('opens Privacy Policy URL when pressed', async () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      fireEvent.press(getByText('Privacy Policy'));
      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith(
          'https://www.symposiumai.app/privacy'
        );
      });
    });

    it('opens Terms of Service URL when pressed', async () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      fireEvent.press(getByText('Terms of Service'));
      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith(
          'https://www.symposiumai.app/terms'
        );
      });
    });
  });

  describe('CTA button - authenticated user', () => {
    it('displays "Start Free Trial" when authenticated', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(getByText('Start Free Trial')).toBeTruthy();
    });

    it('displays "Starting Trial..." when loading', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
          loading={true}
        />
      );
      expect(getByText('Starting Trial...')).toBeTruthy();
    });

    it('calls onAcceptTerms when CTA is pressed', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      fireEvent.press(getByText('Start Free Trial'));
      expect(mockOnAcceptTerms).toHaveBeenCalledTimes(1);
    });
  });

  describe('CTA button - unauthenticated user', () => {
    it('displays "Continue to Create Account" when not authenticated', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={false}
        />
      );
      expect(getByText('Continue to Create Account')).toBeTruthy();
    });
  });

  describe('Maybe Later button', () => {
    it('displays Maybe Later button', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(getByText('Maybe Later')).toBeTruthy();
    });

    it('calls onClose when Maybe Later is pressed', () => {
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      fireEvent.press(getByText('Maybe Later'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('platform-specific info', () => {
    it('displays iOS-specific management info on iOS', () => {
      Platform.OS = 'ios';
      const { getByText } = renderWithProviders(
        <TrialTermsSheet
          visible={true}
          onClose={mockOnClose}
          onAcceptTerms={mockOnAcceptTerms}
          isAuthenticated={true}
        />
      );
      expect(
        getByText(/Payment will be charged to your Apple ID account/)
      ).toBeTruthy();
    });
  });
});
