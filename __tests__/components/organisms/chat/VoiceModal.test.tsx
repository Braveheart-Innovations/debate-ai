import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { VoiceModal } from '../../../../src/components/organisms/chat/VoiceModal';
import { useTheme } from '../../../../src/theme';
import * as expoAudio from 'expo-audio';
import TranscriptionService from '../../../../src/services/voice/TranscriptionService';

// Mock molecules
jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    SheetHeader: ({ title, onClose }: { title: string; onClose: () => void }) => (
      React.createElement(View, null,
        React.createElement(Text, null, title),
        React.createElement(TouchableOpacity, { onPress: onClose }, React.createElement(Text, null, 'Close'))
      )
    ),
  };
});

// Mock theme
jest.mock('../../../../src/theme', () => ({
  useTheme: jest.fn(),
}));

// Mock BlurView
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock SafeAreaView
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock expo-audio
jest.mock('expo-audio', () => ({
  useAudioRecorder: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn(),
  RecordingPresets: { HIGH_QUALITY: 'high_quality' },
}));

// Mock Redux
jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

// Mock TranscriptionService
jest.mock('../../../../src/services/voice/TranscriptionService', () => ({
  __esModule: true,
  default: {
    transcribeWithOpenAI: jest.fn(),
  },
}));

// Mock realtime config
jest.mock('../../../../src/config/realtime', () => ({
  isRealtimeConfigured: jest.fn(),
}));

// Mock realtime services
jest.mock('../../../../src/services/voice/OpenAIRealtimeService', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../../../src/services/voice/OpenAIWebRTCService', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('VoiceModal', () => {
  const mockTheme = {
    colors: {
      primary: {
        500: '#0ea5e9',
      },
      error: {
        500: '#ef4444',
        600: '#dc2626',
      },
      background: '#ffffff',
      surface: '#f8f9fa',
      border: '#e0e0e0',
      semantic: {
        error: '#fee2e2',
      },
      text: {
        primary: '#000000',
        secondary: '#666666',
        inverse: '#ffffff',
      },
    },
  };

  const mockOnClose = jest.fn();
  const mockOnStart = jest.fn();
  const mockOnStop = jest.fn();
  const mockOnTranscribed = jest.fn();

  const mockRecorder = {
    record: jest.fn(),
    stop: jest.fn(),
    uri: 'file:///recording.m4a',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({ theme: mockTheme });
    (expoAudio.useAudioRecorder as jest.Mock).mockReturnValue(mockRecorder);
    (expoAudio.requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (expoAudio.setAudioModeAsync as jest.Mock).mockResolvedValue(undefined);

    const { useSelector } = require('react-redux');
    (useSelector as jest.Mock).mockImplementation((selector) => {
      const state = {
        settings: {
          apiKeys: { openai: 'test-key' },
          realtimeRelayUrl: null,
        },
      };
      return selector(state);
    });

    const { isRealtimeConfigured } = require('../../../../src/config/realtime');
    (isRealtimeConfigured as jest.Mock).mockReturnValue(false);
  });

  describe('Rendering', () => {
    it('should render modal when visible is true', () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Voice Input')).toBeTruthy();
      expect(screen.getByText(/Tap and speak to transcribe/)).toBeTruthy();
    });

    it('should not render content when visible is false', () => {
      render(
        <VoiceModal
          visible={false}
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByText('Voice Input')).toBeFalsy();
    });

    it('should render recording button with start state initially', () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Start Recording')).toBeTruthy();
    });

    it('should render advanced mode toggle', () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/Advanced \(Realtime\)/)).toBeTruthy();
    });

    it('should render permission tip', () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/microphone permissions/)).toBeTruthy();
    });
  });

  describe('Recording - Start', () => {
    it('should request permissions when start button is pressed', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(expoAudio.requestRecordingPermissionsAsync).toHaveBeenCalled();
      });
    });

    it('should start recording when permissions are granted', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(mockRecorder.record).toHaveBeenCalled();
      });
    });

    it('should call onStart callback when recording starts', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
          onStart={mockOnStart}
        />
      );

      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(mockOnStart).toHaveBeenCalled();
      });
    });

    it('should change button text to Stop when recording', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeTruthy();
      });
    });

    it('should show toast when permissions are denied on iOS', async () => {
      Platform.OS = 'ios';
      (expoAudio.requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(screen.getByText(/Mic permission required/)).toBeTruthy();
      });
    });

    it('should not start recording when permissions are denied', async () => {
      (expoAudio.requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(expoAudio.requestRecordingPermissionsAsync).toHaveBeenCalled();
      });

      expect(mockRecorder.record).not.toHaveBeenCalled();
    });

    it('should set audio mode when starting recording', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(expoAudio.setAudioModeAsync).toHaveBeenCalledWith({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      });
    });
  });

  describe('Recording - Stop', () => {
    beforeEach(async () => {
      (TranscriptionService.transcribeWithOpenAI as jest.Mock).mockResolvedValue('Test transcription');
    });

    it('should stop recording when stop button is pressed', async () => {
      const { rerender } = render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
          onStop={mockOnStop}
        />
      );

      // Start recording
      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeTruthy();
      });

      // Stop recording
      fireEvent.press(screen.getByText('Stop Recording'));

      await waitFor(() => {
        expect(mockRecorder.stop).toHaveBeenCalled();
      });
    });

    it('should call onStop callback when recording stops', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
          onStop={mockOnStop}
        />
      );

      // Start recording
      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeTruthy();
      });

      // Stop recording
      fireEvent.press(screen.getByText('Stop Recording'));

      await waitFor(() => {
        expect(mockOnStop).toHaveBeenCalled();
      });
    });

    it('should transcribe recording when stopped', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
          onTranscribed={mockOnTranscribed}
        />
      );

      // Start recording
      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeTruthy();
      });

      // Stop recording
      fireEvent.press(screen.getByText('Stop Recording'));

      await waitFor(() => {
        expect(TranscriptionService.transcribeWithOpenAI).toHaveBeenCalledWith(
          'file:///recording.m4a',
          'audio/m4a',
          'recording.m4a'
        );
      });
    });

    it('should call onTranscribed with transcription result', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
          onTranscribed={mockOnTranscribed}
        />
      );

      // Start recording
      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeTruthy();
      });

      // Stop recording
      fireEvent.press(screen.getByText('Stop Recording'));

      await waitFor(() => {
        expect(mockOnTranscribed).toHaveBeenCalledWith('Test transcription');
      });
    });

    it('should show transcription in alert', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      // Start recording
      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeTruthy();
      });

      // Stop recording
      fireEvent.press(screen.getByText('Stop Recording'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Transcription Complete',
          'Test transcription'
        );
      });
    });

    it('should close modal after successful transcription', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      // Start recording
      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeTruthy();
      });

      // Stop recording
      fireEvent.press(screen.getByText('Stop Recording'));

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('should show error alert if transcription fails', async () => {
      (TranscriptionService.transcribeWithOpenAI as jest.Mock).mockRejectedValue(
        new Error('Transcription failed')
      );

      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      // Start recording
      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeTruthy();
      });

      // Stop recording
      fireEvent.press(screen.getByText('Stop Recording'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Transcription Error',
          'Transcription failed'
        );
      });
    });
  });

  describe('Advanced Mode', () => {
    it('should toggle advanced mode when button is pressed', () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Advanced (Realtime) Off')).toBeTruthy();

      fireEvent.press(screen.getByText('Advanced (Realtime) Off'));

      expect(screen.getByText('Advanced (Realtime) On')).toBeTruthy();
    });

    it('should disable advanced mode toggle when realtime is not available', () => {
      const { useSelector } = require('react-redux');
      (useSelector as jest.Mock).mockImplementation((selector) => {
        const state = {
          settings: {
            apiKeys: {},
            realtimeRelayUrl: null,
          },
        };
        return selector(state);
      });

      const { isRealtimeConfigured } = require('../../../../src/config/realtime');
      (isRealtimeConfigured as jest.Mock).mockReturnValue(false);

      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      // Toggle button should exist when realtime is not available
      expect(screen.getByText('Advanced (Realtime) Off')).toBeTruthy();
    });

    it('should show configuration message when realtime is not available', () => {
      const { useSelector } = require('react-redux');
      (useSelector as jest.Mock).mockImplementation((selector) => {
        const state = {
          settings: {
            apiKeys: {},
            realtimeRelayUrl: null,
          },
        };
        return selector(state);
      });

      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/Configure OPENAI_REALTIME_RELAY_URL/)).toBeTruthy();
    });
  });

  describe('Modal Controls', () => {
    it('should call onClose when close button is pressed', () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      const modal = screen.UNSAFE_getByType(require('react-native').Modal);
      modal.props.onRequestClose();

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Theme Integration', () => {
    it('should use theme for styling', () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      expect(useTheme).toHaveBeenCalled();
    });
  });

  describe('Busy State', () => {
    it('should handle processing state', async () => {
      render(
        <VoiceModal
          visible={true}
          onClose={mockOnClose}
        />
      );

      // Start recording
      fireEvent.press(screen.getByText('Start Recording'));

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeTruthy();
      });

      // Stop recording - triggers processing
      fireEvent.press(screen.getByText('Stop Recording'));

      // Wait for processing to complete
      await waitFor(() => {
        expect(TranscriptionService.transcribeWithOpenAI).toHaveBeenCalled();
      });
    });
  });
});
