import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

// Mock expo-blur
jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}));

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

const { APIKeyGuidanceModal } = require('@/components/organisms/api-config/APIKeyGuidanceModal');

const mockProvider = {
  id: 'openai',
  name: 'OpenAI',
  description: 'Access GPT models including GPT-4',
  gradient: ['#10A37F', '#1A7F64'],
  getKeyUrl: 'https://platform.openai.com/api-keys',
  guidance: {
    estimatedTime: '2-3 min',
    difficulty: 'easy' as const,
    steps: [
      {
        title: 'Sign in or Create Account',
        instruction: 'Log in to your OpenAI account',
        urlPattern: 'auth',
      },
      {
        title: 'Navigate to API Keys',
        instruction: 'Go to the API Keys section',
        urlPattern: 'api-keys',
      },
      {
        title: 'Create New Key',
        instruction: 'Click "Create new secret key"',
        urlPattern: 'create',
      },
    ],
    tips: ['Keep your API key secure', 'Never share your key publicly'],
  },
};

describe('APIKeyGuidanceModal', () => {
  const mockOnContinue = jest.fn();
  const mockOnSkip = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders when visible is true and provider is provided', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Get OpenAI API Key')).toBeTruthy();
    });

    it('returns null when provider is null', () => {
      const { queryByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={null}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(queryByText('Get')).toBeNull();
    });
  });

  describe('provider information', () => {
    it('displays provider name', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('OpenAI')).toBeTruthy();
    });

    it('displays provider description', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Access GPT models including GPT-4')).toBeTruthy();
    });

    it('displays estimated time badge', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('2-3 min')).toBeTruthy();
    });

    it('displays difficulty badge for easy', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Easy')).toBeTruthy();
    });
  });

  describe('steps display', () => {
    it('displays all guidance steps', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Sign in or Create Account')).toBeTruthy();
      expect(getByText('Navigate to API Keys')).toBeTruthy();
      expect(getByText('Create New Key')).toBeTruthy();
    });

    it('displays step instructions', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Log in to your OpenAI account')).toBeTruthy();
    });

    it('displays "What to expect" section header', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('What to expect')).toBeTruthy();
    });
  });

  describe('tips display', () => {
    it('displays Tips section', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Tips')).toBeTruthy();
    });

    it('displays tip content', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Keep your API key secure')).toBeTruthy();
    });
  });

  describe('action buttons', () => {
    it('displays Let\'s Go button', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText("Let's Go")).toBeTruthy();
    });

    it('displays I already have a key button', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('I already have a key')).toBeTruthy();
    });

    it('calls onContinue when Let\'s Go is pressed', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      fireEvent.press(getByText("Let's Go"));
      expect(mockOnContinue).toHaveBeenCalledTimes(1);
    });

    it('calls onSkip when I already have a key is pressed', () => {
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mockProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      fireEvent.press(getByText('I already have a key'));
      expect(mockOnSkip).toHaveBeenCalledTimes(1);
    });
  });

  describe('difficulty labels', () => {
    it('displays "Moderate" for medium difficulty', () => {
      const mediumProvider = {
        ...mockProvider,
        guidance: { ...mockProvider.guidance, difficulty: 'medium' as const },
      };
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={mediumProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Moderate')).toBeTruthy();
    });

    it('displays "Takes a bit longer" for hard difficulty', () => {
      const hardProvider = {
        ...mockProvider,
        guidance: { ...mockProvider.guidance, difficulty: 'hard' as const },
      };
      const { getByText } = renderWithProviders(
        <APIKeyGuidanceModal
          visible={true}
          provider={hardProvider}
          onContinue={mockOnContinue}
          onSkip={mockOnSkip}
          onClose={mockOnClose}
        />
      );
      expect(getByText('Takes a bit longer')).toBeTruthy();
    });
  });
});
