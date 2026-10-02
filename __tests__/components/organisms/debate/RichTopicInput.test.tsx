import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { RichTopicInput } from '@/components/organisms/debate/RichTopicInput';

jest.mock('@/components/molecules', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    GlassCard: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    Typography: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    MicButton: jest.requireActual<typeof import('@/components/molecules/composer/MicButton')>('@/components/molecules/composer/MicButton').MicButton,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

// Root __mocks__/expo-speech-recognition.ts adds these test helpers; requireMock returns the
// registry instance the component sees, typed from the mock file.
jest.mock('expo-speech-recognition');
const speech = jest.requireMock<typeof import('../../../../__mocks__/expo-speech-recognition')>(
  'expo-speech-recognition'
);

describe('RichTopicInput', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with value', () => {
    const { getByDisplayValue } = renderWithProviders(
      <RichTopicInput value="Test topic" onChange={mockOnChange} />
    );
    expect(getByDisplayValue('Test topic')).toBeTruthy();
  });

  it('calls onChange when text changes', () => {
    const { getByDisplayValue } = renderWithProviders(
      <RichTopicInput value="" onChange={mockOnChange} />
    );
    
    const input = getByDisplayValue('');
    fireEvent.changeText(input, 'New topic');
    
    expect(mockOnChange).toHaveBeenCalledWith('New topic');
  });

  it('displays character count', () => {
    const { getByText } = renderWithProviders(
      <RichTopicInput value="Hello" onChange={mockOnChange} maxLength={200} />
    );
    expect(getByText('5/200')).toBeTruthy();
  });

  it('respects maxLength prop', () => {
    const { getByText } = renderWithProviders(
      <RichTopicInput value="Test" onChange={mockOnChange} maxLength={100} />
    );
    expect(getByText('4/100')).toBeTruthy();
  });

  it('uses custom placeholder', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <RichTopicInput value="" onChange={mockOnChange} placeholder="Custom placeholder" />
    );
    expect(getByPlaceholderText('Custom placeholder')).toBeTruthy();
  });

  it('updates character count as text changes', () => {
    const { getByText, rerender } = renderWithProviders(
      <RichTopicInput value="Hi" onChange={mockOnChange} maxLength={200} />
    );
    expect(getByText('2/200')).toBeTruthy();
    
    rerender(<RichTopicInput value="Hello World" onChange={mockOnChange} maxLength={200} />);
    expect(getByText('11/200')).toBeTruthy();
  });

  describe('dictation', () => {
    beforeEach(() => speech.__reset());

    it('dictates the motion within the character limit', async () => {
      const { getByTestId, getByLabelText } = renderWithProviders(
        <RichTopicInput value="Resolved:" onChange={mockOnChange} maxLength={20} />
      );
      await act(async () => {
        fireEvent.press(getByTestId('topic-input-mic'));
      });
      act(() => speech.__emit('start'));
      expect(getByLabelText('Stop dictation')).toBeTruthy();

      act(() =>
        speech.__emit('result', {
          isFinal: true,
          results: [{ transcript: 'cities should ban cars', confidence: 1, segments: [] }],
        })
      );
      expect(mockOnChange).toHaveBeenLastCalledWith('Resolved: cities sho');
    });

    it('shows a dictation error inline', async () => {
      speech.ExpoSpeechRecognitionModule.requestPermissionsAsync
        .mockResolvedValueOnce({ granted: false, canAskAgain: false, expires: 'never', status: 'denied' });
      const { getByTestId, getByText } = renderWithProviders(
        <RichTopicInput value="" onChange={mockOnChange} />
      );
      await act(async () => {
        fireEvent.press(getByTestId('topic-input-mic'));
      });
      expect(getByText(/Microphone access is off/)).toBeTruthy();
    });

    it('hides the mic when the device has no recognizer', () => {
      speech.ExpoSpeechRecognitionModule.isRecognitionAvailable
        .mockReturnValue(false);
      const { queryByTestId } = renderWithProviders(
        <RichTopicInput value="" onChange={mockOnChange} />
      );
      expect(queryByTestId('topic-input-mic')).toBeNull();
    });
  });
});
