import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { TouchableOpacity } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ChatInputBar } from '@/components/organisms/chat/ChatInputBar';

jest.mock('@/components/molecules/chat/MultimodalOptionsRow', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/organisms/chat/ImageUploadModal', () => ({
  ImageUploadModal: () => null,
}));

jest.mock('@/components/organisms/chat/DocumentUploadModal', () => ({
  DocumentUploadModal: () => null,
}));

jest.mock('@/components/organisms/chat/VoiceModal', () => ({
  VoiceModal: () => null,
}));

jest.mock('@/components/atoms/icons/IconStopOctagon', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Warning: 'warning' },
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

describe('ChatInputBar', () => {
  const mockOnInputChange = jest.fn();
  const mockOnSend = jest.fn();
  const mockOnStop = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders input with placeholder', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <ChatInputBar
        inputText=""
        onInputChange={mockOnInputChange}
        onSend={mockOnSend}
        placeholder="Type a message..."
      />
    );

    expect(getByPlaceholderText('Type a message...')).toBeTruthy();
  });

  it('calls onInputChange when text is typed', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <ChatInputBar
        inputText=""
        onInputChange={mockOnInputChange}
        onSend={mockOnSend}
      />
    );

    const input = getByPlaceholderText('Type a message...');
    fireEvent.changeText(input, 'Hello');

    expect(mockOnInputChange).toHaveBeenCalledWith('Hello');
  });

  it('send button is disabled when input is empty', () => {
    const { UNSAFE_getAllByType } = renderWithProviders(
      <ChatInputBar
        inputText=""
        onInputChange={mockOnInputChange}
        onSend={mockOnSend}
      />
    );

    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const sendButton = touchables[touchables.length - 1]; // Last button is send

    expect(sendButton.props.disabled).toBe(true);
  });

  it('send button is enabled when input has text', () => {
    const { UNSAFE_getAllByType } = renderWithProviders(
      <ChatInputBar
        inputText="Hello"
        onInputChange={mockOnInputChange}
        onSend={mockOnSend}
      />
    );

    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const sendButton = touchables[touchables.length - 1];

    expect(sendButton.props.disabled).toBe(false);
  });

  it('calls onSend when send button is pressed with text', () => {
    const { UNSAFE_getAllByType } = renderWithProviders(
      <ChatInputBar
        inputText="Hello"
        onInputChange={mockOnInputChange}
        onSend={mockOnSend}
      />
    );

    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    const sendButton = touchables[touchables.length - 1];

    fireEvent.press(sendButton);

    expect(mockOnSend).toHaveBeenCalledWith('Hello', undefined);
  });

  it('shows stop button when isProcessing is true', () => {
    const { getByText } = renderWithProviders(
      <ChatInputBar
        inputText=""
        onInputChange={mockOnInputChange}
        onSend={mockOnSend}
        isProcessing={true}
        onStop={mockOnStop}
      />
    );

    expect(getByText('Stop')).toBeTruthy();
  });

  it('calls onStop when stop button is pressed', () => {
    const { getByText } = renderWithProviders(
      <ChatInputBar
        inputText=""
        onInputChange={mockOnInputChange}
        onSend={mockOnSend}
        isProcessing={true}
        onStop={mockOnStop}
      />
    );

    fireEvent.press(getByText('Stop'));

    expect(mockOnStop).toHaveBeenCalled();
  });

  it('disables input when disabled prop is true', () => {
    const { getByPlaceholderText } = renderWithProviders(
      <ChatInputBar
        inputText=""
        onInputChange={mockOnInputChange}
        onSend={mockOnSend}
        disabled={true}
      />
    );

    const input = getByPlaceholderText('Type a message...');
    expect(input.props.editable).toBe(false);
  });

  it('renders plus button when attachment support is enabled', () => {
    const { getByText } = renderWithProviders(
      <ChatInputBar
        inputText=""
        onInputChange={mockOnInputChange}
        onSend={mockOnSend}
        attachmentSupport={{ images: true, documents: false }}
      />
    );

    expect(getByText('+')).toBeTruthy();
  });

  it('toggles modality row when plus button is pressed', () => {
    const { getByText } = renderWithProviders(
      <ChatInputBar
        inputText=""
        onInputChange={mockOnInputChange}
        onSend={mockOnSend}
        attachmentSupport={{ images: true, documents: true }}
      />
    );

    const plusButton = getByText('+');
    fireEvent.press(plusButton);

    // After pressing, button should show ×
    expect(getByText('×')).toBeTruthy();
  });

  // TODO: Add tests for attachment handling
  // TODO: Add tests for image generation modal
  // TODO: Add tests for document upload modal
  // TODO: Add tests for voice modal
  // TODO: Add tests for attachment preview and removal
});