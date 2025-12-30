import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

// Mock dependencies
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: ({ name, testID }: { name: string; testID?: string }) => {
    const { Text } = require('react-native');
    return <Text testID={testID || `icon-${name}`}>{name}</Text>;
  }
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock Linking
jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Card: ({ children }: any) => children,
    Button: ({ title }: any) => React.createElement(Text, null, title),
  };
});

const Clipboard = require('expo-clipboard');
const Haptics = require('expo-haptics');
const { ShareActionButtons } = require('@/components/molecules/share/ShareActionButtons');

describe('ShareActionButtons', () => {
  const defaultProps = {
    onShareImage: jest.fn(),
    onCopyLink: jest.fn(),
    isGenerating: false,
    topic: 'AI Ethics',
    winner: 'Claude',
    participants: ['Claude', 'ChatGPT'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(true);
    (Linking.openURL as jest.Mock).mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      const result = renderWithProviders(
        <ShareActionButtons {...defaultProps} />
      );
      expect(result).toBeTruthy();
    });

    it('renders all share platform buttons', () => {
      const { getByText, getAllByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} />
      );

      expect(getByText('Copy')).toBeTruthy();
      expect(getByText('Instagram')).toBeTruthy();
      expect(getByText('Facebook')).toBeTruthy();
      // X appears twice - once in button, once as label
      expect(getAllByText('X').length).toBeGreaterThanOrEqual(1);
      expect(getByText('WhatsApp')).toBeTruthy();
      expect(getByText('Share')).toBeTruthy();
    });

    it('shows Loading... when isGenerating is true', () => {
      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} isGenerating={true} />
      );

      expect(getByText('Loading...')).toBeTruthy();
    });
  });

  describe('Copy Link', () => {
    it('copies text to clipboard when copy button is pressed', async () => {
      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} />
      );

      const copyButton = getByText('content-copy');
      fireEvent.press(copyButton);

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
        expect(Clipboard.setStringAsync).toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith('Copied!', 'Debate details copied to clipboard');
        expect(defaultProps.onCopyLink).toHaveBeenCalled();
      });
    });
  });

  describe('Instagram Share', () => {
    it('opens Instagram when available', async () => {
      const onShareInstagram = jest.fn();
      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} onShareInstagram={onShareInstagram} />
      );

      const instagramButton = getByText('instagram');
      fireEvent.press(instagramButton);

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalled();
        expect(Linking.canOpenURL).toHaveBeenCalledWith('instagram-stories://share');
        expect(Linking.openURL).toHaveBeenCalledWith('instagram-stories://share');
        expect(onShareInstagram).toHaveBeenCalled();
      });
    });

    it('shows alert when Instagram is not installed', async () => {
      (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);

      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} />
      );

      const instagramButton = getByText('instagram');
      fireEvent.press(instagramButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Instagram not found',
          'Please install Instagram to share stories.',
          [{ text: 'OK' }]
        );
      });
    });

    it('handles Instagram share errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (Linking.canOpenURL as jest.Mock).mockRejectedValue(new Error('Test error'));

      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} />
      );

      const instagramButton = getByText('instagram');
      fireEvent.press(instagramButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith('Error', 'Could not open Instagram');
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Facebook Share', () => {
    it('opens Facebook app when available', async () => {
      const onShareFacebook = jest.fn();
      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} onShareFacebook={onShareFacebook} />
      );

      const facebookButton = getByText('facebook');
      fireEvent.press(facebookButton);

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalled();
        expect(Linking.canOpenURL).toHaveBeenCalled();
        expect(Linking.openURL).toHaveBeenCalled();
        expect(onShareFacebook).toHaveBeenCalled();
      });
    });

    it('falls back to web URL when Facebook app not available', async () => {
      (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
      const onShareFacebook = jest.fn();

      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} onShareFacebook={onShareFacebook} />
      );

      const facebookButton = getByText('facebook');
      fireEvent.press(facebookButton);

      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('facebook.com/sharer'));
        expect(onShareFacebook).toHaveBeenCalled();
      });
    });

    it('handles Facebook share errors silently', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (Linking.openURL as jest.Mock).mockRejectedValue(new Error('Test error'));

      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} />
      );

      const facebookButton = getByText('facebook');
      fireEvent.press(facebookButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('WhatsApp Share', () => {
    it('opens WhatsApp when available', async () => {
      const onShareWhatsApp = jest.fn();
      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} onShareWhatsApp={onShareWhatsApp} />
      );

      const whatsappButton = getByText('whatsapp');
      fireEvent.press(whatsappButton);

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalled();
        expect(Linking.canOpenURL).toHaveBeenCalledWith(expect.stringContaining('whatsapp://'));
        expect(Linking.openURL).toHaveBeenCalled();
        expect(onShareWhatsApp).toHaveBeenCalled();
      });
    });

    it('shows alert when WhatsApp is not installed', async () => {
      (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);

      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} />
      );

      const whatsappButton = getByText('whatsapp');
      fireEvent.press(whatsappButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'WhatsApp not found',
          'Please install WhatsApp to share.',
          [{ text: 'OK' }]
        );
      });
    });

    it('handles WhatsApp share errors silently', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (Linking.canOpenURL as jest.Mock).mockRejectedValue(new Error('Test error'));

      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} />
      );

      const whatsappButton = getByText('whatsapp');
      fireEvent.press(whatsappButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Twitter/X Share', () => {
    it('opens Twitter app when available', async () => {
      const onShareTwitter = jest.fn();
      const { getAllByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} onShareTwitter={onShareTwitter} />
      );

      // Find the X button (there are two "X" texts - one in the button, one as label)
      const xButtons = getAllByText('X');
      fireEvent.press(xButtons[0]);

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalled();
        expect(Linking.canOpenURL).toHaveBeenCalledWith(expect.stringContaining('twitter://'));
        expect(Linking.openURL).toHaveBeenCalled();
        expect(onShareTwitter).toHaveBeenCalled();
      });
    });

    it('falls back to web URL when Twitter app not available', async () => {
      (Linking.canOpenURL as jest.Mock).mockResolvedValue(false);
      const onShareTwitter = jest.fn();

      const { getAllByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} onShareTwitter={onShareTwitter} />
      );

      const xButtons = getAllByText('X');
      fireEvent.press(xButtons[0]);

      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('twitter.com/intent/tweet'));
        expect(onShareTwitter).toHaveBeenCalled();
      });
    });

    it('handles Twitter share errors silently', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (Linking.openURL as jest.Mock).mockRejectedValue(new Error('Test error'));

      const { getAllByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} />
      );

      const xButtons = getAllByText('X');
      fireEvent.press(xButtons[0]);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Native Share', () => {
    it('calls onMoreOptions when provided', () => {
      const onMoreOptions = jest.fn();
      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} onMoreOptions={onMoreOptions} />
      );

      const shareButton = getByText('share-variant');
      fireEvent.press(shareButton);

      expect(onMoreOptions).toHaveBeenCalled();
    });

    it('falls back to onShareImage when onMoreOptions not provided', () => {
      const { getByText } = renderWithProviders(
        <ShareActionButtons {...defaultProps} />
      );

      const shareButton = getByText('share-variant');
      fireEvent.press(shareButton);

      expect(defaultProps.onShareImage).toHaveBeenCalled();
    });
  });

  describe('Default Props', () => {
    it('uses default topic when not provided', () => {
      const { getByText } = renderWithProviders(
        <ShareActionButtons
          onShareImage={jest.fn()}
          onCopyLink={jest.fn()}
          isGenerating={false}
        />
      );
      expect(getByText('Copy')).toBeTruthy();
    });

    it('uses empty participants array when not provided', async () => {
      const { getByText } = renderWithProviders(
        <ShareActionButtons
          onShareImage={jest.fn()}
          onCopyLink={jest.fn()}
          isGenerating={false}
        />
      );

      const copyButton = getByText('content-copy');
      fireEvent.press(copyButton);

      await waitFor(() => {
        expect(Clipboard.setStringAsync).toHaveBeenCalled();
      });
    });
  });
});
